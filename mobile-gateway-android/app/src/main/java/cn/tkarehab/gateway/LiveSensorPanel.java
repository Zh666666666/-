package cn.tkarehab.gateway;

import android.content.Context;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.view.Gravity;
import android.view.View;
import android.widget.LinearLayout;
import android.widget.TextView;

import java.util.Locale;

/**
 * Official-app style live sensor card with:
 * - 3D attitude cube
 * - Acc / Gyro / Angle numeric grid
 * - scrolling waveforms
 */
final class LiveSensorPanel {
    private final String placementLabel;
    private final int accentColor;
    private final TextView title;
    private final TextView subtitle;
    private final TextView meta;
    private final MetricRow acceleration;
    private final MetricRow gyroscope;
    private final MetricRow angle;
    private final AttitudeCubeView cube;
    private final WaveformView angleWave;
    private final WaveformView accWave;
    private final WaveformView gyroWave;
    private final LinearLayout root;
    private final LinearLayout advancedContent;
    private int sampleCount;
    private long lastRenderAtMs;
    private String connectedAddress = "";
    private boolean receiving;

    LiveSensorPanel(Context context, String placementLabel, int accentColor) {
        this.placementLabel = placementLabel;
        this.accentColor = accentColor;
        int padding = dp(context, 12);

        root = new LinearLayout(context);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setBackground(cardBackground(0xFFFFFFFF, dp(context, 18)));
        root.setPadding(padding, padding, padding, padding);
        root.setElevation(dp(context, 4));

        LinearLayout header = new LinearLayout(context);
        header.setOrientation(LinearLayout.VERTICAL);
        header.setBackground(cardBackground(accentColor, dp(context, 14)));
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

        TextView cubeLabel = sectionLabel(context, "3D 姿态");
        root.addView(cubeLabel);
        cube = new AttitudeCubeView(context);
        cube.setAccent(accentColor);
        LinearLayout.LayoutParams cubeParams = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                dp(context, 190)
        );
        cubeParams.bottomMargin = dp(context, 8);
        cube.setLayoutParams(cubeParams);
        root.addView(cube);

        advancedContent = new LinearLayout(context);
        advancedContent.setOrientation(LinearLayout.VERTICAL);
        acceleration = addMetricBlock(context, advancedContent, "身体移动（加速度，g）", 0xFF0D47A1);
        gyroscope = addMetricBlock(context, advancedContent, "转动速度（角速度，°/s）", 0xFF1B5E20);
        angle = addMetricBlock(context, advancedContent, "佩戴姿态（角度，°）", 0xFF4A148C);

        advancedContent.addView(sectionLabel(context, "专业数据曲线"));
        angleWave = addWave(context, advancedContent, "佩戴姿态", "°", 180f);
        accWave = addWave(context, advancedContent, "身体移动", "g", 4f);
        gyroWave = addWave(context, advancedContent, "转动速度", "°/s", 500f);
        advancedContent.setVisibility(View.GONE);
        root.addView(advancedContent);

        LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT
        );
        params.bottomMargin = dp(context, 14);
        root.setLayoutParams(params);
    }

    View view() {
        return root;
    }

    void setAdvancedVisible(boolean visible) {
        advancedContent.setVisibility(visible ? View.VISIBLE : View.GONE);
    }

    void markConnected(String deviceName, String address) {
        if (!address.equals(connectedAddress)) {
            resetStream();
            connectedAddress = address;
            title.setText(placementLabel + " · 已连接");
            subtitle.setText(deviceName + " · " + address);
        }
    }

    void markDisconnected() {
        title.setText(placementLabel + " · 未连接");
        subtitle.setText("等待分配传感器");
        meta.setText("帧数：0");
        resetStream();
        connectedAddress = "";
    }

    private void resetStream() {
        sampleCount = 0;
        lastRenderAtMs = 0L;
        receiving = false;
        acceleration.setValues(0, 0, 0);
        gyroscope.setValues(0, 0, 0);
        angle.setValues(0, 0, 0);
        cube.setAttitude(0, 0, 0);
        angleWave.clear();
        accWave.clear();
        gyroWave.clear();
    }

    void update(SensorSample sample, boolean force) {
        sampleCount += 1;
        long now = System.currentTimeMillis();
        if (!force && now - lastRenderAtMs < 50L && sampleCount > 1) {
            // Keep waveform dense, but avoid over-invalidating text every packet.
        }
        boolean renderUi = force || now - lastRenderAtMs >= 100L || sampleCount <= 2;
        if (!renderUi) return;
        lastRenderAtMs = now;
        if (!receiving || !sample.deviceName.equals(connectedAddress)) {
            receiving = true;
            connectedAddress = sample.deviceName;
            title.setText(placementLabel + " · 数据中");
            subtitle.setText(sample.deviceName);
        }
        meta.setText(
                "帧数：" + sampleCount
                        + "    刷新：" + formatTime(sample.recordedAtMs)
                        + "    电量：" + (sample.batteryLevel == null ? "--" : sample.batteryLevel + "%")
        );
        acceleration.setValues(sample.ax, sample.ay, sample.az);
        gyroscope.setValues(sample.gx, sample.gy, sample.gz);
        angle.setValues(sample.roll, sample.pitch, sample.yaw);
        cube.setAttitude(sample.roll, sample.pitch, sample.yaw);

        // Rendering is capped at 10 Hz; acquisition and upload retain every SDK frame.
        angleWave.push((float) sample.roll, (float) sample.pitch, (float) sample.yaw);
        accWave.push((float) sample.ax, (float) sample.ay, (float) sample.az);
        gyroWave.push((float) sample.gx, (float) sample.gy, (float) sample.gz);
    }

    void showSoftwareZero() {
        angle.setValues(0, 0, 0);
        cube.setAttitude(0, 0, 0);
        meta.setText("软件归零已保存 · 等待下一帧");
    }

    private static WaveformView addWave(
            Context context,
            LinearLayout parent,
            String title,
            String unit,
            float fixedRange
    ) {
        WaveformView wave = new WaveformView(context);
        wave.configure(title, unit, fixedRange);
        LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                dp(context, 140)
        );
        params.bottomMargin = dp(context, 8);
        wave.setLayoutParams(params);
        parent.addView(wave);
        return wave;
    }

    private static TextView sectionLabel(Context context, String text) {
        TextView heading = new TextView(context);
        heading.setText(text);
        heading.setTextColor(0xFF37474F);
        heading.setTextSize(14);
        heading.setTypeface(Typeface.DEFAULT_BOLD);
        heading.setPadding(0, dp(context, 10), 0, dp(context, 4));
        return heading;
    }

    private static MetricRow addMetricBlock(Context context, LinearLayout parent, String label, int valueColor) {
        parent.addView(sectionLabel(context, label));
        MetricRow row = new MetricRow(context, valueColor);
        parent.addView(row.view);
        return row;
    }

    private static GradientDrawable cardBackground(int color, int radius) {
        GradientDrawable drawable = new GradientDrawable();
        drawable.setColor(color);
        drawable.setCornerRadius(radius);
        return drawable;
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
            view.setBackground(cardBackground(0xFFF4F7FA, dp(context, 12)));
            view.setPadding(dp(context, 8), dp(context, 10), dp(context, 8), dp(context, 10));

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
