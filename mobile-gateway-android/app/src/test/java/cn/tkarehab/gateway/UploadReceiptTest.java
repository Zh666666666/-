package cn.tkarehab.gateway;

import static org.junit.Assert.assertEquals;

import org.json.JSONObject;
import org.junit.Test;

public final class UploadReceiptTest {
    @Test
    public void verifiesIdentitySequenceAndEveryMotionValue() throws Exception {
        JSONObject sample = new JSONObject()
                .put("gatewaySampleId", "sample-identity-001")
                .put("captureSequence", 9)
                .put("placement", "THIGH")
                .put("roll", 1).put("pitch", 2).put("yaw", 3)
                .put("ax", 4).put("ay", 5).put("az", 6)
                .put("gx", 7).put("gy", 8).put("gz", 9);
        JSONObject values = new JSONObject();
        for (String key : new String[]{"roll", "pitch", "yaw", "ax", "ay", "az", "gx", "gy", "gz"}) {
            values.put(key, sample.getDouble(key));
        }
        JSONObject response = new JSONObject().put("receipt", new JSONObject()
                .put("gatewaySampleId", "sample-identity-001")
                .put("captureSequence", 9)
                .put("placement", "THIGH")
                .put("receivedAt", "2026-07-18T00:00:00.100Z")
                .put("ingestLatencyMs", 100)
                .put("integrity", "MATCHED")
                .put("values", values));

        UploadReceipt receipt = UploadReceipt.verify(sample, response);
        assertEquals(9L, receipt.captureSequence);
        assertEquals(SensorPlacement.THIGH, receipt.placement);
        assertEquals(100L, receipt.ingestLatencyMs);
    }
}
