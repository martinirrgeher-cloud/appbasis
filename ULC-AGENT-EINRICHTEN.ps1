# Einmalig auf dem eigenen Windows-Rechner ausführen.
# Keine kostenpflichtigen API-Keys und keine Cloud-Secrets.
$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot

function Require-Command([string]$Name) {
    if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
        throw "Programm '$Name' fehlt. Siehe docs/ulc-autodev.md."
    }
}

foreach ($name in @('git', 'gh', 'node', 'pnpm', 'codex')) { Require-Command $name }

$nodeMajor = [int]((& node --version).TrimStart('v').Split('.')[0])
if ($nodeMajor -lt 24) { throw 'AppBasis erwartet Node.js 24.19.0 oder neuer innerhalb Version 24.' }
& gh auth status
if ($LASTEXITCODE -ne 0) { throw 'Bitte zuerst: gh auth login' }

$codexStatus = (& codex login status 2>&1 | Out-String)
if ($LASTEXITCODE -ne 0 -or $codexStatus -notmatch 'ChatGPT' -or $codexStatus -match 'API key') {
    throw 'Bitte zuerst: codex login -> Sign in with ChatGPT (nicht API-Key).'
}

# Nur der Git-Transport darf die bereits eingerichtete GitHub-Anmeldung verwenden.
& gh auth setup-git
if ($LASTEXITCODE -ne 0) { throw 'gh auth setup-git fehlgeschlagen.' }

$repo = 'martinirrgeher-cloud/appbasis'
$labels = @(
    @('ulc-agent-ready', '0e8a16', 'Freigegebener Auftrag fuer lokalen ULC-Entwickler'),
    @('ulc-agent-running', 'fbca04', 'Autodev bearbeitet Auftrag'),
    @('ulc-agent-review', '1d76db', 'Draft PR bereit zur Abnahme'),
    @('ulc-agent-blocked', 'd93f0b', 'Autodev erfordert manuelle Entscheidung')
)
foreach ($item in $labels) {
    & gh label create $item[0] --repo $repo --color $item[1] --description $item[2] --force
    if ($LASTEXITCODE -ne 0) { throw "Label-Erstellung fehlgeschlagen: $($item[0])" }
}

& node --test .\tooling\ulc-autodev-policy.test.mjs
if ($LASTEXITCODE -ne 0) { throw 'Sicherheitstests fehlgeschlagen.' }

Write-Host 'Einrichtung erfolgreich. Neue GitHub-Issues brauchen das Label ulc-agent-ready.' -ForegroundColor Green
Write-Host 'Einmaliger Test: .\ULC-AGENT-STARTEN.ps1 -DryRun'
Write-Host 'Dauerlauf:     .\ULC-AGENT-STARTEN.ps1'
Write-Host 'Optionaler Autostart: .\ULC-AGENT-AUTOSTART.ps1'
