package cn.tkarehab.gateway;

import android.content.SharedPreferences;

import org.json.JSONObject;
import org.json.JSONArray;

import java.io.BufferedReader;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.EnumMap;
import java.util.Collections;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashSet;
import java.util.Map;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.Executors;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;

/**
 * Mirrors the shared TypeScript gateway's order of operations: persist, provision,
 * bind, create a session, then upload. Network errors leave the queue untouched.
 */
final class PlatformGateway {
    private static final int MAX_RESPONSE_CHARS = 256 * 1024;

    interface Listener {
        void onStatus(String message);
        void onUploadReceipt(UploadReceipt receipt);
        void onError(String message, Exception error);
        void onDrainComplete();
    }

    private final EncryptedSampleQueue queue;
    private final Listener listener;
    private final ScheduledExecutorService worker = Executors.newSingleThreadScheduledExecutor();
    private final ExecutorService captureWorker = Executors.newSingleThreadExecutor();
    private final AtomicBoolean flushScheduled = new AtomicBoolean(false);
    private final Map<String, String> platformDeviceIds = new HashMap<>();
    private final Map<String, String> sessionIds = new HashMap<>();
    private final Map<SensorPlacement, TimedPitch> latestPitch =
            Collections.synchronizedMap(new EnumMap<>(SensorPlacement.class));
    private final Map<SensorPlacement, CalibrationBaseline> calibrationBaselines =
            Collections.synchronizedMap(new EnumMap<>(SensorPlacement.class));
    private final Set<Long> completionPendingRevisions = new HashSet<>();
    private final Set<String> completionPendingSessionIds = new HashSet<>();
    private final Map<String, JSONObject> pendingCalibrationPayloads = new HashMap<>();
    private final Set<String> publishedCalibrationKeys = new HashSet<>();
    private final SharedPreferences statePreferences;

    private String baseUrl;
    private String patientId;
    private String bearerToken;
    private volatile boolean startRequested;
    private volatile boolean active;
    private volatile boolean accepting;
    private volatile long currentPlacementRevision;
    private long lastCalibrationAttemptAtMs;

    PlatformGateway(EncryptedSampleQueue queue, Listener listener) {
        this(queue, listener, null);
    }

    PlatformGateway(
            EncryptedSampleQueue queue,
            Listener listener,
            SharedPreferences statePreferences
    ) {
        this.queue = queue;
        this.listener = listener;
        this.statePreferences = statePreferences;
        restorePendingState();
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
        this.startRequested = true;
        this.active = false;
        this.accepting = false;
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
        accepting = false;
        long revisionToComplete = currentPlacementRevision;
        captureWorker.execute(() -> worker.execute(() -> {
                completionPendingRevisions.add(revisionToComplete);
                scheduleKnownSessionsForCompletion(revisionToComplete);
                persistPendingState();
                latestPitch.clear();
                listener.onStatus(
                        "训练已停止接收新帧；正在补传结束前已加密保存的 " + queue.size() + " 条数据。"
                );
                requestFlush(0L);
            })
        );
    }

    boolean isStartRequested() {
        return startRequested;
    }

    boolean isDraining() {
        return active && !accepting;
    }

    void onPlacementRevisionChanged(long revision) {
        long previousRevision = currentPlacementRevision;
        currentPlacementRevision = revision;
        worker.execute(() -> {
            if (previousRevision > 0L && previousRevision != revision) {
                completionPendingRevisions.add(previousRevision);
                scheduleKnownSessionsForCompletion(previousRevision);
                persistPendingState();
            }
            latestPitch.clear();
            calibrationBaselines.clear();
            listener.onStatus(
                    "佩戴位置版本已更新为 " + revision
                            + "；下一帧将重新绑定设备并创建独立训练会话。"
            );
        });
    }

    void close() {
        startRequested = false;
        active = false;
        accepting = false;
        captureWorker.shutdown();
        worker.shutdownNow();
    }

    void accept(SensorSample sample) {
        if (!active || !accepting) {
            return;
        }
        String targetPatientId = patientId;
        captureWorker.execute(() -> {
            try {
                latestPitch.put(sample.placement, new TimedPitch(sample.recordedAtMs, sample.pitch));
                if (sample.softwareZero.calibrated) {
                    calibrationBaselines.put(
                            sample.placement,
                            CalibrationBaseline.fromSample(sample)
                    );
                }

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
                requestFlush(queue.size() >= 24 ? 0L : 120L);
            } catch (Exception error) {
                listener.onError("Could not save a sensor reading locally.", error);
            }
        });
    }

