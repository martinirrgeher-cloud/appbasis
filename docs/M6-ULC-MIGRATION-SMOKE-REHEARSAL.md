# M6 – ULC Linz Migration-/Smoke-Rehearsal

## Zweck

Dieser Slice bereitet die zwei späteren M6-Write-Grenzen `production-migrations` und `post-deploy-smokes` so weit wie möglich **ohne Produktionswirkung** vor.

Er führt insbesondere **nicht** aus:

- keine Verbindung zu einer Produktionsdatenbank
- keine SQL-Ausführung
- keine Neon-/Cloudflare-Änderung
- kein Login gegen Produktion
- keine Session-Erzeugung gegen Produktion
- kein Permission-Smoke gegen Produktionsdaten
- keine Fachmodulmutation
- keine Produktionsfreigabe

Der Output bleibt deshalb auch bei vollständig erfolgreichem Rehearsal:

- `productionDatabaseWriteAllowed = false`
- `productionSmokeExecutionAuthorized = false`
- `releaseAuthorized = false`
- `explicitApprovalStillRequired = true`

## 1. Produktionsmigrationen – Repository-Rehearsal

Der ULC-Slice baut keinen zweiten Migrationsexecutor.

Verwendet wird der bestehende gemeinsame Vertrag:

- Plan laden: `tooling/database-migration-executor.mjs#loadRepositoryMigrationPlan`
- spätere Ausführung: `tooling/database-migration-executor.mjs#applyRepositoryMigrationPlan`

Der generische Executor besitzt bereits die relevanten Sicherheitsgrenzen:

- Manifest-/Application-/Owner-Prüfung
- Migrationen nur innerhalb des deklarierten Owner-Roots
- keine fehlenden, doppelten, entkommenden oder symlinkenden Migrationsdateien
- keine Transaction-Control-Statements in den Manifest-Migrationen
- spätere Ziel-DB-Prüfung
- leeres `public`-Schema als Voraussetzung für den initialen Lauf
- atomare Migrationstransaktion

Das ULC-Rehearsal pinnt zusätzlich den **konkreten aktuellen Produktionsplan** auf exakt acht Migrationen in Manifest-Reihenfolge:

1. Identity `0000_appbasis_identity_foundation.sql`
2. Identity `0001_appbasis_identity_foundation.sql`
3. Permissions `0000_appbasis_permissions_foundation.sql`
4. Permissions `0001_appbasis_permission_role_lifecycle.sql`
5. Permissions `0002_appbasis_permission_administration_audit.sql`
6. Permissions `0003_appbasis_principal_permission_administration_audit.sql`
7. ULC Lifecycle `0000_ulc_linz_lifecycle_scope.sql`
8. ULC Lifecycle `0001_ulc_linz_retention_deletion_claim.sql`

Für jede Datei werden nur Pfad, Statement-Anzahl und SHA-256-Digest in den Rehearsal-Snapshot übernommen. SQL-Inhalte und Connection Strings werden nicht ausgegeben.

Der spätere produktive Lauf muss zusätzlich weiterhin erfüllen:

- ausdrückliche Freigabe für genau diesen Produktions-DB-Write
- frische, gebundene Provider-Evidence für die tatsächliche Ziel-DB
- Backup-/Recovery-Zustand vorher geprüft
- vor kritischen Migrationen möglichst unmittelbare Sicherung
- Recovery-/Rollback-Pfad vorher definiert
- Ziel-DB stimmt mit der freigegebenen Produktionsressource überein
- Plan-Fingerprint entspricht dem zuvor geprüften Rehearsal
- Migration danach verifiziert

Die tatsächliche Datenbankidentität wird nicht im Repository gespeichert.

## 2. Production-Smoke-Vertrag

Der bestehende M6-Plan klassifiziert `post-deploy-smokes` zu Recht als `production-smoke-write`: Ein erfolgreicher Auth-Smoke erzeugt produktiven Session-State, und Denial-Fälle können Security-Events im produktiven Logging-Sink erzeugen.

Daher gilt auch später:

- ausdrückliche Freigabe erforderlich
- dedizierte Smoke-Identitäten statt echter Nutzerkonten
- Credentials ausschließlich außerhalb des Repository
- kein automatischer Passwortwechsel während des Smokes
- keine Fachmodul-Datenmutation als Teil dieses v0.1-Smokes
- ein grüner Smoke autorisiert **keine** Produktionsfreigabe

