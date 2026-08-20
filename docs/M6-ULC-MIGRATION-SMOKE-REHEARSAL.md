# M6 – ULC Linz Migration-/Smoke-Rehearsal

## Zweck

Dieser Slice bereitet die späteren M6-Write-Grenzen `production-migrations` und `post-deploy-smokes` so weit wie möglich **ohne Produktionswirkung** vor. Er verbindet sich nicht mit einer Produktionsdatenbank, führt kein SQL aus, verändert keine Neon-/Cloudflare-Ressource, erzeugt keine Produktionssession und autorisiert keinen Release.

Auch bei erfolgreichem Rehearsal gilt daher:

- `productionDatabaseWriteAllowed = false`
- `productionSmokeExecutionAuthorized = false`
- `releaseAuthorized = false`
- `explicitApprovalStillRequired = true`

## 1. Produktionsmigrationen – Repository-Rehearsal

Der ULC-Slice baut keinen zweiten Migrationsexecutor. Verwendet werden weiterhin:

- Plan laden: `tooling/database-migration-executor.mjs#loadRepositoryMigrationPlan`
- spätere Ausführung: `tooling/database-migration-executor.mjs#applyRepositoryMigrationPlan`

Der konkrete aktuelle Produktionsplan ist auf exakt acht Migrationen in Manifest-Reihenfolge gepinnt:

1. Identity `0000_appbasis_identity_foundation.sql`
2. Identity `0001_appbasis_identity_foundation.sql`
3. Permissions `0000_appbasis_permissions_foundation.sql`
4. Permissions `0001_appbasis_permission_role_lifecycle.sql`
5. Permissions `0002_appbasis_permission_administration_audit.sql`
6. Permissions `0003_appbasis_principal_permission_administration_audit.sql`
7. ULC Lifecycle `0000_ulc_linz_lifecycle_scope.sql`
8. ULC Lifecycle `0001_ulc_linz_retention_deletion_claim.sql`

Für jede Migration werden nur Pfad, Statement-Anzahl und SHA-256-Digest ausgegeben. SQL-Inhalte und Connection Strings werden nicht in die Evidence übernommen.

## 2. Execution-bound Plan-Fingerprint

Der `planFingerprint` ist bewusst **kein reiner SQL-Datei-Fingerprint** mehr. Ein späterer Executor darf ein altes Rehearsal nicht wiederverwenden, wenn zwar die Migrationen unverändert sind, aber ein anderer zuvor validierter Runtime-/Smoke-Vertrag gilt.

Deshalb bindet der Fingerprint gemeinsam:

- alle acht Migrationen inklusive Owner, Pfad, Statement-Anzahl und Digest,
- `apps/ulc-linz/appbasis.database.json`,
- `apps/ulc-linz/appbasis.app.json`,
- `apps/ulc-linz/worker/app.ts`,
- `apps/ulc-linz/worker/authorization.ts`,
- den vollständigen erfolgreich validierten M6-Repository-Preflight,
- den kanonischen M6-Ausführungsplan,
- den gepinnten Production-Smoke-Vertrag.

Der Output enthält dafür ausschließlich SHA-256-Digests und keine Datei-, SQL-, Provider- oder Secret-Inhalte. Eine Änderung eines dieser Inputs verändert den `planFingerprint` und macht bestehende Rehearsal-Evidence für die spätere Ausführung unbrauchbar.

Der spätere produktive Lauf muss weiterhin zusätzlich erfüllen:

- ausdrückliche Freigabe für den konkreten Produktions-Write,
- frische, gebundene Provider-Evidence für die Ziel-DB,
- Backup-/Recovery-Zustand vorher geprüft,
- Recovery-/Rollback-Pfad vorher definiert,
- Ziel-DB stimmt mit der freigegebenen Produktionsressource überein,
- execution-bound `planFingerprint` entspricht dem frisch auf dem finalen Head berechneten Rehearsal,
- Migration danach verifiziert.

Die tatsächliche Datenbankidentität wird nicht im Repository gespeichert.

## 3. Production-Smoke-Vertrag

`post-deploy-smokes` bleibt ein `production-smoke-write`: Auth kann Session-State erzeugen, Denial-Fälle können Security-Events erzeugen. Deshalb bleibt auch dieser Schritt ausdrücklich freigabepflichtig.

Der aktuelle Vertrag verlangt:

- HTTPS Health über `GET /api/health`,
- erfolgreiche Anmeldung über `POST /api/auth/sign-in`,
- authentifizierten Session-Read über `GET /api/auth/session`,
- dedizierte Smoke-Identitäten statt realer Nutzer-Credentials,
- keinen automatischen Passwortwechsel durch den Smoke,
- Permission-Allow und deny-by-default an einer geschützten Operationsgrenze über `assertUlcLinzModuleAccess`,
- keine öffentliche Permission-/Smoke-Probe-Route,
- keine Fachmodul-Datenmutation,
- keinen automatischen Release aufgrund eines grünen Smokes.

Der aktuelle ULC-Stand besitzt `modules: []`. Deshalb wird kein fiktiver Fachmodul-Smoke behauptet. Sobald ein echtes Fachmodul in `appbasis.app.json` aufgenommen wird, muss das Rehearsal fail-closed angepasst werden.

## 4. Execution Binding

Der Rehearsal-Vertrag bleibt an `production-migrations`, `post-deploy-smokes` und `release-gate` gebunden. Ein späterer echter Executor muss fail-closed konsumieren:

- das frisch auf dem tatsächlichen finalen Head berechnete Rehearsal,
- den execution-bound `planFingerprint`,
- frische Provider-Evidence,
- die providergebundene Ziel-Datenbank,
- den hier gepinnten Smoke-Vertrag,
- das separate Release-Gate.

`futureExecutorMustConsumeBinding = true` bleibt damit eine ausführbare Sicherheitsgrenze und keine Dokumentationskonvention.

## 5. Stop-Bedingungen

Fail-closed blockieren insbesondere:

- App-/DB-Manifest-Drift,
- zusätzlicher, fehlender oder umsortierter Migration-Owner bzw. Migration,
- Drift der öffentlichen ULC-Routen,
- Drift des Permission-Smoke-Vertrags,
- neu hinzugefügtes Fachmodul ohne aktualisierten Smoke-Vertrag,
- öffentliche Permission-/Smoke-Probe,
- Drift des M6-Ausführungsplans,
- jede Änderung eines execution-bound Inputs bei Wiederverwendung alter Evidence.

## 6. Noch nicht ausgeführt

Dieser Slice bleibt reine Vorbereitung. Ein echter Produktionslauf benötigt vor jeder externen oder produktiven Aktion erneut aktuellen Live-/Provider-State und die ausdrückliche Nutzerfreigabe.
