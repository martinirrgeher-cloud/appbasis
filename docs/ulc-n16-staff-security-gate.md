# N16 – Trainer-/Admin-Stellvertretung: Sicherheits-Gesamtpaket (noch NICHT aktiv)

**Status:** Entwickler-Draft, keine Freigabe zur Aktivierung eines HTTP-POST, kein Merge, kein Deploy.
**Baseline:** `main=e4d61f8df9b3c9ddcd55dd3f789229c8d3e4b7b8` (N17 vollständig abgenommen).
**Quelle:** früher getrennte und ungemergte PRs #573–#578, fachlich konsolidiert auf frischem N16-Branch. Bestehende PRs bleiben unverändert.

## Was dieser Gesamt-Draft nachweist

1. **Transaktionale Schreibgrenze:** `withAuthorizedRegistrationTransaction` akzeptiert erst nach dem erfolgreichen, im selben PostgreSQL-`begin` ausgeführten Guard einen eingeschränkten Writer. Bei Guard-Fehler kein Anlegen einer Session und kein Registrierungs-Write; fehlendes `begin` führt zu Fail-Closed. Das bisherige `withRegistrationTransaction` delegiert auf denselben Scoped-Helper und behält seine Semantik.
2. **Rollen-/Principal-/Mitgliedschafts-Entzug:** Echte isolierte PostgreSQL-E2E-Tests mit zwei Datenbank-Connections prüfen Sperrverhalten für Principal-Revoke, Rollen-Revoke und Trainer-/Athletengruppen-Entzug.
3. **Serverseitiger Staff-Guard (unverdrahtet):** User-Sperre, Identity-Sicherheitsstatus, genau eine aktive ULC-Mitgliedschaft, kanonische Principal-Rolle, aktive Rolle, effektives `kindertraining:edit`-Recht; ausschließlich Admin/Trainer, Funktionär fail-closed. Aktive eigene Gruppe im Modus `self_registration` unter `FOR SHARE`, bei Trainern aktive Gruppenzuordnung, Zielathlet mit gültiger Gruppenmitgliedschaft. Alle Lese-/Lockschritte laufen in derselben SQL-Transaktion.
4. **Automatischer Aktivierungsschutz:** Neuer CI-Test prüft, dass der Guard **nicht** in der aktiven HTTP-Router-/Selbstanmelde-Route verdrahtet ist; die bisherige Athleten-/Eltern-Stellvertretung bleibt unangetastet.
5. **Neu – atomare Session-Zeile:** `assertActiveUlcStaffSession(tx, trustedSessionId, actorIdentityId)` sperrt per `FOR SHARE` ausschließlich die exakte aktive, nicht-impersonierte Better-Auth-Sessionzeile in `"session"`; geprüft werden `session.id`, `session.user_id`, `session.expires_at > clock_timestamp()` und `impersonated_by IS NULL`. Fehlende/mismatched/abgelaufene Einträge sind DENY. Da das Session-ID-Feld **nicht** aus dem Client-JSON stammen darf, wird kein Token geparst oder eine unsichere Tokenannahme gemacht.
6. **Neu – geschlossene Transaktionskette:** `withGuardedUlcStaffRegistration` ruft unter demselben `begin` nacheinander Session-Guard, Staff-/Rollen-/Ziel-Guard, eingeschränkten Write und **nochmals eine Ablaufprüfung nach dem Write** auf. Eine abgelaufene Sitzung löst einen DB-Rollback aus. Die zwei-Verbindungs-E2E-Tests prüfen, dass ein konkurrierendes `DELETE FROM "session"` mit `55P03` scheitert, solange die gesperrte Transaktion läuft, und ein nachträglicher Löschvorgang den nächsten Guard verweigert.


## Offenes zwingendes Security-Gate (P0)

Der bestehende `IdentityHttpService.resolveCurrentIdentity(request)` liefert `CurrentIdentity` mit `identityId`, aber **keine dauerhaft verifizierbare, kanonische Sitzung-ID an die ULC-App-Transaktion**. `AuthSession` enthält `sessionToken` als Cookie-Paar. Eine externe Session-Prüfung unmittelbar vor dem SQL-Write schützt NICHT gegen gleichzeitigen Logout, Session-Revoke, Session-Expiry oder Identity-Ban. Der neu ergänzte **inaktive** Session-Guard sperrt eine kanonische `session.id`-Zeile bereits im selben DB-Transaktionskontext. **Es fehlt aber noch der vertrauenswürdige Identitäts-Bridge-Vertrag**, der genau diese ID aus der gültigen Better-Auth-Sitzung des HTTP-Requests liefert (ohne Client-Eingabe oder Cookie-Parsing). Noch nicht nachgewiesen ist, dass die echte Better-Auth-`sign-out`-/Revoke-/Passwortwechsel-Implementierung exakt jene Zeilen unter denselben Row-Locks ändert. Deshalb bleibt die Aktivierung produktiver Staff-POSTs **BLOCKED**.

**Vor Aktivierung explizit nachzuweisen:**
- Server authentifiziert die konkrete eingeloggte Sitzung. Der Actor kommt ausschließlich aus dem Trusted Context, nicht aus Client-JSON.
- Der serverseitige Better-Auth-Identitäts-Bridge muss die verifizierte `session.id` und `session.user_id` ohne Client-Einfluss liefern. Die DB-Row-Locks sind vorbereitet; reale Better-Auth-Sign-out-/Revoke-/Passwortwechsel-Races sind noch **nicht** nachgewiesen. Keine Cookie-Token-/Hash-Format-Annahme ohne Integrationsbeweis.
- Bereits mit zwei echten Verbindungen testbar: direktes `session`-DELETE blockiert während `FOR SHARE`, fehlende/abgelaufene/mismatched/impersonierte Session denied, Ablauf nach einem Write rollt die Transaktion zurück. Noch offen: **echtes** Better-Auth-`sign-out`-/Revoke-/Passwortwechsel-Race (statt direktem SQL-DELETE), Session-Actor-Bridge, CAS-409, v17-Fristen-/Trigger-Races und vollständiger Audit-Folgepfad. Bestehende Rollen-/Group-Race-Tests bleiben.
- Kein Admin-Bypass, Funktionär nicht berechtigt, keine Cross-Org-/Cross-Group-Berechtigung; kein Second-Actor-/Proxy-Write durch nicht autorisierte Client-Parameter.
- Erst nach diesem Nachweis eigene explizite Freigabe für Staff-POST-HTTP/UI; **nicht** durch CI-PASS dieses Infrastruktur-PRs ersetzen.

## CI / Bewertung

- Verbindlicher `test:postgres` inkludiert den Transaktions-, Staff-Guard- und Group-Revoke-E2E, zusätzlich kommen Principal-/Role-Revoke-E2Es über das `@appbasis/permissions`-E2E-Glob.
- `test/n16-staff-write-gate.test.ts` blockiert verfrühte API-Verdrahtung.
- Quality Gate: Typecheck, Unit/Chromium, Build. Identity/PostgreSQL E2E: Isolation, Zwei-Verbindungs-Row-Locks, Revoke und Rollback.
- **Dieser Draft enthält keinen neuen Endpunkt, keine produktive Berechtigung, keine DB-Migration, keine Cloudflare-Änderung und keine Benutzeroberfläche.**

**Merge-/Deploy-Entscheidung:** Separat durch Betreiber. Vollständiger CI-PASS darf als PASS für diesen *inaktiven Sicherheits-Unterbau*, keinesfalls als Freigabe einer Staff-Funktion, gewertet werden.
