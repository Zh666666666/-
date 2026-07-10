param(
    [string]$ToolRoot = (Join-Path $env:LOCALAPPDATA 'tka-rehab-tools'),
    [switch]$SkipSdkSync
)

$ErrorActionPreference = 'Stop'
$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$androidSdk = Join-Path $ToolRoot 'android-sdk'
$jdk = Get-ChildItem (Join-Path $ToolRoot 'jdk-17') -Directory -ErrorAction SilentlyContinue |
    Where-Object { Test-Path (Join-Path $_.FullName 'bin\java.exe') } |
    Select-Object -First 1

if (-not $jdk) {
    throw "JDK 17 was not found under $ToolRoot\jdk-17."
}
if (-not (Test-Path (Join-Path $androidSdk 'platforms\android-35\android.jar'))) {
    throw "Android SDK Platform 35 was not found under $androidSdk."
}

if (-not $SkipSdkSync -or -not (Test-Path (Join-Path $projectRoot 'vendor\WitSDK'))) {
    & (Join-Path $PSScriptRoot 'sync-wit-sdk.ps1')
}

$env:JAVA_HOME = $jdk.FullName
$env:ANDROID_HOME = $androidSdk
$env:ANDROID_SDK_ROOT = $androidSdk

$wrapper = Join-Path $projectRoot 'gradlew.bat'
$localGradle = Join-Path $ToolRoot 'gradle\gradle-8.7\bin\gradle.bat'
if (Test-Path $localGradle) {
    $gradleCommand = $localGradle
} elseif (Test-Path $wrapper) {
    $gradleCommand = $wrapper
} else {
    throw 'Gradle wrapper is missing. Run the repository toolchain setup once before building.'
}

Push-Location $projectRoot
try {
    & $gradleCommand --no-daemon clean assembleDebug
    if ($LASTEXITCODE -ne 0) {
        throw "Android debug build failed with exit code $LASTEXITCODE."
    }
} finally {
    Pop-Location
}

$apk = Join-Path $projectRoot 'app\build\outputs\apk\debug\app-debug.apk'
if (-not (Test-Path $apk)) {
    throw "Gradle completed but the debug APK was not found at $apk"
}

Write-Output "Debug APK ready: $apk"
