# Freiwilliger Autostart bei interaktiver Windows-Anmeldung.
# Nicht als SYSTEM und nicht ohne Nutzeranmeldung ausführen.
param([switch]$Entfernen)
$ErrorActionPreference = 'Stop'
$taskName = 'ULC-Autodev'
if ($Entfernen) {
    Unregister-ScheduledTask -TaskName $taskName -Confirm:$false -ErrorAction Stop
    Write-Host 'Autostart entfernt. Bereits laufende Prozesse gegebenenfalls mit Strg+C beenden.'
    return
}
$script = Join-Path $PSScriptRoot 'ULC-AGENT-STARTEN.ps1'
$arguments = '-NoLogo -NoProfile -ExecutionPolicy Bypass -File "' + $script + '"'
$user = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
$action = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument $arguments -WorkingDirectory $PSScriptRoot
$trigger = New-ScheduledTaskTrigger -AtLogOn -User $user
$principal = New-ScheduledTaskPrincipal -UserId $user -LogonType Interactive -RunLevel Limited
$settings = New-ScheduledTaskSettingsSet -MultipleInstances IgnoreNew -ExecutionTimeLimit (New-TimeSpan -Seconds 0) -StartWhenAvailable
Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Settings $settings -Principal $principal -Force | Out-Null
Write-Host "Autostart eingerichtet: $taskName (nur bei Anmeldung, PC muss laufen)." -ForegroundColor Green
