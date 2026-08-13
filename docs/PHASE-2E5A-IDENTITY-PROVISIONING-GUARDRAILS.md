# Phase 2E5A – Identity Provisioning Guardrails

## Ziel

Die produktive Identity-Schicht schließt zwei beim Reference-Demo-Bootstrap sichtbar gewordene Invarianten zentral statt app-lokal zu kompensieren:

1. technische Better-Auth-Administratoren dürfen während einer AppBasis-Provisionierung nicht in `appbasis_identity_security_state` übernommen werden;
2. `IdentityService.createInitialUser(...)` muss den tatsächlichen aktuellen Better-Auth-Accountstatus zurückgeben und darf ihn bei Reconciliation/Retry nicht pauschal als `active` melden.

Zusätzlich wird die vorhandene administrative Provisionierungsgrenze so gehärtet, dass auch der Existing-User-Reconciliation-Pfad vor dem Providerzugriff eine real authentifizierte, aktive technische Better-Auth-Admin-Session verlangt.

## Scope

- ausschließlich `packages/identity`, fokussierte Identity-Tests und dieses Scope-Dokument
- `BetterAuthIdentityBackend.createUsernameAccount(...)` authentifiziert die konfigurierte administrative Session vor jeder Existing-/Create-Entscheidung und prüft den zugehörigen Better-Auth-User serverseitig auf aktive technische Adminrolle
- `PostgresIdentityStateStore.completeProvisioning(...)` sperrt den Ziel-Better-Auth-User im selben PostgreSQL-Transaction-Kontext per `FOR UPDATE` und lehnt technische Adminrollen vor dem ersten Insert in AppBasis-Identity-State ab
- `IdentityService.createInitialUser(...)` liest den aktuellen Accountstatus über `getAccountStatus(...)` sowohl bei abgeschlossenem Retry als auch nach neuer/fortgesetzter Provisionierung
- Unit-Tests für tatsächlichen Accountstatus
- reale PostgreSQL-E2Es für ungültige/nicht-administrative Provisionierungs-Sessions, technische Admin-Zielkonten und deaktivierte/reconciliierte Accounts

## Harte Grenzen

- keine Änderung der Better-Auth-Tabellen oder Identity-Migrationen
- keine neue Datenbankmigration
- keine neue öffentliche Provider-Abstraktion
- keine Business-Permission-Logik und keine Gleichsetzung von Better-Auth-Admin mit AppBasis-Businessrolle
- keine Benutzerverwaltungs-, Recovery- oder HTTP-Endpunkte
- keine Änderungen an `apps/reference` in diesem PR
- kein Deployment, keine Secrets und keine externe Ressource
- keine Dependency- oder Lockfile-Änderung

## Sicherheitsverhalten

- eine leere, gefälschte, abgelaufene, deaktivierte oder nicht-administrative Session kann auch einen bereits existierenden Better-Auth-User nicht provisionieren/reconcilen
- unmittelbar vor AppBasis-State-Persistenz wird die Zielrolle unter PostgreSQL-Zeilensperre geprüft; eine bereits erfolgte oder konkurrierend vor der Sperre commitete Promotion zu technischem Admin blockiert die Provisionierung
- kein Better-Auth-Account mit technischer `admin`-Rolle wird durch `completeProvisioning` in AppBasis-Identity-State aufgenommen
- der Guard verändert Better-Auth-Rollen nicht und verleiht keinerlei Business-Berechtigungen
- ein späterer, außerhalb dieses Provisionierungsvorgangs bewusst ausgeführter Better-Auth-Rollenwechsel ist nicht Teil dieses Slices
- `createInitialUser` meldet `disabled`, wenn Better Auth den betreffenden Account aktuell als gesperrt meldet – auch bei idempotentem Retry

## Abnahmekriterien

- Existing-User-Reconciliation benötigt real verifizierte technische Admin-Autorisierung
- technische Better-Auth-Admin-Zielkonten können nicht in AppBasis-Identity-State persistiert werden
- die Zielrollenprüfung und AppBasis-State-Persistenz liegen in derselben PostgreSQL-Transaktion und verwenden eine Zeilensperre auf dem Better-Auth-User
- `createInitialUser` verwendet `getAccountStatus` statt hardcodiertem `active`
- Unit- und reale PostgreSQL-Tests decken positive und negative Fälle ab
- bestehende Username-, Erstpasswortwechsel-, Disable-, Retry-/Recovery- und Session-Semantik bleibt grün
- frozen install, Repo-Verify, Typecheck, Unit-Tests, realer Identity-PostgreSQL-E2E, Build und `git diff --check` bleiben grün

Nicht mergen, bevor Exact-Head-CI und finaler Codex-Review sauber sind.
