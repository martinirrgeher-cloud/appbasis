# P03-H – atomarer Gruppen-/Trainer-/Registrierungs-Actor-Scope (Draft)

**14.11.2026 – separate, noch nicht aktivierte P03-H-Erweiterung zum P03-G-Writer-Guard.**

## Ausgangslücke

P03-G schützt aktive kanonische Athletenzeilen gegen den ATHLETES-Delete, prüft aber **nicht atomar** den aus UI-Snapshots übernommenen Gruppen-/Trainer-Roster und auch keine aktive Identitätszuordnung bei Self-Registration. Zwischen Daten-Lesen und SQL-Schreiben können eine Gruppendeaktivierung, der Austritt eines Athleten/Trainers und der Entzug der Actor-Membership erfolgt sein.

## Umsetzung – nur expliziter Opt-in

Im echten `PostgresUlcTrainingSessionRepository` steht zusätzlich der Guard-Modus `require-live-athlete-group-transaction` bereit. **Default bleibt `legacy`; P03-G-Mode bleibt unverändert.** Der Modus wird in `createGeneratedPostgresApplicationRuntime` lediglich als optionale Konfiguration durchgereicht; kein Worker aktiviert ihn.

- Bereits aus P03-G: `BEGIN`, aktuelle aktive Athleten unter `FOR SHARE`, kanonische Löschmarkertabelle, fail-closed.
- `saveSession`: aktive Vereinsgruppe unter `FOR SHARE`. Jede übermittelte Athleten-ID hat exakt eine zum Sitzungstag gültige Gruppenzuordnung, gesperrt unter `FOR SHARE`. Bei Traineranwesenheit werden **alle** vom Service als auswählbar bezeichneten und alle selektierten Trainer erneut unter `FOR SHARE` als aktiv und aktuell der Gruppe zugeordnet geprüft. Die früher gelesene UI-Trainerliste ist keine Autorität für den SQL-Write. Fehlt eine Quelle oder Zuordnung: die Transaktion schreibt nichts.
- `saveRegistration`: gesperrte geplante Sitzung, aktive `self_registration`-Gruppe, gültige Mitgliedschaft der Zielperson **und** ggf. des Proxy-Athleten. Die wirkliche `actorIdentityId` muss aktuell eine aktive `ulc_linz_membership` mit `source_role='athlete'` zum handelnden Athleten sowie die explizite `ulc_linz_subject_scope`-Relation `self` haben. Der DB-Check hält die vorhandenen Zeilen gesperrt, bis Registrierung, Notiz und Änderungshistorie geschrieben sind.
- Ablehnung über internen `UlcTrainingScopeWriteBlockedError`; keine nach außen behauptete erfolgreiche Speicherung. P03-G-geschütztes `withRegistrationTransaction` bleibt atomar und rollt neue Sessions im Fehlerfall zurück.
- Kein neues Schema, Trigger, Berechtigung, Anbieteradapter oder Datumslöschvertrag. Keine Produktions-/Preview-/Google-Änderung.

## Abnahme und echte Grenzen

`test/p03-live-training-session-writer-scope.postgres.e2e.test.ts` läuft mit **12** realen Testfällen ausschließlich auf einer Wegwerf-PostgreSQL-Datenbank mit exakt den bestehenden **41** Migrationen: gültige U12-Trainerliste und Selbstanmeldung, vorzeitig beendete Athleten- und Trainerzuordnung, inaktive Gruppe, gelöschte Actor-Membership und Self-Scope, Proxy-Entzug sowie zwei echte 2-Connection-Race-Reihenfolgen. CI muss Quality Gate + PostgreSQL E2E auf exaktem PR-Head bestehen.

**Sicherheits-Grenzen / weiterhin BLOCKED:**

1. `saveSession` erhält aktuell **keine Actor-Identity** im Repository-API. Die vorgelagerte Rolle-/Fähigkeitsprüfung (S3/S4) wird nicht atomar innerhalb derselben SQL-Transaktion wiederholt. Eine vollständige Trainer/Admin-Revoke-Sperre erfordert eine separat durchgeführte API- und Rollen-/Grant-Integration.
2. Die gesperrten **vorhandenen** Mitgliedschaftszeilen schützen UPDATE/DELETE-Revocation, aber nicht alle INSERT-Phantome, parallele neue Doppelzuordnungen oder direkte SQL-Schreiber ohne gleichen Guard.
3. Direkte SQL-Bypässe, weitere App-Owner, Datenbank-Restore, relevante Providerkopien, Identitäts-/Rollen-Grant-Revoke, Trainingsnotizen über Dritte und Cross-Owner-Erasure bleiben ungeprüft. Es wird **keine** vollständige App-/DSGVO-/Produktivfreigabe beansprucht.
4. Dieses Paket darf `privacy=blocked`, `applicationLifecycle=blocked`, P01-D2/35-Tage-`postExpiryRetry=deny`, P02-/P03-Owner-Gates und das bisherige produktive Datenbankschema nicht verändern. Kein Merge/Deploy ohne gesonderte Betreiberfreigabe.

**Nächstes sinnvoll abgegrenztes Paket:** P03-I – Actor/Trainer-Rollen und Permissions-Grant-Revoke atomar in der gemeinsamen Trainingswriter-Transaktion, mit echter Rollen-/Mitgliedschafts-Writer-Serialisierung und PostgreSQL-Races; danach direkter-SQL-Fence und vollständiger Restore-/Owner-Check.
