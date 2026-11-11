# Läuft, bis Strg+C gedrückt oder der Rechner heruntergefahren wird.
param(
    [switch]$Once,
    [switch]$DryRun,
    [ValidateRange(1,2147483647)][int]$Issue = 0
)
$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot
$arguments = @((Join-Path $PSScriptRoot 'tooling\ulc-autodev.mjs'))
if ($Once -or $Issue -gt 0) { $arguments += '--once' } else { $arguments += '--loop' }
if ($DryRun) { $arguments += '--dry-run' }
if ($Issue -gt 0) { $arguments += "--issue=$Issue" }
& node @arguments
exit $LASTEXITCODE
