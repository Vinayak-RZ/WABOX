#Requires -RunAsAdministrator
<#
.SYNOPSIS
  One-time MXC host prep for WABOX development on Windows.

.DESCRIPTION
  - prepare-system-drive on C:\ and any extra drives (e.g. D:\)
  - prepare-null-device (required once per reboot — optional scheduled task)
  - Optional: register logon task for prepare-null-device

.USAGE
  # Elevated PowerShell from repo root:
  .\scripts\setup-mxc-host.ps1
  .\scripts\setup-mxc-host.ps1 -ExtraDrives D:\
  .\scripts\setup-mxc-host.ps1 -RegisterLogonTask
#>
param(
  [string[]] $ExtraDrives = @('D:\'),
  [switch] $RegisterLogonTask
)

$ErrorActionPreference = 'Stop'
$RepoRoot = Split-Path -Parent $PSScriptRoot
$HostPrep = Join-Path $RepoRoot 'node_modules\@microsoft\mxc-sdk\bin\x64\wxc-host-prep.exe'

if (-not (Test-Path $HostPrep)) {
  Write-Error "wxc-host-prep not found. Run: npm install"
}

function Invoke-Prep([string]$Args) {
  Write-Host ">> wxc-host-prep $Args"
  & $HostPrep @Args.Split(' ', [System.StringSplitOptions]::RemoveEmptyEntries)
  if ($LASTEXITCODE -ne 0) { throw "wxc-host-prep failed: $Args (exit $LASTEXITCODE)" }
}

Write-Host "=== WABOX MXC host setup ===" -ForegroundColor Cyan

Invoke-Prep 'prepare-system-drive'

foreach ($drive in $ExtraDrives) {
  $root = if ($drive.EndsWith('\')) { $drive } else { "$drive\" }
  if ($root.ToUpper() -eq "$($env:SystemDrive)\") {
    continue
  }
  Invoke-Prep "prepare-system-drive --target $root"
}

Invoke-Prep 'prepare-null-device'

Write-Host "`nVerifying..." -ForegroundColor Cyan
& $HostPrep verify-null-device
if ($LASTEXITCODE -ne 0) {
  Write-Warning "verify-null-device failed — null device may need prepare-null-device after next reboot"
}

if ($RegisterLogonTask) {
  $TaskName = 'WABOX-MXC-prepare-null-device'
  $Action = New-ScheduledTaskAction -Execute $HostPrep -Argument 'prepare-null-device'
  $Trigger = New-ScheduledTaskTrigger -AtLogOn
  $Principal = New-ScheduledTaskPrincipal -UserId 'SYSTEM' -RunLevel Highest
  Register-ScheduledTask -TaskName $TaskName -Action $Action -Trigger $Trigger -Principal $Principal -Force | Out-Null
  Write-Host "Registered scheduled task: $TaskName (runs prepare-null-device at logon)" -ForegroundColor Green
}

Write-Host "`nDone. Run from repo (non-elevated):" -ForegroundColor Green
Write-Host "  npm run warmup"
Write-Host "  npm run diagnose"
