package cn.tkarehab.gateway;

import java.util.EnumMap;
import java.util.Locale;
import java.util.Map;

final class EvidenceEventDetector {
    static final long DATA_GAP_MS = 3_000L;
    static final long STILLNESS_MS = 60_000L;
    static final double IMPACT_ACCELERATION_G = 2.5d;
    static final double IMPACT_ANGULAR_VELOCITY_DPS = 300d;

    static final class Signal {
        final String type;
        final String severity;
        final String title;
        final String evidence;

        Signal(String type, String severity, String title, String evidence) {
            this.type = type;
            this.severity = severity;
            this.title = title;
            this.evidence = evidence;
        }
    }

    private final Map<SensorPlacement, Long> lastSampleAt = new EnumMap<>(SensorPlacement.class);
    private final Map<SensorPlacement, Long> stillnessStartedAt = new EnumMap<>(SensorPlacement.class);
    private final Map<SensorPlacement, Boolean> stillnessReported = new EnumMap<>(SensorPlacement.class);
    private long lastImpactAt;

    synchronized Signal[] inspect(SensorSample sample) {
        Signal gap = null;
        Long previous = lastSampleAt.put(sample.placement, sample.recordedAtMs);
        if (previous != null && sample.recordedAtMs - previous > DATA_GAP_MS) {
            gap = new Signal(
                    "DATA_GAP",
                    "WATCH",
                    "采集出现长断帧",
                    "同一传感器相邻样本间隔 " + (sample.recordedAtMs - previous) + "ms，超过 3000ms。"
            );
        }

        double acceleration = magnitude(sample.ax, sample.ay, sample.az);
        double angularVelocity = magnitude(sample.gx, sample.gy, sample.gz);
        Signal impact = null;
        if (
                sample.recordedAtMs - lastImpactAt >= 5_000L
                        && (acceleration >= IMPACT_ACCELERATION_G || angularVelocity >= IMPACT_ANGULAR_VELOCITY_DPS)
        ) {
            lastImpactAt = sample.recordedAtMs;
            impact = new Signal(
                    "STRONG_MOTION",
                    "HIGH",
                    "检测到强冲击或剧烈运动",
                    String.format(
                            Locale.US,
                            "加速度合量 %.2fg，角速度合量 %.0f°/s；该事件仅用于工程复核。",
                            acceleration,
                            angularVelocity
                    )
            );
        }

        boolean still = Math.abs(acceleration - 1d) <= 0.12d && angularVelocity < 3d;
        Signal stillness = null;
        if (!still) {
            stillnessStartedAt.remove(sample.placement);
            stillnessReported.put(sample.placement, false);
        } else {
            long startedAt = stillnessStartedAt.computeIfAbsent(sample.placement, ignored -> sample.recordedAtMs);
            boolean reported = Boolean.TRUE.equals(stillnessReported.get(sample.placement));
            if (!reported && sample.recordedAtMs - startedAt >= STILLNESS_MS) {
                stillnessReported.put(sample.placement, true);
                stillness = new Signal(
                        "LONG_STILLNESS",
                        "WATCH",
                        "传感器长时间静止",
                        "连续 60 秒接近 1g 且角速度低于 3°/s，请确认设备仍在佩戴或任务是否已结束。"
                );
            }
        }

        int count = (gap == null ? 0 : 1) + (impact == null ? 0 : 1) + (stillness == null ? 0 : 1);
        Signal[] result = new Signal[count];
        int index = 0;
        if (gap != null) result[index++] = gap;
        if (impact != null) result[index++] = impact;
        if (stillness != null) result[index] = stillness;
        return result;
    }

    static double magnitude(double x, double y, double z) {
        return Math.sqrt(x * x + y * y + z * z);
    }
}
