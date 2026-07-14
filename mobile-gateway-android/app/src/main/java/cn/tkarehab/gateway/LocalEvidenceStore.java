package cn.tkarehab.gateway;

import android.content.Context;

import androidx.security.crypto.EncryptedFile;
import androidx.security.crypto.MasterKey;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.util.Arrays;
import java.util.Comparator;
import java.util.UUID;

/**
 * Encrypted, server-independent evidence journal. Export is the only point at
 * which a user-readable JSON copy is written, and it is placed in app cache.
 */
final class LocalEvidenceStore {
    static final String SCHEMA_VERSION = "tka-local-evidence/v1";
    private static final long MIN_SAMPLE_INTERVAL_MS = 500L;
    private static final int MAX_SAMPLES_PER_SESSION = 20_000;

    static final class Summary {
        final String sessionId;
        final String status;
        final int sampleCount;
        final int eventCount;
        final long startedAtMs;
        final long endedAtMs;

        Summary(String sessionId, String status, int sampleCount, int eventCount, long startedAtMs, long endedAtMs) {
            this.sessionId = sessionId;
            this.status = status;
            this.sampleCount = sampleCount;
            this.eventCount = eventCount;
            this.startedAtMs = startedAtMs;
            this.endedAtMs = endedAtMs;
        }
    }

    private static final class ActiveSession {
        final String id;
        final String subjectId;
        final String appVersion;
        final long startedAtMs;
        final File directory;
        int sampleCount;
        int eventCount;
        long lastSavedAtMs;

        ActiveSession(String id, String subjectId, String appVersion, long startedAtMs, File directory) {
            this.id = id;
            this.subjectId = subjectId;
            this.appVersion = appVersion;
            this.startedAtMs = startedAtMs;
            this.directory = directory;
        }
    }

    private final Context context;
    private final MasterKey masterKey;
    private final File root;
    private EvidenceEventDetector detector = new EvidenceEventDetector();
    private ActiveSession active;

    LocalEvidenceStore(Context context) throws Exception {
        this.context = context.getApplicationContext();
        masterKey = new MasterKey.Builder(this.context)
                .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
                .build();
        root = new File(this.context.getFilesDir(), "local-evidence-sessions");
        ensureDirectory(root);
        recoverInterruptedSession();
    }

    synchronized Summary start(String subjectId, String appVersion) throws Exception {
        if (active != null) {
            throw new IllegalStateException("已有本地任务正在采集。");
        }
        long now = System.currentTimeMillis();
        String id = String.format("session-%019d-%s", now, UUID.randomUUID());
        File directory = new File(root, id);
        ensureDirectory(directory);
        ensureDirectory(new File(directory, "samples"));
        ensureDirectory(new File(directory, "events"));
        active = new ActiveSession(id, normalizeSubject(subjectId), appVersion, now, directory);
        detector = new EvidenceEventDetector();
        appendEvent("SESSION_STARTED", "INFO", "本地采集任务已开始", "真实 BLE 样本开始写入手机加密存储。", false, now);
        writeManifest(active, "ACTIVE", 0L, "USER_STARTED");
        return summary(active, "ACTIVE", 0L);
    }

    synchronized Summary accept(SensorSample sample) throws Exception {
        if (active == null) return latestSummary();
        if (active.sampleCount >= MAX_SAMPLES_PER_SESSION) {
            appendEvent("STORAGE_LIMIT", "HIGH", "本地任务已达到样本上限", "单任务最多保存 20000 个样本，系统已停止继续写入。", true, sample.recordedAtMs);
            return finish("STORAGE_LIMIT");
        }
        if (sample.recordedAtMs - active.lastSavedAtMs < MIN_SAMPLE_INTERVAL_MS) {
            return summary(active, "ACTIVE", 0L);
        }
        active.lastSavedAtMs = sample.recordedAtMs;
        writeRecord(new File(active.directory, "samples"), sample.recordedAtMs, "sample", sample.toEvidenceJson());
        active.sampleCount += 1;
        for (EvidenceEventDetector.Signal signal : detector.inspect(sample)) {
            appendEvent(signal.type, signal.severity, signal.title, signal.evidence, true, sample.recordedAtMs);
        }
        if (active.sampleCount % 20 == 0) {
            writeManifest(active, "ACTIVE", 0L, "CHECKPOINT");
        }
        return summary(active, "ACTIVE", 0L);
    }

