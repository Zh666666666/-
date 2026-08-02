package cn.tkarehab.gateway;

import android.content.Context;

import androidx.security.crypto.EncryptedFile;
import androidx.security.crypto.MasterKey;

import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.InputStream;
import java.io.IOException;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.security.GeneralSecurityException;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.NavigableMap;
import java.util.Set;
import java.util.TreeMap;
import java.util.UUID;

/**
 * A durable append-only encrypted journal. Each reading has its own encrypted
 * file, so a power loss cannot overwrite older queued readings.
 */
final class EncryptedSampleQueue {
    private static final int MAX_ITEMS = 50_000;

    static final class Item {
        final String key;
        final JSONObject payload;

        Item(String key, JSONObject payload) {
            this.key = key;
            this.payload = payload;
        }
    }

    private final Context context;
    private final MasterKey masterKey;
    private final File directory;
    private final NavigableMap<String, File> queuedFiles = new TreeMap<>();

    EncryptedSampleQueue(Context context) throws Exception {
        this.context = context.getApplicationContext();
        masterKey = new MasterKey.Builder(this.context)
                .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
                .build();
        directory = new File(this.context.getFilesDir(), "sensor-sample-queue");
        if (!directory.exists() && !directory.mkdirs()) {
            throw new IllegalStateException("Could not create the encrypted sample queue directory.");
        }
        File[] existing = directory.listFiles((file, name) -> name.endsWith(".payload"));
        if (existing != null) {
            for (File file : existing) {
                queuedFiles.put(file.getName(), file);
            }
        }
    }

    synchronized void append(JSONObject item) throws Exception {
        if (queuedFiles.size() >= MAX_ITEMS) {
            throw new IllegalStateException("Offline queue limit reached.");
        }
        File destination = new File(
                directory,
                String.format("%019d-%s.payload", System.currentTimeMillis(), UUID.randomUUID())
        );
        try (OutputStream output = encrypted(destination).openFileOutput()) {
            output.write(item.toString().getBytes(StandardCharsets.UTF_8));
        }
        queuedFiles.put(destination.getName(), destination);
    }

    synchronized JSONObject peek() throws Exception {
        Map.Entry<String, File> first = queuedFiles.firstEntry();
        if (first == null) {
            return null;
        }
        File head = first.getValue();
        try (InputStream input = encrypted(head).openFileInput();
             ByteArrayOutputStream output = new ByteArrayOutputStream()) {
            byte[] buffer = new byte[4096];
            int count;
            while ((count = input.read(buffer)) != -1) {
                output.write(buffer, 0, count);
            }
            return new JSONObject(output.toString(StandardCharsets.UTF_8.name()));
        } catch (Exception error) {
            File quarantined = new File(directory, head.getName().replace(".payload", ".corrupt"));
            if (!head.renameTo(quarantined)) {
                throw new IllegalStateException("A damaged queued sample could not be quarantined.", error);
            }
            queuedFiles.remove(first.getKey());
            throw new IllegalStateException("A damaged queued sample was quarantined for inspection.", error);
        }
    }

    synchronized List<JSONObject> peekBatch(int limit) throws Exception {
        int count = Math.min(Math.max(1, limit), queuedFiles.size());
        List<JSONObject> result = new ArrayList<>(count);
        int index = 0;
        for (File file : queuedFiles.values()) {
            if (index++ >= count) break;
            result.add(read(file));
        }
        return result;
    }

    synchronized List<Item> peekBalancedBatch(int limit) throws Exception {
        int total = queuedFiles.size();
        int count = Math.min(Math.max(1, limit), total);
        if (count == 0) return new ArrayList<>();

        int historicalCount = count == total ? count : Math.max(1, count / 4);
        int liveCount = count - historicalCount;
        LinkedHashSet<String> keys = new LinkedHashSet<>();
        for (String key : queuedFiles.descendingKeySet()) {
            if (keys.size() >= liveCount) break;
            keys.add(key);
        }
        for (String key : queuedFiles.navigableKeySet()) {
            if (keys.size() >= count) break;
            keys.add(key);
        }

        List<Item> result = new ArrayList<>(keys.size());
        for (String key : keys) {
            File file = queuedFiles.get(key);
            if (file != null) result.add(new Item(key, read(file)));
        }
        return result;
    }

