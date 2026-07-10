import CoreBluetooth
import Foundation

protocol WitBleGatewayDelegate: AnyObject {
    func gatewayStatus(_ message: String)
    func gatewayDiscovered(id: UUID, name: String)
    func gatewayConnectionChanged(id: UUID, connected: Bool)
    func gatewayReading(id: UUID, name: String, placement: SensorPlacement, reading: WitBle5Reading)
}

final class WitBleGateway: NSObject {
    static let serviceUUID = CBUUID(string: "FFE5")
    static let notificationUUID = CBUUID(string: "FFE4")
    static let commandUUID = CBUUID(string: "FFE9")
    static let angleZeroCommand = Data([0xff, 0xaa, 0x01, 0x00, 0x00])

    weak var delegate: WitBleGatewayDelegate?
    private var central: CBCentralManager!
    private var discovered: [UUID: CBPeripheral] = [:]
    private var placements: [UUID: SensorPlacement] = [:]
    private var commandCharacteristics: [UUID: CBCharacteristic] = [:]
    private var parsers: [UUID: WitBle5PacketParser] = [:]
    private var lastDeliveredAt: [UUID: Date] = [:]

    override init() {
        super.init()
        central = CBCentralManager(
            delegate: self,
            queue: nil,
            options: [CBCentralManagerOptionRestoreIdentifierKey: "cn.tkarehab.gateway.ios.central"]
        )
    }

    var stateDescription: String {
        switch central.state {
        case .poweredOn: return "蓝牙已开启"
        case .poweredOff: return "请开启蓝牙"
        case .unauthorized: return "请允许蓝牙权限"
        case .unsupported: return "此设备不支持 BLE"
        case .resetting: return "蓝牙正在重置"
        case .unknown: return "正在检查蓝牙状态"
        @unknown default: return "未知蓝牙状态"
        }
    }

    func scan() {
        guard central.state == .poweredOn else {
            delegate?.gatewayStatus(stateDescription)
            return
        }
        discovered.removeAll()
        central.stopScan()
        central.scanForPeripherals(withServices: [Self.serviceUUID], options: [CBCentralManagerScanOptionAllowDuplicatesKey: false])
        delegate?.gatewayStatus("正在扫描 WT9011DCL-BT50；请保持应用在前台。")
    }

    func assignAndConnect(id: UUID, placement: SensorPlacement) {
        guard let peripheral = discovered[id] else {
            delegate?.gatewayStatus("设备已不在扫描列表，请重新扫描。")
            return
        }
        for (otherID, otherPlacement) in placements where otherID != id && otherPlacement == placement {
            if let other = discovered[otherID] { central.cancelPeripheralConnection(other) }
            placements.removeValue(forKey: otherID)
        }
        placements[id] = placement
        parsers[id] = WitBle5PacketParser()
        central.connect(peripheral, options: nil)
    }

    func setAngleZero(for placement: SensorPlacement) {
        guard let id = placements.first(where: { $0.value == placement })?.key,
              let peripheral = discovered[id],
              let command = commandCharacteristics[id] else {
            delegate?.gatewayStatus("请先连接\(placement.displayName)传感器。")
            return
        }
        let writeType: CBCharacteristicWriteType = command.properties.contains(.write) ? .withResponse : .withoutResponse
        peripheral.writeValue(Self.angleZeroCommand, for: command, type: writeType)
        delegate?.gatewayStatus("已向\(placement.displayName)传感器发送归零命令。")
    }

    func stop() {
        central.stopScan()
        for peripheral in discovered.values { central.cancelPeripheralConnection(peripheral) }
        commandCharacteristics.removeAll()
        placements.removeAll()
        parsers.removeAll()
        lastDeliveredAt.removeAll()
    }
}

extension WitBleGateway: CBCentralManagerDelegate {
    func centralManagerDidUpdateState(_ central: CBCentralManager) {
        delegate?.gatewayStatus(stateDescription)
    }

