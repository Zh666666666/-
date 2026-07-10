package cn.tkarehab.gateway;

import android.os.Bundle;
import android.text.InputType;
import android.view.Gravity;
import android.view.View;
import android.widget.Button;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;

import androidx.appcompat.app.AppCompatActivity;

import java.util.HashSet;
import java.util.Set;

/** A deliberately small operational screen for initial device pairing and field testing. */
public final class MainActivity extends AppCompatActivity {
    private final Set<String> renderedDevices = new HashSet<>();
    private LinearLayout devices;
    private TextView status;
    private EditText apiUrl;
    private EditText patientId;
    private EditText apiToken;
    private WitBleGateway bleGateway;
    private PlatformGateway platformGateway;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(createContent());

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
            renderStatus("Encrypted queue initialization failed" + detail(error));
        }

        bleGateway = new WitBleGateway(this, new WitBleGateway.Listener() {
            @Override
            public void onDeviceFound(String address, String name) {
                runOnUiThread(() -> addDiscoveredDevice(address, name));
            }

            @Override
            public void onConnectionChanged(String address, boolean connected) {
                renderStatus(address + (connected ? " connected" : " disconnected"));
            }

            @Override
            public void onReading(SensorSample sample) {
                if (platformGateway != null) {
                    platformGateway.accept(sample);
                }
            }

            @Override
            public void onError(String message, Exception error) {
                renderStatus(message + detail(error));
            }
        });
    }

    @Override
    protected void onDestroy() {
        if (bleGateway != null) {
            bleGateway.stop();
        }
        super.onDestroy();
    }

    private View createContent() {
        int padding = dp(16);
        LinearLayout content = new LinearLayout(this);
        content.setOrientation(LinearLayout.VERTICAL);
        content.setPadding(padding, padding, padding, padding);

        TextView title = new TextView(this);
        title.setText("TKA Hardware Gateway");
        title.setTextSize(22);
        content.addView(title);

        apiUrl = labeledInput(content, "HTTPS API URL", "https://your-server.example.com", InputType.TYPE_TEXT_VARIATION_URI);
        patientId = labeledInput(content, "Patient ID", "Patient ID from the platform", InputType.TYPE_CLASS_TEXT);
        apiToken = labeledInput(content, "Bearer token (optional)", "Leave blank until production auth is enabled", InputType.TYPE_TEXT_VARIATION_PASSWORD);

        Button start = new Button(this);
        start.setText("Start hardware session");
        start.setOnClickListener(view -> startSession());
        content.addView(start);

        Button scan = new Button(this);
        scan.setText("Request permissions and scan WT devices");
        scan.setOnClickListener(view -> {
            renderedDevices.clear();
            devices.removeAllViews();
            bleGateway.requestPermissionsAndScan();
            renderStatus("Scanning for official WIT BLE devices.");
        });
        content.addView(scan);

        LinearLayout calibration = new LinearLayout(this);
        calibration.setOrientation(LinearLayout.HORIZONTAL);
        Button zeroThigh = new Button(this);
        zeroThigh.setText("Zero thigh");
        zeroThigh.setOnClickListener(view -> bleGateway.setAngleZero(SensorPlacement.THIGH));
        calibration.addView(zeroThigh, new LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1));
        Button zeroShank = new Button(this);
        zeroShank.setText("Zero shank");
        zeroShank.setOnClickListener(view -> bleGateway.setAngleZero(SensorPlacement.SHANK));
        calibration.addView(zeroShank, new LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1));
        content.addView(calibration);

        TextView discoveredLabel = new TextView(this);
        discoveredLabel.setText("Discovered devices");
        discoveredLabel.setTextSize(18);
        discoveredLabel.setPadding(0, dp(12), 0, dp(4));
        content.addView(discoveredLabel);

        devices = new LinearLayout(this);
        devices.setOrientation(LinearLayout.VERTICAL);
        content.addView(devices);

        status = new TextView(this);
        status.setText("Enter the server URL and patient ID, then start a session. Readings stay queued until upload succeeds.");
        status.setPadding(0, dp(16), 0, 0);
        content.addView(status);

        ScrollView scrollView = new ScrollView(this);
        scrollView.addView(content);
        return scrollView;
    }

    private EditText labeledInput(LinearLayout container, String label, String hint, int inputType) {
        TextView text = new TextView(this);
        text.setText(label);
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
        String url = apiUrl.getText().toString().trim();
        String patient = patientId.getText().toString().trim();
        if (!url.startsWith("https://") || patient.isEmpty()) {
            renderStatus("Use an HTTPS API URL and a platform patient ID before collecting physical data.");
            return;
        }
        if (platformGateway == null) {
            renderStatus("The encrypted queue is unavailable; do not start collection.");
            return;
        }
        platformGateway.start(url, patient, apiToken.getText().toString().trim());
        renderStatus("Hardware session armed. Scan and assign the thigh and shank sensors.");
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
        row.addView(label);

        LinearLayout actions = new LinearLayout(this);
        actions.setGravity(Gravity.START);
        Button thigh = new Button(this);
        thigh.setText("Assign thigh");
        thigh.setOnClickListener(view -> {
            bleGateway.assignAndConnect(address, SensorPlacement.THIGH);
            renderStatus(name + " assigned as thigh.");
        });
        actions.addView(thigh);
        Button shank = new Button(this);
        shank.setText("Assign shank");
        shank.setOnClickListener(view -> {
            bleGateway.assignAndConnect(address, SensorPlacement.SHANK);
            renderStatus(name + " assigned as shank.");
        });
        actions.addView(shank);
        row.addView(actions);
        devices.addView(row);
    }

    private void renderStatus(String message) {
        runOnUiThread(() -> status.setText(message));
    }

    private int dp(int value) {
        return Math.round(value * getResources().getDisplayMetrics().density);
    }

    private static String detail(Exception error) {
        return error == null ? "" : ": " + error.getMessage();
    }
}
