package cn.tkarehab.gateway;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

public final class EvidenceEventDetectorTest {
    private static SensorSample sample(long atMs, double ax, double ay, double az, double gx, double gy, double gz) {
        return new SensorSample(
                "BLE-001", "WT901BLE67", SensorPlacement.SHANK, atMs, atMs,
                0, 0, 0, ax, ay, az, gx, gy, gz
        );
    }

    @Test
    public void detectsStrongMotionAndAppliesCooldown() {
        EvidenceEventDetector detector = new EvidenceEventDetector();
        EvidenceEventDetector.Signal[] first = detector.inspect(sample(10_000, 3, 0, 0, 0, 350, 0));
        EvidenceEventDetector.Signal[] cooldown = detector.inspect(sample(11_000, 3, 0, 0, 0, 350, 0));

        assertTrue(first.length >= 1);
        assertEquals("STRONG_MOTION", first[first.length - 1].type);
        assertEquals(0, cooldown.length);
    }

    @Test
    public void detectsLongDataGap() {
        EvidenceEventDetector detector = new EvidenceEventDetector();
        detector.inspect(sample(1_000, 0, 0, 1, 0, 10, 0));
        EvidenceEventDetector.Signal[] signals = detector.inspect(sample(5_001, 0, 0, 1, 0, 10, 0));

        assertEquals("DATA_GAP", signals[0].type);
    }

    @Test
    public void detectsOneStillnessEventUntilMovementResetsIt() {
        EvidenceEventDetector detector = new EvidenceEventDetector();
        detector.inspect(sample(1_000, 0, 0, 1, 0, 0, 0));
        EvidenceEventDetector.Signal[] still = detector.inspect(sample(61_000, 0, 0, 1, 0, 0, 0));
        EvidenceEventDetector.Signal[] repeated = detector.inspect(sample(62_000, 0, 0, 1, 0, 0, 0));

        assertTrue(still.length >= 1);
        assertEquals("LONG_STILLNESS", still[still.length - 1].type);
        assertEquals(0, repeated.length);
    }
}
