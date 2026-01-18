<#
Sets up Windows portproxy + firewall so a Vite dev server running inside WSL2
can be accessed from other devices on the LAN.

Run (PowerShell as Administrator) from the repo root:
  powershell -ExecutionPolicy Bypass -File .\scripts\windows\setup-portproxy.ps1

Optional: also forward the backend port (NOT required for the app to work via Vite proxy):
  powershell -ExecutionPolicy Bypass -File .\scripts\windows\setup-portproxy.ps1 -BackendPort 8787
#>

[CmdletBinding()]
param(
  [int]$FrontendPort = 5173,
  [int]$BackendPort = 0,
  [string]$DistroName = "Ubuntu",
  [string]$ListenAddress = "0.0.0.0"
)

function Test-IsAdministrator {
  $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
  $principal = New-Object Security.Principal.WindowsPrincipal($identity)
  return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

if (-not (Test-IsAdministrator)) {
  Write-Error "Run this script in an elevated PowerShell (Run as Administrator)."
  exit 1
}

function Get-LanIPv4 {
  $cfg =
    Get-NetIPConfiguration |
      Where-Object { $_.NetAdapter -and $_.NetAdapter.Status -eq "Up" -and $_.IPv4DefaultGateway -ne $null -and $_.IPv4Address -ne $null } |
      Sort-Object { $_.NetAdapter.InterfaceMetric } |
      Select-Object -First 1

  if ($cfg -and $cfg.IPv4Address -and $cfg.IPv4Address.IPAddress) {
    return $cfg.IPv4Address.IPAddress
  }

  $fallback =
    Get-NetIPAddress -AddressFamily IPv4 |
      Where-Object { $_.IPAddress -and $_.IPAddress -notmatch '^127\.' -and $_.IPAddress -notmatch '^169\.254\.' } |
      Sort-Object -Property InterfaceMetric |
      Select-Object -First 1

  if ($fallback -and $fallback.IPAddress) {
    return $fallback.IPAddress
  }

  throw "Could not detect a LAN IPv4 address (Wi-Fi/Ethernet)."
}

function Get-WslIPv4([string]$distro) {
  $raw = $null
  try {
    $raw = & wsl.exe -d $distro -- hostname -I 2>$null
  } catch {
    $raw = $null
  }

  if (-not $raw) {
    $raw = & wsl.exe -- hostname -I 2>$null
  }

  if ($LASTEXITCODE -ne 0 -or -not $raw) {
    throw "Could not get WSL IP. Is WSL running and is the distro name correct? Try: -DistroName <name>."
  }

  $ip =
    ($raw -split '\s+' |
      Where-Object { $_ -match '^\d{1,3}(\.\d{1,3}){3}$' } |
      Select-Object -First 1)

  if (-not $ip) {
    throw "Could not parse WSL IPv4 from output: $raw"
  }

  return $ip
}

function Get-PortProxyV4Entries {
  $lines = & netsh interface portproxy show v4tov4
  $entries = @()
  foreach ($line in $lines) {
    if ($line -match '^\s*(\d+\.\d+\.\d+\.\d+)\s+(\d+)\s+(\d+\.\d+\.\d+\.\d+)\s+(\d+)\s*$') {
      $entries += [pscustomobject]@{
        ListenAddress  = $matches[1]
        ListenPort     = [int]$matches[2]
        ConnectAddress = $matches[3]
        ConnectPort    = [int]$matches[4]
      }
    }
  }
  return $entries
}

function Remove-PortProxyForPort([int]$port) {
  $entries = Get-PortProxyV4Entries | Where-Object { $_.ListenPort -eq $port }
  foreach ($e in $entries) {
    & netsh interface portproxy delete v4tov4 listenaddress=$e.ListenAddress listenport=$e.ListenPort | Out-Null
  }
}

function Add-PortProxy([string]$listenAddress, [int]$port, [string]$connectAddress) {
  & netsh interface portproxy add v4tov4 listenaddress=$listenAddress listenport=$port connectaddress=$connectAddress connectport=$port | Out-Null
}

function Ensure-FirewallRule([string]$name, [string]$displayName, [int]$port) {
  $existing = Get-NetFirewallRule -Name $name -ErrorAction SilentlyContinue
  if ($existing) {
    Remove-NetFirewallRule -Name $name -ErrorAction SilentlyContinue | Out-Null
  }
  New-NetFirewallRule -Name $name -DisplayName $displayName -Direction Inbound -Action Allow -Protocol TCP -LocalPort $port | Out-Null
}

$lanIp = Get-LanIPv4
$wslIp = Get-WslIPv4 -distro $DistroName

$targets = @(
  [pscustomobject]@{ Port = $FrontendPort; FirewallName = "Lingua-Vite-$FrontendPort"; FirewallDisplay = "Lingua Vite $FrontendPort" }
)
if ($BackendPort -gt 0) {
  $targets += [pscustomobject]@{ Port = $BackendPort; FirewallName = "Lingua-Backend-$BackendPort"; FirewallDisplay = "Lingua Backend $BackendPort" }
}

foreach ($t in $targets) {
  Remove-PortProxyForPort -port $t.Port
  Add-PortProxy -listenAddress $ListenAddress -port $t.Port -connectAddress $wslIp
  Ensure-FirewallRule -name $t.FirewallName -displayName $t.FirewallDisplay -port $t.Port
}

Write-Host ""
Write-Host "LAN_IP: $lanIp"
Write-Host "WSL_IP: $wslIp"
Write-Host "Forwarding:"
foreach ($t in $targets) {
  Write-Host "  ${ListenAddress}:$($t.Port) -> ${wslIp}:$($t.Port)"
}
Write-Host ""
Write-Host "URL: http://${lanIp}:$FrontendPort"
Write-Host ""
Write-Host "Portproxy entries:"
& netsh interface portproxy show v4tov4
