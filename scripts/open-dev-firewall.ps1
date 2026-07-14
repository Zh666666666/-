# Opens Windows Firewall for local Next.js phone uploads.
# Must run elevated. Prefer the .bat launcher which triggers UAC.
#
#   scripts\open-dev-firewall.bat
#
# Or elevated PowerShell:
#   Set-ExecutionPolicy -Scope Process Bypass
#   .\scripts\open-dev-firewall.ps1

$ErrorActionPreference = 'Stop'

function Test-IsAdministrator {
    $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
    $principal = New-Object Security.Principal.WindowsPrincipal($identity)
    return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

if (-not (Test-IsAdministrator)) {
    Write-Error @'
当前不是管理员权限，防火墙规则创建失败（拒绝访问）。

请任选一种方式：
1) 双击 scripts\open-dev-firewall.bat，在 UAC 弹窗点“是”
2) 开始菜单搜索 PowerShell -> 右键“以管理员身份运行”，再执行本脚本
3) Windows 安全中心手动放行 TCP 3000（入站，专用+公用）
'@
    exit 5
}

function Ensure-InboundTcpPortRule {
    param(
        [Parameter(Mandatory = $true)][string]$DisplayName,
        [Parameter(Mandatory = $true)][int]$LocalPort
    )

    $existing = Get-NetFirewallRule -DisplayName $DisplayName -ErrorAction SilentlyContinue
    if (-not $existing) {
        New-NetFirewallRule `
            -DisplayName $DisplayName `
            -Direction Inbound `
            -Action Allow `
            -Protocol TCP `
            -LocalPort $LocalPort `
            -Profile Any `
            -ErrorAction Stop | Out-Null
        Write-Output "Created firewall rule: $DisplayName"
    } else {
        Set-NetFirewallRule -DisplayName $DisplayName -Enabled True -Action Allow -Profile Any -ErrorAction Stop | Out-Null
        Write-Output "Updated firewall rule: $DisplayName"
    }
}

function Ensure-InboundProgramRule {
    param(
        [Parameter(Mandatory = $true)][string]$DisplayName,
        [Parameter(Mandatory = $true)][string]$Program
    )

    if (-not (Test-Path $Program)) {
        Write-Output "Skip program rule (not found): $Program"
        return
    }

    $existing = Get-NetFirewallRule -DisplayName $DisplayName -ErrorAction SilentlyContinue
    if (-not $existing) {
        New-NetFirewallRule `
            -DisplayName $DisplayName `
            -Direction Inbound `
            -Action Allow `
            -Program $Program `
            -Profile Private,Public `
            -ErrorAction Stop | Out-Null
        Write-Output "Created firewall rule: $DisplayName"
    } else {
        Set-NetFirewallRule -DisplayName $DisplayName -Enabled True -Action Allow -Profile Private,Public -ErrorAction Stop | Out-Null
        Write-Output "Updated firewall rule: $DisplayName"
    }
}

Ensure-InboundTcpPortRule -DisplayName 'TKA Rehab Platform Dev 3000' -LocalPort 3000
Ensure-InboundProgramRule -DisplayName 'TKA Node.js Private Inbound' -Program 'C:\Program Files\nodejs\node.exe'

$ip = (Get-NetIPAddress -AddressFamily IPv4 |
    Where-Object {
        $_.IPAddress -notlike '127.*' -and
        $_.PrefixOrigin -ne 'WellKnown' -and
        $_.IPAddress -notlike '169.254.*'
    } |
    Select-Object -ExpandProperty IPAddress -First 1)

if (-not $ip) {
    $ip = '192.168.31.203'
}

Write-Output ''
Write-Output 'Firewall rules are ready.'
Write-Output "On the phone browser open: http://$ip:3000/api/health/ready"
Write-Output 'Expected JSON includes: "status":"ready"'
Write-Output 'If the phone still cannot open it, check router AP isolation / guest Wi-Fi.'