    func centralManager(_ central: CBCentralManager, willRestoreState dict: [String: Any]) {
        let restored = (dict[CBCentralManagerRestoredStatePeripheralsKey] as? [CBPeripheral]) ?? []
        for peripheral in restored {
            discovered[peripheral.identifier] = peripheral
            peripheral.delegate = self
        }
        if !restored.isEmpty { delegate?.gatewayStatus("已恢复 \(restored.count) 个 BLE 连接。") }
    }

    func centralManager(_ central: CBCentralManager, didDiscover peripheral: CBPeripheral, advertisementData: [String: Any], rssi RSSI: NSNumber) {
        let name = peripheral.name ?? (advertisementData[CBAdvertisementDataLocalNameKey] as? String) ?? "未命名 WT 设备"
        guard name.uppercased().hasPrefix("WT") || name.uppercased().contains("BWT") else { return }
        discovered[peripheral.identifier] = peripheral
        delegate?.gatewayDiscovered(id: peripheral.identifier, name: name)
    }

    func centralManager(_ central: CBCentralManager, didConnect peripheral: CBPeripheral) {
        peripheral.delegate = self
        central.stopScan()
        peripheral.discoverServices([Self.serviceUUID])
        delegate?.gatewayConnectionChanged(id: peripheral.identifier, connected: true)
    }

    func centralManager(_ central: CBCentralManager, didFailToConnect peripheral: CBPeripheral, error: Error?) {
        delegate?.gatewayStatus("连接 \(peripheral.name ?? peripheral.identifier.uuidString) 失败：\(error?.localizedDescription ?? "未知错误")")
    }

    func centralManager(_ central: CBCentralManager, didDisconnectPeripheral peripheral: CBPeripheral, error: Error?) {
        commandCharacteristics.removeValue(forKey: peripheral.identifier)
        delegate?.gatewayConnectionChanged(id: peripheral.identifier, connected: false)
    }
}

extension WitBleGateway: CBPeripheralDelegate {
    func peripheral(_ peripheral: CBPeripheral, didDiscoverServices error: Error?) {
        guard error == nil, let service = peripheral.services?.first(where: { $0.uuid == Self.serviceUUID }) else {
            delegate?.gatewayStatus("未找到 WT BLE 服务 FFE5。")
            return
        }
        peripheral.discoverCharacteristics([Self.notificationUUID, Self.commandUUID], for: service)
    }

    func peripheral(_ peripheral: CBPeripheral, didDiscoverCharacteristicsFor service: CBService, error: Error?) {
        guard error == nil else {
            delegate?.gatewayStatus("读取 BLE 特征失败：\(error?.localizedDescription ?? "未知错误")")
            return
        }
        for characteristic in service.characteristics ?? [] {
            if characteristic.uuid == Self.notificationUUID {
                peripheral.setNotifyValue(true, for: characteristic)
            } else if characteristic.uuid == Self.commandUUID {
                commandCharacteristics[peripheral.identifier] = characteristic
            }
        }
    }

    func peripheral(_ peripheral: CBPeripheral, didUpdateValueFor characteristic: CBCharacteristic, error: Error?) {
        guard error == nil, characteristic.uuid == Self.notificationUUID,
              let data = characteristic.value,
              let placement = placements[peripheral.identifier] else { return }
        var parser = parsers[peripheral.identifier] ?? WitBle5PacketParser()
        let readings = parser.push(data)
        parsers[peripheral.identifier] = parser
        let now = Date()
        for reading in readings {
            if let previous = lastDeliveredAt[peripheral.identifier], now.timeIntervalSince(previous) < 0.1 { continue }
            lastDeliveredAt[peripheral.identifier] = now
            delegate?.gatewayReading(id: peripheral.identifier, name: peripheral.name ?? peripheral.identifier.uuidString, placement: placement, reading: reading)
        }
    }
}
