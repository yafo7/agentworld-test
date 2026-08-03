param(
  [ValidateSet('status', 'start', 'stop')]
  [string]$Action = 'status',
  [ValidateSet('all', 'game', 'studio')]
  [string]$Target = 'all',
  [ValidateRange(1, 65535)]
  [int]$GamePort = 5173
)

$ErrorActionPreference = 'Stop'
$RepoRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..\..\..'))
$StudioRoot = [IO.Path]::GetFullPath((Join-Path $RepoRoot '..\3d-generate'))
$RuntimeDir = Join-Path $RepoRoot '.agents\runtime'
New-Item -ItemType Directory -Force -Path $RuntimeDir | Out-Null

function Normalize-ProcessPathEnvironment {
  $variables = [Environment]::GetEnvironmentVariables('Process')
  $pathValue = [string]$variables['Path']
  if (-not $pathValue) { $pathValue = [string]$variables['PATH'] }
  [Environment]::SetEnvironmentVariable('PATH', $null, 'Process')
  [Environment]::SetEnvironmentVariable('Path', $null, 'Process')
  [Environment]::SetEnvironmentVariable('Path', $pathValue, 'Process')
}

Normalize-ProcessPathEnvironment

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
  if ($Kind -eq 'game') {
    return $command -match [regex]::Escape($RepoRoot) -and $command -match 'vite'
  }
  if ($Kind -eq 'studio') {
    return $command -match [regex]::Escape($StudioRoot) `
      -and $Info.Name -match '^python' `
      -and $command -match 'server\.py'
  }
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
  $existing = Get-ServiceProcess $GamePort
  if ($existing) {
    if (-not (Test-OwnedProcess $existing 'game')) { throw "Port $GamePort is owned by an unrelated process: $($existing.ProcessId)" }
    return
  }
  $logSuffix = if ($GamePort -eq 5173) { '' } else { "-$GamePort" }
  Start-Process -FilePath 'npm.cmd' -ArgumentList @('run', 'dev:game', '--', '--host', '0.0.0.0', '--port', "$GamePort", '--strictPort') `
    -WorkingDirectory $RepoRoot -WindowStyle Hidden `
    -RedirectStandardOutput (Join-Path $RuntimeDir "game$logSuffix.out.log") `
    -RedirectStandardError (Join-Path $RuntimeDir "game$logSuffix.err.log") | Out-Null
  if (-not (Wait-Port $GamePort)) { throw "Chii Island did not start on port $GamePort" }
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
  if ($Target -in @('all', 'game')) { Stop-Service $GamePort 'game' }
  if ($Target -in @('all', 'studio')) { Stop-Service 8000 'studio' }
}

$game = Get-ServiceProcess $GamePort
$studio = Get-ServiceProcess 8000
@(
  [pscustomobject]@{ Service = 'Chii Island'; Port = $GamePort; Running = [bool]$game; Owned = Test-OwnedProcess $game 'game'; Url = "http://localhost:$GamePort/src/demos/chii-island/" },
  [pscustomobject]@{ Service = 'Voxel Studio'; Port = 8000; Running = [bool]$studio; Owned = Test-OwnedProcess $studio 'studio'; Url = 'http://localhost:8000/' }
) | Format-Table -AutoSize
