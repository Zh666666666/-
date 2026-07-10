import Foundation

actor PlatformGateway {
    private let queue: EncryptedSampleQueue
    private var configuration: GatewayConfiguration?
    private var bearerToken = ""
    private var active = false
    private var deviceIDs: [String: String] = [:]
    private var sessionIDs: [String: String] = [:]
    private var latestPitch: [SensorPlacement: (at: Date, pitch: Double)] = [:]

    var onStatus: ((String) -> Void)?

    init(queue: EncryptedSampleQueue) {
        self.queue = queue
    }

    func start(configuration: GatewayConfiguration, bearerToken: String) async {
        if self.configuration?.baseURL != configuration.baseURL {
            deviceIDs.removeAll()
            sessionIDs.removeAll()
        }
        self.configuration = configuration
        self.bearerToken = bearerToken
        self.active = true
        latestPitch.removeAll()
        sessionIDs.removeValue(forKey: configuration.patientId)
        let count = (try? await queue.size()) ?? 0
        report("采集会话已就绪；加密队列中有 \(count) 条待上传数据。")
        await flush()
    }

    func stop() {
        active = false
        latestPitch.removeAll()
    }

    func accept(
        gatewayDeviceId: String,
        deviceName: String,
        placement: SensorPlacement,
        reading: WitBle5Reading
    ) async {
        guard active, let configuration else { return }
        let now = Date()
        var sample = QueuedSensorSample(
            gatewayDeviceId: gatewayDeviceId,
            deviceName: deviceName,
            patientId: configuration.patientId,
            placement: placement,
            recordedAt: now,
            roll: reading.angle.roll,
            pitch: reading.angle.pitch,
            yaw: reading.angle.yaw,
            ax: reading.acceleration.x,
            ay: reading.acceleration.y,
            az: reading.acceleration.z,
            gx: reading.angularVelocity.x,
            gy: reading.angularVelocity.y,
            gz: reading.angularVelocity.z,
            raw: WitRawMetadata(protocolName: "WIT_BLE5_BINARY", transport: "BLE_5_NATIVE", frameTypes: [0x61])
        )
        latestPitch[placement] = (now, sample.pitch)
        if placement == .shank, let thigh = latestPitch[.thigh],
           let angle = KneeAngleCalculator.calculate(thighAt: thigh.at, thighPitch: thigh.pitch, shankAt: now, shankPitch: sample.pitch) {
            sample.flexionAngle = angle.flexion
            sample.extensionAngle = angle.extensionAngle
            sample.confidence = angle.confidence
        }
        do {
            try await queue.append(sample)
            await flush()
        } catch {
            report("无法将传感器数据写入加密队列：\(error.localizedDescription)")
        }
    }

    func flush() async {
        guard active, let configuration else { return }
        var uploaded = 0
        while let sample = try? await queue.peek() {
            do {
                let deviceID = try await ensureDevice(for: sample, configuration: configuration)
                let sessionID = try await ensureSession(patientId: sample.patientId, configuration: configuration)
                try await post(path: "/api/sensor-samples", body: uploadBody(sample, deviceID: deviceID, sessionID: sessionID), configuration: configuration)
                try await queue.acknowledgeOne()
                uploaded += 1
            } catch {
                let remaining = (try? await queue.size()) ?? 0
                report("上传暂缓；\(remaining) 条数据仍在加密队列中。")
                return
            }
        }
        if uploaded > 0 {
            report("已上传 \(uploaded) 条真实 iOS 网关采样。")
        }
    }

    private func ensureDevice(for sample: QueuedSensorSample, configuration: GatewayConfiguration) async throws -> String {
        let key = "\(sample.patientId)\u{0}\(sample.gatewayDeviceId)\u{0}\(sample.placement.rawValue)"
        if let existing = deviceIDs[key] { return existing }
        let device = try await post(
            path: "/api/devices",
            body: ["serialNo": sample.gatewayDeviceId, "name": "WT9011DCL-BT50 \(sample.placement.rawValue)", "model": "WT9011DCL-BT50", "manufacturer": "WitMotion"],
            configuration: configuration
        )
        guard let deviceID = device["id"] as? String else { throw URLError(.cannotParseResponse) }
        _ = try await post(
            path: "/api/device-bindings",
            body: ["deviceId": deviceID, "patientId": sample.patientId, "placement": sample.placement.rawValue],
            configuration: configuration
        )
        deviceIDs[key] = deviceID
        return deviceID
    }

    private func ensureSession(patientId: String, configuration: GatewayConfiguration) async throws -> String {
        if let existing = sessionIDs[patientId] { return existing }
        let response = try await post(path: "/api/sensor-sessions", body: ["patientId": patientId, "source": "HARDWARE"], configuration: configuration)
        guard let id = response["id"] as? String else { throw URLError(.cannotParseResponse) }
        sessionIDs[patientId] = id
        return id
    }

    private func post(path: String, body: [String: Any], configuration: GatewayConfiguration) async throws -> [String: Any] {
        let url = configuration.endpoint(path)
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.timeoutInterval = 15
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        if !bearerToken.isEmpty { request.setValue("Bearer \(bearerToken)", forHTTPHeaderField: "Authorization") }
        request.httpBody = try JSONSerialization.data(withJSONObject: body)
        let (data, response) = try await URLSession.shared.data(for: request)
        guard let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode) else {
            throw URLError(.badServerResponse)
        }
        return (try JSONSerialization.jsonObject(with: data) as? [String: Any]) ?? [:]
    }

    private func uploadBody(_ sample: QueuedSensorSample, deviceID: String, sessionID: String) -> [String: Any] {
        var body: [String: Any] = [
            "gatewayDeviceId": sample.gatewayDeviceId,
            "deviceName": sample.deviceName,
            "patientId": sample.patientId,
            "placement": sample.placement.rawValue,
            "recordedAt": ISO8601DateFormatter().string(from: sample.recordedAt),
            "roll": sample.roll, "pitch": sample.pitch, "yaw": sample.yaw,
            "deviceId": deviceID, "sessionId": sessionID,
            "raw": ["protocol": sample.raw.protocolName, "transport": sample.raw.transport, "frameTypes": sample.raw.frameTypes],
        ]
        for (name, value) in [
            ("ax", sample.ax), ("ay", sample.ay), ("az", sample.az),
            ("gx", sample.gx), ("gy", sample.gy), ("gz", sample.gz),
            ("flexionAngle", sample.flexionAngle), ("extensionAngle", sample.extensionAngle),
            ("confidence", sample.confidence),
        ] where value != nil {
            body[name] = value!
        }
        return body
    }

    private func report(_ message: String) {
        let callback = onStatus
        DispatchQueue.main.async { callback?(message) }
    }
}
