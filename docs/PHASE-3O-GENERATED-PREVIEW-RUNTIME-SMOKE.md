# Phase 3O – Generated Preview Runtime Boundary Smoke

## Ziel

Phase 3O erweitert den realen Generated-Preview-Nachweis aus Phase 3N um einen sicheren fachlichen Negativ-Smoke. Nach dem erfolgreichen `/api/health`-Check muss der deployte `tasks-minimal` Worker auch einen geschützten Request über seine normale request-scoped PostgreSQL Application Runtime annehmen und ohne Sitzung exakt fail-closed ablehnen.

Der Slice verändert weder die Worker-Architektur noch die Deployment-Verantwortlichkeiten.

## Verifizierter Request

Der Generated-Preview-Smoke führt nach dem Health-Check zusätzlich aus:

- `GET /api/tasks`
- ohne `Cookie`
- ohne `Authorization`
- erwarteter Status: `401`
- erwarteter Fehlercode: `SESSION_INVALID`
- erwartete Meldung: `A valid session is required.`
- die Antwort darf keine Sitzung per `Set-Cookie` etablieren

Der Request läuft nicht über den Health-Sonderpfad. Damit muss der Worker zuerst seine normalen Runtime-Bindings validieren und die generierte Application Runtime konstruieren, bevor die Tasks-Route an der Identity-Session-Grenze fail-closed beendet wird.

## Architekturgrenzen

Unverändert verbindlich:

- `/api/health` bleibt ohne Datenbank- und Secret-Bindings erreichbar.
- Fachliche Requests benötigen `HYPERDRIVE.connectionString`, `APPBASIS_BASE_URL` und `BETTER_AUTH_SECRET`.
- Die normale Worker-Runtime bleibt request-scoped und PostgreSQL-basiert.
- Es gibt keinen In-Memory-Fallback in der normalen Worker-Runtime.
- Migrationen, Permission-Provisionierung, Benutzer-Provisionierung und Admin-APIs werden nicht in den Worker oder den normalen Deploy-Workflow aufgenommen.
- Deployment-Inputs bleiben außerhalb des App-Manifests.
- Der Smoke verwendet keine Benutzer-, Passwort-, Root-Admin- oder Demo-Credentials.
- Der Smoke mutiert keine fachlichen Daten.

## Was dieser Slice bewusst noch nicht beweist

Der anonyme `GET /api/tasks` endet an der Session-Grenze. Deshalb ist Phase 3O **kein** Nachweis für:

- vollständig migrierte Preview-Datenbankschemata,
- vorhandene Permission-Grants oder Rollenbundles,
- erfolgreiche Benutzeranmeldung,
- authentifizierte Task-Lese- oder Schreibzugriffe,
- einen produktionsreifen Deployment-Control-Plane.

Diese Nachweise gehören in spätere, separat abgegrenzte Deployment-/Provisioning-Slices. Insbesondere werden sie nicht dadurch vorweggenommen, dass Migrationen oder Provisionierung in die normale Worker-Runtime verschoben werden.

## Akzeptanzkriterien

Phase 3O ist abgeschlossen, wenn:

1. der bestehende Generated-Preview-Health-Smoke weiterhin erfolgreich ist,
2. der neue anonyme `/api/tasks`-Smoke exakt `401 SESSION_INVALID` prüft,
3. der Smoke keine Credentials sendet und keine Sitzung akzeptiert,
4. unerwartete Statuscodes oder Payloads fail-closed behandelt werden, ohne Response-Inhalte oder Infrastrukturdetails in Fehlermeldungen zu übernehmen,
5. der Generated-Preview-Deploy weiterhin weder Migrationen noch Provisionierung ausführt,
6. Unit-/Contract-Tests, Repository-CI und finaler Review auf demselben Head-SHA erfolgreich sind,
7. nach dem Merge ein realer Generated-Tasks-Preview-Deploy auf dem neuen `main` den erweiterten Remote-Smoke erfolgreich ausführt.
