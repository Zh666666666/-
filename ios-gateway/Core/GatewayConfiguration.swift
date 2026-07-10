import Foundation

public struct GatewayConfiguration: Equatable, Sendable {
    public let baseURL: URL
    public let patientId: String

    public init?(baseURLText: String, patientIdText: String) {
        let trimmedURL = baseURLText.trimmingCharacters(in: .whitespacesAndNewlines)
            .replacingOccurrences(of: #"/+$"#, with: "", options: .regularExpression)
        let trimmedPatient = patientIdText.trimmingCharacters(in: .whitespacesAndNewlines)
        guard
            !trimmedPatient.isEmpty,
            let url = URL(string: trimmedURL),
            url.scheme?.lowercased() == "https",
            url.host != nil,
            url.user == nil,
            url.password == nil,
            url.query == nil,
            url.fragment == nil
        else {
            return nil
        }
        self.baseURL = url
        self.patientId = trimmedPatient
    }

    public func endpoint(_ path: String) -> URL {
        URL(string: path, relativeTo: baseURL)!.absoluteURL
    }
}
