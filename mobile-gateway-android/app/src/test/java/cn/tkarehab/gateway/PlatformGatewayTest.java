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
        assertEquals(0L, first.getLong("placementRevision"));
        assertTrue(first.getJSONObject("raw").getBoolean("legacyQueueMigrated"));
    }

    @Test
    public void leavesCurrentQueueIdentityUntouched() throws Exception {
        JSONObject sample = new JSONObject()
                .put("gatewaySampleId", "current-sample-001")
                .put("captureSequence", 88L)
                .put("placementRevision", 7L)
                .put("raw", new JSONObject().put("protocol", "WIT_BLE_SDK"));

        PlatformGateway.normalizeLegacyIdentity(sample);

        assertEquals("current-sample-001", sample.getString("gatewaySampleId"));
        assertEquals(88L, sample.getLong("captureSequence"));
        assertEquals(7L, sample.getLong("placementRevision"));
        assertEquals("WIT_BLE_SDK", sample.getJSONObject("raw").getString("protocol"));
    }

    @Test
    public void carriesPlacementRevisionInBindingAndSessionContracts() throws Exception {
        JSONObject binding = PlatformGateway.buildBindingPayload(
                "device-1", "patient-1", "SHANK", 19L
        );
        JSONObject session = PlatformGateway.buildSessionPayload("patient-1", 19L);

        assertEquals("SHANK", binding.getString("placement"));
        assertEquals(19L, binding.getLong("placementRevision"));
        assertEquals("HARDWARE", session.getString("source"));
        assertEquals(19L, session.getLong("placementRevision"));
    }

    @Test
    public void buildsAuditableDualSensorGoodCalibrationContract() throws Exception {
        PlatformGateway.CalibrationBaseline thigh = new PlatformGateway.CalibrationBaseline(
                "BLE-THIGH", 23L, 10, 20, 30, 10, 20, 30
        );
        PlatformGateway.CalibrationBaseline shank = new PlatformGateway.CalibrationBaseline(
                "BLE-SHANK", 23L, -10, -20, -30, -10, -20, -30
        );

        JSONObject payload = PlatformGateway.buildCalibrationPayload(
                "patient-1", "session-1", "device-thigh", "device-shank",
                23L, thigh, shank
        );

        assertEquals("GOOD", payload.getString("quality"));
        assertEquals(23L, payload.getLong("placementRevision"));
        assertEquals(
                20.0,
                payload.getJSONObject("baseline")
                        .getJSONObject("thigh")
                        .getJSONObject("raw")
                        .getDouble("pitch"),
                0.0001
        );
        assertEquals(
                -20.0,
                payload.getJSONObject("baseline")
                        .getJSONObject("shank")
                        .getJSONObject("offset")
                        .getDouble("pitch"),
                0.0001
        );
    }
}
