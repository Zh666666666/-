package cn.tkarehab.gateway;

import java.net.URI;
import java.util.Locale;
import java.util.regex.Pattern;

final class GatewayConfig {
    private static final Pattern PRIVATE_IPV4 = Pattern.compile(
            "^(10\\.\\d{1,3}\\.\\d{1,3}\\.\\d{1,3}"
                    + "|192\\.168\\.\\d{1,3}\\.\\d{1,3}"
                    + "|172\\.(1[6-9]|2\\d|3[0-1])\\.\\d{1,3}\\.\\d{1,3}"
                    + ")$"
    );

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
            String scheme = uri.getScheme() == null ? "" : uri.getScheme().toLowerCase(Locale.US);
            String host = uri.getHost() == null ? "" : uri.getHost().trim();
            boolean https = "https".equals(scheme);
            boolean localHttp = "http".equals(scheme) && isLocalDevelopmentHost(host);

            if ((!https && !localHttp)
                    || host.isEmpty()
                    || uri.getUserInfo() != null
                    || uri.getQuery() != null
                    || uri.getFragment() != null) {
                return Validation.error(
                        "平台地址必须是 HTTPS；本机联调可用局域网 HTTP（如 http://192.168.x.x:3000），且不能包含账号、查询参数或片段。"
                );
            }
        } catch (IllegalArgumentException error) {
            return Validation.error("平台地址格式无效，请填写完整 HTTPS 或局域网 HTTP 地址。");
        }
        return new Validation(true, baseUrl, patientId, "");
    }

    static boolean isLocalDevelopmentHost(String host) {
        if (host == null || host.trim().isEmpty()) {
            return false;
        }
        String normalized = host.trim().toLowerCase(Locale.US);
        if ("localhost".equals(normalized)
                || "127.0.0.1".equals(normalized)
                || "10.0.2.2".equals(normalized)
                || "::1".equals(normalized)
                || "[::1]".equals(normalized)
                || normalized.endsWith(".local")) {
            return true;
        }
        return PRIVATE_IPV4.matcher(normalized).matches();
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
