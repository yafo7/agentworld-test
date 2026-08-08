param(
  [ValidateSet('status', 'start', 'stop')]
  [string]$Action = 'status',
  [ValidateSet('all', 'game', 'studio', 'map')]
  [string]$Target = 'all',
  [ValidateRange(1, 65535)]
  [int]$GamePort = 5173,
  [ValidateRange(1, 65535)]
  [int]$MapPort = 5176,
  [ValidateRange(1, 65535)]
  [int]$MapApiPort = 8797
)

$ErrorActionPreference = 'Stop'
$RepoRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..\..\..'))
$StudioRoot = [IO.Path]::GetFullPath((Join-Path $RepoRoot '..\3d-generate'))
$WorldForgeRoot = [IO.Path]::GetFullPath((Join-Path $RepoRoot '..\worldforge-studio'))
$AgentlandRuntimeRoot = [IO.Path]::GetFullPath((Join-Path $RepoRoot '..\.runtime'))
$WorldForgeCompatRoot = Join-Path $AgentlandRuntimeRoot 'worldforge-3d-compat'
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
  if ($Kind -eq 'map-client') {
    return $command -match [regex]::Escape($WorldForgeRoot) -and $command -match 'vite'
  }
  if ($Kind -eq 'map-api') {
    return $command -match [regex]::Escape($WorldForgeRoot) `
      -and $command -match 'src[/\\]server[/\\]index\.ts'
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

function Resolve-WorldForgeRuntimeRoot {
  $requiredEntries = @('effects.js', 'environment.js', 'outline.js', 'postprocess.js')
  $studioRuntime = Join-Path $StudioRoot 'packages\voxel-render-runtime\src'
  $studioReady = (Test-Path $studioRuntime) -and -not ($requiredEntries | Where-Object {
    -not (Test-Path (Join-Path $studioRuntime $_))
  })
  if ($studioReady) { return $StudioRoot }

  $compatRuntime = Join-Path $WorldForgeCompatRoot 'packages\voxel-render-runtime\src'
  $compatReady = (Test-Path $compatRuntime) -and -not ($requiredEntries | Where-Object {
    -not (Test-Path (Join-Path $compatRuntime $_))
  })
  if ($compatReady) { return $WorldForgeCompatRoot }

  throw 'WorldForge render runtime is unavailable. Update 3d-generate or recreate agentland/.runtime/worldforge-3d-compat.'
}

function Start-MapGenerator {
  if (-not (Test-Path $WorldForgeRoot)) { throw "WorldForge repository not found: $WorldForgeRoot" }
  if (-not (Test-Path (Join-Path $WorldForgeRoot 'node_modules'))) {
    throw "WorldForge dependencies are missing. Run npm ci in $WorldForgeRoot"
  }

  $runtimeRoot = Resolve-WorldForgeRuntimeRoot
  $env:VOXEL_STUDIO_ROOT = $runtimeRoot

  $client = Get-ServiceProcess $MapPort
  if ($client) {
    if (-not (Test-OwnedProcess $client 'map-client')) {
      throw "Port $MapPort is owned by an unrelated process: $($client.ProcessId)"
    }
  } else {
    Start-Process -FilePath 'npm.cmd' `
      -ArgumentList @('exec', '--', 'vite', '--host', '0.0.0.0', '--port', "$MapPort", '--strictPort') `
      -WorkingDirectory $WorldForgeRoot -WindowStyle Hidden `
      -RedirectStandardOutput (Join-Path $RuntimeDir "map-$MapPort.out.log") `
      -RedirectStandardError (Join-Path $RuntimeDir "map-$MapPort.err.log") | Out-Null
    if (-not (Wait-Port $MapPort)) { throw "WorldForge client did not start on port $MapPort" }
  }

  $api = Get-ServiceProcess $MapApiPort
  if ($api) {
    if (-not (Test-OwnedProcess $api 'map-api')) {
      throw "Port $MapApiPort is owned by an unrelated process: $($api.ProcessId)"
    }
  } else {
    $previousPort = $env:PORT
    $env:PORT = "$MapApiPort"
    try {
      Start-Process -FilePath 'npm.cmd' `
        -ArgumentList @('exec', '--', 'tsx', 'watch', 'src/server/index.ts', '--', '--dev') `
        -WorkingDirectory $WorldForgeRoot -WindowStyle Hidden `
        -RedirectStandardOutput (Join-Path $RuntimeDir "map-api-$MapApiPort.out.log") `
        -RedirectStandardError (Join-Path $RuntimeDir "map-api-$MapApiPort.err.log") | Out-Null
    } finally {
      $env:PORT = $previousPort
    }
    if (-not (Wait-Port $MapApiPort)) { throw "WorldForge API did not start on port $MapApiPort" }
  }

  if ($runtimeRoot -eq $WorldForgeCompatRoot) {
    Write-Output "WorldForge compatibility runtime: $WorldForgeCompatRoot"
  }
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
  if ($Target -eq 'map') { Start-MapGenerator }
} elseif ($Action -eq 'stop') {
  if ($Target -in @('all', 'game')) { Stop-Service $GamePort 'game' }
  if ($Target -in @('all', 'studio')) { Stop-Service 8000 'studio' }
  if ($Target -eq 'map') {
    Stop-Service $MapPort 'map-client'
    Stop-Service $MapApiPort 'map-api'
  }
}

$game = Get-ServiceProcess $GamePort
$studio = Get-ServiceProcess 8000
$mapClient = Get-ServiceProcess $MapPort
$mapApi = Get-ServiceProcess $MapApiPort
@(
  [pscustomobject]@{ Service = 'Chii Island'; Port = $GamePort; Running = [bool]$game; Owned = Test-OwnedProcess $game 'game'; Url = "http://localhost:$GamePort/src/demos/chii-island/" },
  [pscustomobject]@{ Service = 'Voxel Studio'; Port = 8000; Running = [bool]$studio; Owned = Test-OwnedProcess $studio 'studio'; Url = 'http://localhost:8000/' },
  [pscustomobject]@{ Service = 'WorldForge'; Port = $MapPort; Running = [bool]$mapClient; Owned = Test-OwnedProcess $mapClient 'map-client'; Url = "http://localhost:$MapPort/" },
  [pscustomobject]@{ Service = 'WorldForge API'; Port = $MapApiPort; Running = [bool]$mapApi; Owned = Test-OwnedProcess $mapApi 'map-api'; Url = "http://localhost:$MapApiPort/" }
) | Format-Table -AutoSize
