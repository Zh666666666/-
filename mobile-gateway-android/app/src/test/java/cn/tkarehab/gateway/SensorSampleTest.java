package cn.tkarehab.gateway;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNotEquals;

import org.junit.Test;

public final class SensorSampleTest {
    @Test
    public void formatsUtcTimestampOnAndroidSevenCompatibleApis() {
        assertEquals("2024-01-01T00:00:00.123Z", SensorSample.formatRecordedAt(1_704_067_200_123L));
    }

    @Test
    public void keepsOneStableGatewaySampleIdForOfflineRetries() throws Exception {
        SensorSample sample = new SensorSample(
                "BLE-001", "WT901BLE67", SensorPlacement.SHANK, 1_704_067_200_123L,
                1, 2, 3, 4, 5, 6, 7, 8, 9
        );

        assertEquals(sample.gatewaySampleId, sample.toUploadJson().getString("gatewaySampleId"));
        assertNotEquals("", sample.gatewaySampleId);
    }
}
