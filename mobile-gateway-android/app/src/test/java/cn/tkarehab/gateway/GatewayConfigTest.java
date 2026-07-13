package cn.tkarehab.gateway;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

public final class GatewayConfigTest {
    @Test
    public void acceptsHttpsAndNormalizesTrailingSlash() {
        GatewayConfig.Validation result = GatewayConfig.validate(" https://care.example.com/ ", " patient-1 ");

        assertTrue(result.valid);
        assertEquals("https://care.example.com", result.baseUrl);
        assertEquals("patient-1", result.patientId);
    }

    @Test
    public void acceptsLocalDevelopmentHttpButRejectsPublicCleartext() {
        assertTrue(GatewayConfig.validate("http://192.168.1.20:3000", "patient-1").valid);
        assertTrue(GatewayConfig.validate("http://10.0.0.8:3000/", "patient-1").valid);
        assertFalse(GatewayConfig.validate("http://care.example.com", "patient-1").valid);
        assertFalse(GatewayConfig.validate("https://user:pass@care.example.com", "patient-1").valid);
    }

    @Test
    public void rejectsMissingPatient() {
        GatewayConfig.Validation result = GatewayConfig.validate("https://care.example.com", "  ");

        assertFalse(result.valid);
        assertEquals("请填写平台患者 ID。", result.message);
    }
}
