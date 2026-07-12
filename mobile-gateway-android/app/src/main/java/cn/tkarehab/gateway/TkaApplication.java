package cn.tkarehab.gateway;

import android.app.Application;
import android.content.Context;
import android.content.SharedPreferences;

import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.PrintWriter;
import java.io.StringWriter;
import java.nio.charset.StandardCharsets;

/**
 * Persists the last uncaught startup failure locally for no-USB field diagnosis.
 *
 * SharedPreferences must use commit() here: apply() is asynchronous and is often
 * lost when Android kills the process during an uncaught exception. A sidecar file
 * is written as a second durable path for OEM devices that drop preference writes.
 */
public final class TkaApplication extends Application {
    private static final String DIAGNOSTIC_PREFERENCES = "startup-diagnostics";
    private static final String LAST_CRASH_KEY = "last-crash";
    private static final String PENDING_LAUNCH_KEY = "pending-launch";
    private static final String CRASH_FILE_NAME = "last-startup-crash.txt";

    @Override
    public void onCreate() {
        super.onCreate();
        final Thread.UncaughtExceptionHandler previous = Thread.getDefaultUncaughtExceptionHandler();
        Thread.setDefaultUncaughtExceptionHandler((thread, error) -> {
            saveCrash(this, error);
            if (previous != null) {
                previous.uncaughtException(thread, error);
            } else {
                System.exit(10);
            }
        });
    }

    static String lastCrash(Context context) {
        String fromPreferences = preferences(context).getString(LAST_CRASH_KEY, "");
        if (fromPreferences != null && !fromPreferences.isEmpty()) {
            return fromPreferences;
        }
        return readCrashFile(context);
    }

    static void clearLastCrash(Context context) {
        preferences(context).edit()
                .remove(LAST_CRASH_KEY)
                .remove(PENDING_LAUNCH_KEY)
                .commit();
        File crashFile = crashFile(context);
        if (crashFile.exists()) {
            // Best-effort cleanup; a leftover file would only re-show diagnostics.
            //noinspection ResultOfMethodCallIgnored
            crashFile.delete();
        }
    }

    /** Marks that the launcher is about to open MainActivity. Cleared on success. */
    static void markLaunchPending(Context context) {
        preferences(context).edit().putBoolean(PENDING_LAUNCH_KEY, true).commit();
    }

    /** Called once MainActivity has rendered far enough to clear the incomplete-launch flag. */
    static void markLaunchSucceeded(Context context) {
        preferences(context).edit().putBoolean(PENDING_LAUNCH_KEY, false).commit();
    }

    /**
     * True when the previous process set a pending launch but never cleared it.
     * Covers native crashes and process kills that never reach the Java handler.
     */
    static boolean hadIncompleteLaunch(Context context) {
        return preferences(context).getBoolean(PENDING_LAUNCH_KEY, false);
    }

    private static void saveCrash(Context context, Throwable error) {
        try {
            StringWriter writer = new StringWriter();
            error.printStackTrace(new PrintWriter(writer));
            String stack = writer.toString();
            preferences(context).edit()
                    .putString(LAST_CRASH_KEY, stack)
                    .putBoolean(PENDING_LAUNCH_KEY, true)
                    .commit();
            writeCrashFile(context, stack);
        } catch (Exception ignored) {
            // Let Android's original handler finish the crash path even if local reporting fails.
        }
    }

    private static void writeCrashFile(Context context, String stack) {
        try (FileOutputStream output = new FileOutputStream(crashFile(context))) {
            output.write(stack.getBytes(StandardCharsets.UTF_8));
            output.getFD().sync();
        } catch (Exception ignored) {
            // Preference commit is the primary path.
        }
    }

    private static String readCrashFile(Context context) {
        File crashFile = crashFile(context);
        if (!crashFile.exists() || crashFile.length() == 0L) {
            return "";
        }
        try (FileInputStream input = new FileInputStream(crashFile)) {
            byte[] bytes = new byte[(int) Math.min(crashFile.length(), 64_000L)];
            int read = input.read(bytes);
            if (read <= 0) {
                return "";
            }
            return new String(bytes, 0, read, StandardCharsets.UTF_8);
        } catch (Exception ignored) {
            return "";
        }
    }

    private static File crashFile(Context context) {
        return new File(context.getApplicationContext().getFilesDir(), CRASH_FILE_NAME);
    }

    private static SharedPreferences preferences(Context context) {
        return context.getApplicationContext()
                .getSharedPreferences(DIAGNOSTIC_PREFERENCES, MODE_PRIVATE);
    }
}
