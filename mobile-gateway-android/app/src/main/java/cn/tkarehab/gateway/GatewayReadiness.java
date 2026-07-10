package cn.tkarehab.gateway;

final class GatewayReadiness {
    private GatewayReadiness() {
    }

    static String report(
            String versionName,
            boolean supportsBle,
            boolean bluetoothEnabled,
            boolean permissionsGranted,
            boolean locationEnabled,
            boolean offlineQueueReady,
            GatewayConfig.Validation configuration
    ) {
        boolean readyToScan = supportsBle
                && bluetoothEnabled
                && permissionsGranted
                && locationEnabled
                && offlineQueueReady;

        StringBuilder result = new StringBuilder("安装自检\n版本：")
                .append(versionName)
                .append('\n');
        append(result, "BLE 硬件", supportsBle, "可用", "此手机不支持 BLE");
        append(result, "蓝牙开关", bluetoothEnabled, "已开启", "请开启蓝牙");
        append(result, "运行时权限", permissionsGranted, "已允许", "点击扫描后允许蓝牙和定位权限");
        append(result, "定位服务", locationEnabled, "已开启", "请开启系统定位服务");
        append(result, "加密离线队列", offlineQueueReady, "已就绪", "初始化失败，不能安全采集");
        append(
                result,
                "平台配置",
                configuration.valid,
                "已填写",
                configuration.message.isEmpty() ? "填写 HTTPS 地址和患者 ID 后可上传" : configuration.message
        );

        if (readyToScan) {
            result.append("结果：手机已具备扫描条件。扫描到 WT 设备后再分配为大腿或小腿。\n");
        } else {
            result.append("结果：请先完成标记为未就绪的项目，再扫描传感器。\n");
        }
        if (!configuration.valid) {
            result.append("提示：未填写平台配置不会阻止扫描，但会阻止开始采集和上传。");
        }
        return result.toString();
    }

    private static void append(
            StringBuilder result,
            String label,
            boolean ready,
            String readyMessage,
            String blockedMessage
    ) {
        result.append(ready ? "[已就绪] " : "[待处理] ")
                .append(label)
                .append("：")
                .append(ready ? readyMessage : blockedMessage)
                .append('\n');
    }
}
