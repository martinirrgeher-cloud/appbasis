# P2-E – Schema-Parität, Rollengrenze und Restore-Probe (ohne Providerwrite)

**Stand: 20.11.2026. Status: DRAFT / technische Rehearsal, nicht aktivieren.**

## Anlass und tatsächliche Datenbank-Evidenz

Rein lesende, rollenbezogene Neon-Abfragen am 19.11.2026 (nur `pg_catalog` und `has_table_privilege`, keine Nutzdaten) belegen:

| Zustand | Public-Tabellen | Aussage |
| --- | ---: | --- |
| Neon-Production-Projekt `appbasis-ulc-linz-production`, DB `neondb` | 51 | nicht das vollständige Modul-/ULC-Preview-Schema |
| Aktuell registriertes ULC-Manifestschema | **64** erwartet | 41 kanonische Owner-Dateien; noch keine Betreiberfreigabe zum Apply auf Production |
| Tatsächliche Preview `appbasis_ulc_linz_preview` | 66 | zusätzlich zwei v17-Kalendertabellen |
| Künftiges geschütztes Katalogschema | **68** als *Testkandidat* | plus zwei bisher nur isolierte P02-G-/P02-H-Schutzrelationen |

Die 15 in Production fehlenden, in Preview vorhandenen Tabellen liegen bei den Ownern Athleten (1), Trainingsblöcke (3), Trainingsdokumentation (3), Trainingspläne (1) und ULC-App (7). Die genaue Zuordnung jeder fehlenden Tabelle zu **genau einer** vorhandenen DDL-Datei steht maschinenlesbar im Ergebnis von `loadUlcP02ParityRehearsalPlan`. Der Plan verweigert jetzt auch **falsche Originaldateien trotz gleicher Owner-Gruppe** sowie **Owner-Wurzel-/Manifestverschiebungen**. Die 15 erwarteten Dateipfade und beide unveröffentlichten Fixture-Dateien werden exakt gegengetestet. Achtung: `apps/ulc-linz/migrations/0016_ulc_linz_registration_calendar.sql` ist als Datei vorhanden, jedoch **nicht** Teil des aktuellen `appbasis.database.json` (Schema-Version 16, nur 0015). Der kontrollierte v17-Kalenderschritt darf **nicht** als automatisch vom Manifest miterledigt gelten.

**In Preview zusätzlich fehlend:** `appbasis_exercise_catalog_favorite_deletion` und `appbasis_exercise_catalog_usage_subject`. Das sind derzeit **nur** die unveränderten P02-G/H-Test-Fixtures, ausdrücklich keine registrierte Katalog-Modulmigration. Ihre Übernahme erfordert einen separaten Owner-v5-Migrationsvertrag mit Test/Review/Approval, keine Copy/Paste- oder GRANT-Schnellreparatur.

**Preview-App-Rolle, konkrete Rechte-Lücke:** `appbasis_training_block_usage_subject`: SELECT + INSERT fehlen; `appbasis_training_block_usage_subject_deletion`: SELECT fehlt. Die übrigen geprüften Katalog-Haupt-/Child-/Favoritenrechte und Plan-Reader-Rechte sind vorhanden. Für zukünftige Freigaben ist der minimale, nachweisbar widerrufbare Rollen-Scope zu prüfen; der gewöhnliche Worker darf **keine** Löschmarker INSERT/UPDATE/DELETE/TRUNCATE erhalten.

## Neues deterministisches technisches Gate

