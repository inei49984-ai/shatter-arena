$ErrorActionPreference = 'Stop'
$AppRoot = Split-Path -Parent $PSScriptRoot
$Port = 3000
$HealthUrl = "http://localhost:$Port/health"
$PidFile = Join-Path $AppRoot '.server.pid'
$StdoutLog = Join-Path $AppRoot '.server-out.log'
$StderrLog = Join-Path $AppRoot '.server-error.log'

function Test-GameServer {
  try { $null = Invoke-RestMethod -Uri $HealthUrl -TimeoutSec 2; return $true } catch { return $false }
}

try {
  if (!(Get-Command node.exe -ErrorAction SilentlyContinue)) { throw 'Node.jsが見つかりません。nodejs.orgからLTS版をインストールしてください。' }
  if (!(Test-Path (Join-Path $AppRoot 'node_modules'))) {
    $npm = Get-Command npm.cmd -ErrorAction SilentlyContinue
    if (!$npm) { throw 'npmが見つかりません。Node.jsをインストールし直してください。' }
    Write-Host '初回セットアップ中です。少しお待ちください...'
    Push-Location $AppRoot
    try { & $npm.Source install; if ($LASTEXITCODE -ne 0) { throw 'npm installに失敗しました。' } } finally { Pop-Location }
  }

  if (!(Test-GameServer)) {
    $node = (Get-Command node.exe).Source
    $process = Start-Process -FilePath $node -ArgumentList @('server.js') -WorkingDirectory $AppRoot -WindowStyle Hidden -PassThru -RedirectStandardOutput $StdoutLog -RedirectStandardError $StderrLog
    Set-Content -LiteralPath $PidFile -Value $process.Id -NoNewline
    $ready = $false
    for ($i = 0; $i -lt 40; $i++) {
      Start-Sleep -Milliseconds 500
      if (Test-GameServer) { $ready = $true; break }
      if ($process.HasExited) { break }
    }
    if (!$ready) {
      $detail = if (Test-Path $StderrLog) { (Get-Content $StderrLog -Tail 12) -join "`n" } else { 'サーバーが起動しませんでした。' }
      throw "サーバーを起動できませんでした。`n$detail"
    }
  }

  try {
    $desktop = [Environment]::GetFolderPath('Desktop')
    $shortcutPath = Join-Path $desktop 'Shatter Arena.lnk'
    $shortcut = (New-Object -ComObject WScript.Shell).CreateShortcut($shortcutPath)
    $shortcut.TargetPath = Join-Path $PSScriptRoot 'start-game.bat'
    $shortcut.WorkingDirectory = $PSScriptRoot
    $shortcut.Description = 'Shatter Arenaを起動'
    $shortcut.IconLocation = "$env:SystemRoot\System32\shell32.dll,13"
    $shortcut.Save()
  } catch { Write-Host 'デスクトップショートカットを作れませんでした。public/start-game.batから起動できます。' }

  $GameUrl = "http://localhost:$Port"
  Start-Process -FilePath $GameUrl
  Write-Host "ゲームを起動しました: http://localhost:$Port"
  Write-Host '同じWi-Fiの友達には、サーバーのLAN playアドレスを伝えてください。'
} catch {
  Write-Host $_.Exception.Message -ForegroundColor Red
  exit 1
}