### Health

Öffentliche Produktionsruntime über HTTPS:

- `GET /api/health`
- erwartete Antwort: `status=ok`, `appId=ulc-linz`

### Auth / Session

Mit einer dedizierten, bereits vollständig aktivierten Smoke-Identität:

- erfolgreicher `POST /api/auth/sign-in`
- danach erfolgreicher `GET /api/auth/session`
- `mustChangePassword` darf für den Smoke nicht offen sein
- der Smoke darf nicht selbst Passwort-/Benutzer-Lifecycle korrigieren

### Permissions

Es wird **keine öffentliche Permission-Probe-Route** erfunden.

Der Permission-Smoke verwendet an einer geschützten Operationsgrenze den bestehenden Runtime-Vertrag:

`apps/ulc-linz/worker/authorization.ts#assertUlcLinzModuleAccess`

Mindestens erforderlich:

- ein explizit erlaubter Same-Organization-Fall
- ein explizit verweigerter Fall
- Unknown-Capability bleibt deny-by-default
- keine Provider-/DB-IDs im normalen Ergebnis

### Application

Der aktuelle erzeugte ULC-Stand besitzt in `appbasis.app.json` bewusst `modules: []` und öffentlich nur die Identity-/Health-Grundlage. Deshalb wird **kein fiktiver Fachmodul-Smoke** behauptet.

Für diesen Stand bedeutet `application`:

- aktueller Core-Runtime-Vertrag ist unverändert
- Health/Auth/Session funktionieren
- der bestehende Permission-Guard kann geschützt gegen reale Rollen-/Scope-Daten geprüft werden
- es existiert keine zusätzliche öffentliche Smoke-/Admin-Probe

Sobald ein echtes Fachmodul in `appbasis.app.json` aufgenommen wird, muss dieses Rehearsal fail-closed angepasst werden und der Post-Deploy-Smoke mindestens einen realen Fachmodul-Smoke ergänzen.

## 3. Execution Binding

Der Rehearsal-Vertrag ist ausdrücklich an die bestehenden M6-Schritte `production-migrations`, `post-deploy-smokes` und `release-gate` gebunden. Ein späterer echter Executor darf diese Vorbereitung nicht umgehen. Er muss fail-closed nachweisen, dass:

- das Rehearsal auf dem tatsächlichen finalen Head frisch neu berechnet wurde,
- der erwartete Migrations-Plan-Fingerprint exakt übereinstimmt,
- frische Provider-Evidence für die freigegebene Zielressource vorliegt,
- die Ziel-Datenbank an genau diese Provider-Evidence gebunden ist,
- der hier definierte Smoke-Vertrag konsumiert wird,
- kein Smoke-Erfolg den separaten Release-Gate ersetzt.

`futureExecutorMustConsumeBinding = true` ist damit Teil des fail-closed Vertrags und keine bloße Dokumentationskonvention.

## 4. Rehearsal-Output

`evaluateUlcLinzM6MigrationSmokeRehearsal()` liefert nur Repository-Evidence:

- exakte Migrationen + Owner-Reihenfolge
- Statement-Anzahlen
- Datei-Digests
- Plan-Fingerprint
- gepinnten Smoke-Vertrag
- weiterhin gesperrte Produktionsausführung

Keine SQL-Statements, Provider-Credentials, Connection Strings oder Produktions-IDs werden ausgegeben.

## 5. Stop-Bedingungen

Fail-closed blockieren insbesondere:

- App-/DB-Manifest-Drift
- zusätzlicher oder fehlender Migration-Owner
- zusätzliche, fehlende oder umsortierte Migration
- unsichere Migration laut gemeinsamem Migrationsexecutor
- geänderte aktuelle öffentliche ULC-Routen
- neu hinzugefügtes Fachmodul ohne aktualisierten Smoke-Vertrag
- öffentliche Permission-/Smoke-Probe
- Drift der M6-Klassifikation von Migration oder Post-Deploy-Smoke

## 6. Noch nicht ausgeführt

Der Rehearsal-Slice ist ausschließlich Vorbereitung. Ein echter Produktionslauf bleibt hinter den bereits definierten M6-Freigabegrenzen und benötigt vor jeder produktiven Aktion erneut den aktuellen Live-/Provider-State und die ausdrückliche Nutzerfreigabe.
