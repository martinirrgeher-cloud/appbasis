# Phase 2D – Production Identity Runtime

## Ziel

Die in Phase 2B real gegen PostgreSQL und Better Auth validierte Identity-Logik als produktiv nutzbare, serverseitige Composition bereitstellen. Die Reference-App soll danach keinen Testadapter kopieren müssen, sondern einen kleinen, konkreten AppBasis-Identity-Runtime-Baustein verwenden können.

## Ausgangslage

- `createBetterAuthRuntime` ist produktiv vorhanden und exportiert.
- `IdentityService` und die Identity-Verträge sind produktiv vorhanden.
- Die konkreten Better-Auth-/PostgreSQL-Adapter, die beide verbinden, leben derzeit im Wesentlichen in den PostgreSQL-E2E-Tests.
- Phase 2B hat deren Verhalten bereits gegen echtes PostgreSQL und Better Auth abgesichert.

## Scope

- ausschließlich `packages/identity` plus fokussierte Identity-Tests und notwendige paketlokale Konfiguration
- konkrete serverseitige Better-Auth-Backend-Composition für `IdentityService`
- konkrete PostgreSQL-Implementierung von `IdentityStateStore`
- kleine öffentliche serverseitige Composition/API, mit der eine App aus bestehender Database-Verbindung, Better-Auth-Runtime und Identity-Service einen nutzbaren Identity-Runtime zusammensetzen kann
- bestehende PostgreSQL-/Better-Auth-E2E-Tests so refaktorieren, dass sie die produktive Composition statt testlokaler Duplikate prüfen
- bereits gemergte Phase-2B-Sicherheitssemantik unverändert erhalten

## Harte Grenzen

- keine Änderungen an `apps/reference`
- keine Änderungen an `packages/permissions`
- keine Änderungen an `modules/tasks`
- keine Deployment-/Vercel-/Cloudflare-Konfiguration
- keine neue Datenbankmigration und keine Änderung des bestehenden Identity-Schemas, außer ein realer, reviewter Defekt erzwingt dies
- keine Secrets oder externen Cloud-Ressourcen
- keine generische Auth-Provider-Abstraktion; Better Auth bleibt die konkrete interne Implementierung
- kein Saga-/Outbox-/Workflow-Framework
- keine neue Business-Permissions-Logik
- keine funktionale Erweiterung der Benutzerverwaltung über das bereits in Phase 2B validierte Verhalten hinaus

## Abnahmekriterien

- produktiver Code enthält die konkrete Adapter-/State-Store-Logik, nicht nur Testdateien
- Reference-/Server-Code müsste für Identity keine E2E-Testklasse kopieren
- bestehende Better-Auth-Username-Anmeldung, Provisionierung, Deaktivierung, verpflichtender Erst-Passwortwechsel, Session-Rotation und sichere Retry-/Recovery-Semantik bleiben unverändert
- die realen PostgreSQL-/Better-Auth-E2E-Tests laufen über die produktive Runtime/Adapter-Composition
- keine Passwörter, Passwort-Hashes, Session-Token, Token-Fingerprints oder Provider-Payloads werden in AppBasis-eigenen Operationstabellen persistiert
- `pnpm install --frozen-lockfile`, `pnpm run verify:repo`, Typecheck, Unit-Tests, realer Identity-PostgreSQL-E2E, Build und `git diff --check` bleiben grün
- Diff bleibt strikt im beschriebenen Identity-Scope

Draft: nicht mergen, bevor Exact-Head-CI und finaler Codex-Review sauber sind.
