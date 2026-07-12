package cn.tkarehab.gateway;

import android.content.Context;
import android.graphics.Typeface;
import android.view.Gravity;
import android.view.View;
import android.widget.LinearLayout;
import android.widget.TextView;

import java.util.Locale;

/** Official-app style live sensor card: connection header + Acc / Gyro / Angle grids. */
final class LiveSensorPanel {
    private final String placementLabel;
    private final TextView title;
    private final TextView subtitle;
    private final TextView meta;
    private final MetricRow acceleration;
    private final MetricRow gyroscope;
    private final MetricRow angle;
    private final LinearLayout root;
    private int sampleCount;
    private long lastRenderAtMs;

    LiveSensorPanel(Context context, String placementLabel, int accentColor) {
        this.placementLabel = placementLabel;
        int padding = dp(context, 12);
        root = new LinearLayout(context);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setBackgroundColor(0xFFFFFFFF);
        root.setPadding(padding, padding, padding, padding);
        root.setElevation(dp(context, 2));

        LinearLayout header = new LinearLayout(context);
        header.setOrientation(LinearLayout.VERTICAL);
        header.setBackgroundColor(accentColor);
        header.setPadding(padding, padding, padding, padding);

        title = new TextView(context);
        title.setText(placementLabel + " · 未连接");
        title.setTextColor(0xFFFFFFFF);
        title.setTextSize(18);
        title.setTypeface(Typeface.DEFAULT_BOLD);
        header.addView(title);

        subtitle = new TextView(context);
        subtitle.setText("等待分配传感器");
        subtitle.setTextColor(0xE6FFFFFF);
        subtitle.setTextSize(13);
        header.addView(subtitle);

        meta = new TextView(context);
        meta.setText("帧数：0");
        meta.setTextColor(0xCCFFFFFF);
        meta.setTextSize(12);
        meta.setPadding(0, dp(context, 4), 0, 0);
        header.addView(meta);
        root.addView(header);

        acceleration = addMetricBlock(context, root, "加速度 Acc (g)", 0xFF0D47A1);
        gyroscope = addMetricBlock(context, root, "角速度 Gyro (°/s)", 0xFF1B5E20);
        angle = addMetricBlock(context, root, "角度 Angle (°)", 0xFF4A148C);

        LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT
        );
        params.bottomMargin = dp(context, 12);
        root.setLayoutParams(params);
    }

    View view() {
        return root;
    }

    void markConnected(String deviceName, String address) {
        title.setText(placementLabel + " · 已连接");
        subtitle.setText(deviceName + "\n" + address);
    }

    void markDisconnected() {
        title.setText(placementLabel + " · 未连接");
        subtitle.setText("等待分配传感器");
        meta.setText("帧数：0");
        sampleCount = 0;
        acceleration.setValues(0, 0, 0);
        gyroscope.setValues(0, 0, 0);
        angle.setValues(0, 0, 0);
    }

    void update(SensorSample sample, boolean force) {
        sampleCount += 1;
        long now = System.currentTimeMillis();
        if (!force && now - lastRenderAtMs < 150L && sampleCount > 1) {
            return;
        }
        lastRenderAtMs = now;

        title.setText(placementLabel + " · 数据中");
        subtitle.setText(sample.deviceName);
        meta.setText("帧数：" + sampleCount + "    刷新：" + formatTime(sample.recordedAtMs));
        acceleration.setValues(sample.ax, sample.ay, sample.az);
        gyroscope.setValues(sample.gx, sample.gy, sample.gz);
        angle.setValues(sample.roll, sample.pitch, sample.yaw);
    }

    private static MetricRow addMetricBlock(Context context, LinearLayout parent, String label, int valueColor) {
        TextView heading = new TextView(context);
        heading.setText(label);
        heading.setTextColor(0xFF37474F);
        heading.setTextSize(14);
        heading.setTypeface(Typeface.DEFAULT_BOLD);
        heading.setPadding(0, dp(context, 10), 0, dp(context, 4));
        parent.addView(heading);

        MetricRow row = new MetricRow(context, valueColor);
        parent.addView(row.view);
        return row;
    }

    private static String formatTime(long epochMs) {
        return new java.text.SimpleDateFormat("HH:mm:ss.SSS", Locale.US)
                .format(new java.util.Date(epochMs));
    }

    private static int dp(Context context, int value) {
        return Math.round(value * context.getResources().getDisplayMetrics().density);
    }

    private static final class MetricRow {
        final LinearLayout view;
        private final TextView x;
        private final TextView y;
        private final TextView z;

        MetricRow(Context context, int valueColor) {
            view = new LinearLayout(context);
            view.setOrientation(LinearLayout.HORIZONTAL);
            view.setBackgroundColor(0xFFF7FAFC);
            view.setPadding(dp(context, 8), dp(context, 8), dp(context, 8), dp(context, 8));

            x = axis(context, "X", valueColor);
            y = axis(context, "Y", valueColor);
            z = axis(context, "Z", valueColor);
            view.addView(wrap(context, x));
            view.addView(wrap(context, y));
            view.addView(wrap(context, z));
            setValues(0, 0, 0);
        }

        void setValues(double xv, double yv, double zv) {
            x.setText(format(xv));
            y.setText(format(yv));
            z.setText(format(zv));
        }

        private static TextView axis(Context context, String axis, int valueColor) {
            TextView value = new TextView(context);
            value.setTextColor(valueColor);
            value.setTextSize(20);
            value.setTypeface(Typeface.MONOSPACE, Typeface.BOLD);
            value.setGravity(Gravity.CENTER);
            value.setTag(axis);
            return value;
        }

        private static LinearLayout wrap(Context context, TextView value) {
            LinearLayout column = new LinearLayout(context);
            column.setOrientation(LinearLayout.VERTICAL);
            column.setGravity(Gravity.CENTER_HORIZONTAL);
            LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1);
            column.setLayoutParams(params);

            TextView axis = new TextView(context);
            axis.setText(String.valueOf(value.getTag()));
            axis.setTextColor(0xFF78909C);
            axis.setTextSize(12);
            axis.setGravity(Gravity.CENTER);
            column.addView(axis);
            column.addView(value);
            return column;
        }

        private static String format(double value) {
            return String.format(Locale.US, "%+.2f", value);
        }
    }
}
