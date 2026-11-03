$AppRoot = Split-Path -Parent $PSScriptRoot
$PidFile = Join-Path $AppRoot '.server.pid'
if (!(Test-Path $PidFile)) {
  Write-Host '起動用ショートカットで開始したサーバーは見つかりません。手動起動の場合はPowerShellでCtrl+Cを押してください.'
  exit 1
}
$serverPid = 0
try { $serverPid = [int](Get-Content -LiteralPath $PidFile -Raw) } catch {}
if ($serverPid -gt 0 -and (Get-Process -Id $serverPid -ErrorAction SilentlyContinue)) {
  Stop-Process -Id $serverPid -Force
  Write-Host 'Shatter Arenaサーバーを停止しました。'
} else {
  Write-Host 'サーバーはすでに停止しています。'
}
Remove-Item -LiteralPath $PidFile -Force -ErrorAction SilentlyContinue
