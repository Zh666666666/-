package cn.tkarehab.gateway;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

public final class SensorSampleTest {
    @Test
    public void formatsUtcTimestampOnAndroidSevenCompatibleApis() {
        assertEquals("2024-01-01T00:00:00.123Z", SensorSample.formatRecordedAt(1_704_067_200_123L));
    }

    @Test
    public void keepsOneStableGatewaySampleIdForOfflineRetries() throws Exception {
        SensorSample sample = new SensorSample(
                "BLE-001", "WT901BLE67", SensorPlacement.SHANK, 42L, 1_704_067_200_123L,
                1, 2, 3, 4, 5, 6, 7, 8, 9
        );

        String firstUploadId = sample.gatewaySampleId;
        sample.toUploadJson();

        assertEquals(firstUploadId, sample.gatewaySampleId);
        assertTrue(firstUploadId.matches("^[0-9a-fA-F-]{36}$"));
        assertEquals(42L, sample.toUploadJson().getLong("captureSequence"));
    }

    @Test
    public void uploadsRawAndSoftwareZeroedAnglesWithPlacementRevision() throws Exception {
        SensorSample sample = new SensorSample(
                "BLE-002", "WT901BLE68", SensorPlacement.THIGH, 9L, 1_704_067_200_123L,
                12L, 179, 42, -179, new SoftwareZeroCalibration(170, 40, 179),
                0.1, 0.2, 0.3, 1, 2, 3
        );

        org.json.JSONObject upload = sample.toUploadJson();
        org.json.JSONObject raw = upload.getJSONObject("raw");

        assertEquals(12L, upload.getLong("placementRevision"));
        assertEquals(9.0, upload.getDouble("roll"), 0.0001);
        assertEquals(2.0, upload.getDouble("pitch"), 0.0001);
        assertEquals(2.0, upload.getDouble("yaw"), 0.0001);
        assertEquals(179.0, raw.getJSONObject("rawAngles").getDouble("roll"), 0.0001);
        assertEquals(170.0, raw.getJSONObject("softwareZero").getDouble("roll"), 0.0001);
        assertEquals("SOFTWARE_ZERO", raw.getString("angleCalibrationMode"));
    }
}
