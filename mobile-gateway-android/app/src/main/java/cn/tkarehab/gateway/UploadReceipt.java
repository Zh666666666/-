package cn.tkarehab.gateway;

import org.json.JSONObject;

final class UploadReceipt {
    private static final String[] NUMERIC_FIELDS = {
            "roll", "pitch", "yaw", "ax", "ay", "az", "gx", "gy", "gz"
    };

    final String gatewaySampleId;
    final long captureSequence;
    final SensorPlacement placement;
    final String receivedAt;
    final long ingestLatencyMs;

    private UploadReceipt(
            String gatewaySampleId,
            long captureSequence,
            SensorPlacement placement,
            String receivedAt,
            long ingestLatencyMs
    ) {
        this.gatewaySampleId = gatewaySampleId;
        this.captureSequence = captureSequence;
        this.placement = placement;
        this.receivedAt = receivedAt;
        this.ingestLatencyMs = ingestLatencyMs;
    }

    static UploadReceipt verify(JSONObject queuedSample, JSONObject response) throws Exception {
        JSONObject receipt = response.optJSONObject("receipt");
        if (receipt == null || !"MATCHED".equals(receipt.optString("integrity"))) {
            throw new IllegalStateException("服务器未返回 MATCHED 完整性回执");
        }
        String sampleId = queuedSample.getString("gatewaySampleId");
        long sequence = queuedSample.getLong("captureSequence");
        String placement = queuedSample.getString("placement");
        if (!sampleId.equals(receipt.optString("gatewaySampleId"))
                || sequence != receipt.optLong("captureSequence", -1L)
                || !placement.equals(receipt.optString("placement"))) {
            throw new IllegalStateException("服务器回执与本机采样身份不一致");
        }

        JSONObject values = receipt.optJSONObject("values");
        if (values == null) {
            throw new IllegalStateException("服务器回执缺少原始数值");
        }
        for (String field : NUMERIC_FIELDS) {
            double sent = queuedSample.optDouble(field, Double.NaN);
            double accepted = values.optDouble(field, Double.NaN);
            if (Double.isNaN(sent) != Double.isNaN(accepted)
                    || (!Double.isNaN(sent) && Math.abs(sent - accepted) > 0.000001d)) {
                throw new IllegalStateException("服务器回执数值不一致：" + field);
            }
        }

        return new UploadReceipt(
                sampleId,
                sequence,
                SensorPlacement.valueOf(placement),
                receipt.getString("receivedAt"),
                Math.max(0L, receipt.optLong("ingestLatencyMs", 0L))
        );
    }

    String shortId() {
        return gatewaySampleId.length() <= 8
                ? gatewaySampleId
                : gatewaySampleId.substring(gatewaySampleId.length() - 8);
    }
}
