package cn.tkarehab.gateway;

import java.net.URI;

final class GatewayConfig {
    private GatewayConfig() {
    }

    static Validation validate(String rawBaseUrl, String rawPatientId) {
        String baseUrl = rawBaseUrl == null ? "" : rawBaseUrl.trim().replaceAll("/+$", "");
        String patientId = rawPatientId == null ? "" : rawPatientId.trim();
        if (patientId.isEmpty()) {
            return Validation.error("请填写平台患者 ID。");
        }
        try {
            URI uri = URI.create(baseUrl);
            if (!"https".equalsIgnoreCase(uri.getScheme())
                    || uri.getHost() == null
                    || uri.getHost().trim().isEmpty()
                    || uri.getUserInfo() != null
                    || uri.getQuery() != null
                    || uri.getFragment() != null) {
                return Validation.error("平台地址必须是完整 HTTPS 地址，且不能包含账号、查询参数或片段。");
            }
        } catch (IllegalArgumentException error) {
            return Validation.error("平台地址格式无效，请填写完整 HTTPS 地址。");
        }
        return new Validation(true, baseUrl, patientId, "");
    }

    static final class Validation {
        final boolean valid;
        final String baseUrl;
        final String patientId;
        final String message;

        private Validation(boolean valid, String baseUrl, String patientId, String message) {
            this.valid = valid;
            this.baseUrl = baseUrl;
            this.patientId = patientId;
            this.message = message;
        }

        static Validation error(String message) {
            return new Validation(false, "", "", message);
        }
    }
}
