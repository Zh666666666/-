package cn.tkarehab.gateway;

import android.app.Application;
import android.content.Context;
import android.content.SharedPreferences;

import java.io.PrintWriter;
import java.io.StringWriter;

/** Persists the last uncaught startup failure locally for no-USB field diagnosis. */
public final class TkaApplication extends Application {
    private static final String DIAGNOSTIC_PREFERENCES = "startup-diagnostics";
    private static final String LAST_CRASH_KEY = "last-crash";

    @Override
    public void onCreate() {
        super.onCreate();
        final Thread.UncaughtExceptionHandler previous = Thread.getDefaultUncaughtExceptionHandler();
        Thread.setDefaultUncaughtExceptionHandler((thread, error) -> {
            saveCrash(this, error);
            if (previous != null) {
                previous.uncaughtException(thread, error);
            }
        });
    }

    static String lastCrash(Context context) {
        return preferences(context).getString(LAST_CRASH_KEY, "");
    }

    static void clearLastCrash(Context context) {
        preferences(context).edit().remove(LAST_CRASH_KEY).apply();
    }

    private static void saveCrash(Context context, Throwable error) {
        try {
            StringWriter writer = new StringWriter();
            error.printStackTrace(new PrintWriter(writer));
            preferences(context).edit().putString(LAST_CRASH_KEY, writer.toString()).apply();
        } catch (Exception ignored) {
            // Let Android's original handler finish the crash path even if local reporting fails.
        }
    }

    private static SharedPreferences preferences(Context context) {
        return context.getSharedPreferences(DIAGNOSTIC_PREFERENCES, MODE_PRIVATE);
    }
}
