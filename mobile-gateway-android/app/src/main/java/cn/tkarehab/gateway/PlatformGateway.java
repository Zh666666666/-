package cn.tkarehab.gateway;

import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.EnumMap;
import java.util.HashMap;
import java.util.Map;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;

/**
 * Mirrors the shared TypeScript gateway's order of operations: persist, provision,
 * bind, create a session, then upload. Network errors leave the queue untouched.
 */
final class PlatformGateway {
    interface Listener {
        void onStatus(String message);
        void onUploadReceipt(UploadReceipt receipt);
        void onError(String message, Exception error);
    }

    private final EncryptedSampleQueue queue;
    private final Listener listener;
    private final ScheduledExecutorService worker = Executors.newSingleThreadScheduledExecutor();
    private final Map<String, String> platformDeviceIds = new HashMap<>();
    private final Map<String, String> sessionIds = new HashMap<>();
    private final Map<SensorPlacement, TimedPitch> latestPitch = new EnumMap<>(SensorPlacement.class);
    private final Map<SensorPlacement, Long> lastQueuedAtMs = new EnumMap<>(SensorPlacement.class);
    private static final long MIN_QUEUE_INTERVAL_MS = 500L;

    private String baseUrl;
    private String patientId;
    private String bearerToken;
    private volatile boolean active;

    PlatformGateway(EncryptedSampleQueue queue, Listener listener) {
        this.queue = queue;
        this.listener = listener;
        worker.scheduleWithFixedDelay(this::retryQueuedSamples, 15, 15, TimeUnit.SECONDS);
    }

    void start(String baseUrl, String patientId, String bearerToken) {
        String normalizedUrl = stripTrailingSlash(baseUrl);
        if (this.baseUrl != null && !this.baseUrl.equals(normalizedUrl)) {
            platformDeviceIds.clear();
            sessionIds.clear();
        }
        this.baseUrl = normalizedUrl;
        this.patientId = patientId;
        this.bearerToken = bearerToken;
        sessionIds.remove(patientId);
        latestPitch.clear();
        lastQueuedAtMs.clear();
        this.active = true;
        listener.onStatus("采集会话已就绪；加密队列中有 " + queue.size() + " 条待上传数据。正在探测平台连通性…");
        worker.execute(this::probeAndFlush);
    }

    void testConnection(String baseUrl, String bearerToken) {
        this.baseUrl = stripTrailingSlash(baseUrl);
        this.bearerToken = bearerToken;
        worker.execute(() -> {
            try {
                JSONObject ready = getJson("/api/health/ready");
                listener.onStatus(
                        "平台连通正常：" + ready.optString("status", "ready")
                                + " / mode=" + ready.optString("mode", "unknown")
                                + " / storage=" + ready.optString("storage", "unknown")
                );
            } catch (Exception error) {
                listener.onStatus("平台连通失败：" + summarize(error)
                        + "。请确认手机与电脑同一 Wi-Fi，浏览器能打开 " + this.baseUrl + "/api/health/ready");
            }
        });
    }

    void stop() {
        active = false;
        worker.execute(latestPitch::clear);
    }

    void close() {
        active = false;
        worker.shutdownNow();
    }

