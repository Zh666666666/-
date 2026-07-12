package cn.tkarehab.gateway;

import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.bluetooth.BluetoothAdapter;
import android.graphics.Typeface;
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
import java.util.Locale;
import java.util.Set;

/**
 * Field gateway screen styled closer to the official WitMotion data page:
 * live Acc / Gyro / Angle cards update as soon as a sensor is connected.
 */
public final class MainActivity extends AppCompatActivity {
    private static final int WIT_PERMISSION_REQUEST = 1001;
    private static final String PREFERENCES = "gateway-config";

    private final Set<String> renderedDevices = new HashSet<>();
    private LinearLayout devices;
    private TextView status;
    private TextView linkState;
    private TextView sampleSummary;
    private TextView sessionState;
    private EditText apiUrl;
    private EditText patientId;
    private EditText apiToken;
    private Button start;
    private Button stop;
    private LiveSensorPanel thighPanel;
    private LiveSensorPanel shankPanel;
    private WitBleGateway bleGateway;
    private PlatformGateway platformGateway;
    private SharedPreferences preferences;
    private String bleInitializationFailure;
    private int liveSampleCount;
    private String connectedThighAddress = "";
    private String connectedShankAddress = "";

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
                    runOnUiThread(() -> handleConnectionChanged(address, connected));
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
        content.setBackgroundColor(0xFFF0F4F8);
        content.setPadding(padding, padding, padding, padding);

        TextView title = new TextView(this);
        title.setText("TKA 实时传感器看板");
        title.setTextSize(24);
        title.setTypeface(Typeface.DEFAULT_BOLD);
        title.setTextColor(0xFF0F2942);
        content.addView(title);

        TextView description = new TextView(this);
        description.setText("风格参考官方维特数据页：连接后自动显示加速度、角速度、角度。上传平台前也可先看实时数据。");
        description.setTextColor(0xFF496579);
        description.setPadding(0, dp(6), 0, dp(10));
        content.addView(description);

        linkState = banner(
                "连接状态：未连接传感器",
                0xFF7A4E00,
                0xFFFFF4D6
        );
        content.addView(linkState);

        sampleSummary = banner(
                "实时帧数：0\n转动传感器后，下方 X/Y/Z 数值应持续变化。",
                0xFF0F2942,
                0xFFE3F2FD
        );
        content.addView(sampleSummary);

        thighPanel = new LiveSensorPanel(this, "大腿", 0xFF00695C);
        shankPanel = new LiveSensorPanel(this, "小腿", 0xFF1565C0);
        content.addView(thighPanel.view());
        content.addView(shankPanel.view());

        content.addView(sectionTitle("设备扫描与校准"));

        Button readiness = actionButton("运行安装自检", view -> runReadinessCheck());
        content.addView(readiness);

