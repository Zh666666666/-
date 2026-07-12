package cn.tkarehab.gateway;

import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.bluetooth.BluetoothAdapter;
import android.os.Bundle;
import android.text.InputType;
import android.view.Gravity;
import android.view.View;
import android.view.WindowManager;
import android.widget.Button;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;

import androidx.annotation.NonNull;
import androidx.appcompat.app.AppCompatActivity;

import com.wit.witsdk.Bluetooth.WitBluetoothManager;

import java.util.HashSet;
import java.util.Set;

/** Operational screen for pairing, collection, and no-USB field diagnostics. */
public final class MainActivity extends AppCompatActivity {
    private static final int WIT_PERMISSION_REQUEST = 1001;
    private static final String PREFERENCES = "gateway-config";

    private final Set<String> renderedDevices = new HashSet<>();
    private LinearLayout devices;
    private TextView status;
    private TextView liveReadings;
    private TextView sessionState;
    private EditText apiUrl;
    private EditText patientId;
    private EditText apiToken;
    private Button start;
    private Button stop;
    private WitBleGateway bleGateway;
    private PlatformGateway platformGateway;
    private SharedPreferences preferences;
    private String bleInitializationFailure;
    private int liveSampleCount;
    private long lastLiveRenderAtMs;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        preferences = getSharedPreferences(PREFERENCES, MODE_PRIVATE);

        // Render the operational UI first so a later SDK/keystore failure cannot
        // blank the process before the user sees anything. Then clear the
        // incomplete-launch flag so the next cold start does not false-alarm.
        setContentView(createContent());
        restoreConfiguration();
        TkaApplication.markLaunchSucceeded(this);

        try {
            platformGateway = new PlatformGateway(
                    new EncryptedSampleQueue(this),
                    new PlatformGateway.Listener() {
                        @Override
                        public void onStatus(String message) {
                            renderStatus(message);
                        }

                        @Override
                        public void onError(String message, Exception error) {
                            renderStatus(message + detail(error));
                        }
                    }
            );
        } catch (Exception error) {
            renderStatus("加密离线队列初始化失败" + detail(error));
        }

