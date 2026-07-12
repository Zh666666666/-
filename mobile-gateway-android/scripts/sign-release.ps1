param(
    [string]$AndroidSdk = $env:ANDROID_SDK_ROOT,
    [string]$Keystore = $env:SIGNING_KEYSTORE,
    [string]$Alias = $env:SIGNING_KEY_ALIAS,
    [switch]$SkipBuild
)

$ErrorActionPreference = 'Stop'
$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$outputDirectory = Join-Path $projectRoot 'app\build\outputs\apk\release'
$unsignedApk = Join-Path $outputDirectory 'app-release-unsigned.apk'
$alignedApk = Join-Path $outputDirectory 'app-release-aligned.apk'
$signedApk = if ($env:SIGNED_APK) { $env:SIGNED_APK } else { Join-Path $outputDirectory 'TKA-Gateway-v0.2.1.apk' }

foreach ($required in @($AndroidSdk, $Keystore, $Alias, $env:SIGNING_STORE_PASSWORD, $env:SIGNING_KEY_PASSWORD)) {
    if ([string]::IsNullOrWhiteSpace($required)) {
        throw 'ANDROID_SDK_ROOT and all SIGNING_* variables are required.'
    }
}

if (-not $SkipBuild) {
    Push-Location $projectRoot
    try {
        & .\gradlew.bat --no-daemon clean assembleRelease
        if ($LASTEXITCODE -ne 0) { throw "Release build failed with exit code $LASTEXITCODE." }
    } finally {
        Pop-Location
    }
}
if (-not (Test-Path $unsignedApk)) { throw "Unsigned release APK not found: $unsignedApk" }

$buildTools = Get-ChildItem (Join-Path $AndroidSdk 'build-tools') -Directory |
    Sort-Object { [version]$_.Name } -Descending |
    Select-Object -First 1
$zipalign = Join-Path $buildTools.FullName 'zipalign.exe'
$apksigner = Join-Path $buildTools.FullName 'apksigner.bat'
$apksignerJar = Join-Path $buildTools.FullName 'lib\apksigner.jar'
if (-not (Test-Path $zipalign) -or -not (Test-Path $apksigner) -or -not (Test-Path $apksignerJar)) {
    throw 'zipalign, apksigner, or apksigner.jar was not found in Android build-tools.'
}

Remove-Item $alignedApk, $signedApk, "$signedApk.idsig", "$signedApk.verify.txt", "$signedApk.v4-verify.txt" -Force -ErrorAction SilentlyContinue
& $zipalign -p -f 4 $unsignedApk $alignedApk
if ($LASTEXITCODE -ne 0) { throw 'zipalign failed.' }
& $apksigner sign --ks $Keystore --ks-key-alias $Alias --ks-pass env:SIGNING_STORE_PASSWORD --key-pass env:SIGNING_KEY_PASSWORD --min-sdk-version 24 --v1-signing-enabled false --v2-signing-enabled true --v3-signing-enabled true --v4-signing-enabled true --out $signedApk $alignedApk
if ($LASTEXITCODE -ne 0) { throw 'apksigner sign failed.' }
& $zipalign -c -p 4 $signedApk
if ($LASTEXITCODE -ne 0) { throw 'Signed APK alignment verification failed.' }
$verification = & $apksigner verify --verbose --print-certs $signedApk
$verification | Set-Content "$signedApk.verify.txt"
if ($LASTEXITCODE -ne 0 -or $verification -notmatch 'Verified using v2 scheme \(APK Signature Scheme v2\): true' -or $verification -notmatch 'Verified using v3 scheme \(APK Signature Scheme v3\): true') {
    throw 'APK v2/v3 signature verification failed.'
}
if (-not (Test-Path "$signedApk.idsig")) { throw 'APK v4 .idsig output is missing.' }
$v4Verifier = Join-Path $PSScriptRoot 'VerifyV4Signature.java'
& javac -cp $apksignerJar -d $outputDirectory $v4Verifier
if ($LASTEXITCODE -ne 0) { throw 'APK v4 verifier compilation failed.' }
& java -cp "$apksignerJar;$outputDirectory" VerifyV4Signature $signedApk "$signedApk.idsig" | Set-Content "$signedApk.v4-verify.txt"
if ($LASTEXITCODE -ne 0) { throw 'APK v4 signature verification failed.' }
Remove-Item (Join-Path $outputDirectory 'VerifyV4Signature.class') -Force -ErrorAction SilentlyContinue
Remove-Item $alignedApk -Force
Write-Output "Signed APK ready: $signedApk"
Write-Output "APK Signature Scheme v4 sidecar: $signedApk.idsig"