    synchronized Summary recordConnectionEvent(String address, boolean connected) throws Exception {
        if (active == null) return latestSummary();
        appendEvent(
                connected ? "DEVICE_RECONNECTED" : "DEVICE_DISCONNECTED",
                connected ? "INFO" : "HIGH",
                connected ? "传感器已重新连接" : "采集中传感器断开",
                address + (connected ? " 已恢复 BLE 连接。" : " 已断开 BLE 连接，需要确认设备电量、距离或任务状态。"),
                !connected,
                System.currentTimeMillis()
        );
        return summary(active, "ACTIVE", 0L);
    }

    synchronized Summary finish(String reason) throws Exception {
        if (active == null) return latestSummary();
        long now = System.currentTimeMillis();
        appendEvent("SESSION_FINISHED", "INFO", "本地采集任务已结束", "结束原因：" + reason, false, now);
        writeManifest(active, "COMPLETED", now, reason);
        Summary result = summary(active, "COMPLETED", now);
        active = null;
        return result;
    }

    synchronized boolean isActive() {
        return active != null;
    }

    synchronized Summary latestSummary() throws Exception {
        if (active != null) return summary(active, "ACTIVE", 0L);
        File directory = latestSessionDirectory();
        if (directory == null) return null;
        JSONObject manifest = readLatestManifest(directory);
        return new Summary(
                manifest.getString("id"),
                manifest.optString("status", "UNKNOWN"),
                countRecords(new File(directory, "samples")),
                countRecords(new File(directory, "events")),
                manifest.optLong("startedAtMs", 0L),
                manifest.optLong("endedAtMs", 0L)
        );
    }

    synchronized File exportLatest() throws Exception {
        File directory = latestSessionDirectory();
        if (directory == null) {
            throw new IllegalStateException("还没有可导出的本地采集任务。");
        }
        JSONObject manifest = readLatestManifest(directory);
        JSONArray samples = readRecords(new File(directory, "samples"));
        JSONArray events = readRecords(new File(directory, "events"));
        JSONObject session = new JSONObject(manifest.toString());
        session.put("sampleCount", samples.length());
        session.put("eventCount", events.length());

        JSONObject evidence = new JSONObject();
        evidence.put("schemaVersion", SCHEMA_VERSION);
        evidence.put("exportedAt", SensorSample.formatRecordedAt(System.currentTimeMillis()));
        evidence.put("session", session);
        evidence.put("samples", samples);
        evidence.put("events", events);

        File exportDirectory = new File(context.getCacheDir(), "evidence-exports");
        ensureDirectory(exportDirectory);
        File destination = new File(exportDirectory, manifest.getString("id") + ".json");
        try (OutputStream output = new FileOutputStream(destination, false)) {
            output.write(evidence.toString(2).getBytes(StandardCharsets.UTF_8));
        }
        return destination;
    }

    private void recoverInterruptedSession() throws Exception {
        File directory = latestSessionDirectory();
        if (directory == null) return;
        JSONObject manifest = readLatestManifest(directory);
        if (!"ACTIVE".equals(manifest.optString("status"))) return;
        active = new ActiveSession(
                manifest.getString("id"),
                manifest.optString("subjectId", "local-subject"),
                manifest.optString("appVersion", "unknown"),
                manifest.optLong("startedAtMs", System.currentTimeMillis()),
                directory
        );
        active.sampleCount = countRecords(new File(directory, "samples"));
        active.eventCount = countRecords(new File(directory, "events"));
        appendEvent("SESSION_INTERRUPTED", "HIGH", "上次采集未正常结束", "应用退出或系统终止了采集任务，已自动封存现有数据。", true, System.currentTimeMillis());
        finish("APP_INTERRUPTED");
    }

    private void appendEvent(String type, String severity, String title, String evidence, boolean requiresAction, long occurredAtMs) throws Exception {
        if (active == null) return;
        JSONObject event = new JSONObject();
        event.put("id", UUID.randomUUID().toString());
        event.put("type", type);
        event.put("severity", severity);
        event.put("status", "OPEN");
        event.put("occurredAt", SensorSample.formatRecordedAt(occurredAtMs));
        event.put("title", title);
        event.put("evidence", evidence);
        event.put("requiresAction", requiresAction);
        writeRecord(new File(active.directory, "events"), occurredAtMs, "event", event);
        active.eventCount += 1;
    }