        Button scan = actionButton("授权并扫描 WT 设备", view -> {
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
        Button zeroThigh = actionButton("大腿归零", view -> {
            if (requireBleGateway()) {
                bleGateway.setAngleZero(SensorPlacement.THIGH);
            }
        });
        calibration.addView(zeroThigh, weightedButton());
        Button zeroShank = actionButton("小腿归零", view -> {
            if (requireBleGateway()) {
                bleGateway.setAngleZero(SensorPlacement.SHANK);
            }
        });
        calibration.addView(zeroShank, weightedButton());
        content.addView(calibration);

        content.addView(sectionTitle("扫描到的设备"));
        devices = new LinearLayout(this);
        devices.setOrientation(LinearLayout.VERTICAL);
        content.addView(devices);

        content.addView(sectionTitle("平台上传（可选）"));
        sessionState = banner("采集状态：未开始（仅预览实时数据）", 0xFF7A4E00, 0xFFFFF4D6);
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
        start = actionButton("开始采集上传", view -> startSession());
        sessionActions.addView(start, weightedButton());
        stop = actionButton("停止上传", view -> stopSession());
        stop.setEnabled(false);
        sessionActions.addView(stop, weightedButton());
        content.addView(sessionActions);

        content.addView(sectionTitle("运行信息"));
        status = banner(
                "先扫描连接传感器查看实时看板。填写平台地址和患者 ID 后点“开始采集上传”才会加密保存并上传。",
                0xFF0F2942,
                0xFFFFFFFF
        );
        content.addView(status);

        ScrollView scrollView = new ScrollView(this);
        scrollView.setFillViewport(true);
        scrollView.setBackgroundColor(0xFFF0F4F8);
        scrollView.addView(content);
        return scrollView;
    }

    private TextView sectionTitle(String text) {
        TextView title = new TextView(this);
        title.setText(text);
        title.setTextSize(18);
        title.setTypeface(Typeface.DEFAULT_BOLD);
        title.setTextColor(0xFF0F2942);
        title.setPadding(0, dp(16), 0, dp(6));
        return title;
    }

    private TextView banner(String text, int textColor, int background) {
        TextView view = new TextView(this);
        view.setText(text);
        view.setTextColor(textColor);
        view.setBackgroundColor(background);
        view.setTextIsSelectable(true);
        view.setPadding(dp(12), dp(10), dp(12), dp(10));
        LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT
        );
        params.bottomMargin = dp(8);
        view.setLayoutParams(params);
        return view;
    }

