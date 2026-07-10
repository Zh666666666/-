package cn.tkarehab.gateway;

import android.app.Activity;
import android.bluetooth.BluetoothDevice;

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

    WitBleGateway(Activity activity, Listener listener) {
        this.activity = activity;
        this.listener = listener;
        deviceManager.AddDeviceListener(this);
        deviceManager.AddDeviceFindListener(this);
    }

    void requestPermissionsAndScan() {
        WitBluetoothManager.requestPermissions(activity);
        try {
            WitBluetoothManager.getInstance(activity).startScan();
        } catch (Exception error) {
            listener.onError("Bluetooth permissions are required before scanning.", error);
        }
    }

    void assignAndConnect(String address, SensorPlacement placement) {
        BluetoothDevice device = discoveredDevices.get(address);
        if (device == null) {
            listener.onError("The selected device is no longer available. Scan again.", null);
            return;
        }

        for (Map.Entry<String, SensorPlacement> entry : placements.entrySet()) {
            if (!entry.getKey().equals(address) && entry.getValue() == placement) {
                DeviceModel previous = deviceManager.GetDevice(entry.getKey());
                if (previous != null) {
                    previous.CloseDevice();
                }
            }
        }
        placements.entrySet().removeIf(entry ->
                !entry.getKey().equals(address) && entry.getValue() == placement
        );
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
        try {
            WitBluetoothManager.getInstance(activity).stopScan();
        } catch (Exception ignored) {
            // The SDK throws before permissions have been granted.
        }
        deviceManager.CleanAllDevice();
        placements.clear();
    }

    @Override
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

        SensorSample sample = new SensorSample(
                "BLE-" + address.replace(":", ""),
                address,
                placement,
                System.currentTimeMillis(),
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
}
