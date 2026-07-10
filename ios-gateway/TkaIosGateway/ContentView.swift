import SwiftUI

struct ContentView: View {
    @StateObject private var gateway = GatewayViewModel()
    @AppStorage("gateway.api-url") private var apiURL = ""
    @AppStorage("gateway.patient-id") private var patientID = ""
    @State private var bearerToken = ""
    @State private var readiness: [String] = []

    private var configuration: GatewayConfiguration? {
        GatewayConfiguration(baseURLText: apiURL, patientIdText: patientID)
    }

    var body: some View {
        NavigationStack {
            Form {
                Section("采集状态") {
                    Label(gateway.active ? "采集已启动" : "采集未启动", systemImage: gateway.active ? "dot.radiowaves.left.and.right" : "pause.circle")
                    Text(gateway.status).font(.footnote).foregroundStyle(.secondary)
                }
                Section("平台配置") {
                    TextField("HTTPS 平台地址", text: $apiURL).textInputAutocapitalization(.never).keyboardType(.URL)
                    TextField("患者 ID", text: $patientID).textInputAutocapitalization(.never)
                    SecureField("Bearer Token（不保存）", text: $bearerToken)
                }
                Section("无需 USB 安装自检") {
                    Button("运行安装自检") { readiness = gateway.readiness(configuration: configuration) }
                    ForEach(readiness, id: \.self) { Text($0).font(.footnote) }
                }
                Section("设备与校准") {
                    Button("授权并扫描 WT 设备") { gateway.scan() }
                    ForEach(gateway.discoveredDevices.keys.sorted(by: { $0.uuidString < $1.uuidString }), id: \.self) { id in
                        VStack(alignment: .leading) {
                            Text(gateway.discoveredDevices[id] ?? id.uuidString)
                            Text(id.uuidString).font(.caption2).foregroundStyle(.secondary)
                            HStack {
                                Button("设为大腿") { gateway.assign(id: id, placement: .thigh) }
                                Button("设为小腿") { gateway.assign(id: id, placement: .shank) }
                            }
                        }
                    }
                    HStack {
                        Button("大腿归零") { gateway.zero(.thigh) }
                        Button("小腿归零") { gateway.zero(.shank) }
                    }
                }
                Section {
                    Button(gateway.active ? "停止采集" : "开始采集") {
                        if gateway.active { gateway.stop() }
                        else if let configuration { gateway.start(configuration: configuration, token: bearerToken) }
                    }
                    .disabled(!gateway.active && configuration == nil)
                }
            }
            .navigationTitle("TKA iOS 网关")
        }
    }
}
