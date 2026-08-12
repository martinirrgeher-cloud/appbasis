# Phase 2B – Real PostgreSQL + Better Auth E2E

## Ziel

Phase 2B validiert die in Phase 2A gemergte Identity-/Persistenzbasis gegen echtes PostgreSQL und Better Auth mit fokussierten End-to-End- und Fehlerpfadtests.

## Harte Grenzen

- kein Produktivdeployment und keine externen kostenpflichtigen Ressourcen
- keine Secrets im Repository
- keine neue Auth-Provider-Abstraktion
- kein allgemeiner Saga-/Outbox-/Workflow-Unterbau
- keine Änderungen am fachneutralen Tasks-Demo-Slice aus PR #11
- Better Auth bleibt konkrete interne Implementierung hinter der AppBasis-Identity-Grenze
- bestehende Migration-Ownership bleibt unverändert: Identity besitzt Identity-Schema und -Migrationen, Database nur neutrale Primitiven

## Bevorzugter Testpfad

Für CI soll echtes, ephemeres PostgreSQL als GitHub-Actions-Service verwendet werden. Dadurch brauchen die Tests keine Neon-Credentials und bleiben reproduzierbar. Lokale Ausführung darf über eine `DATABASE_URL` gegen PostgreSQL möglich sein, ohne Docker als Pflicht für Entwickler zu machen.

## Abnahmekriterien

1. Identity-Migrationen werden gegen leeres echtes PostgreSQL reproduzierbar angewendet.
2. Better-Auth-Username-Login funktioniert Ende-zu-Ende mit dem verbindlichen Username-Vertrag `[a-z0-9._]{3,30}`.
3. Admin-Provisionierung erzeugt einen Benutzer mit temporärem Passwort und `mustChangePassword`.
4. Verpflichtender Erst-Passwortwechsel funktioniert E2E und widerruft andere Sessions wie vorgesehen.
5. Deaktivierung verhindert weitere Anmeldung und aktive Sessions werden beendet.
6. Fokussierte Failure-/Retry-Szenarien prüfen die durable Identity-Reconciliation auf realer PostgreSQL-Semantik, einschließlich request-scoped Idempotency beim Passwortwechsel.
7. AppBasis-Operationstabellen enthalten keine Passwörter, Passwort-Hashes, Credentials oder Provider-Payloads.
8. Bestehende Repo-CI bleibt grün; neue E2E-Prüfung ist deterministisch und klar getrennt.

## Nicht Teil von Phase 2B

- Produktions-Neon-Projekt oder Deployment
- Permissions
- Tasks-Persistenz
- Files/Notifications/Workflow/Realtime
- Generator/Provisioning-Control-Plane
