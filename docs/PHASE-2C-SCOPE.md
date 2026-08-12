# Phase 2C – Minimal Permissions Foundation

## Ziel

Eine kleine, fachneutrale Berechtigungsbasis für AppBasis schaffen, damit der erste Demo-Prototyp zwischen normaler Nutzung und administrativen Aktionen unterscheiden kann, ohne Identity-Providerlogik oder Fachmodule miteinander zu vermischen.

## Scope

- ausschließlich `packages/permissions` plus fokussierte Tests und notwendige paketlokale Konfiguration
- fachneutrale Principal-/Capability-Verträge
- kleine, explizite API zum Prüfen und Erzwingen von Berechtigungen
- minimale Rollen-/Grant-Abbildung nur soweit für Demo v0.1 nötig
- In-Memory-Adapter für reproduzierbare Tests
- serverseitig nutzbare, frameworkunabhängige Kernlogik
- vollständige TypeScript- und Unit-Test-Abdeckung der Allow-/Deny-Grenzen

## Harte Grenzen

- keine Änderungen an `packages/identity`, `packages/database` oder deren Migrationen
- keine Better-Auth-Adminrollen als AppBasis-Businessrollen verwenden
- keine Tasks-Persistenz und keine Änderungen an `modules/tasks`
- keine App-/UI-Integration in diesem PR
- keine Deployment-/Vercel-Konfiguration
- keine neue allgemeine Policy-Engine, ABAC-Sprache oder Workflow-/Saga-Infrastruktur
- keine Runtime-Dependency oder Lockfile-Änderung ohne nachgewiesenen Bedarf

## Abnahmekriterien

- Berechtigungsentscheidungen sind standardmäßig deny-by-default
- Admin-/Member-Demo-Fälle lassen sich ausschließlich über AppBasis-eigene Grants/Capabilities ausdrücken
- unbekannte Principals, Rollen oder Capabilities eskalieren nicht versehentlich zu Zugriff
- Tests decken positive und negative Entscheidungen sowie administrative Aktionen ab
- `pnpm run verify:repo`, Typecheck, Tests, Build und `git diff --check` bleiben grün
- Diff bleibt strikt außerhalb der parallel laufenden Phase 2B Identity/PostgreSQL-Arbeit

Draft: nicht mergen, bevor Scope, CI und Review sauber sind.
