package cn.tkarehab.gateway;

import android.app.Activity;
import android.content.Intent;
import android.os.Build;
import android.os.Bundle;
import android.text.TextUtils;
import android.view.View;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;

import java.io.PrintWriter;
import java.io.StringWriter;

/**
 * Opens the gateway normally, or preserves the previous startup failure for field diagnosis.
 *
 * Two incomplete-launch signals are supported:
 * 1. A Java stack trace captured by {@link TkaApplication}.
 * 2. A pending-launch flag that MainActivity never cleared (native crash / process kill).
 */
public final class StartupActivity extends Activity {
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        String crash = TkaApplication.lastCrash(this);
        boolean incompleteLaunch = TkaApplication.hadIncompleteLaunch(this);

        if (!TextUtils.isEmpty(crash)) {
            setContentView(diagnosticView(
                    "上一次启动未完成。以下堆栈只保存在本机，请截屏反馈后再重试。",
                    crash
            ));
            return;
        }

        if (incompleteLaunch) {
            setContentView(diagnosticView(
                    "上一次启动在进入主界面前异常退出，但没有留下 Java 堆栈。"
                            + " 这通常是 native 崩溃、系统直接杀进程，或崩溃记录未能落盘。"
                            + " 请截屏反馈手机型号、Android 版本，然后点“清除诊断并重试”。",
                    deviceFingerprint()
            ));
            return;
        }

        openGateway();
    }

    private void openGateway() {
        try {
            TkaApplication.markLaunchPending(this);
            Intent intent = new Intent(this, MainActivity.class);
            intent.addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP);
            startActivity(intent);
            finish();
        } catch (Throwable error) {
            setContentView(diagnosticView(
                    "无法打开主界面。请截屏反馈以下信息。",
                    stackTrace(error)
            ));
        }
    }

    private View diagnosticView(String summary, String detailsText) {
        int padding = dp(20);
        LinearLayout content = new LinearLayout(this);
        content.setOrientation(LinearLayout.VERTICAL);
        content.setPadding(padding, padding, padding, padding);

        TextView title = new TextView(this);
        title.setText("TKA 网关启动诊断");
        title.setTextSize(22);
        title.setTextColor(0xFF0F2942);
        content.addView(title);

        TextView message = new TextView(this);
        message.setText(summary);
        message.setPadding(0, dp(10), 0, dp(10));
        content.addView(message);

        TextView details = new TextView(this);
        details.setText(detailsText);
        details.setTextIsSelectable(true);
        details.setTextSize(12);
        details.setTextColor(0xFF8A1C1C);
        content.addView(details);

        Button retry = new Button(this);
        retry.setText("清除诊断并重试");
        retry.setOnClickListener(view -> {
            TkaApplication.clearLastCrash(this);
            openGateway();
        });
        LinearLayout.LayoutParams retryLayout = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT
        );
        retryLayout.topMargin = dp(16);
        content.addView(retry, retryLayout);

        Button copyHint = new Button(this);
        copyHint.setText("长按上方红色文字可选中复制");
        copyHint.setEnabled(false);
        content.addView(copyHint);

        ScrollView scroll = new ScrollView(this);
        scroll.setFillViewport(true);
        scroll.addView(content);
        return scroll;
    }

    private String deviceFingerprint() {
        String abi = Build.SUPPORTED_ABIS.length > 0 ? Build.SUPPORTED_ABIS[0] : "unknown";
        return "pending-launch=true\n"
                + "package=" + getPackageName() + "\n"
                + "android=" + Build.VERSION.RELEASE + " (API " + Build.VERSION.SDK_INT + ")\n"
                + "device=" + Build.MANUFACTURER + " " + Build.MODEL + "\n"
                + "abi=" + abi;
    }

    private int dp(int value) {
        return Math.round(value * getResources().getDisplayMetrics().density);
    }

    private static String stackTrace(Throwable error) {
        StringWriter writer = new StringWriter();
        error.printStackTrace(new PrintWriter(writer));
        return writer.toString();
    }
}