    void flush() {
        if (active) {
            requestFlush(0L);
        }
    }

    private void preflightAndActivate() {
        if (!startRequested) return;
        try {
            JSONObject ready = getJson(gatewayReadyPath(patientId));
            if (!startRequested) return;
            JSONObject patient = ready.getJSONObject("patient");
            active = true;
            accepting = true;
            listener.onStatus(
                    "上传已启动：" + patient.optString("name", "康复患者")
                            + " / " + patient.getString("id")
                            + "；待上传 " + queue.size() + " 条。"
            );
            requestFlush(0L);
        } catch (Exception error) {
            active = false;
            accepting = false;
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
            requestFlush(0L);
        } catch (Exception error) {
            listener.onStatus(
                    "上传暂缓；" + queue.size() + " 条仍在加密队列。"
                            + " 原因：" + summarize(error)
                            + "。请核对患者 ID、Bearer Token 与网络。"
            );
        }
    }

    private void flushOnWorker() {
        flushScheduled.set(false);
        if (!active) {
            return;
        }
        int uploaded = 0;
        int isolated = 0;
        try {
            List<EncryptedSampleQueue.Item> queuedItems = queue.peekBalancedBatch(100);
            if (!queuedItems.isEmpty()) {
                JSONArray payloads = new JSONArray();
                for (EncryptedSampleQueue.Item queuedItem : queuedItems) {
                    JSONObject sample = queuedItem.payload;
                    normalizeLegacyIdentity(sample);
                    String deviceId = ensureDevice(sample);
                    String samplePatientId = sample.getString("patientId");
                    long revision = sample.optLong("placementRevision", 0L);
                    sample.put("deviceId", deviceId);
                    sample.put("sessionId", ensureSession(samplePatientId, revision));
                    sample.remove("gatewayDeviceId");
                    payloads.put(sample);
                }

                try {
                    JSONObject batchBody = new JSONObject();
                    batchBody.put("samples", payloads);
                    JSONObject batchResponse = postJson("/api/sensor-samples/batch", batchBody);
                    JSONArray results = batchResponse.getJSONArray("results");
                    UploadReceipt latestReceipt = null;
                    String latestReceiptKey = "";
                    JSONObject latestReceiptSample = null;
                    Set<String> acknowledgedKeys = new LinkedHashSet<>();
                    Map<String, String> rejectedKeys = new HashMap<>();
                    Exception retryableFailure = null;
                    for (int index = 0; index < queuedItems.size(); index += 1) {
                        JSONObject result = results.getJSONObject(index);
                        int status = result.getInt("status");
                        if (status >= 200 && status < 300) {
                            EncryptedSampleQueue.Item queuedItem = queuedItems.get(index);
                            JSONObject sample = queuedItem.payload;
                            UploadReceipt receipt = UploadReceipt.verify(sample, result.getJSONObject("body"));
                            if (latestReceipt == null || queuedItem.key.compareTo(latestReceiptKey) > 0) {
                                latestReceipt = receipt;
                                latestReceiptKey = queuedItem.key;
                                latestReceiptSample = sample;
                            }
                            acknowledgedKeys.add(queuedItem.key);
                            uploaded += 1;
                            continue;
                        }
                        if (isPermanentSampleFailure(status)) {
                            rejectedKeys.put(queuedItems.get(index).key, "http-" + status);
                            isolated += 1;
                            continue;
                        }
                        retryableFailure = new HttpStatusException(
                                status,
                                "Batch item failed (" + status + ")"
                        );
                    }
                    queue.acknowledgeKeys(acknowledgedKeys);
                    for (Map.Entry<String, String> rejected : rejectedKeys.entrySet()) {
                        queue.quarantineKey(rejected.getKey(), rejected.getValue());
                    }
                    if (latestReceipt != null) listener.onUploadReceipt(latestReceipt);
                    if (latestReceiptSample != null) {
                        maybePublishCalibration(
                                latestReceiptSample.getString("patientId"),
                                latestReceiptSample.getString("sessionId"),
                                latestReceiptSample.optLong("placementRevision", 0L)
                        );
                    }
                    if (retryableFailure != null) throw retryableFailure;
                } catch (Exception error) {
                    throw error;
                }
            }
            int remaining = queue.size();
            if (uploaded > 0 || isolated > 0) {
                listener.onStatus(
                        "本轮已上传 " + uploaded + " 条、隔离 " + isolated + " 条"
                                + (remaining > 0 ? "；队列还剩 " + remaining + " 条。" : "；队列已清空。")
                );
                if (remaining > 0) {
                    requestFlush(5L);
                }
            }
            if (remaining == 0) {
                attemptPendingCalibrations();
            }
            if (remaining == 0 && pendingCalibrationPayloads.isEmpty()) {
                completePendingSessions();
            }
            if (remaining == 0 && !accepting && completionPendingRevisions.isEmpty()) {
                active = false;
                listener.onStatus("训练已结束，结束前样本已全部同步，平台会话已可靠关闭。");
                listener.onDrainComplete();
            }
        } catch (Exception error) {
            listener.onStatus(
                    "上传暂缓；" + queue.size() + " 条数据仍在加密队列中，15 秒后自动重试。"
                            + " 原因：" + summarize(error)
            );
        }
    }

