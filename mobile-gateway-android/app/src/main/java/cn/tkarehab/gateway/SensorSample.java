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
    final long captureSequence;
    final long recordedAtMs;
    final long placementRevision;
    final double rawRoll;
    final double rawPitch;
    final double rawYaw;
    final SoftwareZeroCalibration softwareZero;
    final double roll;
    final double pitch;
    final double yaw;
    final double ax;
    final double ay;
    final double az;
    final double gx;
    final double gy;
    final double gz;
    final Integer batteryLevel;

    SensorSample(
            String gatewayDeviceId,
            String deviceName,
            SensorPlacement placement,
            long captureSequence,
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
        this(
                gatewayDeviceId, deviceName, placement, captureSequence, recordedAtMs,
                0L, roll, pitch, yaw, SoftwareZeroCalibration.NONE,
                ax, ay, az, gx, gy, gz, null
        );
    }

    SensorSample(
            String gatewayDeviceId,
            String deviceName,
            SensorPlacement placement,
            long captureSequence,
            long recordedAtMs,
            long placementRevision,
            double rawRoll,
            double rawPitch,
            double rawYaw,
            SoftwareZeroCalibration softwareZero,
            double ax,
            double ay,
            double az,
            double gx,
            double gy,
            double gz
    ) {
        this(
                gatewayDeviceId, deviceName, placement, captureSequence, recordedAtMs,
                placementRevision, rawRoll, rawPitch, rawYaw, softwareZero,
                ax, ay, az, gx, gy, gz, null
        );
    }

    SensorSample(
            String gatewayDeviceId,
            String deviceName,
            SensorPlacement placement,
            long captureSequence,
            long recordedAtMs,
            long placementRevision,
            double rawRoll,
            double rawPitch,
            double rawYaw,
            SoftwareZeroCalibration softwareZero,
            double ax,
            double ay,
            double az,
            double gx,
            double gy,
            double gz,
            Integer batteryLevel
    ) {
        this.gatewayDeviceId = gatewayDeviceId;
        this.gatewaySampleId = UUID.randomUUID().toString();
        this.deviceName = deviceName;
        this.placement = placement;
        this.captureSequence = captureSequence;
        this.recordedAtMs = recordedAtMs;
        this.placementRevision = placementRevision;
        this.rawRoll = rawRoll;
        this.rawPitch = rawPitch;
        this.rawYaw = rawYaw;
        this.softwareZero = softwareZero == null ? SoftwareZeroCalibration.NONE : softwareZero;
        this.roll = this.softwareZero.calibratedRoll(rawRoll);
        this.pitch = this.softwareZero.calibratedPitch(rawPitch);
        this.yaw = this.softwareZero.calibratedYaw(rawYaw);
        this.ax = ax;
        this.ay = ay;
        this.az = az;
        this.gx = gx;
        this.gy = gy;
        this.gz = gz;
        this.batteryLevel = batteryLevel;
    }

    JSONObject toUploadJson() throws JSONException {
        JSONObject raw = new JSONObject();
        raw.put("protocol", "WIT_BLE_SDK");
        raw.put("transport", "BLE_5_NATIVE");
        raw.put("gatewayDeviceId", gatewayDeviceId);
        raw.put("deviceName", deviceName);
        raw.put("captureSequence", captureSequence);
        raw.put("placementRevision", placementRevision);
        raw.put("angleCalibrationMode", softwareZero.calibrated ? "SOFTWARE_ZERO" : "RAW");
        raw.put("rawAngles", angleJson(rawRoll, rawPitch, rawYaw));
        raw.put("originalAngles", angleJson(rawRoll, rawPitch, rawYaw));
        raw.put("softwareZero", angleJson(softwareZero.roll, softwareZero.pitch, softwareZero.yaw));
        raw.put("zeroOffsets", angleJson(softwareZero.roll, softwareZero.pitch, softwareZero.yaw));

        JSONObject payload = new JSONObject();
        payload.put("gatewayDeviceId", gatewayDeviceId);
        payload.put("gatewaySampleId", gatewaySampleId);
        payload.put("captureSequence", captureSequence);
        payload.put("patientId", "");
        payload.put("placement", placement.name());
        payload.put("placementRevision", placementRevision);
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
        if (batteryLevel != null) {
            payload.put("batteryLevel", batteryLevel);
            raw.put("batterySource", "WIT_SDK_ELECTRICITY_REGISTER_0X64");
        }
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
        payload.put("placementRevision", placementRevision);
        payload.put("captureSequence", captureSequence);
        payload.put("rawAngles", angleJson(rawRoll, rawPitch, rawYaw));
        payload.put("softwareZero", angleJson(softwareZero.roll, softwareZero.pitch, softwareZero.yaw));
        payload.put("angleCalibrationMode", softwareZero.calibrated ? "SOFTWARE_ZERO" : "RAW");
        payload.put("roll", roll);
        payload.put("pitch", pitch);
        payload.put("yaw", yaw);
        payload.put("ax", ax);
        payload.put("ay", ay);
        payload.put("az", az);
        payload.put("gx", gx);
        payload.put("gy", gy);
        payload.put("gz", gz);
        if (batteryLevel != null) {
            payload.put("batteryLevel", batteryLevel);
        }
        return payload;
    }

    private static JSONObject angleJson(double roll, double pitch, double yaw) throws JSONException {
        JSONObject angles = new JSONObject();
        angles.put("roll", roll);
        angles.put("pitch", pitch);
        angles.put("yaw", yaw);
        return angles;
    }

    static String formatRecordedAt(long recordedAtMs) {
        SimpleDateFormat formatter = new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US);
        formatter.setTimeZone(TimeZone.getTimeZone("UTC"));
        return formatter.format(new Date(recordedAtMs));
    }
}
