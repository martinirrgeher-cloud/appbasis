ULC Linz – kostenloser lokaler Codex-Entwicklungsagent (Pilot)

1. Die Dateien aus diesem ZIP direkt in den Stammordner deiner lokalen
   AppBasis-Arbeitskopie entpacken (dort, wo AGENTS.md liegt).
2. Voraussetzung: Windows, Git, GitHub CLI, Node.js 24.19.x, pnpm 11.21.0,
   Codex CLI und eine ChatGPT-Anmeldung von Codex (kein API-Key).
3. PowerShell im AppBasis-Stammordner öffnen und ausführen:

   powershell -NoProfile -ExecutionPolicy Bypass -File .\ULC-AGENT-EINRICHTEN.ps1
   powershell -NoProfile -ExecutionPolicy Bypass -File .\ULC-AGENT-STARTEN.ps1 -DryRun

4. In GitHub ein eigenes Issue erstellen und das Label ulc-agent-ready setzen.
5. Die eigentliche Entwicklung starten:

   powershell -NoProfile -ExecutionPolicy Bypass -File .\ULC-AGENT-STARTEN.ps1

Der Rechner muss eingeschaltet und mit dem Nutzer angemeldet bleiben.
Es entstehen keine API-Kosten, aber das Codex-Nutzungslimit des Abos gilt.
Es gibt keine automatischen Merges oder Deployments.

Ausführliche Anleitung: docs/ulc-autodev.md
