package cn.tkarehab.gateway;

import android.app.Activity;
import android.annotation.SuppressLint;
import android.bluetooth.BluetoothAdapter;
import android.bluetooth.BluetoothDevice;
import android.content.Intent;
import android.provider.Settings;

import com.wit.witsdk.Bluetooth.WitBluetoothManager;
import com.wit.witsdk.Device.DeviceManager;
import com.wit.witsdk.Device.DeviceModel;
import com.wit.witsdk.Device.Interface.DeviceDataListener;
import com.wit.witsdk.Device.Interface.DeviceFindListener;

import java.util.HashMap;
import java.util.Locale;
import java.util.Map;

/**
 * Keeps WitMotion's SDK at the Android edge. Application code only sees typed
 * readings and never depends on the SDK's human-readable display strings.
 */
final class WitBleGateway implements DeviceDataListener, DeviceFindListener {
    private static final long MIN_SAMPLE_INTERVAL_MS = 100L;

    interface Listener {
        void onDeviceFound(String address, String name);
        void onConnectionChanged(String address, boolean connected);
        void onReading(SensorSample sample);
        void onError(String message, Exception error);
        void onStatus(String message);
    }

    private final Activity activity;
    private final Listener listener;
    private final DeviceManager deviceManager = DeviceManager.getInstance();
    private final Map<String, BluetoothDevice> discoveredDevices = new HashMap<>();
    private final Map<String, SensorPlacement> placements = new HashMap<>();
    private final Map<String, Long> lastSampleAt = new HashMap<>();
    private boolean waitingForPermissions;
    private boolean resumeScanWhenReady;
    private boolean scanning;
    private boolean stopped;

    WitBleGateway(Activity activity, Listener listener) {
        this.activity = activity;
        this.listener = listener;
        deviceManager.AddDeviceListener(this);
        deviceManager.AddDeviceFindListener(this);
    }

    void requestPermissionsAndScan() {
        if (stopped) {
            return;
        }
        resumeScanWhenReady = true;

        if (!WitBluetoothManager.checkPermissions(activity)) {
            waitingForPermissions = true;
            listener.onStatus("正在申请蓝牙和定位权限；允许后会自动继续扫描。");
            WitBluetoothManager.requestPermissions(activity);
            return;
        }

        startScanWhenReady();
    }

    void onPermissionsResult(boolean granted) {
        if (!waitingForPermissions || stopped) {
            return;
        }
        waitingForPermissions = false;

        // Always re-check the real permission state. Some OEMs report a partial
        // grantResult array while ContextCompat still sees the permission as denied.
        if (!granted || !WitBluetoothManager.checkPermissions(activity)) {
            resumeScanWhenReady = false;
            listener.onError(
                    "扫描需要蓝牙和定位权限。请在系统设置 → 应用 → TKA Hardware Gateway → 权限中全部允许后重试。",
                    null
            );
            return;
        }

        if (resumeScanWhenReady) {
            startScanWhenReady();
        }
    }

    /**
     * Called when the activity returns to the foreground, for example after the
     * user enables location services or Bluetooth in system settings.
     */
    void onHostResumed() {
        if (stopped || waitingForPermissions || !resumeScanWhenReady || scanning) {
            return;
        }
        if (!WitBluetoothManager.checkPermissions(activity)) {
            return;
        }
        startScanWhenReady();
    }

    @SuppressLint("MissingPermission")
    private void startScanWhenReady() {
        BluetoothAdapter adapter = BluetoothAdapter.getDefaultAdapter();
        if (adapter == null) {
            resumeScanWhenReady = false;
            listener.onError("此手机不支持蓝牙，无法连接 WT 传感器。", null);
            return;
        }
        if (!adapter.isEnabled()) {
            listener.onStatus("请先开启蓝牙；开启后返回本应用会自动继续扫描。");
            try {
                activity.startActivity(new Intent(BluetoothAdapter.ACTION_REQUEST_ENABLE));
            } catch (Exception error) {
                listener.onError("无法打开蓝牙开关页面。", error);
            }
            return;
        }

        if (!LocationServices.isEnabled(activity)) {
            listener.onStatus(
                    "请开启系统定位服务（很多手机不开定位就扫不到蓝牙设备名）。"
                            + "开启后直接返回本应用，会自动继续扫描。"
            );
            try {
                activity.startActivity(new Intent(Settings.ACTION_LOCATION_SOURCE_SETTINGS));
            } catch (Exception error) {
                listener.onError("无法打开定位设置页面，请手动开启定位后重试。", error);
            }
            return;
        }

        try {
            WitBluetoothManager manager = WitBluetoothManager.getInstance(activity);
            try {
                manager.stopScan();
            } catch (Exception ignored) {
                // First scan has no active callback.
            }
            discoveredDevices.clear();
            scanning = true;
            resumeScanWhenReady = false;
            manager.startScan();
            listener.onStatus(
                    "正在扫描 WT 蓝牙设备（约 10 秒）。"
                            + "请确认传感器已开机，指示灯闪烁，并靠近手机。"
            );
        } catch (Exception error) {
            scanning = false;
            // Keep resume armed so a later permission/location fix can continue.
            resumeScanWhenReady = true;
            listener.onError("无法启动蓝牙扫描。请确认权限、蓝牙和定位均已开启。", error);
        }
    }

