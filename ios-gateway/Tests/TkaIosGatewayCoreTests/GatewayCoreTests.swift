import XCTest
@testable import TkaIosGatewayCore

final class GatewayCoreTests: XCTestCase {
    func testConfigurationAcceptsHttpsAndRejectsCleartext() {
        let configuration = GatewayConfiguration(
            baseURLText: " https://care.example.com/ ",
            patientIdText: " patient-1 "
        )
        XCTAssertEqual(configuration?.baseURL.absoluteString, "https://care.example.com")
        XCTAssertEqual(configuration?.patientId, "patient-1")
        XCTAssertNil(GatewayConfiguration(baseURLText: "http://care.example.com", patientIdText: "patient-1"))
    }

    func testParsesFragmentedBleFiveMotionPacket() {
        var packet = [UInt8](repeating: 0, count: 20)
        packet[0] = 0x55
        packet[1] = 0x61
        write(16384, into: &packet, at: 14)
        write(-8192, into: &packet, at: 16)
        write(4096, into: &packet, at: 18)

        var parser = WitBle5PacketParser()
        XCTAssertTrue(parser.push(Data(packet.prefix(7))).isEmpty)
        let readings = parser.push(Data(packet.dropFirst(7)))
        XCTAssertEqual(readings.count, 1)
        XCTAssertEqual(readings[0].angle.roll, 90)
        XCTAssertEqual(readings[0].angle.pitch, -45)
        XCTAssertEqual(readings[0].angle.yaw, 22.5)
    }

    func testPairsAnglesOnlyInsideTimeWindow() {
        let start = Date(timeIntervalSince1970: 1_700_000_000)
        let paired = KneeAngleCalculator.calculate(
            thighAt: start,
            thighPitch: 10,
            shankAt: start.addingTimeInterval(0.12),
            shankPitch: 80
        )
        XCTAssertEqual(paired?.flexion, 70)
        XCTAssertEqual(paired?.confidence ?? 0, 0.88, accuracy: 0.0001)
        XCTAssertNil(KneeAngleCalculator.calculate(
            thighAt: start,
            thighPitch: 10,
            shankAt: start.addingTimeInterval(0.31),
            shankPitch: 80
        ))
    }

    private func write(_ value: Int16, into packet: inout [UInt8], at offset: Int) {
        let bits = UInt16(bitPattern: value)
        packet[offset] = UInt8(bits & 0xff)
        packet[offset + 1] = UInt8(bits >> 8)
    }
}
