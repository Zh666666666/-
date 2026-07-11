package cn.tkarehab.gateway;

import android.app.Activity;
import android.content.Intent;
import android.os.Bundle;
import android.text.TextUtils;
import android.view.View;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;

/** Opens the gateway normally, or preserves the previous startup stack trace for field diagnosis. */
public final class StartupActivity extends Activity {
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        String crash = TkaApplication.lastCrash(this);
        if (TextUtils.isEmpty(crash)) {
            openGateway();
            return;
        }
        setContentView(diagnosticView(crash));
    }

    private void openGateway() {
        startActivity(new Intent(this, MainActivity.class));
        finish();
    }

    private View diagnosticView(String crash) {
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
        message.setText("上一次启动未完成。以下信息只保存在本机，请截屏反馈后再重试。");
        message.setPadding(0, dp(10), 0, dp(10));
        content.addView(message);

        TextView details = new TextView(this);
        details.setText(crash);
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

        ScrollView scroll = new ScrollView(this);
        scroll.setFillViewport(true);
        scroll.addView(content);
        return scroll;
    }

    private int dp(int value) {
        return Math.round(value * getResources().getDisplayMetrics().density);
    }
}