    void assignAndConnect(String address, SensorPlacement placement) {
        BluetoothDevice device = discoveredDevices.get(address);
        if (device == null) {
            listener.onError("所选设备已失效，请重新扫描。", null);
            return;
        }

        for (Map.Entry<String, SensorPlacement> entry : new HashMap<>(placements).entrySet()) {
            if (!entry.getKey().equals(address) && entry.getValue() == placement) {
                DeviceModel previous = deviceManager.GetDevice(entry.getKey());
                if (previous != null) {
                    previous.CloseDevice();
                }
                deviceManager.RemoveDevice(entry.getKey());
            }
        }
        placements.entrySet().removeIf(entry ->
                !entry.getKey().equals(address) && entry.getValue() == placement
        );
        DeviceModel existing = deviceManager.GetDevice(address);
        if (existing != null) {
            existing.CloseDevice();
            deviceManager.RemoveDevice(address);
        }
        placements.put(address, placement);
        DeviceModel deviceModel = new DeviceModel(address, device);
        deviceManager.AddDevice(address, deviceModel);
        try {
            deviceModel.Connect(activity);
            listener.onStatus(placementLabel(placement) + " 传感器连接中：" + address);
        } catch (Exception error) {
            listener.onError("无法连接 " + address, error);
        }
    }

    void setAngleZero(SensorPlacement placement) {
        for (Map.Entry<String, SensorPlacement> entry : placements.entrySet()) {
            if (entry.getValue() == placement) {
                DeviceModel device = deviceManager.GetDevice(entry.getKey());
                if (device != null) {
                    device.SetAngle0();
                    listener.onStatus(placementLabel(placement) + " 已发送归零命令。");
                    return;
                }
            }
        }
        listener.onError("请先把 " + placementLabel(placement) + " 传感器扫描并连接。", null);
    }

    void stop() {
        stopped = true;
        resumeScanWhenReady = false;
        scanning = false;
        try {
            WitBluetoothManager.getInstance(activity).stopScan();
        } catch (Exception ignored) {
            // The SDK throws before permissions have been granted.
        }
        deviceManager.CleanAllDevice();
        deviceManager.RemoveDeviceListener(this);
        deviceManager.RemoveDeviceFindListener(this);
        placements.clear();
        discoveredDevices.clear();
        lastSampleAt.clear();
    }

    @Override
    @SuppressLint("MissingPermission")
    public void onDeviceFound(BluetoothDevice device) {
        String name = device.getName();
        if (name == null || name.trim().isEmpty()) {
            // Without location services many phones hide the advertised name.
            return;
        }
        String normalized = name.toUpperCase(Locale.ROOT);
        if (!(normalized.startsWith("WT") || normalized.startsWith("BWT") || normalized.contains("901"))) {
            return;
        }
        String address = device.getAddress();
        if (address == null || discoveredDevices.containsKey(address)) {
            return;
        }
        discoveredDevices.put(address, device);
        listener.onDeviceFound(address, name);
        listener.onStatus("已发现设备：" + name + "（" + address + "）");
    }

    @Override
    public void OnReceive(String address, String ignoredDisplayData) {
        SensorPlacement placement = placements.get(address);
        DeviceModel device = deviceManager.GetDevice(address);
        if (placement == null || device == null) {
            return;
        }

        long now = System.currentTimeMillis();
        Long last = lastSampleAt.get(address);
        if (last != null && now - last < MIN_SAMPLE_INTERVAL_MS) {
            return;
        }
        lastSampleAt.put(address, now);

        SensorSample sample = new SensorSample(
                "BLE-" + address.replace(":", ""),
                address,
                placement,
                now,
                device.GetData("AngX"),
                device.GetData("AngY"),
                device.GetData("AngZ"),
                device.GetData("AccX"),
                device.GetData("AccY"),
                device.GetData("AccZ"),
                device.GetData("AsX"),
                device.GetData("AsY"),
                device.GetData("AsZ")
        );
        listener.onReading(sample);
    }

    @Override
    public void OnStatusChange(String address, boolean connected) {
        listener.onConnectionChanged(address, connected);
    }

    private static String placementLabel(SensorPlacement placement) {
        return placement == SensorPlacement.THIGH ? "大腿" : "小腿";
    }
}
