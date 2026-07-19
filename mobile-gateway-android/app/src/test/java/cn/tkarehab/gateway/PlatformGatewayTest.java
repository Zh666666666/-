package cn.tkarehab.gateway;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;

import org.json.JSONObject;
import org.junit.Test;

public final class PlatformGatewayTest {
    @Test
    public void givesLegacyQueueItemsStableRetryIdentity() throws Exception {
        JSONObject first = new JSONObject()
                .put("patientId", "prod-patient-1")
                .put("placement", "THIGH")
                .put("recordedAt", "2026-07-18T00:00:00.000Z")
                .put("pitch", 42.5);
        JSONObject replay = new JSONObject(first.toString());

        PlatformGateway.normalizeLegacyIdentity(first);
        PlatformGateway.normalizeLegacyIdentity(replay);

        assertEquals(first.getString("gatewaySampleId"), replay.getString("gatewaySampleId"));
        assertEquals(0L, first.getLong("captureSequence"));
        assertTrue(first.getJSONObject("raw").getBoolean("legacyQueueMigrated"));
    }

    @Test
    public void leavesCurrentQueueIdentityUntouched() throws Exception {
        JSONObject sample = new JSONObject()
                .put("gatewaySampleId", "current-sample-001")
                .put("captureSequence", 88L)
                .put("raw", new JSONObject().put("protocol", "WIT_BLE_SDK"));

        PlatformGateway.normalizeLegacyIdentity(sample);

        assertEquals("current-sample-001", sample.getString("gatewaySampleId"));
        assertEquals(88L, sample.getLong("captureSequence"));
        assertEquals("WIT_BLE_SDK", sample.getJSONObject("raw").getString("protocol"));
    }
}
