<#
Removes the Windows portproxy + firewall rules created by setup-portproxy.ps1.

Run (PowerShell as Administrator) from the repo root:
  powershell -ExecutionPolicy Bypass -File .\scripts\windows\teardown-portproxy.ps1

If you forwarded the backend port too:
  powershell -ExecutionPolicy Bypass -File .\scripts\windows\teardown-portproxy.ps1 -BackendPort 8787
#>

[CmdletBinding()]
param(
  [int]$FrontendPort = 5173,
  [int]$BackendPort = 0
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

$targets = @(
  [pscustomobject]@{ Port = $FrontendPort; FirewallName = "Lingua-Vite-$FrontendPort" }
)
if ($BackendPort -gt 0) {
  $targets += [pscustomobject]@{ Port = $BackendPort; FirewallName = "Lingua-Backend-$BackendPort" }
}

foreach ($t in $targets) {
  Remove-PortProxyForPort -port $t.Port
  Remove-NetFirewallRule -Name $t.FirewallName -ErrorAction SilentlyContinue | Out-Null
}

Write-Host ""
Write-Host "Removed portproxy + firewall rules for:"
foreach ($t in $targets) {
  Write-Host "  port $($t.Port)"
}
Write-Host ""
Write-Host "Remaining portproxy entries:"
& netsh interface portproxy show v4tov4

