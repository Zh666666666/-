package cn.tkarehab.gateway;

import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.EnumMap;
import java.util.HashMap;
import java.util.Map;
import java.util.UUID;
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
    private volatile boolean startRequested;
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
        this.startRequested = true;
        this.active = false;
        listener.onStatus("正在验证网关 Token 与患者 ID；通过后自动上传 " + queue.size() + " 条离线数据…");
        worker.execute(this::preflightAndActivate);
    }

    void testConnection(String baseUrl, String patientId, String bearerToken) {
        String targetBaseUrl = stripTrailingSlash(baseUrl);
        worker.execute(() -> {
            try {
                JSONObject ready = getJson(targetBaseUrl, bearerToken, gatewayReadyPath(patientId));
                JSONObject patient = ready.getJSONObject("patient");
                listener.onStatus(
                        "平台、Token 与患者均已验证："
                                + patient.optString("name", "康复患者")
                                + " / " + patient.getString("id")
                );
            } catch (Exception error) {
                listener.onStatus("平台预检失败：" + summarize(error)
                        + "。请核对正式域名、患者 ID 与 Bearer Token；健康页能打开不代表上传鉴权通过。");
            }
        });
    }

    void stop() {
        startRequested = false;
        active = false;
        worker.execute(latestPitch::clear);
    }

    void close() {
        startRequested = false;
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

    private void preflightAndActivate() {
        if (!startRequested) return;
        try {
            JSONObject ready = getJson(gatewayReadyPath(patientId));
            if (!startRequested) return;
            JSONObject patient = ready.getJSONObject("patient");
            active = true;
            listener.onStatus(
                    "上传已启动：" + patient.optString("name", "康复患者")
                            + " / " + patient.getString("id")
                            + "；待上传 " + queue.size() + " 条。"
            );
            flushOnWorker();
        } catch (Exception error) {
            active = false;
            if (!startRequested) return;
            listener.onStatus(
                    "未启动网页上传：" + summarize(error)
                            + "。本地证据仍在保存；请核对患者 ID 与 Bearer Token 后重新开始。"
            );
        }
    }

    private void probeAndFlush() {
        if (!active) {
            return;
        }
        try {
            getJson(gatewayReadyPath(patientId));
            flushOnWorker();
        } catch (Exception error) {
            listener.onStatus(
                    "上传暂缓；" + queue.size() + " 条仍在加密队列。"
                            + " 原因：" + summarize(error)
                            + "。请核对患者 ID、Bearer Token 与网络。"
            );
        }
    }

    private void flushOnWorker() {
        if (!active) {
            return;
        }
        int uploaded = 0;
        int isolated = 0;
        try {
            JSONObject sample;
            // Cap each flush burst so the UI can keep rendering BLE frames.
            while (uploaded + isolated < 40 && (sample = queue.peek()) != null) {
                try {
                    normalizeLegacyIdentity(sample);
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
                } catch (HttpStatusException error) {
                    if (!isPermanentSampleFailure(error.status)) {
                        throw error;
                    }
                    queue.quarantineOne("http-" + error.status);
                    isolated += 1;
                    listener.onStatus(
                            "已隔离 1 条无法恢复的旧队列数据（HTTP " + error.status
                                    + "），后续实时帧继续上传。"
                    );
                }
            }
            int remaining = queue.size();
            if (uploaded > 0 || isolated > 0) {
                listener.onStatus(
                        "本轮已上传 " + uploaded + " 条、隔离 " + isolated + " 条"
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

    static void normalizeLegacyIdentity(JSONObject sample) throws Exception {
        boolean migrated = false;
        if (!sample.has("gatewaySampleId") || sample.optString("gatewaySampleId").isEmpty()) {
            String stableId = UUID.nameUUIDFromBytes(sample.toString().getBytes(StandardCharsets.UTF_8)).toString();
            sample.put("gatewaySampleId", stableId);
            migrated = true;
        }
        if (!sample.has("captureSequence")) {
            sample.put("captureSequence", 0L);
            migrated = true;
        }
        if (!migrated) return;

        JSONObject raw = sample.optJSONObject("raw");
        if (raw == null) {
            raw = new JSONObject();
            sample.put("raw", raw);
        }
        raw.put("captureSequence", sample.getLong("captureSequence"));
        raw.put("legacyQueueMigrated", true);
    }

    private static boolean isPermanentSampleFailure(int status) {
        return status == 400 || status == 409 || status == 422;
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
        return getJson(baseUrl, bearerToken, path);
    }

    private JSONObject getJson(String targetBaseUrl, String targetBearerToken, String path) throws Exception {
        HttpURLConnection connection = open(targetBaseUrl, targetBearerToken, path);
        try {
            connection.setRequestMethod("GET");
            return readJsonResponse(connection, "GET " + path);
        } finally {
            connection.disconnect();
        }
    }

    private HttpURLConnection open(String path) throws Exception {
        return open(baseUrl, bearerToken, path);
    }

    private HttpURLConnection open(String targetBaseUrl, String targetBearerToken, String path) throws Exception {
        if (targetBaseUrl == null || targetBaseUrl.isEmpty()) {
            throw new IllegalStateException("平台地址为空");
        }
        HttpURLConnection connection = (HttpURLConnection) new URL(targetBaseUrl + path).openConnection();
        connection.setConnectTimeout(8_000);
        connection.setReadTimeout(12_000);
        connection.setRequestProperty("Content-Type", "application/json");
        connection.setRequestProperty("Accept", "application/json");
        if (targetBearerToken != null && !targetBearerToken.isEmpty()) {
            connection.setRequestProperty("Authorization", "Bearer " + targetBearerToken);
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
            throw new HttpStatusException(status, label + " failed (" + status + "): " + response);
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

    private static String gatewayReadyPath(String patientId) throws Exception {
        return "/api/gateway/ready?patientId=" + URLEncoder.encode(patientId, StandardCharsets.UTF_8.name());
    }

    private static String stripTrailingSlash(String value) {
        return value.replaceAll("/+$", "");
    }

    private static final class HttpStatusException extends IllegalStateException {
        final int status;

        HttpStatusException(int status, String message) {
            super(message);
            this.status = status;
        }
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
