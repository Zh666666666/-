import Combine
import Foundation

@MainActor
final class GatewayViewModel: NSObject, ObservableObject {
    @Published private(set) var status = "正在检查 iPhone 蓝牙与加密队列。"
    @Published private(set) var discoveredDevices: [UUID: String] = [:]
    @Published private(set) var active = false
    @Published private(set) var queueReady = false

    let bleGateway: WitBleGateway
    private var platformGateway: PlatformGateway?

    override init() {
        bleGateway = WitBleGateway()
        super.init()
        bleGateway.delegate = self
        do {
            let queue = try EncryptedSampleQueue()
            platformGateway = PlatformGateway(queue: queue)
            queueReady = true
            Task { await platformGateway?.setStatusListener { [weak self] message in self?.status = message } }
        } catch {
            status = "加密离线队列初始化失败：\(error.localizedDescription)"
        }
    }

    func readiness(configuration: GatewayConfiguration?) -> [String] {
        [
            "BLE：\(bleGateway.stateDescription)",
            "加密队列：\(queueReady ? "可用" : "不可用")",
            "平台配置：\(configuration == nil ? "请填写 HTTPS 地址和患者 ID" : "可用")",
            "传感器：\(discoveredDevices.isEmpty ? "尚未发现（不代表故障）" : "发现 \(discoveredDevices.count) 台")",
        ]
    }

    func start(configuration: GatewayConfiguration, token: String) {
        guard queueReady, let platformGateway else {
            status = "加密队列不可用，已阻止采集。"
            return
        }
        active = true
        Task { await platformGateway.start(configuration: configuration, bearerToken: token) }
    }

    func stop() {
        active = false
        bleGateway.stop()
        Task { await platformGateway?.stop() }
    }

    func scan() { bleGateway.scan() }
    func assign(id: UUID, placement: SensorPlacement) { bleGateway.assignAndConnect(id: id, placement: placement) }
    func zero(_ placement: SensorPlacement) { bleGateway.setAngleZero(for: placement) }
}

extension GatewayViewModel: WitBleGatewayDelegate {
    func gatewayStatus(_ message: String) { status = message }
    func gatewayDiscovered(id: UUID, name: String) { discoveredDevices[id] = name }
    func gatewayConnectionChanged(id: UUID, connected: Bool) { status = "\(discoveredDevices[id] ?? id.uuidString) \(connected ? "已连接" : "已断开")" }
    func gatewayReading(id: UUID, name: String, placement: SensorPlacement, reading: WitBle5Reading) {
        guard active else { return }
        Task {
            await platformGateway?.accept(
                gatewayDeviceId: "BLE-\(id.uuidString.replacingOccurrences(of: "-", with: ""))",
                deviceName: name,
                placement: placement,
                reading: reading
            )
        }
    }
}

private extension PlatformGateway {
    func setStatusListener(_ listener: @escaping (String) -> Void) {
        onStatus = listener
    }
}
