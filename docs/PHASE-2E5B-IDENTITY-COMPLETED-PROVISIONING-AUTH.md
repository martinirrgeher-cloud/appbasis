# Phase 2E5B – Identity Completed Provisioning Authorization Guard

## Ziel

Jeder Aufruf der produktiven Identity-Provisionierung muss eine aktuell gültige, aktive technische Better-Auth-Admin-Session nachweisen, auch wenn die Provisionierungsoperation bereits vollständig abgeschlossen ist und nur idempotent reconciled wird.

## Scope

- `IdentityService.createInitialUser(...)` erhält einen von der produktiven Runtime gebundenen Provisionierungs-Autorisierungsschritt, der vor jedem Zugriff auf Provisionierungs-/Reconciliation-State ausgeführt wird.
- `BetterAuthIdentityBackend` exponiert dafür ausschließlich die bereits bestehende Admin-Session-Prüfung; die eigentliche Better-Auth-Regel wird nicht dupliziert.
- `createIdentityRuntime(...)` bindet diesen Guard zwingend in die produktive Service-Composition ein.
- Der bestehende Guard in `createUsernameAccount(...)` bleibt als Defense-in-Depth bestehen.
- Ein fokussierter realer PostgreSQL-E2E beweist, dass ein nach erfolgreicher Provisionierung ausgeführter Retry mit gefälschter oder nicht-administrativer Session abgewiesen wird und keine Identity-Metadaten liefert.

## Harte Grenzen

- keine Migration oder Schemaänderung
- keine Reference-App-Änderung
- keine Permission-/Task-Änderung
- keine neue Auth- oder Provider-Abstraktion
- keine Dependency-/Lockfile-Änderung
- kein Deployment und keine externe Ressource
- bestehende Password-Change-, Disable-, Session- und Idempotenzsemantik bleiben unverändert

## Sicherheitsinvariante

Eine abgeschlossene Provisionierungsoperation ist kein Autorisierungsnachweis. Der aktuell aufrufende technische Administrator muss bei jedem produktiven `createInitialUser(...)`-Aufruf erneut authentifiziert und auf aktive Better-Auth-Adminrolle geprüft werden, bevor irgendein bereits vorhandener AppBasis-Identity-State gelesen oder zurückgegeben wird.

## Abnahmekriterien

- gültiger technischer Admin kann einen User provisionieren und denselben abgeschlossenen Bootstrap idempotent wiederholen
- gefälschte Session kann einen bereits vollständig provisionierten User nicht reconciliieren
- normale Better-Auth-User-Session kann einen bereits vollständig provisionierten User nicht reconciliieren
- bestehende zentrale Guards gegen technische Admin-Zielaccounts und Concurrent-Promotion bleiben bestehen
- frozen install, Repo-Verify, Typecheck, Unit-Tests, reale PostgreSQL-E2Es, Build und `git diff --check` bleiben grün

Nicht mergen, bevor Exact-Head-CI und finaler Codex-Review sauber sind.
