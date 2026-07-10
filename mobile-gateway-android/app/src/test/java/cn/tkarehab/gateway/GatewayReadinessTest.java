package cn.tkarehab.gateway;

import static org.junit.Assert.assertTrue;

import org.junit.Test;

public final class GatewayReadinessTest {
    @Test
    public void reportsWhenPhoneIsReadyToScanButNeedsPlatformConfiguration() {
        String report = GatewayReadiness.report(
                "0.2.0",
                true,
                true,
                true,
                true,
                true,
                GatewayConfig.Validation.error("填写 HTTPS 地址和患者 ID 后可上传")
        );

        assertTrue(report.contains("手机已具备扫描条件"));
        assertTrue(report.contains("未填写平台配置不会阻止扫描"));
    }

    @Test
    public void reportsBlockedPrerequisites() {
        String report = GatewayReadiness.report(
                "0.2.0",
                false,
                false,
                false,
                false,
                false,
                GatewayConfig.Validation.error("请填写平台患者 ID。")
        );

        assertTrue(report.contains("此手机不支持 BLE"));
        assertTrue(report.contains("请开启蓝牙"));
        assertTrue(report.contains("请先完成标记为未就绪的项目"));
    }
}