    void accept(SensorSample sample) {
        if (!active) {
            return;
        }
        String targetPatientId = patientId;
        worker.execute(() -> {
            if (!active) {
                return;
            }
            try {
                latestPitch.put(sample.placement, new TimedPitch(sample.recordedAtMs, sample.pitch));
                // Keep live BLE high-rate for UI, but only queue ~2Hz for upload.
                long previousQueuedAt = lastQueuedAtMs.containsKey(sample.placement)
                        ? lastQueuedAtMs.get(sample.placement)
                        : 0L;
                if (sample.recordedAtMs - previousQueuedAt < MIN_QUEUE_INTERVAL_MS) {
                    return;
                }
                lastQueuedAtMs.put(sample.placement, sample.recordedAtMs);

                JSONObject payload = sample.toUploadJson();
                payload.put("patientId", targetPatientId);
                payload.put("source", "HARDWARE");
                TimedPitch thigh = latestPitch.get(SensorPlacement.THIGH);
                TimedPitch shank = latestPitch.get(SensorPlacement.SHANK);
                KneeAngleCalculator.Result angle = null;
                if (thigh != null && shank != null) {
                    angle = KneeAngleCalculator.calculate(
                            thigh.recordedAtMs,
                            thigh.pitch,
                            shank.recordedAtMs,
                            shank.pitch
                    );
                }
                if (angle == null) {
                    angle = KneeAngleCalculator.provisionalFromSingle(sample.pitch);
                }
                if (angle != null) {
                    payload.put("flexionAngle", angle.flexion);
                    payload.put("extensionAngle", angle.extension);
                    payload.put("confidence", angle.confidence);
                    JSONObject raw = payload.optJSONObject("raw");
                    if (raw != null) {
                        raw.put(
                                "kneeAngleMode",
                                angle.provisional ? "SINGLE_SENSOR_PROVISIONAL" : "DUAL_SENSOR"
                        );
                    }
                }
                queue.append(payload);
                flushOnWorker();
            } catch (Exception error) {
                listener.onError("Could not save a sensor reading locally.", error);
            }
        });
    }

    void flush() {
        if (active) {
            worker.execute(this::flushOnWorker);
        }
    }

    private void probeAndFlush() {
        if (!active) {
            return;
        }
        try {
            JSONObject ready = getJson("/api/health/ready");
            listener.onStatus(
                    "平台已连通（" + ready.optString("mode", "unknown") + "），开始上传队列 "
                            + queue.size() + " 条…"
            );
            flushOnWorker();
        } catch (Exception error) {
            listener.onStatus(
                    "上传暂缓；" + queue.size() + " 条仍在加密队列。"
                            + " 原因：" + summarize(error)
                            + "。请用手机浏览器打开 " + baseUrl + "/api/health/ready"
            );
        }
    }

    private void flushOnWorker() {
        if (!active) {
            return;
        }
        try {
            int uploaded = 0;
            JSONObject sample;
            // Cap each flush burst so the UI can keep rendering BLE frames.
            while (uploaded < 40 && (sample = queue.peek()) != null) {
                String deviceId = ensureDevice(sample);
                String samplePatientId = sample.getString("patientId");
                String activeSessionId = ensureSession(samplePatientId);
                sample.put("deviceId", deviceId);
                sample.put("sessionId", activeSessionId);
                // Avoid shipping local-only queue fields to the platform schema.
                sample.remove("gatewayDeviceId");
                JSONObject response = postJson("/api/sensor-samples", sample);
                UploadReceipt receipt = UploadReceipt.verify(sample, response);
                queue.acknowledgeOne();
                listener.onUploadReceipt(receipt);
                uploaded += 1;
            }
            if (uploaded > 0) {
                int remaining = queue.size();
                listener.onStatus(
                        "已上传 " + uploaded + " 条真实网关采样"
                                + (remaining > 0 ? "；队列还剩 " + remaining + " 条。" : "；队列已清空。")
                );
                if (remaining > 0) {
                    worker.execute(this::flushOnWorker);
                }
            }
        } catch (Exception error) {
            listener.onStatus(
                    "上传暂缓；" + queue.size() + " 条数据仍在加密队列中，15 秒后自动重试。"
                            + " 原因：" + summarize(error)
            );
        }
    }

    private void retryQueuedSamples() {
        if (active) {
            probeAndFlush();
        }
    }

    private static String summarize(Exception error) {
        String message = error.getMessage();
        if (message == null || message.trim().isEmpty()) {
            message = error.getClass().getSimpleName();
        }
        if (message.length() > 180) {
            return message.substring(0, 180) + "…";
        }
        return message;
    }