    private void writeManifest(ActiveSession session, String status, long endedAtMs, String reason) throws Exception {
        JSONObject manifest = new JSONObject();
        manifest.put("id", session.id);
        manifest.put("subjectId", session.subjectId);
        manifest.put("status", status);
        manifest.put("source", "HARDWARE");
        manifest.put("sensorModel", "WT9011DCL-BT50");
        manifest.put("appVersion", session.appVersion);
        manifest.put("startedAt", SensorSample.formatRecordedAt(session.startedAtMs));
        manifest.put("startedAtMs", session.startedAtMs);
        manifest.put("endedAt", endedAtMs > 0 ? SensorSample.formatRecordedAt(endedAtMs) : JSONObject.NULL);
        manifest.put("endedAtMs", endedAtMs);
        manifest.put("endReason", reason);
        manifest.put("sampleCount", session.sampleCount);
        manifest.put("eventCount", session.eventCount);
        writeRecord(session.directory, System.currentTimeMillis(), "manifest", manifest);
    }

    private void writeRecord(File directory, long atMs, String label, JSONObject payload) throws Exception {
        ensureDirectory(directory);
        File destination = new File(directory, String.format("%019d-%s-%s.payload", atMs, label, UUID.randomUUID()));
        try (OutputStream output = encrypted(destination).openFileOutput()) {
            output.write(payload.toString().getBytes(StandardCharsets.UTF_8));
        }
    }

    private JSONArray readRecords(File directory) throws Exception {
        JSONArray result = new JSONArray();
        for (File file : payloadFiles(directory, null)) {
            result.put(readJson(file));
        }
        return result;
    }

    private JSONObject readLatestManifest(File directory) throws Exception {
        File[] files = payloadFiles(directory, "-manifest-");
        if (files.length == 0) throw new IllegalStateException("本地任务缺少清单文件。");
        JSONObject latest = null;
        for (File file : files) {
            JSONObject candidate = readJson(file);
            if (latest == null || isNewerManifest(candidate, latest)) {
                latest = candidate;
            }
        }
        return latest;
    }

    private static boolean isNewerManifest(JSONObject candidate, JSONObject current) {
        boolean candidateCompleted = "COMPLETED".equals(candidate.optString("status"));
        boolean currentCompleted = "COMPLETED".equals(current.optString("status"));
        if (candidateCompleted != currentCompleted) return candidateCompleted;
        if (candidateCompleted) {
            return candidate.optLong("endedAtMs", 0L) >= current.optLong("endedAtMs", 0L);
        }
        int candidateProgress = candidate.optInt("sampleCount", 0) + candidate.optInt("eventCount", 0);
        int currentProgress = current.optInt("sampleCount", 0) + current.optInt("eventCount", 0);
        return candidateProgress >= currentProgress;
    }

    private JSONObject readJson(File file) throws Exception {
        try (InputStream input = encrypted(file).openFileInput(); ByteArrayOutputStream output = new ByteArrayOutputStream()) {
            byte[] buffer = new byte[4096];
            int count;
            while ((count = input.read(buffer)) != -1) output.write(buffer, 0, count);
            return new JSONObject(output.toString(StandardCharsets.UTF_8.name()));
        }
    }

    private EncryptedFile encrypted(File destination) throws Exception {
        return new EncryptedFile.Builder(
                context,
                destination,
                masterKey,
                EncryptedFile.FileEncryptionScheme.AES256_GCM_HKDF_4KB
        ).build();
    }

    private File latestSessionDirectory() {
        File[] directories = root.listFiles(File::isDirectory);
        if (directories == null || directories.length == 0) return null;
        Arrays.sort(directories, Comparator.comparing(File::getName));
        return active != null ? active.directory : directories[directories.length - 1];
    }

    private static File[] payloadFiles(File directory, String contains) {
        File[] files = directory.listFiles((file, name) -> name.endsWith(".payload") && (contains == null || name.contains(contains)));
        if (files == null) return new File[0];
        Arrays.sort(files, Comparator.comparing(File::getName));
        return files;
    }

    private static int countRecords(File directory) {
        return payloadFiles(directory, null).length;
    }

    private static void ensureDirectory(File directory) {
        if (!directory.exists() && !directory.mkdirs()) {
            throw new IllegalStateException("Could not create local evidence directory: " + directory.getName());
        }
    }

    private static String normalizeSubject(String subjectId) {
        String value = subjectId == null ? "" : subjectId.trim();
        return value.isEmpty() ? "local-subject" : value;
    }

    private static Summary summary(ActiveSession session, String status, long endedAtMs) {
        return new Summary(session.id, status, session.sampleCount, session.eventCount, session.startedAtMs, endedAtMs);
    }
}
