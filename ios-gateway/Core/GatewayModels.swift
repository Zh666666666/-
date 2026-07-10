import Foundation

public enum SensorPlacement: String, Codable, CaseIterable, Sendable {
    case thigh = "THIGH"
    case shank = "SHANK"

    public var displayName: String {
        switch self {
        case .thigh: return "大腿"
        case .shank: return "小腿"
        }
    }
}

public struct WitRawMetadata: Codable, Sendable {
    public let protocolName: String
    public let transport: String
    public let frameTypes: [Int]

    public init(protocolName: String, transport: String, frameTypes: [Int]) {
        self.protocolName = protocolName
        self.transport = transport
        self.frameTypes = frameTypes
    }

    enum CodingKeys: String, CodingKey {
        case protocolName = "protocol"
        case transport
        case frameTypes
    }
}

public struct QueuedSensorSample: Codable, Sendable {
    public var gatewayDeviceId: String
    public var deviceName: String
    public var patientId: String
    public var placement: SensorPlacement
    public var recordedAt: Date
    public var roll: Double
    public var pitch: Double
    public var yaw: Double
    public var ax: Double?
    public var ay: Double?
    public var az: Double?
    public var gx: Double?
    public var gy: Double?
    public var gz: Double?
    public var flexionAngle: Double?
    public var extensionAngle: Double?
    public var confidence: Double?
    public var raw: WitRawMetadata

    public init(
        gatewayDeviceId: String,
        deviceName: String,
        patientId: String,
        placement: SensorPlacement,
        recordedAt: Date,
        roll: Double,
        pitch: Double,
        yaw: Double,
        ax: Double? = nil,
        ay: Double? = nil,
        az: Double? = nil,
        gx: Double? = nil,
        gy: Double? = nil,
        gz: Double? = nil,
        flexionAngle: Double? = nil,
        extensionAngle: Double? = nil,
        confidence: Double? = nil,
        raw: WitRawMetadata
    ) {
        self.gatewayDeviceId = gatewayDeviceId
        self.deviceName = deviceName
        self.patientId = patientId
        self.placement = placement
        self.recordedAt = recordedAt
        self.roll = roll
        self.pitch = pitch
        self.yaw = yaw
        self.ax = ax
        self.ay = ay
        self.az = az
        self.gx = gx
        self.gy = gy
        self.gz = gz
        self.flexionAngle = flexionAngle
        self.extensionAngle = extensionAngle
        self.confidence = confidence
        self.raw = raw
    }
}

public struct KneeAngleResult: Equatable, Sendable {
    public let flexion: Double
    public let extensionAngle: Double
    public let confidence: Double
}

public enum KneeAngleCalculator {
    public static func calculate(
        thighAt: Date,
        thighPitch: Double,
        shankAt: Date,
        shankPitch: Double,
        maximumSkew: TimeInterval = 0.3
    ) -> KneeAngleResult? {
        let skew = abs(shankAt.timeIntervalSince(thighAt))
        guard skew <= maximumSkew, thighPitch.isFinite, shankPitch.isFinite else {
            return nil
        }
        let flexion = min(150, abs(shankPitch - thighPitch))
        return KneeAngleResult(
            flexion: round(flexion * 10) / 10,
            extensionAngle: max(-20, min(40, -flexion)),
            confidence: max(0.5, 1 - skew)
        )
    }
}
