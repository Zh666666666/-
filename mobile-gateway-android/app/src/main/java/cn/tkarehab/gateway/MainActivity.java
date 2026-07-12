package cn.tkarehab.gateway;

import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.bluetooth.BluetoothAdapter;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
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
 * Field gateway screen with official-app style live visualization:
 * 3D attitude cube, Acc/Gyro/Angle grids, and scrolling waveforms.
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
        content.setBackgroundColor(0xFFEEF3F7);
        content.setPadding(padding, padding, padding, padding);

        LinearLayout hero = new LinearLayout(this);
        hero.setOrientation(LinearLayout.VERTICAL);
        hero.setBackground(gradient(0xFF0F2942, 0xFF1A5276, dp(18)));
        hero.setPadding(padding, padding, padding, padding);
        LinearLayout.LayoutParams heroParams = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT
        );
        heroParams.bottomMargin = dp(12);
        hero.setLayoutParams(heroParams);

        TextView title = new TextView(this);
        title.setText("TKA 实时传感器看板");
        title.setTextSize(24);
        title.setTypeface(Typeface.DEFAULT_BOLD);
        title.setTextColor(0xFFFFFFFF);
        hero.addView(title);

        TextView description = new TextView(this);
        description.setText("3D 姿态 · 波形曲线 · Acc/Gyro/Angle 实时读数\n连接后自动刷新，无需先开始采集上传");
        description.setTextColor(0xD9FFFFFF);
        description.setTextSize(13);
        description.setPadding(0, dp(6), 0, 0);
        hero.addView(description);
        content.addView(hero);

        linkState = banner(
                "连接状态：未连接传感器",
                0xFF7A4E00,
                0xFFFFF8E1
        );
        content.addView(linkState);

        sampleSummary = banner(
                "实时帧数：0\n转动传感器后，3D 姿态与波形应持续变化。",
                0xFF0F2942,
                0xFFE3F2FD
        );
        content.addView(sampleSummary);

        content.addView(sectionTitle("实时可视化"));
        thighPanel = new LiveSensorPanel(this, "大腿", 0xFF00897B);
        shankPanel = new LiveSensorPanel(this, "小腿", 0xFF1E88E5);
        content.addView(thighPanel.view());
        content.addView(shankPanel.view());

        content.addView(sectionTitle("设备扫描与校准"));

        content.addView(actionButton("运行安装自检", 0xFF546E7A, view -> runReadinessCheck()));
        content.addView(actionButton("授权并扫描 WT 设备", 0xFF00897B, view -> {
            if (!requireBleGateway()) {
                return;
            }
            renderedDevices.clear();
            devices.removeAllViews();
            bleGateway.requestPermissionsAndScan();
        }));

        LinearLayout calibration = new LinearLayout(this);
        calibration.setOrientation(LinearLayout.HORIZONTAL);
        Button zeroThigh = actionButton("大腿归零", 0xFF00897B, view -> {
            if (requireBleGateway()) {
                bleGateway.setAngleZero(SensorPlacement.THIGH);
            }
        });
        calibration.addView(zeroThigh, weightedButton());
        Button zeroShank = actionButton("小腿归零", 0xFF1E88E5, view -> {
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
        sessionState = banner("采集状态：未开始（仅预览实时数据）", 0xFF7A4E00, 0xFFFFF8E1);
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
        start = actionButton("开始采集上传", 0xFF2E7D32, view -> startSession());
        sessionActions.addView(start, weightedButton());
        stop = actionButton("停止上传", 0xFFC62828, view -> stopSession());
        stop.setEnabled(false);
        sessionActions.addView(stop, weightedButton());
        content.addView(sessionActions);

        content.addView(sectionTitle("运行信息"));
        status = banner(
                "先扫描连接传感器查看 3D 姿态与波形。填写平台地址和患者 ID 后点“开始采集上传”才会加密保存并上传。",
                0xFF0F2942,
                0xFFFFFFFF
        );
        content.addView(status);

        ScrollView scrollView = new ScrollView(this);
        scrollView.setFillViewport(true);
        scrollView.setBackgroundColor(0xFFEEF3F7);
        scrollView.addView(content);
        return scrollView;
    }

    private TextView sectionTitle(String text) {
        TextView title = new TextView(this);
        title.setText(text);
        title.setTextSize(18);
        title.setTypeface(Typeface.DEFAULT_BOLD);
        title.setTextColor(0xFF0F2942);
        title.setPadding(0, dp(16), 0, dp(8));
        return title;
    }

    private TextView banner(String text, int textColor, int background) {
        TextView view = new TextView(this);
        view.setText(text);
        view.setTextColor(textColor);
        view.setBackground(rounded(background, dp(14)));
        view.setTextIsSelectable(true);
        view.setPadding(dp(12), dp(12), dp(12), dp(12));
        LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT
        );
        params.bottomMargin = dp(8);
        view.setLayoutParams(params);
        return view;
    }

    private Button actionButton(String text, int color, View.OnClickListener listener) {
        Button button = new Button(this);
        button.setText(text);
        button.setTextColor(0xFFFFFFFF);
        button.setAllCaps(false);
        button.setBackground(rounded(color, dp(12)));
        button.setOnClickListener(listener);
        LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT
        );
        params.bottomMargin = dp(8);
        button.setLayoutParams(params);
        button.setPadding(dp(12), dp(12), dp(12), dp(12));
        return button;
    }

    private EditText labeledInput(LinearLayout container, String label, String hint, int inputType) {
        TextView text = new TextView(this);
        text.setText(label);
        text.setTextColor(0xFF2D4A5E);
        text.setPadding(0, dp(8), 0, dp(4));
        container.addView(text);

        EditText input = new EditText(this);
        input.setHint(hint);
        input.setInputType(inputType);
        input.setSingleLine(true);
        input.setBackground(rounded(0xFFFFFFFF, dp(12)));
        input.setPadding(dp(12), dp(12), dp(12), dp(12));
        LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT
        );
        params.bottomMargin = dp(6);
        input.setLayoutParams(params);
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
        sessionState.setText("采集状态：已开始上传（3D/波形同时刷新）");
        sessionState.setTextColor(0xFF1B5E20);
        sessionState.setBackground(rounded(0xFFE8F5E9, dp(14)));
        renderStatus("采集上传已启动。上方可视化继续刷新，数据同时写入加密队列。");
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
        sessionState.setBackground(rounded(0xFFFFF8E1, dp(14)));
        renderStatus("上传已停止。3D 姿态与波形仍会刷新；未上传数据仍在手机加密队列中。");
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
        row.setBackground(rounded(0xFFFFFFFF, dp(14)));
        row.setPadding(dp(12), dp(12), dp(12), dp(12));
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
        actions.setPadding(0, dp(8), 0, 0);
        Button thigh = actionButton("设为大腿", 0xFF00897B, view -> {
            if (!requireBleGateway()) {
                return;
            }
            connectedThighAddress = address;
            thighPanel.markConnected(name, address);
            updateLinkState();
            bleGateway.assignAndConnect(address, SensorPlacement.THIGH);
            renderStatus(name + " 正在连接为大腿传感器。连接后绿色卡片应出现 3D 姿态与波形。");
        });
        actions.addView(thigh, weightedButton());
        Button shank = actionButton("设为小腿", 0xFF1E88E5, view -> {
            if (!requireBleGateway()) {
                return;
            }
            connectedShankAddress = address;
            shankPanel.markConnected(name, address);
            updateLinkState();
            bleGateway.assignAndConnect(address, SensorPlacement.SHANK);
            renderStatus(name + " 正在连接为小腿传感器。连接后蓝色卡片应出现 3D 姿态与波形。");
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
            linkState.setBackground(rounded(0xFFE8F5E9, dp(14)));
        } else if (thigh) {
            linkState.setText("连接状态：大腿已连接，小腿未连接");
            linkState.setTextColor(0xFF00695C);
            linkState.setBackground(rounded(0xFFE0F2F1, dp(14)));
        } else if (shank) {
            linkState.setText("连接状态：小腿已连接，大腿未连接");
            linkState.setTextColor(0xFF0D47A1);
            linkState.setBackground(rounded(0xFFE3F2FD, dp(14)));
        } else {
            linkState.setText("连接状态：未连接传感器");
            linkState.setTextColor(0xFF7A4E00);
            linkState.setBackground(rounded(0xFFFFF8E1, dp(14)));
        }
    }

    private LinearLayout.LayoutParams weightedButton() {
        LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1);
        params.rightMargin = dp(6);
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
                            + "\n3D 姿态与波形应随转动变化"
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

    private static GradientDrawable rounded(int color, int radius) {
        GradientDrawable drawable = new GradientDrawable();
        drawable.setColor(color);
        drawable.setCornerRadius(radius);
        return drawable;
    }

    private static GradientDrawable gradient(int start, int end, int radius) {
        GradientDrawable drawable = new GradientDrawable(
                GradientDrawable.Orientation.TL_BR,
                new int[]{start, end}
        );
        drawable.setCornerRadius(radius);
        return drawable;
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