    private void requestFlush(long delayMs) {
        if (!active || !flushScheduled.compareAndSet(false, true)) return;
        worker.schedule(this::flushOnWorker, Math.max(0L, delayMs), TimeUnit.MILLISECONDS);
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
        if (!sample.has("placementRevision")) {
            sample.put("placementRevision", 0L);
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
        long samplePlacementRevision = sample.optLong("placementRevision", 0L);
        String cacheKey = samplePatientId + "\u0000" + gatewayDeviceId + "\u0000"
                + sample.getString("placement") + "\u0000" + samplePlacementRevision;
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

        JSONObject bindingPayload = buildBindingPayload(
                deviceId,
                samplePatientId,
                sample.getString("placement"),
                samplePlacementRevision
        );
        postJson("/api/device-bindings", bindingPayload);
        platformDeviceIds.put(cacheKey, deviceId);
        return deviceId;
    }

    private String ensureSession(String samplePatientId, long samplePlacementRevision) throws Exception {
        String sessionKey = samplePatientId + "\u0000" + samplePlacementRevision;
        String sessionId = sessionIds.get(sessionKey);
        if (sessionId == null) {
            JSONObject sessionPayload = buildSessionPayload(samplePatientId, samplePlacementRevision);
            sessionId = postJson("/api/sensor-sessions", sessionPayload).getString("id");
            sessionIds.put(sessionKey, sessionId);
            if (completionPendingRevisions.contains(samplePlacementRevision)) {
                completionPendingSessionIds.add(
                        completionToken(samplePlacementRevision, sessionId)
                );
                persistPendingState();
            }
        }
        return sessionId;
    }

    static JSONObject buildBindingPayload(
            String deviceId,
            String samplePatientId,
            String placement,
            long samplePlacementRevision
    ) throws Exception {
        JSONObject payload = new JSONObject();
        payload.put("deviceId", deviceId);
        payload.put("patientId", samplePatientId);
        payload.put("placement", placement);
        payload.put("placementRevision", samplePlacementRevision);
        return payload;
    }

    static JSONObject buildSessionPayload(String samplePatientId, long samplePlacementRevision)
            throws Exception {
        JSONObject payload = new JSONObject();
        payload.put("patientId", samplePatientId);
        payload.put("source", "HARDWARE");
        payload.put("placementRevision", samplePlacementRevision);
        return payload;
    }

    static JSONObject buildCalibrationPayload(
            String samplePatientId,
            String sessionId,
            String thighDeviceId,
            String shankDeviceId,
            long revision,
            CalibrationBaseline thigh,
            CalibrationBaseline shank
    ) throws Exception {
        JSONObject baseline = new JSONObject();
        baseline.put("thigh", thigh.toJson());
        baseline.put("shank", shank.toJson());

        JSONObject payload = new JSONObject();
        payload.put("patientId", samplePatientId);
        payload.put("sessionId", sessionId);
        payload.put("thighDeviceId", thighDeviceId);
        payload.put("shankDeviceId", shankDeviceId);
        payload.put("placementRevision", revision);
        payload.put("quality", "GOOD");
        payload.put("baseline", baseline);
        return payload;
    }

    private void maybePublishCalibration(
            String samplePatientId,
            String sessionId,
            long samplePlacementRevision
    ) {
        CalibrationBaseline thigh = calibrationBaselines.get(SensorPlacement.THIGH);
        CalibrationBaseline shank = calibrationBaselines.get(SensorPlacement.SHANK);
        if (thigh == null || shank == null
                || thigh.placementRevision != samplePlacementRevision
                || shank.placementRevision != samplePlacementRevision) {
            return;
        }
        String thighDeviceId = cachedPlatformDeviceId(
                samplePatientId, thigh.gatewayDeviceId, "THIGH", samplePlacementRevision
        );
        String shankDeviceId = cachedPlatformDeviceId(
                samplePatientId, shank.gatewayDeviceId, "SHANK", samplePlacementRevision
        );
        if (thighDeviceId == null || shankDeviceId == null) {
            return;
        }
        try {
            JSONObject payload = buildCalibrationPayload(
                    samplePatientId,
                    sessionId,
                    thighDeviceId,
                    shankDeviceId,
                    samplePlacementRevision,
                    thigh,
                    shank
            );
            String calibrationKey = calibrationKeyFromPayload(payload);
            if (publishedCalibrationKeys.contains(calibrationKey)) {
                return;
            }
            pendingCalibrationPayloads.put(
                    calibrationKey,
                    payload
            );
            persistPendingState();
            attemptPendingCalibrations();
        } catch (Exception error) {
            listener.onStatus("无法构造软件零点校准请求，仍保留待重试状态：" + summarize(error));
        }
    }

    private void attemptPendingCalibrations() {
        if (pendingCalibrationPayloads.isEmpty()) {
            return;
        }
        long now = System.currentTimeMillis();
        if (now - lastCalibrationAttemptAtMs < 5_000L) {
            return;
        }
        lastCalibrationAttemptAtMs = now;
        for (Map.Entry<String, JSONObject> entry :
                new HashMap<>(pendingCalibrationPayloads).entrySet()) {
            try {
                postJson("/api/device-calibrations", entry.getValue());
                pendingCalibrationPayloads.remove(entry.getKey());
                publishedCalibrationKeys.add(entry.getKey());
                persistPendingState();
                listener.onStatus(
                        "双传感器软件零点已登记为 GOOD 校准，版本 "
                                + entry.getValue().optLong("placementRevision") + "。"
                );
            } catch (Exception error) {
                listener.onStatus(
                        "软件零点已保存在手机，但平台校准登记待重试：" + summarize(error)
                );
                return;
            }
        }
    }

    private String cachedPlatformDeviceId(
            String samplePatientId,
            String gatewayDeviceId,
            String placement,
            long revision
    ) {
        return platformDeviceIds.get(
                samplePatientId + "\u0000" + gatewayDeviceId + "\u0000"
                        + placement + "\u0000" + revision
        );
    }

    private void completePendingSessions() throws Exception {
        for (String token : new HashSet<>(completionPendingSessionIds)) {
            int separator = token.indexOf('|');
            String sessionId = separator >= 0 ? token.substring(separator + 1) : token;
            JSONObject body = new JSONObject();
            body.put("status", "COMPLETED");
            patchJson("/api/sensor-sessions/" + urlPath(sessionId), body);
            completionPendingSessionIds.remove(token);
            sessionIds.entrySet().removeIf(entry -> sessionId.equals(entry.getValue()));
            persistPendingState();
        }
        for (Long revision : new HashSet<>(completionPendingRevisions)) {
            String suffix = "\u0000" + revision;
            boolean hasSession = sessionIds.keySet().stream().anyMatch(key -> key.endsWith(suffix));
            boolean hasPendingId = completionPendingSessionIds.stream()
                    .anyMatch(token -> token.startsWith(revision + "|"));
            if (!hasSession && !hasPendingId) {
                completionPendingRevisions.remove(revision);
                persistPendingState();
            }
        }
    }

    private void scheduleKnownSessionsForCompletion(long revision) {
        String suffix = "\u0000" + revision;
        for (Map.Entry<String, String> entry : sessionIds.entrySet()) {
            if (entry.getKey().endsWith(suffix)) {
                completionPendingSessionIds.add(completionToken(revision, entry.getValue()));
            }
        }
    }

    private static String completionToken(long revision, String sessionId) {
        return revision + "|" + sessionId;
    }

    private void restorePendingState() {
        if (statePreferences == null) {
            return;
        }
        for (String value : statePreferences.getStringSet("pending-session-revisions", new HashSet<>())) {
            try {
                completionPendingRevisions.add(Long.parseLong(value));
            } catch (NumberFormatException ignored) {
                // Ignore damaged state and preserve the remaining retry entries.
            }
        }
        completionPendingSessionIds.addAll(
                statePreferences.getStringSet("pending-session-completions", new HashSet<>())
        );
        publishedCalibrationKeys.addAll(
                statePreferences.getStringSet("published-calibration-keys", new HashSet<>())
        );
        for (String encoded : statePreferences.getStringSet("pending-calibrations", new HashSet<>())) {
            try {
                JSONObject payload = new JSONObject(encoded);
                pendingCalibrationPayloads.put(calibrationKeyFromPayload(payload), payload);
            } catch (Exception ignored) {
                // A damaged retry entry must not prevent the gateway from starting.
            }
        }
    }

    private void persistPendingState() {
        if (statePreferences == null) {
            return;
        }
        Set<String> revisions = new HashSet<>();
        for (Long revision : completionPendingRevisions) {
            revisions.add(String.valueOf(revision));
        }
        Set<String> calibrations = new HashSet<>();
        for (JSONObject payload : pendingCalibrationPayloads.values()) {
            calibrations.add(payload.toString());
        }
        statePreferences.edit()
                .putStringSet("pending-session-revisions", revisions)
                .putStringSet("pending-session-completions", new HashSet<>(completionPendingSessionIds))
                .putStringSet("pending-calibrations", calibrations)
                .putStringSet("published-calibration-keys", new HashSet<>(publishedCalibrationKeys))
                .apply();
    }

    private static String calibrationKeyFromPayload(JSONObject payload) throws Exception {
        JSONObject baseline = payload.getJSONObject("baseline");
        return payload.getString("patientId") + "\u0000"
                + payload.getLong("placementRevision") + "\u0000"
                + baseline.getJSONObject("thigh").getJSONObject("offset").toString()
                + "\u0000"
                + baseline.getJSONObject("shank").getJSONObject("offset").toString();
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

    private JSONObject patchJson(String path, JSONObject body) throws Exception {
        HttpURLConnection connection = open(path);
        try {
            connection.setRequestMethod("PATCH");
            connection.setDoOutput(true);
            try (OutputStream output = connection.getOutputStream()) {
                output.write(body.toString().getBytes(StandardCharsets.UTF_8));
            }
            return readJsonResponse(connection, "PATCH " + path);
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
            throw new HttpStatusException(status, label + " failed (" + status + ")");
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
                if (result.length() + line.length() > MAX_RESPONSE_CHARS) {
                    throw new IllegalStateException("Platform response exceeded the safety limit.");
                }
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

    private static String urlPath(String value) throws Exception {
        return URLEncoder.encode(value, StandardCharsets.UTF_8.name()).replace("+", "%20");
    }

    static final class CalibrationBaseline {
        final String gatewayDeviceId;
        final long placementRevision;
        final double rawRoll;
        final double rawPitch;
        final double rawYaw;
        final double zeroRoll;
        final double zeroPitch;
        final double zeroYaw;

        CalibrationBaseline(
                String gatewayDeviceId,
                long placementRevision,
                double rawRoll,
                double rawPitch,
                double rawYaw,
                double zeroRoll,
                double zeroPitch,
                double zeroYaw
        ) {
            this.gatewayDeviceId = gatewayDeviceId;
            this.placementRevision = placementRevision;
            this.rawRoll = rawRoll;
            this.rawPitch = rawPitch;
            this.rawYaw = rawYaw;
            this.zeroRoll = zeroRoll;
            this.zeroPitch = zeroPitch;
            this.zeroYaw = zeroYaw;
        }

        static CalibrationBaseline fromSample(SensorSample sample) {
            return new CalibrationBaseline(
                    sample.gatewayDeviceId,
                    sample.placementRevision,
                    sample.softwareZero.roll,
                    sample.softwareZero.pitch,
                    sample.softwareZero.yaw,
                    sample.softwareZero.roll,
                    sample.softwareZero.pitch,
                    sample.softwareZero.yaw
            );
        }

        JSONObject toJson() throws Exception {
            JSONObject raw = new JSONObject();
            raw.put("roll", rawRoll);
            raw.put("pitch", rawPitch);
            raw.put("yaw", rawYaw);
            JSONObject offset = new JSONObject();
            offset.put("roll", zeroRoll);
            offset.put("pitch", zeroPitch);
            offset.put("yaw", zeroYaw);
            JSONObject value = new JSONObject();
            value.put("gatewayDeviceId", gatewayDeviceId);
            value.put("raw", raw);
            value.put("offset", offset);
            return value;
        }

        String zeroKey() {
            return zeroRoll + "," + zeroPitch + "," + zeroYaw;
        }
    }
}
