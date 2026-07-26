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
import java.util.Arrays;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;
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

    EncryptedSampleQueue(Context context) throws Exception {
        this.context = context.getApplicationContext();
        masterKey = new MasterKey.Builder(this.context)
                .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
                .build();
        directory = new File(this.context.getFilesDir(), "sensor-sample-queue");
        if (!directory.exists() && !directory.mkdirs()) {
            throw new IllegalStateException("Could not create the encrypted sample queue directory.");
        }
    }

    synchronized void append(JSONObject item) throws Exception {
        if (files().length >= MAX_ITEMS) {
            throw new IllegalStateException("Offline queue limit reached.");
        }
        File destination = new File(
                directory,
                String.format("%019d-%s.payload", System.currentTimeMillis(), UUID.randomUUID())
        );
        try (OutputStream output = encrypted(destination).openFileOutput()) {
            output.write(item.toString().getBytes(StandardCharsets.UTF_8));
        }
    }

    synchronized JSONObject peek() throws Exception {
        File[] files = files();
        if (files.length == 0) {
            return null;
        }
        File head = files[0];
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
            throw new IllegalStateException("A damaged queued sample was quarantined for inspection.", error);
        }
    }

    synchronized List<JSONObject> peekBatch(int limit) throws Exception {
        File[] files = files();
        int count = Math.min(Math.max(1, limit), files.length);
        List<JSONObject> result = new ArrayList<>(count);
        for (int index = 0; index < count; index += 1) {
            result.add(read(files[index]));
        }
        return result;
    }

    synchronized List<Item> peekBalancedBatch(int limit) throws Exception {
        File[] files = files();
        int[] indexes = balancedIndexes(files.length, limit);
        List<Item> result = new ArrayList<>(indexes.length);
        for (int index : indexes) {
            File file = files[index];
            result.add(new Item(file.getName(), read(file)));
        }
        return result;
    }

    synchronized void acknowledgeOne() {
        File[] files = files();
        if (files.length > 0 && !files[0].delete()) {
            throw new IllegalStateException("Could not remove an uploaded encrypted sample.");
        }
    }

    synchronized void acknowledge(int count) {
        File[] files = files();
        int removable = Math.min(Math.max(0, count), files.length);
        for (int index = 0; index < removable; index += 1) {
            if (!files[index].delete()) {
                throw new IllegalStateException("Could not remove an uploaded encrypted sample.");
            }
        }
    }

    synchronized void acknowledgeKeys(Set<String> keys) {
        if (keys.isEmpty()) return;
        for (File file : files()) {
            if (keys.contains(file.getName()) && !file.delete()) {
                throw new IllegalStateException("Could not remove an uploaded encrypted sample.");
            }
        }
    }

    synchronized void quarantineOne(String reason) {
        File[] files = files();
        if (files.length == 0) return;
        File head = files[0];
        String safeReason = reason.replaceAll("[^a-zA-Z0-9-]", "-");
        File quarantined = new File(directory, head.getName().replace(".payload", ".rejected-" + safeReason));
        if (!head.renameTo(quarantined)) {
            throw new IllegalStateException("Could not isolate a permanently rejected queued sample.");
        }
    }

    synchronized void quarantineKey(String key, String reason) {
        File head = new File(directory, key);
        if (!head.exists()) return;
        String safeReason = reason.replaceAll("[^a-zA-Z0-9-]", "-");
        File quarantined = new File(directory, head.getName().replace(".payload", ".rejected-" + safeReason));
        if (!head.renameTo(quarantined)) {
            throw new IllegalStateException("Could not isolate a permanently rejected queued sample.");
        }
    }

    synchronized int size() {
        return files().length;
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

    private File[] files() {
        File[] files = directory.listFiles((file, name) -> name.endsWith(".payload"));
        if (files == null) {
            return new File[0];
        }
        Arrays.sort(files, Comparator.comparing(File::getName));
        return files;
    }
}