        try {
            bleGateway = new WitBleGateway(this, new WitBleGateway.Listener() {
                @Override
                public void onDeviceFound(String address, String name) {
                    runOnUiThread(() -> addDiscoveredDevice(address, name));
                }

                @Override
                public void onConnectionChanged(String address, boolean connected) {
                    renderStatus(address + (connected ? " 已连接" : " 已断开"));
                }

                @Override
                public void onReading(SensorSample sample) {
                    renderLiveReading(sample);
                    if (platformGateway != null) {
                        platformGateway.accept(sample);
                    }
                }

                @Override
                public void onError(String message, Exception error) {
                    renderStatus(message + detail(error));
                }

                @Override
                public void onStatus(String message) {
                    renderStatus(message);
                }
            });
        } catch (Throwable error) {
            bleInitializationFailure = describe(error);
            renderStatus("蓝牙 SDK 初始化失败。应用仍可打开，请保存此信息并反馈：" + bleInitializationFailure);
        }
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (bleGateway != null) {
            bleGateway.onHostResumed();
        }
    }

    @Override
    protected void onDestroy() {
        getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        if (bleGateway != null) {
            bleGateway.stop();
        }
        if (platformGateway != null) {
            platformGateway.close();
        }
        super.onDestroy();
    }

    @Override
    public void onRequestPermissionsResult(
            int requestCode,
            @NonNull String[] permissions,
            @NonNull int[] grantResults
    ) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode != WIT_PERMISSION_REQUEST || bleGateway == null) {
            return;
        }
        // Some OEM permission dialogs return empty grantResults when the user leaves
        // through settings. Re-check the real permission state inside the gateway.
        boolean granted = grantResults.length > 0;
        for (int result : grantResults) {
            granted &= result == PackageManager.PERMISSION_GRANTED;
        }
        bleGateway.onPermissionsResult(granted);
    }

    private View createContent() {
        int padding = dp(16);
        LinearLayout content = new LinearLayout(this);
        content.setOrientation(LinearLayout.VERTICAL);
        content.setPadding(padding, padding, padding, padding);

        TextView title = new TextView(this);
        title.setText("TKA 康复传感器网关");
        title.setTextSize(24);
        title.setTextColor(0xFF0F2942);
        content.addView(title);

        TextView description = new TextView(this);
        description.setText("连接大腿与小腿 WT9011DCL-BT50，数据先加密保存在手机，网络恢复后自动补传。");
        description.setTextColor(0xFF496579);
        description.setPadding(0, dp(6), 0, dp(10));
        content.addView(description);

        sessionState = new TextView(this);
        sessionState.setText("采集状态：未开始");
        sessionState.setTextColor(0xFF7A4E00);
        sessionState.setBackgroundColor(0xFFFFF4D6);
        sessionState.setPadding(dp(12), dp(10), dp(12), dp(10));
        content.addView(sessionState);

        apiUrl = labeledInput(
                content,
                "平台 HTTPS 地址",
                "https://your-server.example.com",
                InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_URI
        );
        patientId = labeledInput(
                content,
                "患者 ID",
                "从平台患者资料复制",
                InputType.TYPE_CLASS_TEXT
        );
        apiToken = labeledInput(
                content,
                "Bearer Token（可选，不保存）",
                "正式鉴权启用后填写",
                InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_PASSWORD
        );

        LinearLayout sessionActions = new LinearLayout(this);
        sessionActions.setOrientation(LinearLayout.HORIZONTAL);
        start = new Button(this);
        start.setText("开始采集");
        start.setOnClickListener(view -> startSession());
        sessionActions.addView(start, weightedButton());
        stop = new Button(this);
        stop.setText("停止");
        stop.setEnabled(false);
        stop.setOnClickListener(view -> stopSession());
        sessionActions.addView(stop, weightedButton());
        content.addView(sessionActions);

        Button readiness = new Button(this);
        readiness.setText("运行安装自检");
        readiness.setOnClickListener(view -> runReadinessCheck());
        content.addView(readiness);

        Button scan = new Button(this);
        scan.setText("授权并扫描 WT 设备");
        scan.setOnClickListener(view -> {
            if (!requireBleGateway()) {
                return;
            }
            renderedDevices.clear();
            devices.removeAllViews();
            bleGateway.requestPermissionsAndScan();
        });
        content.addView(scan);

        LinearLayout calibration = new LinearLayout(this);
        calibration.setOrientation(LinearLayout.HORIZONTAL);
        Button zeroThigh = new Button(this);
        zeroThigh.setText("大腿归零");
        zeroThigh.setOnClickListener(view -> {
            if (requireBleGateway()) {
                bleGateway.setAngleZero(SensorPlacement.THIGH);
            }
        });
        calibration.addView(zeroThigh, weightedButton());
        Button zeroShank = new Button(this);
        zeroShank.setText("小腿归零");
        zeroShank.setOnClickListener(view -> {
            if (requireBleGateway()) {
                bleGateway.setAngleZero(SensorPlacement.SHANK);
            }
        });
        calibration.addView(zeroShank, weightedButton());
        content.addView(calibration);

        TextView liveLabel = new TextView(this);
        liveLabel.setText("实时读数（连接后自动显示，无需开始采集）");
        liveLabel.setTextSize(18);
        liveLabel.setTextColor(0xFF0F2942);
        liveLabel.setPadding(0, dp(14), 0, dp(4));
        content.addView(liveLabel);

        liveReadings = new TextView(this);
        liveReadings.setText("尚未收到传感器数据。\n连接成功后请轻轻转动传感器；若 5 秒内仍无变化，请反馈。");
        liveReadings.setTextIsSelectable(true);
        liveReadings.setTextColor(0xFF0F2942);
        liveReadings.setBackgroundColor(0xFFE8F5F3);
        liveReadings.setPadding(dp(12), dp(10), dp(12), dp(10));
        content.addView(liveReadings);

        TextView discoveredLabel = new TextView(this);
        discoveredLabel.setText("扫描到的设备");
        discoveredLabel.setTextSize(18);
        discoveredLabel.setTextColor(0xFF0F2942);
        discoveredLabel.setPadding(0, dp(14), 0, dp(4));
        content.addView(discoveredLabel);

        devices = new LinearLayout(this);
        devices.setOrientation(LinearLayout.VERTICAL);
        content.addView(devices);

        TextView statusLabel = new TextView(this);
        statusLabel.setText("运行信息");
        statusLabel.setTextSize(18);
        statusLabel.setTextColor(0xFF0F2942);
        statusLabel.setPadding(0, dp(14), 0, dp(4));
        content.addView(statusLabel);

        status = new TextView(this);
        status.setText("可先扫描连接传感器查看实时读数。填写平台地址和患者 ID 后点“开始采集”才会加密保存并上传。");
        status.setTextIsSelectable(true);
        status.setBackgroundColor(0xFFF2F6F8);
        status.setPadding(dp(12), dp(10), dp(12), dp(10));
        content.addView(status);

        ScrollView scrollView = new ScrollView(this);
        scrollView.setFillViewport(true);
        scrollView.addView(content);
        return scrollView;
    }

    private EditText labeledInput(LinearLayout container, String label, String hint, int inputType) {
        TextView text = new TextView(this);
        text.setText(label);
        text.setTextColor(0xFF2D4A5E);
        text.setPadding(0, dp(10), 0, dp(2));
        container.addView(text);

        EditText input = new EditText(this);
        input.setHint(hint);
        input.setInputType(inputType);
        input.setSingleLine(true);
        container.addView(input);
        return input;
    }

    private void startSession() {
        GatewayConfig.Validation validation = GatewayConfig.validate(
                apiUrl.getText().toString(),
                patientId.getText().toString()
        );
        if (!validation.valid) {
            renderStatus(validation.message);
            return;
        }
        if (platformGateway == null) {
            renderStatus("加密队列不可用，已阻止采集，避免丢失数据。");
            return;
        }

        preferences.edit()
                .putString("apiUrl", validation.baseUrl)
                .putString("patientId", validation.patientId)
                .apply();
        platformGateway.start(
                validation.baseUrl,
                validation.patientId,
                apiToken.getText().toString().trim()
        );
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        start.setEnabled(false);
        stop.setEnabled(true);
        sessionState.setText("采集状态：已开始（等待传感器）");
        sessionState.setTextColor(0xFF00695C);
        sessionState.setBackgroundColor(0xFFE0F2F1);
        renderStatus("采集已启动。现在扫描设备，并分别分配为大腿和小腿传感器。");
    }

    private void stopSession() {
        if (platformGateway != null) {
            platformGateway.stop();
        }
        getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        start.setEnabled(true);
        stop.setEnabled(false);
        sessionState.setText("采集状态：已停止");
        sessionState.setTextColor(0xFF7A4E00);
        sessionState.setBackgroundColor(0xFFFFF4D6);
        renderStatus("采集已停止。未上传的数据仍保存在手机的加密队列中。");
    }

    private void restoreConfiguration() {
        apiUrl.setText(preferences.getString("apiUrl", ""));
        patientId.setText(preferences.getString("patientId", ""));
    }

    private void runReadinessCheck() {
        boolean supportsBle = getPackageManager().hasSystemFeature(PackageManager.FEATURE_BLUETOOTH_LE);
        BluetoothAdapter adapter = BluetoothAdapter.getDefaultAdapter();
        boolean bluetoothEnabled = adapter != null && adapter.isEnabled();
        boolean permissionsGranted = false;
        try {
            permissionsGranted = WitBluetoothManager.checkPermissions(this);
        } catch (Throwable error) {
            bleInitializationFailure = describe(error);
        }
        boolean locationEnabled = LocationServices.isEnabled(this);
        GatewayConfig.Validation configuration = GatewayConfig.validate(
                apiUrl.getText().toString(),
                patientId.getText().toString()
        );
        renderStatus(GatewayReadiness.report(
                BuildConfig.VERSION_NAME,
                supportsBle,
                bluetoothEnabled,
                permissionsGranted,
                locationEnabled,
                platformGateway != null,
                configuration
        ) + (bleInitializationFailure == null ? "" : "\n蓝牙 SDK：初始化失败 - " + bleInitializationFailure));
    }

    private void addDiscoveredDevice(String address, String name) {
        if (!renderedDevices.add(address)) {
            return;
        }
        LinearLayout row = new LinearLayout(this);
        row.setOrientation(LinearLayout.VERTICAL);
        row.setPadding(0, dp(8), 0, dp(8));

        TextView label = new TextView(this);
        label.setText(name + "\n" + address);
        label.setTextIsSelectable(true);
        row.addView(label);

        LinearLayout actions = new LinearLayout(this);
        actions.setGravity(Gravity.START);
        Button thigh = new Button(this);
        thigh.setText("设为大腿");
        thigh.setOnClickListener(view -> {
            if (!requireBleGateway()) {
                return;
            }
            bleGateway.assignAndConnect(address, SensorPlacement.THIGH);
            renderStatus(name + " 正在连接为大腿传感器。");
        });
        actions.addView(thigh, weightedButton());
        Button shank = new Button(this);
        shank.setText("设为小腿");
        shank.setOnClickListener(view -> {
            if (!requireBleGateway()) {
                return;
            }
            bleGateway.assignAndConnect(address, SensorPlacement.SHANK);
            renderStatus(name + " 正在连接为小腿传感器。");
        });
        actions.addView(shank, weightedButton());
        row.addView(actions);
        devices.addView(row);
    }

    private LinearLayout.LayoutParams weightedButton() {
        return new LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1);
    }

    private void renderStatus(String message) {
        runOnUiThread(() -> status.setText(message));
    }

    private void renderLiveReading(SensorSample sample) {
        liveSampleCount += 1;
        long now = System.currentTimeMillis();
        // Keep the UI readable: refresh at most ~5 times per second.
        if (now - lastLiveRenderAtMs < 200L && liveSampleCount > 1) {
            return;
        }
        lastLiveRenderAtMs = now;
        String placement = sample.placement == SensorPlacement.THIGH ? "大腿" : "小腿";
        String text = "已收到 " + liveSampleCount + " 帧真实数据\n"
                + "部位：" + placement + "\n"
                + "设备：" + sample.deviceName + "\n"
                + "角度 AngX/Y/Z："
                + format(sample.roll) + " / "
                + format(sample.pitch) + " / "
                + format(sample.yaw) + "\n"
                + "加速度 AccX/Y/Z："
                + format(sample.ax) + " / "
                + format(sample.ay) + " / "
                + format(sample.az) + "\n"
                + "角速度 AsX/Y/Z："
                + format(sample.gx) + " / "
                + format(sample.gy) + " / "
                + format(sample.gz) + "\n"
                + "提示：转动传感器时角度应变化。未点“开始采集”时只预览，不上传。";
        runOnUiThread(() -> {
            liveReadings.setText(text);
            if (stop.isEnabled()) {
                sessionState.setText("采集状态：进行中（已收 " + liveSampleCount + " 帧）");
            }
        });
    }

    private boolean requireBleGateway() {
        if (bleGateway != null) {
            return true;
        }
        renderStatus("蓝牙 SDK 未就绪，无法执行此操作。请反馈：" + (bleInitializationFailure == null ? "初始化未完成" : bleInitializationFailure));
        return false;
    }

    private static String format(double value) {
        return String.format(java.util.Locale.US, "%.2f", value);
    }

    private int dp(int value) {
        return Math.round(value * getResources().getDisplayMetrics().density);
    }

    private static String detail(Exception error) {
        if (error == null || error.getMessage() == null || error.getMessage().isEmpty()) {
            return "";
        }
        return "：" + error.getMessage();
    }

    private static String describe(Throwable error) {
        String message = error.getMessage();
        return error.getClass().getSimpleName() + (message == null || message.isEmpty() ? "" : "：" + message);
    }
}
