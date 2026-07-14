package cn.tkarehab.gateway;

import org.json.JSONException;
import org.json.JSONObject;

import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;
import java.util.TimeZone;
import java.util.UUID;

final class SensorSample {
    final String gatewayDeviceId;
    final String gatewaySampleId;
    final String deviceName;
    final SensorPlacement placement;
    final long recordedAtMs;
    final double roll;
    final double pitch;
    final double yaw;
    final double ax;
    final double ay;
    final double az;
    final double gx;
    final double gy;
    final double gz;

    SensorSample(
            String gatewayDeviceId,
            String deviceName,
            SensorPlacement placement,
            long recordedAtMs,
            double roll,
            double pitch,
            double yaw,
            double ax,
            double ay,
            double az,
            double gx,
            double gy,
            double gz
    ) {
        this.gatewayDeviceId = gatewayDeviceId;
        this.gatewaySampleId = UUID.randomUUID().toString();
        this.deviceName = deviceName;
        this.placement = placement;
        this.recordedAtMs = recordedAtMs;
        this.roll = roll;
        this.pitch = pitch;
        this.yaw = yaw;
        this.ax = ax;
        this.ay = ay;
        this.az = az;
        this.gx = gx;
        this.gy = gy;
        this.gz = gz;
    }

    JSONObject toUploadJson() throws JSONException {
        JSONObject raw = new JSONObject();
        raw.put("protocol", "WIT_BLE_SDK");
        raw.put("transport", "BLE_5_NATIVE");
        raw.put("gatewayDeviceId", gatewayDeviceId);
        raw.put("deviceName", deviceName);

        JSONObject payload = new JSONObject();
        payload.put("gatewayDeviceId", gatewayDeviceId);
        payload.put("gatewaySampleId", gatewaySampleId);
        payload.put("patientId", "");
        payload.put("placement", placement.name());
        payload.put("recordedAt", formatRecordedAt(recordedAtMs));
        payload.put("roll", roll);
        payload.put("pitch", pitch);
        payload.put("yaw", yaw);
        payload.put("ax", ax);
        payload.put("ay", ay);
        payload.put("az", az);
        payload.put("gx", gx);
        payload.put("gy", gy);
        payload.put("gz", gz);
        payload.put("raw", raw);
        return payload;
    }

    JSONObject toEvidenceJson() throws JSONException {
        JSONObject payload = new JSONObject();
        payload.put("id", gatewaySampleId);
        payload.put("recordedAt", formatRecordedAt(recordedAtMs));
        payload.put("deviceId", gatewayDeviceId);
        payload.put("deviceName", deviceName);
        payload.put("placement", placement.name());
        payload.put("roll", roll);
        payload.put("pitch", pitch);
        payload.put("yaw", yaw);
        payload.put("ax", ax);
        payload.put("ay", ay);
        payload.put("az", az);
        payload.put("gx", gx);
        payload.put("gy", gy);
        payload.put("gz", gz);
        return payload;
    }

    static String formatRecordedAt(long recordedAtMs) {
        SimpleDateFormat formatter = new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US);
        formatter.setTimeZone(TimeZone.getTimeZone("UTC"));
        return formatter.format(new Date(recordedAtMs));
    }
}