    private String ensureDevice(JSONObject sample) throws Exception {
        String gatewayDeviceId = sample.getString("gatewayDeviceId");
        String samplePatientId = sample.getString("patientId");
        String cacheKey = samplePatientId + "\u0000" + gatewayDeviceId + "\u0000" + sample.getString("placement");
        String cached = platformDeviceIds.get(cacheKey);
        if (cached != null) {
            return cached;
        }

        JSONObject devicePayload = new JSONObject();
        devicePayload.put("serialNo", gatewayDeviceId);
        devicePayload.put("name", "WT9011DCL-BT50 " + sample.getString("placement"));
        devicePayload.put("model", "WT9011DCL-BT50");
        devicePayload.put("manufacturer", "WitMotion");
        JSONObject device = postJson("/api/devices", devicePayload);
        String deviceId = device.getString("id");

        JSONObject bindingPayload = new JSONObject();
        bindingPayload.put("deviceId", deviceId);
        bindingPayload.put("patientId", samplePatientId);
        bindingPayload.put("placement", sample.getString("placement"));
        postJson("/api/device-bindings", bindingPayload);
        platformDeviceIds.put(cacheKey, deviceId);
        return deviceId;
    }

    private String ensureSession(String samplePatientId) throws Exception {
        String sessionId = sessionIds.get(samplePatientId);
        if (sessionId == null) {
            JSONObject sessionPayload = new JSONObject();
            sessionPayload.put("patientId", samplePatientId);
            sessionPayload.put("source", "HARDWARE");
            sessionId = postJson("/api/sensor-sessions", sessionPayload).getString("id");
            sessionIds.put(samplePatientId, sessionId);
        }
        return sessionId;
    }

    private JSONObject postJson(String path, JSONObject body) throws Exception {
        HttpURLConnection connection = open(path);
        try {
            connection.setRequestMethod("POST");
            connection.setDoOutput(true);
            try (OutputStream output = connection.getOutputStream()) {
                output.write(body.toString().getBytes(StandardCharsets.UTF_8));
            }
            return readJsonResponse(connection, "POST " + path);
        } finally {
            connection.disconnect();
        }
    }

    private JSONObject getJson(String path) throws Exception {
        HttpURLConnection connection = open(path);
        try {
            connection.setRequestMethod("GET");
            return readJsonResponse(connection, "GET " + path);
        } finally {
            connection.disconnect();
        }
    }

    private HttpURLConnection open(String path) throws Exception {
        if (baseUrl == null || baseUrl.isEmpty()) {
            throw new IllegalStateException("平台地址为空");
        }
        HttpURLConnection connection = (HttpURLConnection) new URL(baseUrl + path).openConnection();
        connection.setConnectTimeout(8_000);
        connection.setReadTimeout(12_000);
        connection.setRequestProperty("Content-Type", "application/json");
        connection.setRequestProperty("Accept", "application/json");
        if (bearerToken != null && !bearerToken.isEmpty()) {
            connection.setRequestProperty("Authorization", "Bearer " + bearerToken);
        }
        return connection;
    }

    private JSONObject readJsonResponse(HttpURLConnection connection, String label) throws Exception {
        int status;
        try {
            status = connection.getResponseCode();
        } catch (Exception error) {
            throw new IllegalStateException(label + " 无法连接：" + summarize(error), error);
        }
        InputStream stream = status >= 200 && status < 300
                ? connection.getInputStream()
                : connection.getErrorStream();
        String response = readFully(stream);
        if (status < 200 || status >= 300) {
            throw new IllegalStateException(label + " failed (" + status + "): " + response);
        }
        if (response == null || response.trim().isEmpty()) {
            return new JSONObject();
        }
        return new JSONObject(response);
    }

    private static String readFully(InputStream stream) throws Exception {
        if (stream == null) {
            return "";
        }
        StringBuilder result = new StringBuilder();
        try (BufferedReader reader = new BufferedReader(new InputStreamReader(stream, StandardCharsets.UTF_8))) {
            String line;
            while ((line = reader.readLine()) != null) {
                result.append(line);
            }
        }
        return result.toString();
    }

    private static String stripTrailingSlash(String value) {
        return value.replaceAll("/+$", "");
    }

    private static final class TimedPitch {
        final long recordedAtMs;
        final double pitch;

        TimedPitch(long recordedAtMs, double pitch) {
            this.recordedAtMs = recordedAtMs;
            this.pitch = pitch;
        }
    }
}
