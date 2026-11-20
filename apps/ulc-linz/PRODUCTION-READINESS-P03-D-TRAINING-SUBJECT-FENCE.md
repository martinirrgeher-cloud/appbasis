# P03-D – App-owned Anwesenheit/Anmeldung: No-Resurrection-Schreibsperre (Kandidat)

**Stand 20.11.2026: DRAFT / nur isolierte Tests, nicht in Preview/Production installiert.**

## Konkrete Lücke

Die vorhandenen echten P03-C-Tests in `apps/ulc-linz/test/p03-stale-training-writers.postgres.e2e.test.ts` zeigen **absichtlich noch erfolgreich**:

- Ein alter Trainer-Speicherstand schreibt nach isoliertem Löschen wieder Anwesenheitszeilen für denselben Athleten.
- Eine veraltete Selbstanmeldung legt Registrierung **und Änderungshistorie** neu an.
- Selbst direkter SQL-INSERT ist ohne app-eigene Löschmarker-/Trigger-Absicherung möglich.

Eine fachliche Datenlöschung darf daher aktuell **nicht** als im produktiven ULC-Trainingsbereich wirksam bestätigt werden. Bestehende Handy-PASS beziehen sich nur auf Bedienung/Speichern, nicht auf diese Lebenszyklusgarantie.

## Umsetzung dieses Drafts

Ein unregistriertes SQL-Entwurfsfile `apps/ulc-linz/test/fixtures/p03-d-training-subject-write-fence.candidate.sql` beschreibt:

1. Eine app-eigene, organisations- und athletengebundene Löschmarkertabelle `ulc_linz_training_subject_deletion` mit 35-Tage-Quellfenster, **ohne** automatisches Auslaufen/Purge.
2. Eine `SECURITY DEFINER`-Triggerfunktion mit festem `pg_catalog`-Suchpfad und pro Organisations-/Athletenpaar identischem Transaktions-Advisory-Lock; sie prüft den Löschmarker unmittelbar vor alten und neuen Writes. Zusätzlich muss die zugehörige Trainingseinheit mit **genau derselben Organisation** vorhanden sein; eine fremde `organization_id` darf keinen Löschmarker umgehen.
3. Drei INSERT-/UPDATE-Trigger auf `ulc_linz_training_attendance`, `ulc_linz_training_registration`, `ulc_linz_training_registration_change`; alle verweigern nach Erasure-Markierung neue Inserts und Ownership-Wechsel, lassen Nachbarathleten/andere Organisationen unverändert.
4. `REVOKE ALL` auf die private Triggerfunktion; keine GRANTs/Runtime-Freischaltung.

Die App-Migrationsliste verbleibt ausdrücklich bei Version 16. Kalender-v17 und die Übungskatalog-v5-Arbeiten werden in diesem Draft **nicht** registriert oder ausgeführt.

## Reproduzierbare isolierte PostgreSQL-Abnahme

`tooling/ulc-linz-p03-d-subject-fence.postgres.test.mjs` nutzt ausschließlich die lokale PostgreSQL-18-CI-Datenbank, darin eine neue Wegwerf-DB mit den tatsächlich betroffenen Original-SQL-Migrationen (0004/0008/0010). Der Test beweist:

- Abbruch während SQL-Installation rollt neue Tabelle/Funktionen/Trigger zurück.
- Fehlversuch der Markierung/Löschung rollt **sämtliche** Teillöschungen und den Marker zurück.
- Nach atomarer Markierung und Löschen der drei app-owned Referenztypen scheitern **drei** direkte SQL-Reinserts (Anwesenheit, Selbstanmeldung, Verlauf) am PostgreSQL-Trigger, selbst bei abgelaufenem Marker.
- Fremdorganisation und anderer Athlet behalten ihre Daten und können weiterbearbeitet werden; ein stiller Ownership-Wechsel wird abgewiesen.
- Eine synthetische normale NOLOGIN-App-Rolle kann den Marker nicht INSERTen, ändern oder löschen; auch ihr normal erlaubter Attendance-Write wird bei bereits gelöschtem Subjekt abgewiesen.
- `tooling/ulc-linz-p03-d-subject-fence.test.mjs` verlangt drei exakte Trigger und ein unverändertes Live-Migrationsmanifest.

## Grenzen – noch kein Echtbetriebsgate

- Dies ist ein **Datenbankmechanismus als Draft**, keine Berechtigung, eine produktive Löschung auszuführen. Der reale, derzeit absichtlich frozen-only Repositorypfad `training-subject-history-deletion-postgres.ts` wurde **nicht** in einen Live-Löschdienst umgebaut. Eine künftige privilegierte Operation müsste zuerst den kanonischen Athleten-Owner-Löschbeleg und Adminscope verifizieren und dann unter **demselben advisory lock** Marker und die drei Deletes in **einer** Transaktion ausführen.
- Noch nicht abgedeckt: Traineranwesenheits-Identität, `updated_by_identity_id` / `actor_identity_id` als **Akteursreferenzen**, gemeinsame Session-Notizen/Freitext, historische Fremdteilnehmer in Dokumentrevisionen, private R2-Medien, Restore-/Backups und alle anderen Owner. Der Drei-Tabellen-Marker darf **niemals** als Nachweis vollständiger Vereinsdatenlöschung gewertet werden.
- Die künftige normale App-Rolle darf weder auf die Markertabelle DML/`TRUNCATE` haben, noch Trigger deaktivieren können. Der Marker gehört dem privilegierten app-owned Löschkoordinator, nicht dem regulären Worker.
- Für Echtbetrieb weiterhin BLOCKED: P01/D2-Aufbewahrungsentscheidung, Marker-/Restoreautorität, Rollenabnahme, echter isolierter DB-Klon-/In-place-Test, bestätigter Löschablauf, fokussierte Handytests und separate Betreiberfreigabe.

**Ergebnis:** Aus einer bekannten und bereits dokumentierten Wiederanlage-Lücke wurde ein konkret getesteter, aber weiterhin nicht aktivierter SQL-Lösungsentwurf. Kein Merge, kein Deployment, keine Neon-/Cloudflare-/R2-Änderung. Verknüpft #607 / #530 und P02-F.
