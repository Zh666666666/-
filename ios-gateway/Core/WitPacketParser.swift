import Foundation

public struct WitBle5Reading: Sendable {
    public let acceleration: (x: Double, y: Double, z: Double)
    public let angularVelocity: (x: Double, y: Double, z: Double)
    public let angle: (roll: Double, pitch: Double, yaw: Double)
}

public struct WitBle5PacketParser: Sendable {
    private static let packetLength = 20
    private var pending = Data()

    public init() {}

    public mutating func push(_ chunk: Data) -> [WitBle5Reading] {
        pending.append(chunk)
        var readings: [WitBle5Reading] = []

        while pending.count >= Self.packetLength {
            guard let header = pending.firstIndex(of: 0x55) else {
                pending.removeAll(keepingCapacity: true)
                break
            }
            if header != pending.startIndex {
                pending.removeSubrange(pending.startIndex..<header)
            }
            guard pending.count >= Self.packetLength else { break }

            let candidate = pending.prefix(Self.packetLength)
            if candidate[candidate.startIndex + 1] == 0x61,
               let reading = Self.decodeMotionPacket(Data(candidate)) {
                readings.append(reading)
                pending.removeFirst(Self.packetLength)
            } else {
                pending.removeFirst()
            }
        }
        return readings
    }

    public static func decodeMotionPacket(_ packet: Data) -> WitBle5Reading? {
        guard packet.count == packetLength, packet[packet.startIndex] == 0x55,
              packet[packet.startIndex + 1] == 0x61 else {
            return nil
        }
        func value(_ offset: Int, scale: Double) -> Double {
            let raw = Int16(littleEndian: Int16(bitPattern: UInt16(packet[offset]) | UInt16(packet[offset + 1]) << 8))
            return (Double(raw) / 32768 * scale * 1000).rounded() / 1000
        }
        return WitBle5Reading(
            acceleration: (value(2, scale: 16), value(4, scale: 16), value(6, scale: 16)),
            angularVelocity: (value(8, scale: 2000), value(10, scale: 2000), value(12, scale: 2000)),
            angle: (value(14, scale: 180), value(16, scale: 180), value(18, scale: 180))
        )
    }
}
