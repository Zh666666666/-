package cn.tkarehab.gateway;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNull;

import org.junit.Test;

public final class KneeAngleCalculatorTest {
    @Test
    public void calculatesPairedPitchWithinTimeWindow() {
        KneeAngleCalculator.Result result = KneeAngleCalculator.calculate(1_000, 12.25, 1_120, 82.81);

        assertEquals(70.6, result.flexion, 0.001);
        assertEquals(-20.0, result.extension, 0.001);
        assertEquals(0.88, result.confidence, 0.001);
    }

    @Test
    public void clampsFlexionAndRejectsStalePairs() {
        KneeAngleCalculator.Result clamped = KneeAngleCalculator.calculate(1_000, -100, 1_000, 100);

        assertEquals(150.0, clamped.flexion, 0.001);
        assertNull(KneeAngleCalculator.calculate(1_000, 10, 1_301, 20));
    }

    @Test
    public void rejectsNonFiniteSensorValues() {
        assertNull(KneeAngleCalculator.calculate(1_000, Double.NaN, 1_000, 20));
        assertNull(KneeAngleCalculator.calculate(1_000, 10, 1_000, Double.POSITIVE_INFINITY));
    }
}
