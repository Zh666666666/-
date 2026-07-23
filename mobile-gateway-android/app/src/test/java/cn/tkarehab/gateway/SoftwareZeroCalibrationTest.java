package cn.tkarehab.gateway;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

public final class SoftwareZeroCalibrationTest {
    @Test
    public void appliesPersistentOffsetsAndWrapsAtOneEightyDegrees() {
        SoftwareZeroCalibration zero = new SoftwareZeroCalibration(179, -30, -179);

        assertEquals(2.0, zero.calibratedRoll(-179), 0.0001);
        assertEquals(5.0, zero.calibratedPitch(-25), 0.0001);
        assertEquals(-2.0, zero.calibratedYaw(179), 0.0001);
    }

    @Test
    public void roundTripsStoredCalibration() {
        SoftwareZeroCalibration restored = SoftwareZeroCalibration.decode(
                new SoftwareZeroCalibration(1.25, -2.5, 179.75).encode()
        );

        assertTrue(restored.calibrated);
        assertEquals(1.25, restored.roll, 0.0001);
        assertEquals(-2.5, restored.pitch, 0.0001);
        assertEquals(179.75, restored.yaw, 0.0001);
    }

    @Test
    public void rejectsDamagedStoredCalibration() {
        SoftwareZeroCalibration restored = SoftwareZeroCalibration.decode("not-a-zero");

        assertFalse(restored.calibrated);
        assertEquals(12.0, restored.calibratedRoll(12.0), 0.0001);
    }
}
