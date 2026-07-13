package cn.tkarehab.gateway;

final class KneeAngleCalculator {
    private static final long MAX_PAIR_GAP_MS = 300L;

    private KneeAngleCalculator() {
    }

    static Result calculate(long thighAtMs, double thighPitch, long shankAtMs, double shankPitch) {
        long gapMs = Math.abs(shankAtMs - thighAtMs);
        if (gapMs > MAX_PAIR_GAP_MS || !Double.isFinite(thighPitch) || !Double.isFinite(shankPitch)) {
            return null;
        }
        double flexion = Math.max(0, Math.min(150, Math.abs(shankPitch - thighPitch)));
        double extension = Math.max(-20, Math.min(40, -flexion));
        double confidence = Math.max(0.5, 1.0 - gapMs / 1000.0);
        return new Result(roundOne(flexion), roundOne(extension), confidence, false);
    }

    /**
     * Single-sensor interim estimate used only when the second WT901 is not paired yet.
     * This keeps the clinical dashboard moving without pretending dual-sensor accuracy.
     */
    static Result provisionalFromSingle(double pitch) {
        if (!Double.isFinite(pitch)) {
            return null;
        }
        double flexion = Math.max(0, Math.min(150, Math.abs(pitch)));
        double extension = Math.max(-20, Math.min(40, -Math.min(flexion, 20)));
        return new Result(roundOne(flexion), roundOne(extension), 0.35, true);
    }

    private static double roundOne(double value) {
        return Math.round(value * 10.0) / 10.0;
    }

    static final class Result {
        final double flexion;
        final double extension;
        final double confidence;
        final boolean provisional;

        Result(double flexion, double extension, double confidence) {
            this(flexion, extension, confidence, false);
        }

        Result(double flexion, double extension, double confidence, boolean provisional) {
            this.flexion = flexion;
            this.extension = extension;
            this.confidence = confidence;
            this.provisional = provisional;
        }
    }
}
