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
        void onError(String message, Exception error);
    }

    private final EncryptedSampleQueue queue;
    private final Listener listener;
    private final ScheduledExecutorService worker = Executors.newSingleThreadScheduledExecutor();
    private final Map<String, String> platformDeviceIds = new HashMap<>();
    private final Map<String, String> sessionIds = new HashMap<>();
    private final Map<SensorPlacement, TimedPitch> latestPitch = new EnumMap<>(SensorPlacement.class);

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
        this.active = true;
        listener.onStatus("采集会话已就绪；加密队列中有 " + queue.size() + " 条待上传数据。");
        flush();
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
                JSONObject payload = sample.toUploadJson();
                payload.put("patientId", targetPatientId);
                latestPitch.put(sample.placement, new TimedPitch(sample.recordedAtMs, sample.pitch));
                TimedPitch thigh = latestPitch.get(SensorPlacement.THIGH);
                if (sample.placement == SensorPlacement.SHANK && thigh != null) {
                    KneeAngleCalculator.Result angle = KneeAngleCalculator.calculate(
                            thigh.recordedAtMs,
                            thigh.pitch,
                            sample.recordedAtMs,
                            sample.pitch
                    );
                    if (angle != null) {
                        payload.put("flexionAngle", angle.flexion);
                        payload.put("extensionAngle", angle.extension);
                        payload.put("confidence", angle.confidence);
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

    private void flushOnWorker() {
        if (!active) {
            return;
        }
        try {
            int uploaded = 0;
            JSONObject sample;
            while ((sample = queue.peek()) != null) {
                String deviceId = ensureDevice(sample);
                String samplePatientId = sample.getString("patientId");
                String activeSessionId = ensureSession(samplePatientId);
                sample.put("deviceId", deviceId);
                sample.put("sessionId", activeSessionId);
                postJson("/api/sensor-samples", sample);
                queue.acknowledgeOne();
                uploaded += 1;
            }
            if (uploaded > 0) {
                listener.onStatus("已上传 " + uploaded + " 条真实网关采样。");
            }
        } catch (Exception error) {
            listener.onStatus("上传暂缓；" + queue.size() + " 条数据仍在加密队列中，15 秒后自动重试。");
        }
    }

    private void retryQueuedSamples() {
        if (active) {
            flushOnWorker();
        }
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
        JSONObject raw = sample.optJSONObject("raw");
        String advertisedName = raw == null ? gatewayDeviceId : raw.optString("deviceName", gatewayDeviceId);
        devicePayload.put("name", advertisedName + " " + sample.getString("placement"));
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
        HttpURLConnection connection = (HttpURLConnection) new URL(baseUrl + path).openConnection();
        try {
            connection.setRequestMethod("POST");
            connection.setConnectTimeout(10_000);
            connection.setReadTimeout(15_000);
            connection.setRequestProperty("Content-Type", "application/json");
            connection.setRequestProperty("Accept", "application/json");
            if (bearerToken != null && !bearerToken.isEmpty()) {
                connection.setRequestProperty("Authorization", "Bearer " + bearerToken);
            }
            connection.setDoOutput(true);
            try (OutputStream output = connection.getOutputStream()) {
                output.write(body.toString().getBytes(StandardCharsets.UTF_8));
            }

            int status = connection.getResponseCode();
            InputStream stream = status >= 200 && status < 300
                    ? connection.getInputStream()
                    : connection.getErrorStream();
            String response = readFully(stream);
            if (status < 200 || status >= 300) {
                throw new IllegalStateException("POST " + path + " failed (" + status + "): " + response);
            }
            return new JSONObject(response);
        } finally {
            connection.disconnect();
        }
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
