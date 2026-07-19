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
import java.util.Comparator;
import java.util.UUID;

/**
 * A durable append-only encrypted journal. Each reading has its own encrypted
 * file, so a power loss cannot overwrite older queued readings.
 */
final class EncryptedSampleQueue {
    private static final int MAX_ITEMS = 50_000;

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

    synchronized void acknowledgeOne() {
        File[] files = files();
        if (files.length > 0 && !files[0].delete()) {
            throw new IllegalStateException("Could not remove an uploaded encrypted sample.");
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

    synchronized int size() {
        return files().length;
    }

    private EncryptedFile encrypted(File destination) throws GeneralSecurityException, IOException {
        return new EncryptedFile.Builder(
                context,
                destination,
                masterKey,
                EncryptedFile.FileEncryptionScheme.AES256_GCM_HKDF_4KB
        ).build();
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
