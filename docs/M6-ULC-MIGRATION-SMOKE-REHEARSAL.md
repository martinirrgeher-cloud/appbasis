# M6 – ULC Linz Migration-/Smoke-Rehearsal

## Zweck

Dieser Slice bereitet `production-migrations` und `post-deploy-smokes` ohne Produktionswirkung vor. Er verbindet sich nicht mit einer Produktionsdatenbank, führt kein SQL aus, verändert keinen Provider, loggt sich nicht in Produktion ein und autorisiert keinen Release.

Auch bei erfolgreichem Rehearsal bleiben `productionDatabaseWriteAllowed=false`, `productionSmokeExecutionAuthorized=false`, `releaseAuthorized=false` und `explicitApprovalStillRequired=true`.

## 1. Produktionsmigrationen

Es wird ausschließlich der bestehende gemeinsame Migrationsexecutor verwendet:

- Plan: `tooling/database-migration-executor.mjs#loadRepositoryMigrationPlan`
- spätere Ausführung: `tooling/database-migration-executor.mjs#applyRepositoryMigrationPlan`

Der konkrete ULC-Plan umfasst acht Migrationen in Manifest-Reihenfolge: zwei Identity-, vier Permissions- und zwei ULC-Lifecycle-Migrationen. Für jede Datei werden nur Owner, Pfad, Statement-Anzahl und SHA-256-Digest in die Evidence aufgenommen.

Der spätere produktive Lauf benötigt weiterhin eine ausdrückliche Freigabe, frische gebundene Provider-Evidence, Recovery-Precheck, Sicherungs-/Rollbackpfad, exakte Ziel-DB-Bindung und nachgelagerte Migrationsverifikation.

## 2. Exact-Head-Bindung

Rehearsal-Evidence gilt nur für den **exakten sauberen Repository-Head**, auf dem sie erzeugt wurde.

`evaluateUlcLinzM6MigrationSmokeRehearsal()`:

- liest `git rev-parse --verify HEAD`,
- akzeptiert nur einen vollständigen 40-stelligen Commit-SHA,
- verlangt einen sauberen Worktree über `git status --porcelain=v1 --untracked-files=all`,
- blockiert bei nicht verifizierbarem Head mit `REPOSITORY_HEAD_UNVERIFIED`,
- blockiert bei lokalen Änderungen oder untracked Dateien mit `REPOSITORY_HEAD_DIRTY`,
- übernimmt `repositoryHeadSha` in `validatedInputDigests`,
- bindet diesen SHA damit direkt in den `planFingerprint` ein.

Dadurch invalidiert **jeder neue Commit** die alte Rehearsal-Evidence, auch wenn Migrationen und semantische Snapshots gleich geblieben sind. Das schließt insbesondere Änderungen am Migrationsexecutor, Production-Preflight, Rehearsal selbst oder deren Implementierungsabhängigkeiten ein.

Der spätere Executor muss den verifizierten Head zusammen mit dem Plan-Fingerprint konsumieren. Eine Evidence von einem anderen Head darf nicht wiederverwendet werden.

## 3. Weitere execution-bound Inputs

Zusätzlich zum exakten Head bindet der Fingerprint weiterhin:

- Datenbankmanifest,
- App-Definition,
- öffentliche ULC-Runtime,
- Permission-/Authorization-Smoke-Vertrag,
- validierten Repository-Preflight,
- kanonischen M6-Ausführungsplan,
- Smoke-Vertrag,
- alle acht Migrationen.

Die Head-Bindung ersetzt diese inhaltlichen Digests nicht; sie ergänzt sie um die vollständige Repository-Provenienz.

## 4. Production-Smoke-Vertrag

`post-deploy-smokes` bleibt ein `production-smoke-write`, weil Auth-Smokes Session-State und Denial-Fälle Security-Events erzeugen können. Deshalb sind dedizierte Smoke-Identitäten und eine ausdrückliche Freigabe erforderlich.

Geprüft werden:

- `GET /api/health`,
- `POST /api/auth/sign-in`,
- `GET /api/auth/session`,
- geschützter Permission-Allowed- und Denied-Fall über `assertUlcLinzModuleAccess`,
- Unknown-Capability deny-by-default,
- aktueller Application-Scope.

Es wird keine öffentliche Permission-/Smoke-Probe erfunden. Der aktuelle ULC-Stand hat `modules: []`; daher wird kein fiktiver Fachmodul-Smoke behauptet. Sobald ein echtes Fachmodul hinzukommt, muss der Vertrag fail-closed angepasst werden.

## 5. Execution Binding

Der Rehearsal-Vertrag ist an `production-migrations`, `post-deploy-smokes` und `release-gate` gebunden. Er verlangt insbesondere:

- `migrationPlanFingerprintRequiredAtExecution=true`,
- `freshProviderEvidenceRequiredAtExecution=true`,
- `providerBoundTargetRequiredAtExecution=true`,
- `verifiedRepositoryHeadRequiredAtExecution=true`,
- `cleanRepositoryRequiredForRehearsal=true`,
- `rehearsalMustBeRecomputedOnFinalHead=true`,
- `smokeContractRequiredAtExecution=true`,
- `futureExecutorMustConsumeBinding=true`.

Ein grüner Smoke ersetzt niemals M4/M5 oder die separate Release-Freigabe.

## 6. Output und Stop-Bedingungen

Der Output enthält nur Evidence wie Head-SHA, Digests, Counts, Plan-Fingerprint und Smoke-Vertrag; keine SQL-Inhalte, Provider-Credentials, Connection Strings oder Produktions-IDs.

Fail-closed blockieren insbesondere ein nicht verifizierbarer/unsauberer Repository-Head, Manifest-/Migration-Drift, unsichere Migrationen, geänderte öffentliche Routen, neue Fachmodule ohne aktualisierten Smoke-Vertrag, öffentliche Probe-Routen oder Drift der M6-Schrittklassifikation.

## Noch nicht ausgeführt

Dieser Slice ist reine Vorbereitung. Jeder spätere produktive Schritt benötigt erneut aktuellen Live-/Provider-State und die ausdrückliche Nutzerfreigabe.
