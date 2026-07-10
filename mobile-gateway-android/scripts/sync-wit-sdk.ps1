param(
    [switch]$Refresh,
    [switch]$ApiOnly
)

$ErrorActionPreference = 'Stop'
$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$destination = Join-Path $projectRoot 'vendor\WitSDK'
$temporaryRoot = Join-Path ([System.IO.Path]::GetTempPath()) 'witmotion-ble5-sdk'
$sourceRepository = 'https://github.com/WITMOTION/WitBluetooth_BWT901BLE5_0.git'
$sourceCommit = '9efaab0fdd6a06dc807bf80402e58aa91b431c6f'
$sourceModule = Join-Path $temporaryRoot 'Android_Java\wit-example-ble5\WitSDK'
$repositoryApi = 'repos/WITMOTION/WitBluetooth_BWT901BLE5_0'
$modulePrefix = 'Android_Java/wit-example-ble5/WitSDK/'

function Sync-FromGitHubApi {
    param([string]$TargetDirectory)

    if (-not (Get-Command gh -ErrorAction SilentlyContinue)) {
        throw 'Git clone failed and GitHub CLI is unavailable for the API fallback.'
    }

    $tree = gh api "$repositoryApi/git/trees/$sourceCommit`?recursive=1" | ConvertFrom-Json
    if ($LASTEXITCODE -ne 0) {
        throw 'Could not read the official WitMotion repository tree through GitHub API.'
    }

    $files = $tree.tree | Where-Object {
        $_.type -eq 'blob' -and $_.path.StartsWith($modulePrefix)
    }
    if ($files.Count -lt 5) {
        throw "Official WitSDK API fallback returned only $($files.Count) files."
    }

    New-Item -ItemType Directory -Force $TargetDirectory | Out-Null
    foreach ($file in $files) {
        $relativePath = $file.path.Substring($modulePrefix.Length).Replace('/', [IO.Path]::DirectorySeparatorChar)
        $targetPath = Join-Path $TargetDirectory $relativePath
        New-Item -ItemType Directory -Force (Split-Path $targetPath) | Out-Null
        $content = gh api "$repositoryApi/contents/$($file.path)?ref=$sourceCommit" | ConvertFrom-Json
        if ($LASTEXITCODE -ne 0 -or $null -eq $content.content) {
            throw "Could not download official SDK file $($file.path)."
        }
        [IO.File]::WriteAllBytes($targetPath, [Convert]::FromBase64String(($content.content -replace '\s', '')))
    }

    Write-Output "Official WitSDK prepared through GitHub API ($($files.Count) files)."
}

if ($Refresh -and (Test-Path $temporaryRoot)) {
    Remove-Item -LiteralPath $temporaryRoot -Recurse -Force
}

if (Test-Path $destination) {
    Remove-Item -LiteralPath $destination -Recurse -Force
}

$cloneSucceeded = $false
if (-not $ApiOnly) {
    if (-not (Test-Path $temporaryRoot)) {
        git init $temporaryRoot
        git -C $temporaryRoot remote add origin $sourceRepository
    } else {
        git -C $temporaryRoot remote set-url origin $sourceRepository
    }
    git -C $temporaryRoot fetch --depth 1 origin $sourceCommit
    if ($LASTEXITCODE -eq 0) {
        git -C $temporaryRoot checkout --detach FETCH_HEAD
        $cloneSucceeded = $LASTEXITCODE -eq 0
    }
}

if ($cloneSucceeded -and (Test-Path $sourceModule)) {
    New-Item -ItemType Directory -Force (Split-Path $destination) | Out-Null
    Copy-Item -LiteralPath $sourceModule -Destination $destination -Recurse
    Write-Output "Official WitSDK prepared from pinned commit $sourceCommit at $destination"
} else {
    if (Test-Path $temporaryRoot) {
        Remove-Item -LiteralPath $temporaryRoot -Recurse -Force
    }
    Sync-FromGitHubApi -TargetDirectory $destination
}

if (-not (Test-Path (Join-Path $destination 'src\main\java\com\wit\witsdk\Device\DeviceModel.java'))) {
    throw "Official WitSDK verification failed at $destination"
}
