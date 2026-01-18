<#
Sets up Windows portproxy + firewall so a Vite dev server running inside WSL2
can be accessed from another PC on the LAN at http://<LAN_IP>:5173.

Run (PowerShell as Administrator) from the repo root:
  powershell -ExecutionPolicy Bypass -File .\scripts\windows\setup-lan.ps1
#>

[CmdletBinding()]
param(
  [string]$DistroName = "Ubuntu",
  [int]$Port = 5173
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
  $configs =
    Get-NetIPConfiguration |
      Where-Object { $_.NetAdapter -and $_.NetAdapter.Status -eq "Up" -and $_.IPv4DefaultGateway -ne $null -and $_.IPv4Address -ne $null }

  $preferWifi =
    $configs |
      Where-Object {
        $_.InterfaceAlias -match 'Wi-?Fi|WLAN' -or
        ($_.NetAdapter -and $_.NetAdapter.InterfaceDescription -match 'Wi-?Fi|Wireless|802\.11')
      } |
      Sort-Object { $_.NetAdapter.InterfaceMetric } |
      Select-Object -First 1

  $cfg =
    if ($preferWifi) { $preferWifi } else {
      $configs |
        Sort-Object { $_.NetAdapter.InterfaceMetric } |
        Select-Object -First 1
    }

  if ($cfg -and $cfg.IPv4Address) {
    $ip = ($cfg.IPv4Address | Select-Object -First 1).IPAddress
    if ($ip) { return $ip }
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
  $cmd = 'hostname -I | awk ''{print $1}'''
  $raw = & wsl.exe -d $distro -- bash -lc $cmd 2>$null

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

function Ensure-IpHelperRunning {
  $svc = Get-Service -Name iphlpsvc -ErrorAction SilentlyContinue
  if (-not $svc) {
    throw "Windows service 'iphlpsvc' (IP Helper) was not found."
  }

  if ($svc.Status -ne "Running") {
    Start-Service -Name iphlpsvc | Out-Null
  }
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
    & netsh interface portproxy delete v4tov4 listenaddress=$e.ListenAddress listenport=$e.ListenPort 2>$null | Out-Null
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

Ensure-IpHelperRunning

Remove-PortProxyForPort -port $Port
Add-PortProxy -listenAddress $lanIp -port $Port -connectAddress $wslIp

$fwName = "Lingua-LAN-$Port"
$fwDisplay = "Lingua LAN $Port (WSL2 portproxy)"
Ensure-FirewallRule -name $fwName -displayName $fwDisplay -port $Port

Write-Host ""
Write-Host "LAN_IP: $lanIp"
Write-Host "WSL_IP: $wslIp"
Write-Host "URL final: http://${lanIp}:$Port"
Write-Host "Prueba: Test-NetConnection $lanIp -Port $Port"
