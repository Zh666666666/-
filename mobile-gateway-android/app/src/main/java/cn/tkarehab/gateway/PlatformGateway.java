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
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

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
    private final ExecutorService worker = Executors.newSingleThreadExecutor();
    private final Map<String, String> platformDeviceIds = new HashMap<>();
    private final Map<SensorPlacement, TimedPitch> latestPitch = new EnumMap<>(SensorPlacement.class);

    private String baseUrl;
    private String patientId;
    private String bearerToken;
    private String sessionId;
    private boolean active;

    PlatformGateway(EncryptedSampleQueue queue, Listener listener) {
        this.queue = queue;
        this.listener = listener;
    }

    void start(String baseUrl, String patientId, String bearerToken) {
        this.baseUrl = stripTrailingSlash(baseUrl);
        this.patientId = patientId;
        this.bearerToken = bearerToken;
        this.sessionId = null;
        this.active = true;
        flush();
    }

    void stop() {
        active = false;
    }

    void accept(SensorSample sample) {
        if (!active) {
            return;
        }
        worker.execute(() -> {
            try {
                JSONObject payload = sample.toUploadJson();
                payload.put("patientId", patientId);
                latestPitch.put(sample.placement, new TimedPitch(sample.recordedAtMs, sample.pitch));
                TimedPitch thigh = latestPitch.get(SensorPlacement.THIGH);
                if (sample.placement == SensorPlacement.SHANK
                        && thigh != null
                        && Math.abs(sample.recordedAtMs - thigh.recordedAtMs) <= 300) {
                    double flexion = Math.min(150, Math.abs(sample.pitch - thigh.pitch));
                    payload.put("flexionAngle", Math.round(flexion * 10.0) / 10.0);
                    payload.put("extensionAngle", Math.max(-20, Math.min(40, -flexion)));
                    payload.put("confidence", Math.max(0.5, 1.0 - Math.abs(sample.recordedAtMs - thigh.recordedAtMs) / 1000.0));
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
                String activeSessionId = ensureSession();
                sample.put("deviceId", deviceId);
                sample.put("sessionId", activeSessionId);
                postJson("/api/sensor-samples", sample);
                queue.acknowledgeOne();
                uploaded += 1;
            }
            if (uploaded > 0) {
                listener.onStatus("Uploaded " + uploaded + " physical gateway samples.");
            }
        } catch (Exception error) {
            listener.onStatus("Upload paused; encrypted local queue will retry when restarted.");
        }
    }

    private String ensureDevice(JSONObject sample) throws Exception {
        String gatewayDeviceId = sample.getString("gatewayDeviceId");
        String cached = platformDeviceIds.get(gatewayDeviceId);
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
        bindingPayload.put("patientId", patientId);
        bindingPayload.put("placement", sample.getString("placement"));
        postJson("/api/device-bindings", bindingPayload);
        platformDeviceIds.put(gatewayDeviceId, deviceId);
        return deviceId;
    }

    private String ensureSession() throws Exception {
        if (sessionId == null) {
            JSONObject sessionPayload = new JSONObject();
            sessionPayload.put("patientId", patientId);
            sessionPayload.put("source", "HARDWARE");
            sessionId = postJson("/api/sensor-sessions", sessionPayload).getString("id");
        }
        return sessionId;
    }

    private JSONObject postJson(String path, JSONObject body) throws Exception {
        HttpURLConnection connection = (HttpURLConnection) new URL(baseUrl + path).openConnection();
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
