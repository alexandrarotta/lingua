<#
Removes the Windows portproxy + firewall rule created by setup-lan.ps1.

Run (PowerShell as Administrator) from the repo root:
  powershell -ExecutionPolicy Bypass -File .\scripts\windows\teardown-lan.ps1
#>

[CmdletBinding()]
param(
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

Remove-PortProxyForPort -port $Port

$fwName = "Lingua-LAN-$Port"
Remove-NetFirewallRule -Name $fwName -ErrorAction SilentlyContinue | Out-Null

Write-Host ""
Write-Host "Removed portproxy + firewall rule for port $Port."
