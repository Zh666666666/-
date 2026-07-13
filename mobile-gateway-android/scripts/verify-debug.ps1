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
$gradle = Join-Path $ToolRoot 'gradle\gradle-8.7\bin\gradle.bat'

if (-not $jdk) {
    throw "JDK 17 was not found under $ToolRoot\jdk-17."
}
if (-not (Test-Path $gradle)) {
    throw "Gradle 8.7 was not found at $gradle."
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

# Gradle test worker classpaths break on this Windows setup when the repository
# absolute path contains non-ASCII characters. A temporary drive keeps the same
# working tree but gives Java an ASCII-only path.
$driveLetter = @('T', 'U', 'V', 'W', 'X', 'Y') |
    Where-Object { -not (Test-Path "${_}:\") } |
    Select-Object -First 1
if (-not $driveLetter) {
    throw 'No free drive letter is available for the Android verification mapping.'
}

& subst.exe "${driveLetter}:" $projectRoot
try {
    $mappedRoot = "${driveLetter}:\"
    Push-Location $mappedRoot
    try {
        & $gradle --no-daemon :app:testDebugUnitTest :app:lintDebug :app:assembleDebug
        if ($LASTEXITCODE -ne 0) {
            throw "Android verification failed with exit code $LASTEXITCODE."
        }
    } finally {
        Pop-Location
    }
} finally {
    & subst.exe "${driveLetter}:" /D
}

$apk = Join-Path $projectRoot 'app\build\outputs\apk\debug\app-debug.apk'
if (-not (Test-Path $apk)) {
    throw "Android verification passed but the debug APK was not found at $apk."
}

Write-Output "Android verification passed: $apk"
