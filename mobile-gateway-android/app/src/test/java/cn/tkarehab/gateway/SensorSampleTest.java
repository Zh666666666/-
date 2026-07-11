package cn.tkarehab.gateway;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import org.json.JSONObject;
import org.junit.Test;

public final class SensorSampleTest {
    @Test
    public void formatsUtcTimestampOnAndroidSevenCompatibleApis() {
        assertEquals("2024-01-01T00:00:00.123Z", SensorSample.formatRecordedAt(1_704_067_200_123L));
    }

    @Test
    public void uploadJsonKeepsHardwareProvenanceBatteryAndAdvertisedName() throws Exception {
        SensorSample sample = new SensorSample(
                "BLE-AABBCCDDEEFF",
                "WT901BLE67",
                "AA:BB:CC:DD:EE:FF",
                SensorPlacement.SHANK,
                1_704_067_200_123L,
                1.0,
                42.5,
                -3.0,
                0.1,
                0.2,
                0.9,
                1.0,
                2.0,
                3.0,
                88
        );

        JSONObject payload = sample.toUploadJson();
        assertEquals("HARDWARE", payload.getString("source"));
        assertEquals(88, payload.getInt("batteryLevel"));
        assertEquals(42.5, payload.getDouble("pitch"), 0.0001);

        JSONObject raw = payload.getJSONObject("raw");
        assertEquals("WT901BLE67", raw.getString("deviceName"));
        assertEquals("AA:BB:CC:DD:EE:FF", raw.getString("bleAddress"));
        assertTrue(raw.getString("sdkKeys").contains("Ang"));
        assertFalse(raw.has("AngleX"));
    }
}