    private Button actionButton(String text, View.OnClickListener listener) {
        Button button = new Button(this);
        button.setText(text);
        button.setOnClickListener(listener);
        LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT
        );
        params.bottomMargin = dp(6);
        button.setLayoutParams(params);
        return button;
    }

    private EditText labeledInput(LinearLayout container, String label, String hint, int inputType) {
        TextView text = new TextView(this);
        text.setText(label);
        text.setTextColor(0xFF2D4A5E);
        text.setPadding(0, dp(8), 0, dp(2));
        container.addView(text);

        EditText input = new EditText(this);
        input.setHint(hint);
        input.setInputType(inputType);
        input.setSingleLine(true);
        input.setBackgroundColor(0xFFFFFFFF);
        input.setPadding(dp(10), dp(10), dp(10), dp(10));
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
        sessionState.setText("采集状态：已开始上传（实时看板同时刷新）");
        sessionState.setTextColor(0xFF00695C);
        sessionState.setBackgroundColor(0xFFE0F2F1);
        renderStatus("采集上传已启动。传感器数据会显示在上方看板，并写入加密队列。");
    }

    private void stopSession() {
        if (platformGateway != null) {
            platformGateway.stop();
        }
        getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        start.setEnabled(true);
        stop.setEnabled(false);
        sessionState.setText("采集状态：已停止上传（仍可继续看实时数据）");
        sessionState.setTextColor(0xFF7A4E00);
        sessionState.setBackgroundColor(0xFFFFF4D6);
        renderStatus("上传已停止。实时看板仍会刷新；未上传数据仍在手机加密队列中。");
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
        row.setBackgroundColor(0xFFFFFFFF);
        row.setPadding(dp(10), dp(10), dp(10), dp(10));
        LinearLayout.LayoutParams rowParams = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT
        );
        rowParams.bottomMargin = dp(8);
        row.setLayoutParams(rowParams);

        TextView label = new TextView(this);
        label.setText(name + "\n" + address);
        label.setTextIsSelectable(true);
        label.setTextColor(0xFF0F2942);
        label.setTypeface(Typeface.DEFAULT_BOLD);
        row.addView(label);

        LinearLayout actions = new LinearLayout(this);
        actions.setGravity(Gravity.START);
        Button thigh = new Button(this);
        thigh.setText("设为大腿");
        thigh.setOnClickListener(view -> {
            if (!requireBleGateway()) {
                return;
            }
            connectedThighAddress = address;
            thighPanel.markConnected(name, address);
            updateLinkState();
            bleGateway.assignAndConnect(address, SensorPlacement.THIGH);
            renderStatus(name + " 正在连接为大腿传感器。连接后上方绿色看板应开始刷新。");
        });
        actions.addView(thigh, weightedButton());
        Button shank = new Button(this);
        shank.setText("设为小腿");
        shank.setOnClickListener(view -> {
            if (!requireBleGateway()) {
                return;
            }
            connectedShankAddress = address;
            shankPanel.markConnected(name, address);
            updateLinkState();
            bleGateway.assignAndConnect(address, SensorPlacement.SHANK);
            renderStatus(name + " 正在连接为小腿传感器。连接后上方蓝色看板应开始刷新。");
        });
        actions.addView(shank, weightedButton());
        row.addView(actions);
        devices.addView(row);
    }

    private void handleConnectionChanged(String address, boolean connected) {
        if (address.equals(connectedThighAddress)) {
            if (connected) {
                thighPanel.markConnected("大腿传感器", address);
            } else {
                thighPanel.markDisconnected();
                connectedThighAddress = "";
            }
        }
        if (address.equals(connectedShankAddress)) {
            if (connected) {
                shankPanel.markConnected("小腿传感器", address);
            } else {
                shankPanel.markDisconnected();
                connectedShankAddress = "";
            }
        }
        updateLinkState();
        renderStatus(address + (connected ? " 已连接，等待实时数据…" : " 已断开"));
    }

    private void updateLinkState() {
        boolean thigh = !connectedThighAddress.isEmpty();
        boolean shank = !connectedShankAddress.isEmpty();
        if (thigh && shank) {
            linkState.setText("连接状态：大腿 + 小腿 均已连接");
            linkState.setTextColor(0xFF1B5E20);
            linkState.setBackgroundColor(0xFFE8F5E9);
        } else if (thigh) {
            linkState.setText("连接状态：大腿已连接，小腿未连接");
            linkState.setTextColor(0xFF00695C);
            linkState.setBackgroundColor(0xFFE0F2F1);
        } else if (shank) {
            linkState.setText("连接状态：小腿已连接，大腿未连接");
            linkState.setTextColor(0xFF0D47A1);
            linkState.setBackgroundColor(0xFFE3F2FD);
        } else {
            linkState.setText("连接状态：未连接传感器");
            linkState.setTextColor(0xFF7A4E00);
            linkState.setBackgroundColor(0xFFFFF4D6);
        }
    }

    private LinearLayout.LayoutParams weightedButton() {
        LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1);
        params.rightMargin = dp(4);
        return params;
    }

    private void renderStatus(String message) {
        runOnUiThread(() -> status.setText(message));
    }

    private void renderLiveReading(SensorSample sample) {
        liveSampleCount += 1;
        runOnUiThread(() -> {
            if (sample.placement == SensorPlacement.THIGH) {
                if (connectedThighAddress.isEmpty()) {
                    connectedThighAddress = sample.deviceName;
                }
                thighPanel.markConnected("大腿传感器", sample.deviceName);
                thighPanel.update(sample, false);
            } else {
                if (connectedShankAddress.isEmpty()) {
                    connectedShankAddress = sample.deviceName;
                }
                shankPanel.markConnected("小腿传感器", sample.deviceName);
                shankPanel.update(sample, false);
            }
            updateLinkState();
            sampleSummary.setText(
                    "实时帧数：" + liveSampleCount
                            + "\n最新设备：" + sample.deviceName
                            + "\n部位：" + (sample.placement == SensorPlacement.THIGH ? "大腿" : "小腿")
                            + "\n角度(°)：X " + format(sample.roll)
                            + "  Y " + format(sample.pitch)
                            + "  Z " + format(sample.yaw)
            );
            if (stop.isEnabled()) {
                sessionState.setText("采集状态：上传中（已收 " + liveSampleCount + " 帧）");
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
        return String.format(Locale.US, "%+.2f", value);
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
