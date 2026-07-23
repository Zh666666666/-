package cn.tkarehab.gateway;

import java.util.Locale;

final class SoftwareZeroCalibration {
    static final SoftwareZeroCalibration NONE = new SoftwareZeroCalibration(0, 0, 0, false);

    final double roll;
    final double pitch;
    final double yaw;
    final boolean calibrated;

    SoftwareZeroCalibration(double roll, double pitch, double yaw) {
        this(roll, pitch, yaw, true);
    }

    private SoftwareZeroCalibration(double roll, double pitch, double yaw, boolean calibrated) {
        this.roll = roll;
        this.pitch = pitch;
        this.yaw = yaw;
        this.calibrated = calibrated;
    }

    double calibratedRoll(double rawRoll) {
        return calibrated ? normalizeDegrees(rawRoll - roll) : rawRoll;
    }

    double calibratedPitch(double rawPitch) {
        return calibrated ? normalizeDegrees(rawPitch - pitch) : rawPitch;
    }

    double calibratedYaw(double rawYaw) {
        return calibrated ? normalizeDegrees(rawYaw - yaw) : rawYaw;
    }

    String encode() {
        return String.format(Locale.US, "%.9f,%.9f,%.9f", roll, pitch, yaw);
    }

    static SoftwareZeroCalibration decode(String encoded) {
        if (encoded == null || encoded.trim().isEmpty()) {
            return NONE;
        }
        try {
            String[] values = encoded.split(",", -1);
            if (values.length != 3) {
                return NONE;
            }
            return new SoftwareZeroCalibration(
                    Double.parseDouble(values[0]),
                    Double.parseDouble(values[1]),
                    Double.parseDouble(values[2])
            );
        } catch (RuntimeException ignored) {
            return NONE;
        }
    }

    static double normalizeDegrees(double value) {
        double normalized = value % 360.0d;
        if (normalized > 180.0d) {
            normalized -= 360.0d;
        } else if (normalized < -180.0d) {
            normalized += 360.0d;
        }
        return normalized;
    }
}
