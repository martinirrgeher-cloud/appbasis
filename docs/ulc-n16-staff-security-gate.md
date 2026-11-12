# N16 – Trainer-/Admin-Stellvertretung: Sicherheits-Gesamtpaket (noch NICHT aktiv)

**Status:** Entwickler-Draft, keine Freigabe zur Aktivierung eines HTTP-POST, kein Merge, kein Deploy.
**Baseline:** `main=e4d61f8df9b3c9ddcd55dd3f789229c8d3e4b7b8` (N17 vollständig abgenommen).
**Quelle:** früher getrennte und ungemergte PRs #573–#578, fachlich konsolidiert auf frischem N16-Branch. Bestehende PRs bleiben unverändert.

## Was dieser Gesamt-Draft nachweist

1. **Transaktionale Schreibgrenze:** `withAuthorizedRegistrationTransaction` akzeptiert erst nach dem erfolgreichen, im selben PostgreSQL-`begin` ausgeführten Guard einen eingeschränkten Writer. Bei Guard-Fehler kein Anlegen einer Session und kein Registrierungs-Write; fehlendes `begin` führt zu Fail-Closed. Das bisherige `withRegistrationTransaction` delegiert auf denselben Scoped-Helper und behält seine Semantik.
2. **Rollen-/Principal-/Mitgliedschafts-Entzug:** Echte isolierte PostgreSQL-E2E-Tests mit zwei Datenbank-Connections prüfen Sperrverhalten für Principal-Revoke, Rollen-Revoke und Trainer-/Athletengruppen-Entzug.
3. **Serverseitiger Staff-Guard (unverdrahtet):** User-Sperre, Identity-Sicherheitsstatus, genau eine aktive ULC-Mitgliedschaft, kanonische Principal-Rolle, aktive Rolle, effektives `kindertraining:edit`-Recht; ausschließlich Admin/Trainer, Funktionär fail-closed. Aktive eigene Gruppe im Modus `self_registration` unter `FOR SHARE`, bei Trainern aktive Gruppenzuordnung, Zielathlet mit gültiger Gruppenmitgliedschaft. Alle Lese-/Lockschritte laufen in derselben SQL-Transaktion.
4. **Automatischer Aktivierungsschutz:** Neuer CI-Test prüft, dass der Guard **nicht** in der aktiven HTTP-Router-/Selbstanmelde-Route verdrahtet ist; die bisherige Athleten-/Eltern-Stellvertretung bleibt unangetastet.

## Offenes zwingendes Security-Gate (P0)

Der bestehende `IdentityHttpService.resolveCurrentIdentity(request)` liefert `CurrentIdentity` mit `identityId`, aber **keine dauerhaft verifizierbare, kanonische Sitzung-ID an die ULC-App-Transaktion**. `AuthSession` enthält `sessionToken` als Cookie-Paar. Eine externe Session-Prüfung unmittelbar vor dem SQL-Write schützt NICHT gegen gleichzeitigen Logout, Session-Revoke, Session-Expiry oder Identity-Ban. Der jetzige Staff-Guard sperrt zwar User/Rollen/Rechte/Gruppe, aber **keine echte kanonische Better-Auth-Sitzungszeile**. Deshalb ist er alleine **KEINE** Autorisierung für einen produktiven Staff-POST.

**Vor Aktivierung explizit nachzuweisen:**
- Server authentifiziert die konkrete eingeloggte Sitzung. Der Actor kommt ausschließlich aus dem Trusted Context, nicht aus Client-JSON.
- Auth-Session-ID und Zuordnung Actor↔Session müssen atomar und **auf derselben SQL-Verbindung/Transaktion** mit Registrierungs-Write nachgeprüft bzw. gegen Logout/Revoke/Expiry gesperrt werden; keine Annahme über Cookie-Token-/Hash-Format ohne verifizierten Better-Auth-DB-Vertrag.
- Race-Tests **mit zwei echten Verbindungen**: Logout/Revoke während laufendem Guard blockiert oder verwirft sicher; abgelaufene Session denied; Scope/Organisation/Gruppe ändern sich nicht unbemerkt; Role/Permission/Mode/Target-Races denied; CAS-409, v17-Fristen/Triggers, Audit, Rollback der Session-/Registrierungsschreibungen korrekt.
- Kein Admin-Bypass, Funktionär nicht berechtigt, keine Cross-Org-/Cross-Group-Berechtigung; kein Second-Actor-/Proxy-Write durch nicht autorisierte Client-Parameter.
- Erst nach diesem Nachweis eigene explizite Freigabe für Staff-POST-HTTP/UI; **nicht** durch CI-PASS dieses Infrastruktur-PRs ersetzen.

## CI / Bewertung

- Verbindlicher `test:postgres` inkludiert den Transaktions-, Staff-Guard- und Group-Revoke-E2E, zusätzlich kommen Principal-/Role-Revoke-E2Es über das `@appbasis/permissions`-E2E-Glob.
- `test/n16-staff-write-gate.test.ts` blockiert verfrühte API-Verdrahtung.
- Quality Gate: Typecheck, Unit/Chromium, Build. Identity/PostgreSQL E2E: Isolation, Zwei-Verbindungs-Row-Locks, Revoke und Rollback.
- **Dieser Draft enthält keinen neuen Endpunkt, keine produktive Berechtigung, keine DB-Migration, keine Cloudflare-Änderung und keine Benutzeroberfläche.**

**Merge-/Deploy-Entscheidung:** Separat durch Betreiber. Vollständiger CI-PASS darf als PASS für diesen *inaktiven Sicherheits-Unterbau*, keinesfalls als Freigabe einer Staff-Funktion, gewertet werden.
