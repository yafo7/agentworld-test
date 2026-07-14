param(
  [ValidateSet('status', 'start', 'stop')]
  [string]$Action = 'status',
  [ValidateSet('all', 'game', 'studio')]
  [string]$Target = 'all'
)

$ErrorActionPreference = 'Stop'
$RepoRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..\..\..'))
$StudioRoot = [IO.Path]::GetFullPath((Join-Path $RepoRoot '..\3d-generate'))
$RuntimeDir = Join-Path $RepoRoot '.agents\runtime'
New-Item -ItemType Directory -Force -Path $RuntimeDir | Out-Null

function Get-ServiceProcess([int]$Port) {
  $connection = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
  if (-not $connection) { return $null }
  $process = Get-CimInstance Win32_Process -Filter "ProcessId=$($connection.OwningProcess)" -ErrorAction SilentlyContinue
  [pscustomobject]@{
    Port = $Port
    ProcessId = $connection.OwningProcess
    Name = $process.Name
    CommandLine = $process.CommandLine
  }
}

function Test-OwnedProcess($Info, [string]$Kind) {
  if (-not $Info) { return $false }
  $command = [string]$Info.CommandLine
  if ($command -match [regex]::Escape($RepoRoot)) { return $true }
  if ($command -match [regex]::Escape($StudioRoot)) { return $true }
  if ($Kind -eq 'game' -and $command -match 'vite') { return $true }
  if ($Kind -eq 'studio' -and $Info.Name -match '^python' -and $command -match 'server\.py') { return $true }
  return $false
}

function Wait-Port([int]$Port) {
  for ($i = 0; $i -lt 30; $i++) {
    Start-Sleep -Milliseconds 500
    if (Get-ServiceProcess $Port) { return $true }
  }
  return $false
}

function Start-Game {
  $existing = Get-ServiceProcess 5173
  if ($existing) {
    if (-not (Test-OwnedProcess $existing 'game')) { throw "Port 5173 is owned by an unrelated process: $($existing.ProcessId)" }
    return
  }
  Start-Process -FilePath 'npm.cmd' -ArgumentList @('run', 'dev:game', '--', '--host', '0.0.0.0', '--port', '5173') `
    -WorkingDirectory $RepoRoot -WindowStyle Hidden `
    -RedirectStandardOutput (Join-Path $RuntimeDir 'game.out.log') `
    -RedirectStandardError (Join-Path $RuntimeDir 'game.err.log') | Out-Null
  if (-not (Wait-Port 5173)) { throw 'Chii Island did not start on port 5173' }
}

function Start-Studio {
  $existing = Get-ServiceProcess 8000
  if ($existing) {
    if (-not (Test-OwnedProcess $existing 'studio')) { throw "Port 8000 is owned by an unrelated process: $($existing.ProcessId)" }
    return
  }
  if (-not (Test-Path $StudioRoot)) { throw "Studio repository not found: $StudioRoot" }
  $preferredPython = 'C:\Users\yafo777\AppData\Local\Programs\Python\Python313\python.exe'
  $python = if (Test-Path $preferredPython) { $preferredPython } else { 'python' }
  Start-Process -FilePath $python -ArgumentList @('server.py') -WorkingDirectory $StudioRoot -WindowStyle Hidden `
    -RedirectStandardOutput (Join-Path $RuntimeDir 'studio.out.log') `
    -RedirectStandardError (Join-Path $RuntimeDir 'studio.err.log') | Out-Null
  if (-not (Wait-Port 8000)) { throw 'Voxel Studio did not start on port 8000' }
}

function Stop-Service([int]$Port, [string]$Kind) {
  $existing = Get-ServiceProcess $Port
  if (-not $existing) { return }
  if (-not (Test-OwnedProcess $existing $Kind)) {
    throw "Refusing to stop unrelated process $($existing.ProcessId) on port $Port"
  }
  Stop-Process -Id $existing.ProcessId -Force
}

if ($Action -eq 'start') {
  if ($Target -in @('all', 'game')) { Start-Game }
  if ($Target -in @('all', 'studio')) { Start-Studio }
} elseif ($Action -eq 'stop') {
  if ($Target -in @('all', 'game')) { Stop-Service 5173 'game' }
  if ($Target -in @('all', 'studio')) { Stop-Service 8000 'studio' }
}

@(
  [pscustomobject]@{ Service = 'Chii Island'; Port = 5173; Running = [bool](Get-ServiceProcess 5173); Url = 'http://localhost:5173/src/demos/chii-island/' },
  [pscustomobject]@{ Service = 'Voxel Studio'; Port = 8000; Running = [bool](Get-ServiceProcess 8000); Url = 'http://localhost:8000/' }
) | Format-Table -AutoSize
