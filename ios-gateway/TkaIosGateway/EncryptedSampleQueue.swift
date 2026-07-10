import CryptoKit
import Foundation
import Security

enum EncryptedQueueError: LocalizedError {
    case unavailableKey
    case queueLimitReached

    var errorDescription: String? {
        switch self {
        case .unavailableKey: return "无法读取手机上的加密队列密钥。"
        case .queueLimitReached: return "离线队列已达到安全上限，请恢复网络后再继续采集。"
        }
    }
}

actor EncryptedSampleQueue {
    private static let maximumItems = 50_000
    private let directory: URL
    private let key: SymmetricKey
    private let encoder: JSONEncoder
    private let decoder: JSONDecoder

    init(fileManager: FileManager = .default) throws {
        let root = try fileManager.url(
            for: .applicationSupportDirectory,
            in: .userDomainMask,
            appropriateFor: nil,
            create: true
        )
        directory = root.appendingPathComponent("TkaIosGateway/sensor-sample-queue", isDirectory: true)
        try fileManager.createDirectory(at: directory, withIntermediateDirectories: true)
        key = try KeychainQueueKey.loadOrCreate()
        encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
    }

    func append(_ sample: QueuedSensorSample) throws {
        if try files().count >= Self.maximumItems {
            throw EncryptedQueueError.queueLimitReached
        }
        let plaintext = try encoder.encode(sample)
        let sealed = try AES.GCM.seal(plaintext, using: key)
        guard let combined = sealed.combined else { throw EncryptedQueueError.unavailableKey }
        let name = String(format: "%019lld-%@.payload", Int64(Date().timeIntervalSince1970 * 1000), UUID().uuidString)
        try combined.write(to: directory.appendingPathComponent(name), options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
    }

    func peek() throws -> QueuedSensorSample? {
        guard let file = try files().first else { return nil }
        do {
            let encrypted = try Data(contentsOf: file)
            let box = try AES.GCM.SealedBox(combined: encrypted)
            let plaintext = try AES.GCM.open(box, using: key)
            return try decoder.decode(QueuedSensorSample.self, from: plaintext)
        } catch {
            let quarantined = file.deletingPathExtension().appendingPathExtension("corrupt")
            try? FileManager.default.moveItem(at: file, to: quarantined)
            throw error
        }
    }

    func acknowledgeOne() throws {
        if let file = try files().first {
            try FileManager.default.removeItem(at: file)
        }
    }

    func size() throws -> Int { try files().count }

    private func files() throws -> [URL] {
        try FileManager.default.contentsOfDirectory(
            at: directory,
            includingPropertiesForKeys: nil,
            options: [.skipsHiddenFiles]
        )
        .filter { $0.pathExtension == "payload" }
        .sorted { $0.lastPathComponent < $1.lastPathComponent }
    }
}

private enum KeychainQueueKey {
    private static let service = "cn.tkarehab.gateway.ios"
    private static let account = "offline-sample-queue-key-v1"

    static func loadOrCreate() throws -> SymmetricKey {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
            kSecReturnData as String: true,
        ]
        var result: CFTypeRef?
        let status = SecItemCopyMatching(query as CFDictionary, &result)
        if status == errSecSuccess, let data = result as? Data, data.count == 32 {
            return SymmetricKey(data: data)
        }
        guard status == errSecItemNotFound else { throw EncryptedQueueError.unavailableKey }

        var bytes = [UInt8](repeating: 0, count: 32)
        guard SecRandomCopyBytes(kSecRandomDefault, bytes.count, &bytes) == errSecSuccess else {
            throw EncryptedQueueError.unavailableKey
        }
        let data = Data(bytes)
        let add: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
            kSecValueData as String: data,
            kSecAttrAccessible as String: kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly,
        ]
        guard SecItemAdd(add as CFDictionary, nil) == errSecSuccess else {
            throw EncryptedQueueError.unavailableKey
        }
        return SymmetricKey(data: data)
    }
}