    synchronized void acknowledgeOne() {
        Map.Entry<String, File> first = queuedFiles.firstEntry();
        if (first == null) return;
        if (!first.getValue().delete()) {
            throw new IllegalStateException("Could not remove an uploaded encrypted sample.");
        }
        queuedFiles.remove(first.getKey());
    }

    synchronized void acknowledge(int count) {
        int removable = Math.min(Math.max(0, count), queuedFiles.size());
        List<String> keys = new ArrayList<>(removable);
        for (String key : queuedFiles.navigableKeySet()) {
            if (keys.size() >= removable) break;
            keys.add(key);
        }
        for (String key : keys) {
            File file = queuedFiles.get(key);
            if (file != null && !file.delete()) {
                throw new IllegalStateException("Could not remove an uploaded encrypted sample.");
            }
            queuedFiles.remove(key);
        }
    }

    synchronized void acknowledgeKeys(Set<String> keys) {
        if (keys.isEmpty()) return;
        for (String key : keys) {
            File file = queuedFiles.get(key);
            if (file != null && !file.delete()) {
                throw new IllegalStateException("Could not remove an uploaded encrypted sample.");
            }
            queuedFiles.remove(key);
        }
    }

    synchronized void quarantineOne(String reason) {
        Map.Entry<String, File> first = queuedFiles.firstEntry();
        if (first == null) return;
        File head = first.getValue();
        String safeReason = reason.replaceAll("[^a-zA-Z0-9-]", "-");
        File quarantined = new File(directory, head.getName().replace(".payload", ".rejected-" + safeReason));
        if (!head.renameTo(quarantined)) {
            throw new IllegalStateException("Could not isolate a permanently rejected queued sample.");
        }
        queuedFiles.remove(first.getKey());
    }

    synchronized void quarantineKey(String key, String reason) {
        File head = queuedFiles.get(key);
        if (head == null || !head.exists()) return;
        String safeReason = reason.replaceAll("[^a-zA-Z0-9-]", "-");
        File quarantined = new File(directory, head.getName().replace(".payload", ".rejected-" + safeReason));
        if (!head.renameTo(quarantined)) {
            throw new IllegalStateException("Could not isolate a permanently rejected queued sample.");
        }
        queuedFiles.remove(key);
    }

    synchronized int size() {
        return queuedFiles.size();
    }

    static int[] balancedIndexes(int total, int limit) {
        if (total <= 0) return new int[0];
        int count = Math.min(Math.max(1, limit), total);
        if (count == total) {
            int[] all = new int[count];
            for (int index = 0; index < count; index += 1) all[index] = index;
            return all;
        }

        int historicalCount = Math.max(1, count / 4);
        int liveCount = count - historicalCount;
        LinkedHashSet<Integer> indexes = new LinkedHashSet<>();
        for (int index = total - 1; index >= Math.max(0, total - liveCount); index -= 1) {
            indexes.add(index);
        }
        for (int index = 0; index < historicalCount; index += 1) {
            indexes.add(index);
        }

        int[] result = new int[indexes.size()];
        int offset = 0;
        for (Integer index : indexes) result[offset++] = index;
        return result;
    }

    private EncryptedFile encrypted(File destination) throws GeneralSecurityException, IOException {
        return new EncryptedFile.Builder(
                context,
                destination,
                masterKey,
                EncryptedFile.FileEncryptionScheme.AES256_GCM_HKDF_4KB
        ).build();
    }

    private JSONObject read(File file) throws Exception {
        try (InputStream input = encrypted(file).openFileInput();
             ByteArrayOutputStream output = new ByteArrayOutputStream()) {
            byte[] buffer = new byte[4096];
            int count;
            while ((count = input.read(buffer)) != -1) {
                output.write(buffer, 0, count);
            }
            return new JSONObject(output.toString(StandardCharsets.UTF_8.name()));
        }
    }
}
