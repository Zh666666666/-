param(
    [switch]$Refresh
)

$ErrorActionPreference = 'Stop'
$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$destination = Join-Path $projectRoot 'vendor\WitSDK'
$temporaryRoot = Join-Path ([System.IO.Path]::GetTempPath()) 'witmotion-ble5-sdk'
$sourceRepository = 'https://github.com/WITMOTION/WitBluetooth_BWT901BLE5_0.git'
$sourceModule = Join-Path $temporaryRoot 'Android_Java\wit-example-ble5\WitSDK'

if ($Refresh -and (Test-Path $temporaryRoot)) {
    Remove-Item -LiteralPath $temporaryRoot -Recurse -Force
}

if (-not (Test-Path $temporaryRoot)) {
    git clone --depth 1 $sourceRepository $temporaryRoot
} else {
    git -C $temporaryRoot pull --ff-only
}

if (-not (Test-Path $sourceModule)) {
    throw "Could not find the official WitSDK module at $sourceModule"
}

New-Item -ItemType Directory -Force (Split-Path $destination) | Out-Null
if (Test-Path $destination) {
    Remove-Item -LiteralPath $destination -Recurse -Force
}
Copy-Item -LiteralPath $sourceModule -Destination $destination -Recurse

Write-Output "Official WitSDK prepared at $destination"
