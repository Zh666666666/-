package cn.tkarehab.gateway;

import android.app.Activity;
import android.annotation.SuppressLint;
import android.bluetooth.BluetoothAdapter;
import android.bluetooth.BluetoothDevice;
import android.content.Intent;
import android.location.LocationManager;
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
    }

    private final Activity activity;
    private final Listener listener;
    private final DeviceManager deviceManager = DeviceManager.getInstance();
    private final Map<String, BluetoothDevice> discoveredDevices = new HashMap<>();
    private final Map<String, SensorPlacement> placements = new HashMap<>();
    private final Map<String, Long> lastSampleAt = new HashMap<>();
    private boolean waitingForPermissions;
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
        if (!WitBluetoothManager.checkPermissions(activity)) {
            waitingForPermissions = true;
            WitBluetoothManager.requestPermissions(activity);
            listener.onError("请允许蓝牙和定位权限；授权后应用会自动开始扫描。", null);
            return;
        }
        startScanWhenReady();
    }

    void onPermissionsResult(boolean granted) {
        if (!waitingForPermissions || stopped) {
            return;
        }
        waitingForPermissions = false;
        if (!granted || !WitBluetoothManager.checkPermissions(activity)) {
            listener.onError("扫描需要蓝牙和定位权限，请在系统设置中允许后重试。", null);
            return;
        }
        startScanWhenReady();
    }

    @SuppressLint("MissingPermission")
    private void startScanWhenReady() {
        BluetoothAdapter adapter = BluetoothAdapter.getDefaultAdapter();
        if (adapter == null) {
            listener.onError("此手机不支持蓝牙，无法连接 WT 传感器。", null);
            return;
        }
        if (!adapter.isEnabled()) {
            activity.startActivity(new Intent(BluetoothAdapter.ACTION_REQUEST_ENABLE));
            listener.onError("请先开启蓝牙，然后再次点击扫描。", null);
            return;
        }

        LocationManager location = (LocationManager) activity.getSystemService(Activity.LOCATION_SERVICE);
        if (location != null && !location.isProviderEnabled(LocationManager.GPS_PROVIDER)) {
            activity.startActivity(new Intent(Settings.ACTION_LOCATION_SOURCE_SETTINGS));
            listener.onError("官方 SDK 需要开启系统定位服务；开启后请再次点击扫描。", null);
            return;
        }

        try {
            WitBluetoothManager manager = WitBluetoothManager.getInstance(activity);
            manager.stopScan();
            discoveredDevices.clear();
            manager.startScan();
            listener.onError("正在扫描 WT 蓝牙设备，扫描会在 10 秒后自动停止。", null);
        } catch (Exception error) {
            listener.onError("无法启动蓝牙扫描。请确认权限、蓝牙和定位均已开启。", error);
        }
    }

    void assignAndConnect(String address, SensorPlacement placement) {
        BluetoothDevice device = discoveredDevices.get(address);
        if (device == null) {
            listener.onError("The selected device is no longer available. Scan again.", null);
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
        } catch (Exception error) {
            listener.onError("Could not connect " + address, error);
        }
    }

    void setAngleZero(SensorPlacement placement) {
        for (Map.Entry<String, SensorPlacement> entry : placements.entrySet()) {
            if (entry.getValue() == placement) {
                DeviceModel device = deviceManager.GetDevice(entry.getKey());
                if (device != null) {
                    device.SetAngle0();
                    return;
                }
            }
        }
        listener.onError("Assign and connect the " + placement.name() + " sensor first.", null);
    }

    void stop() {
        stopped = true;
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
        if (name == null || !name.toUpperCase(Locale.ROOT).startsWith("WT")) {
            return;
        }
        String address = device.getAddress();
        if (address == null || discoveredDevices.containsKey(address)) {
            return;
        }
        discoveredDevices.put(address, device);
        listener.onDeviceFound(address, name);
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
                discoveredDeviceName(address),
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

    @SuppressLint("MissingPermission")
    private String discoveredDeviceName(String address) {
        BluetoothDevice bluetoothDevice = discoveredDevices.get(address);
        if (bluetoothDevice == null || !WitBluetoothManager.checkPermissions(activity)) {
            return address;
        }
        try {
            String name = bluetoothDevice.getName();
            return name == null ? address : name;
        } catch (SecurityException ignored) {
            // Permission can be revoked while a connected device is streaming.
            return address;
        }
    }

    @Override
    public void OnStatusChange(String address, boolean connected) {
        listener.onConnectionChanged(address, connected);
    }
}
