// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "TkaIosGatewayCore",
    platforms: [.macOS(.v13), .iOS(.v17)],
    products: [
        .library(name: "TkaIosGatewayCore", targets: ["TkaIosGatewayCore"]),
    ],
    targets: [
        .target(name: "TkaIosGatewayCore", path: "Core"),
        .testTarget(
            name: "TkaIosGatewayCoreTests",
            dependencies: ["TkaIosGatewayCore"],
            path: "Tests/TkaIosGatewayCoreTests"
        ),
    ]
)