- `tooling/ulc-linz-p02-parity-rehearsal.mjs`: **rein lesender, connection-freier** Evaluator für exakte 51/66-Tabelleninventare ohne personenbezogene Daten. Er nimmt keine Datenbank-URL an und führt weder Schema- noch Rollenänderungen aus. Bei Abweichungen, zusätzlichen Tabellen, unvollständigen oder doppelten Ownern wird abgebrochen.
- Der Plan lädt alle 41 bereits registrierten Migrationen, die **unregistrierte** v17-Kalendermigration und die **unregistrierten** zwei Katalog-Kandidaten. Exakt 15 Produktionslücken und beide Kandidatentabellen müssen ihren eindeutigen Datei-Owner behalten. SQL-Fingerprints/Statementzahl sind überprüfbar. `status=review-only`, `migrationExecutionAuthorized=false`, `providerWritesAllowed=false`.
- `tooling/ulc-linz-p02-parity-rehearsal.postgres.test.mjs`: Nur in lokaler CI-PostgreSQL-18-Datenbank `postgres://postgres@localhost:5432/appbasis_identity_e2e` (keine Neon-/Cloudflare-Verbindung). Eine neue isolierte Testdatenbank wird angelegt und nach Testende entfernt. SQL vom Manifest führt zu 64 Tabellen, zusätzlich v17 zu 66; synthetischer Fehler im Katalog-Kandidaten-Apply lässt die DB vollständig auf 66 zurückrollen; beide Kandidaten führen zusammen zu 68, inklusive exakt verknüpfter Subject-Usage-FK.
- Ein **synthetischer NOLOGIN-Rolle** werden exakt die für die neue Schutzfunktion benötigten Leserechte und Block-Subject-Usage SELECT/INSERT erteilt. Negative echte SQL-Transaktionen prüfen, dass Favoriten- und Blocklöschmarker nicht geschrieben oder gelöscht werden dürfen. Das sind ausschließlich Test-Rollen/Grants **in der Wegwerf-DB**, **keine Neon-Rollenänderungen**.
- **Restore-Negativfall:** Eine synthetische ältere PostgreSQL-Datenbankkopie wird *vor* einer Eigentümer-Löschentscheidung angefertigt, danach wird ein exakt organisations- und principalgebundener Löschmarker gesetzt und ein Favorit entfernt. Die alte Kopie enthält den Favoriten wieder und den neueren Marker nicht. `assessUlcP02CatalogRestoreMarkers` verweigert darum die Wiederfreigabe. Nur nach synthetischer markergebundener, transaktionaler Wiederholung sind die beiden Markerbestände identisch und der Favorit erneut entfernt. Dennoch `promotionAuthorized=false`, auch bei 0 Markern.
- Tests mit fehlerhaften/duplizierten, abgelaufenen, umdatieren und organisationsfremden Markern schlagen geschlossen fehl, ohne Personenschlüssel in Fehlermeldungen aufzunehmen. Die gesamte Rehearsal läuft in CI mit eigenem Quality- und PostgreSQL-Schritt.

## Reproduzierbare Prüfung ohne Providerzugriff

- Statische Quell-/Owner-Prüfung: `node --test tooling/ulc-linz-p02-parity-rehearsal.test.mjs`.
- Isolierter SQL-Nachweis: `node --test tooling/ulc-linz-p02-parity-rehearsal.postgres.test.mjs` **nur** mit `DATABASE_URL` des lokalen PostgreSQL-18-Testdienstes (`postgres://postgres:postgres@localhost:5432/appbasis_identity_e2e`). Ohne `DATABASE_URL` wird dieser Test **übersprungen**; ein solcher Lauf ist ausdrücklich **kein** PostgreSQL-PASS.
- Die PR-Pflicht-CI `Identity PostgreSQL E2E` setzt die lokale URL im PostgreSQL-18-Service. Provider-/Preview-/Production-URLs werden vom Test abgewiesen. Reale SQL-Migrationen und Rollenanpassungen bleiben gesondert gesperrt.

## Kritische Restgrenzen (nicht als PASS verkaufen)

1. **51→64** ist als *exakte Datei-Zuordnung* geplant, nicht als Migration echter Produktionsdaten ausgeführt. Alte/teilweise angewandte Migrationen, Fremdschlüssel, Triggers, vorhandene Daten und Rollengrenzen benötigen eine **echte, isolierte Kopie/Backup** der zu migrierenden Production-DB vor Apply. Ein Neuaufbau einer leeren PostgreSQL-DB beweist keinen in-place Upgrade mit Echtdaten.
2. **64→66 (Kalender)** und **66→68 (Katalog)** haben noch keine produktiv registrierte v17- bzw. Katalog-v5-Owner-Version. Keine Stille Änderung von Manifest oder Production Contracts; DDL-/Schema-Änderung erst nach getrennter Freigabe.
3. Der synthetische Restore-Test belegt **nur** die Risiken und Marker-Rückübernahme für den einen Katalog-Owner, nicht autoritative vollständige Backup-/Restore-Verfügbarkeit, alle acht Datenowner, registrierte Drittpersonen, Freitextredaktion oder R2-Medien. Direkte Legacy-SQL-Schreiber dürfen nicht weiter Marker umgehen. Auch ein positiver SQL-Gate darf P01-/D2-/Provider-/rechtliche Nachweise nicht ersetzen.
4. Die tatsächliche Production-51-Tabellen-Instanz und Preview-66-Instanz wurden **nicht** geklont, gelöscht oder migriert; keine Daten, Test-Einträge, Berechtigungen oder Secrets wurden dort geändert.

**Reihenfolge vor privatem Echtbetrieb:** isolierter echter Production-Backup- und Versionsnachweis → autorisierter, konsistenter 51→64→66→68-Expand-Test → sichere getrennte App-Rolle/ACL samt vollständigem Owner-/Medien-Lifecycle → betriebliche Restore-/Re-Deletion-Abnahme → Betreiberentscheidung → erst dann kontrollierter Preview-/Production-Cutover. PRs #659/#660 bleiben Draft; keine Merges/Deployments ohne gesonderte Freigabe.
