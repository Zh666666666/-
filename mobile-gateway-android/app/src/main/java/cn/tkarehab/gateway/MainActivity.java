package cn.tkarehab.gateway;

import android.content.SharedPreferences;
import android.content.Intent;
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
import androidx.core.content.FileProvider;
import androidx.security.crypto.EncryptedSharedPreferences;
import androidx.security.crypto.MasterKey;

import com.wit.witsdk.Bluetooth.WitBluetoothManager;

import java.io.File;
import java.util.HashSet;
import java.util.Locale;
import java.util.Set;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicLong;

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
    private TextView localEvidenceState;
    private TextView syncState;
    private EditText apiUrl;
    private EditText patientId;
    private EditText apiToken;
    private Button start;
    private Button stop;
    private Button exportEvidence;
    private LinearLayout platformSettings;
    private boolean advancedVisible;
    private LiveSensorPanel thighPanel;
    private LiveSensorPanel shankPanel;
    private WitBleGateway bleGateway;
    private PlatformGateway platformGateway;
    private LocalEvidenceStore evidenceStore;
    private SharedPreferences preferences;
    private SharedPreferences securePreferences;
    private String bleInitializationFailure;
    private int liveSampleCount;
    private String connectedThighAddress = "";
    private String connectedShankAddress = "";
    private boolean thighConnected;
    private boolean shankConnected;
    private LinearLayout sessionActions;
    private final AtomicBoolean stopInProgress = new AtomicBoolean(false);
    private final AtomicBoolean exportInProgress = new AtomicBoolean(false);
    private final AtomicLong lastEvidenceQueuedAtMs = new AtomicLong(0L);
    private final ExecutorService evidenceWorker = Executors.newSingleThreadExecutor();
    private long lastThighUiAtMs;
    private long lastShankUiAtMs;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        preferences = getSharedPreferences(PREFERENCES, MODE_PRIVATE);

        // Render the operational UI first so a later SDK/keystore failure cannot
        // blank the process before the user sees anything. Then clear the
        // incomplete-launch flag so the next cold start does not false-alarm.
        setContentView(createContent());
        try {
            MasterKey masterKey = new MasterKey.Builder(this)
                    .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
                    .build();
            securePreferences = EncryptedSharedPreferences.create(
                    this,
                    "gateway-secure-config",
                    masterKey,
                    EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
                    EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM
            );
        } catch (Exception error) {
            renderStatus("安全配置存储初始化失败；Bearer Token 本次可用但不会保存" + detail(error));
        }
        restoreConfiguration();
        TkaApplication.markLaunchSucceeded(this);

        try {
            evidenceStore = new LocalEvidenceStore(this);
            renderEvidenceSummary(evidenceStore.latestSummary());
        } catch (Exception error) {
            renderStatus("本地证据存储初始化失败" + detail(error));
        }

        try {
            EncryptedSampleQueue queue = new EncryptedSampleQueue(this);
            platformGateway = new PlatformGateway(
                    queue,
                    new PlatformGateway.Listener() {
                        @Override
                        public void onStatus(String message) {
                            renderStatus(message);
                        }

                        @Override
                        public void onUploadReceipt(UploadReceipt receipt) {
                            renderUploadReceipt(receipt);
                        }

                        @Override
                        public void onError(String message, Exception error) {
                            renderStatus(message + detail(error));
                        }

                        @Override
                        public void onDrainComplete() {
                            runOnUiThread(() -> {
                                if (evidenceStore == null || !evidenceStore.isActive()) {
                                    start.setEnabled(true);
                                }
                            });
                        }
                    },
                    preferences
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
                    queueEvidenceSample(sample);
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

                @Override
                public void onPlacementRevisionChanged(long revision) {
                    runOnUiThread(() -> handlePlacementRevisionChanged(revision));
                }

                @Override
                public void onSoftwareZeroApplied(SensorPlacement placement) {
                    runOnUiThread(() -> {
                        if (placement == SensorPlacement.THIGH) {
                            thighPanel.showSoftwareZero();
                        } else {
                            shankPanel.showSoftwareZero();
                        }
                    });
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
        evidenceWorker.shutdown();
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
        title.setText("膝关节居家训练");
        title.setTextSize(24);
        title.setTypeface(Typeface.DEFAULT_BOLD);
        title.setTextColor(0xFFFFFFFF);
        hero.addView(title);

        TextView description = new TextView(this);
        description.setText("连接大腿与小腿传感器后，App 会自动验证平台并开始实时上传。\n每帧先加密保存，再等待服务器一致性回执。");
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
        stabilizeLines(linkState, 1);
        content.addView(linkState);

        TextView steps = banner(
                "使用步骤\n1. 在平台设置中绑定正式域名、患者 ID 与 Token  2. 扫描并连接大腿/小腿  3. 双路连接后自动记录并上传",
                0xFF0F2942,
                0xFFFFFFFF
        );
        content.addView(steps);

        syncState = banner(
                "网页同步：等待双传感器连接。连接成功后自动验证患者与 Token，并开始上传。",
                0xFF5D4037,
                0xFFFFF3E0
        );
        stabilizeLines(syncState, 3);
        content.addView(syncState);

        sampleSummary = banner(
                "实时帧数：0\n转动传感器后，3D 姿态与波形应持续变化。",
                0xFF0F2942,
                0xFFE3F2FD
        );
        stabilizeLines(sampleSummary, 5);
        content.addView(sampleSummary);

        content.addView(sectionTitle("佩戴姿态（转动传感器应同步变化）"));
        thighPanel = new LiveSensorPanel(this, "大腿", 0xFF00897B);
        shankPanel = new LiveSensorPanel(this, "小腿", 0xFF1E88E5);
        content.addView(thighPanel.view());
        content.addView(shankPanel.view());
        content.addView(actionButton("显示专业数据", 0xFF546E7A, view -> {
            advancedVisible = !advancedVisible;
            thighPanel.setAdvancedVisible(advancedVisible);
            shankPanel.setAdvancedVisible(advancedVisible);
            ((Button) view).setText(advancedVisible ? "收起专业数据" : "显示专业数据");
        }));

        content.addView(sectionTitle("连接与佩戴"));

        content.addView(actionButton("检查手机是否准备好", 0xFF546E7A, view -> runReadinessCheck()));
        content.addView(actionButton("扫描附近传感器", 0xFF00897B, view -> {
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

        content.addView(sectionTitle("开始训练"));
        sessionState = banner("采集状态：未开始（仅预览实时数据）", 0xFF7A4E00, 0xFFFFF8E1);
        stabilizeLines(sessionState, 1);
        content.addView(sessionState);

        localEvidenceState = banner(
                "本地证据：暂无任务。连接 BT50 后即可开始，样本会加密保存在手机。",
                0xFF0F2942,
                0xFFFFFFFF
        );
        stabilizeLines(localEvidenceState, 3);
        content.addView(localEvidenceState);

        sessionActions = new LinearLayout(this);
        sessionActions.setOrientation(LinearLayout.HORIZONTAL);
        sessionActions.setBackgroundColor(0xFFFFFFFF);
        sessionActions.setPadding(padding, dp(8), padding, dp(8));
        sessionActions.setElevation(dp(8));
        start = actionButton("开始记录并上传", 0xFF2E7D32, view -> startSession());
        sessionActions.addView(start, weightedButton());
        stop = actionButton("结束本次训练", 0xFFC62828, view -> stopSession());
        stop.setEnabled(false);
        sessionActions.addView(stop, weightedButton());

        exportEvidence = actionButton("导出最近证据包", 0xFF455A64, view -> exportLatestEvidence());
        exportEvidence.setEnabled(false);
        content.addView(exportEvidence);

        content.addView(sectionTitle("管理员设置"));
        Button toggleSettings = actionButton("展开平台设置", 0xFF455A64, view -> {
            boolean show = platformSettings.getVisibility() != View.VISIBLE;
            platformSettings.setVisibility(show ? View.VISIBLE : View.GONE);
            ((Button) view).setText(show ? "收起平台设置" : "展开平台设置");
        });
        content.addView(toggleSettings);

        platformSettings = new LinearLayout(this);
        platformSettings.setOrientation(LinearLayout.VERTICAL);
        platformSettings.setVisibility(View.GONE);

        apiUrl = labeledInput(
                platformSettings,
                "平台地址",
                "正式平台：https://www.dorianaistudio.cloud",
                InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_URI
        );
        patientId = labeledInput(
                platformSettings,
                "患者 ID（必须与 Web 实时页完全一致）",
                "从 Web 设备页复制，例如 prod-patient-1",
                InputType.TYPE_CLASS_TEXT
        );
        apiToken = labeledInput(
                platformSettings,
                "Bearer Token（加密保存在本机）",
                "用于验证并上传真实传感器帧",
                InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_PASSWORD
        );

        Button testConnection = actionButton("测试平台连接", 0xFF1565C0, view -> testPlatformConnection());
        platformSettings.addView(testConnection);
        content.addView(platformSettings);

        content.addView(sectionTitle("运行信息"));
        status = banner(
                "先在平台设置完成一次验证，再扫描并连接两只 BT50。双路连接后会自动记录并上传；网络异常时样本留在加密队列。",
                0xFF0F2942,
                0xFFFFFFFF
        );
        stabilizeLines(status, 3);
        content.addView(status);

        ScrollView scrollView = new ScrollView(this);
        scrollView.setFillViewport(true);
        scrollView.setBackgroundColor(0xFFEEF3F7);
        scrollView.addView(content);

        LinearLayout screen = new LinearLayout(this);
        screen.setOrientation(LinearLayout.VERTICAL);
        screen.setBackgroundColor(0xFFEEF3F7);
        screen.addView(scrollView, new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                0,
                1
        ));
        screen.addView(sessionActions, new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT
        ));
        return screen;
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

    private static void stabilizeLines(TextView view, int lines) {
        view.setMinLines(lines);
        view.setMaxLines(lines);
        view.setGravity(Gravity.CENTER_VERTICAL);
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

    private void testPlatformConnection() {
        GatewayConfig.Validation validation = GatewayConfig.validate(
                apiUrl.getText().toString(),
                patientId.getText().toString()
        );
        if (!validation.valid) {
            renderStatus(validation.message);
            return;
        }
        if (platformGateway == null) {
            renderStatus("加密队列不可用，无法测试上传。");
            return;
        }
        persistPlatformConfiguration(validation);
        String token = apiToken.getText().toString().trim();
        if (evidenceStore != null && evidenceStore.isActive() && thighConnected && shankConnected) {
            renderStatus("正在重新验证平台配置并恢复网页上传…");
            platformGateway.start(validation.baseUrl, validation.patientId, token);
            return;
        }
        renderStatus("正在验证平台、Bearer Token 与患者 ID…");
        platformGateway.testConnection(
                validation.baseUrl,
                validation.patientId,
                token
        );
    }

    private void startSession() {
        if (stop.isEnabled()) {
            return;
        }
        if (platformGateway != null && platformGateway.isDraining()) {
            renderStatus("上一次训练仍在补传并关闭平台会话，请等待“平台会话已可靠关闭”后再开始。");
            return;
        }
        if (evidenceStore == null) {
            renderStatus("本地证据存储不可用，已阻止采集，避免产生不可追溯数据。");
            return;
        }
        if (connectedThighAddress.isEmpty() && connectedShankAddress.isEmpty()) {
            renderStatus("请先扫描并连接至少一只真实 BT50 传感器，再开始本地采集。");
            return;
        }
        try {
            LocalEvidenceStore.Summary summary = evidenceStore.start(
                    patientId.getText().toString(),
                    BuildConfig.VERSION_NAME
            );
            renderEvidenceSummary(summary);
        } catch (Exception error) {
            renderStatus("无法开始本地采集" + detail(error));
            return;
        }

        GatewayConfig.Validation validation = GatewayConfig.validate(
                apiUrl.getText().toString(),
                patientId.getText().toString()
        );
        boolean uploadEnabled = validation.valid && platformGateway != null;
        if (uploadEnabled) {
            persistPlatformConfiguration(validation);
            platformGateway.start(
                    validation.baseUrl,
                    validation.patientId,
                    apiToken.getText().toString().trim()
            );
        }
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        start.setEnabled(false);
        stop.setEnabled(true);
        exportEvidence.setEnabled(false);
        sessionState.setText(uploadEnabled
                ? "训练状态：正在记录并同步网页"
                : "训练状态：正在保存到手机（未配置网页同步）");
        sessionState.setTextColor(0xFF1B5E20);
        sessionState.setBackground(rounded(0xFFE8F5E9, dp(14)));
        renderStatus(uploadEnabled
                ? "训练已开始。每帧会先保存在手机，收到服务器一致性回执后才标记为已同步。"
                : "训练已开始。真实样本正在手机加密保存，结束后可导出证据包。");
        syncState.setText(uploadEnabled
                ? "网页同步：正在等待首个服务器确认样本…"
                : "网页同步：未启用，数据仅保存在本机。");
    }

    private void stopSession() {
        if (!stopInProgress.compareAndSet(false, true)) {
            return;
        }
        stop.setEnabled(false);
        if (evidenceStore == null) {
            renderStatus("本地证据存储不可用，无法封存任务。");
            stop.setEnabled(true);
            stopInProgress.set(false);
            return;
        }
        if (platformGateway != null) platformGateway.stop();
        sessionState.setText("采集状态：正在后台封存，请稍候…");
        renderStatus("正在后台封存本次训练；界面不会因样本较多而卡住。");
        evidenceWorker.execute(() -> {
            try {
                LocalEvidenceStore.Summary summary = evidenceStore.finish("USER_FINISHED");
                runOnUiThread(() -> {
                    renderEvidenceSummary(summary);
                    getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
                    start.setEnabled(platformGateway == null || !platformGateway.isDraining());
                    stop.setEnabled(false);
                    exportEvidence.setEnabled(true);
                    sessionState.setText("采集状态：本地任务已结束（仍可预览实时数据）");
                    sessionState.setTextColor(0xFF7A4E00);
                    sessionState.setBackground(rounded(0xFFFFF8E1, dp(14)));
                    renderStatus("本地任务已封存。可导出证据包，网页端会继续完成剩余同步。");
                    stopInProgress.set(false);
                });
            } catch (Exception error) {
                runOnUiThread(() -> {
                    exportEvidence.setEnabled(false);
                    sessionState.setText("采集状态：封存失败，请再次点击结束本地任务");
                    sessionState.setTextColor(0xFFC62828);
                    sessionState.setBackground(rounded(0xFFFFEBEE, dp(14)));
                    renderStatus("结束任务时封存证据失败，数据仍保留在加密存储中，请重试" + detail(error));
                    stop.setEnabled(true);
                    stopInProgress.set(false);
                });
            }
        });
    }

    private void exportLatestEvidence() {
        if (evidenceStore == null) {
            renderStatus("本地证据存储不可用，无法导出。");
            return;
        }
        if (!exportInProgress.compareAndSet(false, true)) return;
        exportEvidence.setEnabled(false);
        renderStatus("正在后台生成证据包；样本较多时可能需要几秒，请勿重复点击。");
        evidenceWorker.execute(() -> {
            try {
                File file = evidenceStore.exportLatest();
                runOnUiThread(() -> {
                    Intent share = new Intent(Intent.ACTION_SEND);
                    share.setType("application/json");
                    share.putExtra(
                            Intent.EXTRA_STREAM,
                            FileProvider.getUriForFile(this, BuildConfig.APPLICATION_ID + ".fileprovider", file)
                    );
                    share.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                    startActivity(Intent.createChooser(share, "导出 TKA 本地证据包"));
                    renderStatus("证据包已生成：" + file.getName());
                    exportEvidence.setEnabled(true);
                    exportInProgress.set(false);
                });
            } catch (Exception error) {
                runOnUiThread(() -> {
                    renderStatus("证据包导出失败" + detail(error));
                    exportEvidence.setEnabled(true);
                    exportInProgress.set(false);
                });
            }
        });
    }

    private void queueEvidenceSample(SensorSample sample) {
        if (evidenceStore == null || !evidenceStore.isActive()) return;
        long previous = lastEvidenceQueuedAtMs.get();
        if (sample.recordedAtMs - previous < 450L
                || !lastEvidenceQueuedAtMs.compareAndSet(previous, sample.recordedAtMs)) {
            return;
        }
        evidenceWorker.execute(() -> {
            try {
                LocalEvidenceStore.Summary summary = evidenceStore.accept(sample);
                runOnUiThread(() -> renderEvidenceSummary(summary));
            } catch (Exception error) {
                runOnUiThread(() -> renderStatus("真实样本无法写入本地证据包" + detail(error)));
            }
        });
    }

    private void restoreConfiguration() {
        apiUrl.setText(preferences.getString("apiUrl", "https://www.dorianaistudio.cloud"));
        patientId.setText(preferences.getString("patientId", ""));
        if (securePreferences != null) {
            apiToken.setText(securePreferences.getString("apiToken", ""));
        }
    }

    private void persistPlatformConfiguration(GatewayConfig.Validation validation) {
        preferences.edit()
                .putString("apiUrl", validation.baseUrl)
                .putString("patientId", validation.patientId)
                .apply();
        if (securePreferences != null) {
            securePreferences.edit().putString("apiToken", apiToken.getText().toString().trim()).apply();
        }
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
            if (address.equals(connectedShankAddress)) {
                connectedShankAddress = "";
                shankConnected = false;
                shankPanel.markDisconnected();
            }
            connectedThighAddress = address;
            thighConnected = false;
            thighPanel.markConnected(name + "（连接中）", address);
            updateLinkState();
            bleGateway.assignAndConnect(address, SensorPlacement.THIGH);
            renderStatus(name + " 正在连接为大腿传感器。连接后绿色卡片应出现 3D 姿态与波形。");
        });
        actions.addView(thigh, weightedButton());
        Button shank = actionButton("设为小腿", 0xFF1E88E5, view -> {
            if (!requireBleGateway()) {
                return;
            }
            if (address.equals(connectedThighAddress)) {
                connectedThighAddress = "";
                thighConnected = false;
                thighPanel.markDisconnected();
            }
            connectedShankAddress = address;
            shankConnected = false;
            shankPanel.markConnected(name + "（连接中）", address);
            updateLinkState();
            bleGateway.assignAndConnect(address, SensorPlacement.SHANK);
            renderStatus(name + " 正在连接为小腿传感器。连接后蓝色卡片应出现 3D 姿态与波形。");
        });
        actions.addView(shank, weightedButton());
        row.addView(actions);
        devices.addView(row);
    }

    private void handleConnectionChanged(String address, boolean connected) {
        if (evidenceStore != null && evidenceStore.isActive()) {
            try {
                renderEvidenceSummary(evidenceStore.recordConnectionEvent(address, connected));
            } catch (Exception error) {
                renderStatus("连接事件无法写入证据包" + detail(error));
            }
        }
        if (address.equals(connectedThighAddress)) {
            thighConnected = connected;
            if (connected) {
                thighPanel.markConnected("大腿传感器", address);
            } else {
                thighPanel.markDisconnected();
                connectedThighAddress = "";
            }
        }
        if (address.equals(connectedShankAddress)) {
            shankConnected = connected;
            if (connected) {
                shankPanel.markConnected("小腿传感器", address);
            } else {
                shankPanel.markDisconnected();
                connectedShankAddress = "";
            }
        }
        updateLinkState();
        renderStatus(address + (connected ? " 已连接，正在准备实时上传…" : " 已断开"));
        if (connected) {
            maybeStartAfterDualConnection();
        }
    }

    private void updateLinkState() {
        if (thighConnected && shankConnected) {
            linkState.setText("连接状态：大腿 + 小腿 均已连接 · 正在自动启动上传");
            linkState.setTextColor(0xFF1B5E20);
            linkState.setBackground(rounded(0xFFE8F5E9, dp(14)));
        } else if (thighConnected) {
            linkState.setText("连接状态：大腿已连接，小腿未连接");
            linkState.setTextColor(0xFF00695C);
            linkState.setBackground(rounded(0xFFE0F2F1, dp(14)));
        } else if (shankConnected) {
            linkState.setText("连接状态：小腿已连接，大腿未连接");
            linkState.setTextColor(0xFF0D47A1);
            linkState.setBackground(rounded(0xFFE3F2FD, dp(14)));
        } else if (!connectedThighAddress.isEmpty() || !connectedShankAddress.isEmpty()) {
            linkState.setText("连接状态：正在连接已分配的传感器…");
            linkState.setTextColor(0xFF7A4E00);
            linkState.setBackground(rounded(0xFFFFF8E1, dp(14)));
        } else {
            linkState.setText("连接状态：未连接传感器");
            linkState.setTextColor(0xFF7A4E00);
            linkState.setBackground(rounded(0xFFFFF8E1, dp(14)));
        }
    }

    private void handlePlacementRevisionChanged(long revision) {
        if (platformGateway != null) {
            platformGateway.onPlacementRevisionChanged(revision);
        }
        if (evidenceStore != null && evidenceStore.isActive()) {
            try {
                evidenceStore.finish("PLACEMENT_CHANGED");
                renderEvidenceSummary(evidenceStore.start(
                        patientId.getText().toString(),
                        BuildConfig.VERSION_NAME
                ));
            } catch (Exception error) {
                renderStatus("佩戴位置已更新，但本地任务切换失败" + detail(error));
                return;
            }
        }
        syncState.setText(
                "网页同步：佩戴位置版本 " + revision
                        + "\n旧任务已隔离，新帧将重新绑定大腿/小腿"
                        + "\n等待双路服务器回执…"
        );
    }

    private void maybeStartAfterDualConnection() {
        if (!thighConnected || !shankConnected) return;
        GatewayConfig.Validation validation = GatewayConfig.validate(
                apiUrl.getText().toString(),
                patientId.getText().toString()
        );
        if (!validation.valid) {
            syncState.setText("网页同步：双传感器已连接，但平台配置不完整。请展开平台设置填写正式域名与患者 ID。");
            platformSettings.setVisibility(View.VISIBLE);
            renderStatus(validation.message);
            return;
        }
        if (stop.isEnabled()) {
            if (platformGateway == null || platformGateway.isStartRequested()) {
                return;
            }
            persistPlatformConfiguration(validation);
            syncState.setText("网页同步：双路已恢复，正在重新验证患者与 Token…");
            platformGateway.start(
                    validation.baseUrl,
                    validation.patientId,
                    apiToken.getText().toString().trim()
            );
            return;
        }
        startSession();
    }

    private LinearLayout.LayoutParams weightedButton() {
        LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1);
        params.rightMargin = dp(6);
        return params;
    }

    private void renderStatus(String message) {
        runOnUiThread(() -> status.setText(message));
    }

    private void renderUploadReceipt(UploadReceipt receipt) {
        runOnUiThread(() -> {
            String location = receipt.placement == SensorPlacement.THIGH ? "大腿" : "小腿";
            syncState.setText(
                    "网页同步：已确认一致"
                            + "\n" + location + "样本 #" + receipt.captureSequence
                            + " · 编号 …" + receipt.shortId()
                            + "\n手机采集 → 服务器 " + receipt.ingestLatencyMs + " ms"
            );
            syncState.setTextColor(receipt.ingestLatencyMs <= 2_000L ? 0xFF1B5E20 : 0xFFC62828);
            syncState.setBackground(rounded(
                    receipt.ingestLatencyMs <= 2_000L ? 0xFFE8F5E9 : 0xFFFFEBEE,
                    dp(14)
            ));
        });
    }

    private void renderLiveReading(SensorSample sample) {
        liveSampleCount += 1;
        long now = System.currentTimeMillis();
        if (sample.placement == SensorPlacement.THIGH) {
            if (now - lastThighUiAtMs < 100L) return;
            lastThighUiAtMs = now;
        } else {
            if (now - lastShankUiAtMs < 100L) return;
            lastShankUiAtMs = now;
        }
        runOnUiThread(() -> {
            boolean connectionStateChanged = false;
            if (sample.placement == SensorPlacement.THIGH) {
                if (connectedThighAddress.isEmpty()) {
                    connectedThighAddress = sample.deviceName;
                }
                if (!thighConnected) {
                    thighConnected = true;
                    connectionStateChanged = true;
                    thighPanel.markConnected("大腿传感器", sample.deviceName);
                }
                thighPanel.update(sample, false);
            } else {
                if (connectedShankAddress.isEmpty()) {
                    connectedShankAddress = sample.deviceName;
                }
                if (!shankConnected) {
                    shankConnected = true;
                    connectionStateChanged = true;
                    shankPanel.markConnected("小腿传感器", sample.deviceName);
                }
                shankPanel.update(sample, false);
            }
            if (connectionStateChanged) {
                updateLinkState();
                maybeStartAfterDualConnection();
            }
            sampleSummary.setText(
                    "实时帧数：" + liveSampleCount
                            + "\n最新设备：" + sample.deviceName
                            + "\n部位：" + (sample.placement == SensorPlacement.THIGH ? "大腿" : "小腿")
                            + "\n角度(°)：X " + format(sample.roll)
                            + "  Y " + format(sample.pitch)
                            + "  Z " + format(sample.yaw)
                            + "\n传感器电量：" + (sample.batteryLevel == null ? "设备暂未返回" : sample.batteryLevel + "%")
                            + "\n3D 姿态与波形应随转动变化"
            );
            if (stop.isEnabled()) {
                sessionState.setText("采集状态：本地记录中（实时帧 " + liveSampleCount + "）");
            }
        });
    }

    private void renderEvidenceSummary(LocalEvidenceStore.Summary summary) {
        runOnUiThread(() -> {
            if (localEvidenceState == null) return;
            if (summary == null) {
                localEvidenceState.setText("本地证据：暂无任务。连接 BT50 后即可开始。");
                exportEvidence.setEnabled(false);
                return;
            }
            localEvidenceState.setText(
                    "本地证据：" + summary.status
                            + "\n任务：" + summary.sessionId
                            + "\n已保存样本：" + summary.sampleCount
                            + " · 事件：" + summary.eventCount
            );
            exportEvidence.setEnabled(!"ACTIVE".equals(summary.status));
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
