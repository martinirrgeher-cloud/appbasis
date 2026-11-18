# P04-B – Vier bestehende Lifecycle-Tabellen kontrolliert nachziehen

**Status 18.11.2026: technische Vorbereitung / PostgreSQL-Rehearsal. Kein Preview-/Produktiv-SQL ausgeführt.** Ziel ist ein prüfbarer, kleiner Teil der Vorbereitung aller sechs Bestandsmodule, keine zweite Implementierung oder neue Domänentabelle.

## Tatsächlicher Live-Befund und Ursprung

Das verbundene **Preview**-Neon-Projekt `appbasis-ulc-linz-preview`, Datenbank `appbasis_ulc_linz_preview`, Branch `main`, zeigt bei einer rein lesenden Metadatenabfrage **62 öffentliche Tabellen**. Die Repository-Inventur für 41 deklarierte Migrationen zählt **64**, enthält aber zwei spätere v17-Kalendertabellen nicht. Tatsächlich fehlen genau diese **vier bereits kanonischen Moduleigentümer-Tabellen**:

| Fehlende Tabelle | Bereits vorhandene Migration / Owner |
| --- | --- |
| `appbasis_training_block_favorite_deletion` | `modules/training-blocks/migrations/0004_appbasis_training_block_favorite_deletion.sql` |
| `appbasis_training_block_usage_subject` | `modules/training-blocks/migrations/0005_appbasis_training_block_usage_subject.sql` |
| `appbasis_training_block_usage_subject_deletion` | dieselbe Blöcke-Migration `0005` |
| `appbasis_training_documentation_subject_deletion` | `modules/training-documentation/migrations/0001_appbasis_training_documentation_subject_deletion.sql` |

Die in Preview vorhandenen `ulc_linz_registration_calendar_rule` und `ulc_linz_registration_calendar_exception` sind **keine** fehlenden Tabellen und sollen bei einem Nachziehen unberührt bleiben. Die Tabelle allein belegt nicht, dass alle Funktionen/Trigger vollständig sind; eine Metadatenprüfung des Zielsystems ist weiterhin Pflicht.

## Neu im Paket

1. `tooling/ulc-linz-lifecycle-schema-reconcile.mjs`: **ausschließlich lesender**, aus den **exakt deklarierten** SQL-Dateien und dem kanonischen 41-Migrationsmanifest abgeleiteter Plan. Er überprüft im PostgreSQL-Katalog die fünf Basistabellen, alle vier Lifecycle-Tabellen sowie die drei Dokumentationsschutzfunktionen und zwei Trigger. Nur die Zustände **alle 4 fehlen + keine DDL-Reste** oder **alle 4 und alle Schutzroutinen vollständig vorhanden** werden akzeptiert. Jeder Zwischenzustand, alter fehlender Root oder kaputte Funktions-/Triggerinstallation stoppt mit `BLOCKED`. Es gibt in diesem Werkzeug bewusst **keinen Apply-Aufruf**.
2. `tooling/ulc-linz-lifecycle-schema-reconcile.test.mjs`: reproduzierbare Ablehnung teilinstallierter und driftender Schemas sowie korrekte Meldung `migration-required` oder `current`.
3. `tooling/ulc-linz-lifecycle-schema-reconcile.postgres.test.mjs`: **echter PostgreSQL-18-E2E** in einer eigens angelegten und nachher entfernten Datenbank. 38 der 41 kanonischen Migrationen ergeben den älteren Zustand. Ein absichtlich abgebrochener erster Migrationsversuch rollt zurück. Danach werden die **drei unveränderten Originaldateien atomar** angewendet; Schutzroutinen und vier Tabellen müssen vorhanden sein, eine vorher existierende Athletenzeile muss erhalten bleiben, ein gelöschter Dokumentations-Subject wird per DB-Trigger gegen Wiederanlegen geschützt. Nach absichtlich beschädigter Installation muss der Plan **verweigern**.
4. Die bestehende CI prüft beides eigenständig: `Quality gate` mit dem read-only Vertragstest und `Identity PostgreSQL E2E` mit dem tatsächlichen Migrations-Rehearsal. **Keine** neuen Paketmanager, Trigger oder Spalten im aktiven Schema.

## Warum jetzt NICHT direkt auf Preview oder Production anwenden?

Die SQL-Dateien enthalten neue personenbezogene Löschmarker und, für die Dokumentation, **SECURITY DEFINER**-Funktionen und Trigger. Ein blindes `CREATE TABLE IF NOT EXISTS`, das fehlende Tabellen „nachkorrigiert“, würde **teilinstallierte Funktionen, fehlende Berechtigungen oder Restore-Drift verschleiern**.

**Ein einziger späterer Betreiber-Change** sollte nach Freigabe die konkrete Preview-/Production-Zielumgebung und laufende Migrationserlaubnis, Snapshot/Restorepunkt, Org-/Rollenberechtigungen und exakte Release-SHA erfassen. Die Migrationsausführung muss das vorher geprüfte exakte Schema nochmals unter kontrolliertem Lock prüfen und bei Abweichung ohne Teiländerung stoppen. Danach ist die Rechtezuweisung an Worker-/Log-Rollen separat zu verifizieren. Die tatsächliche Löschung privater Mediendateien ist ein weiterer eigenständiger Owner-Nachweis; das Einspielen dieser drei SQL-Dateien löst sie nicht.

**Freigabegrenze:** Kein Merge, Deploy, Preview-/Produktiv-Schema-Write, Rechtewechsel, Marker-/Retention-Aktivierung oder `production.json`-Statuswechsel durch dieses Paket. Die bestehende Preview und der bestätigte Handy-PASS bleiben unangetastet.

## Kontrollierter Preview-Ausführungspfad (Ergänzung)

Der bereits testgrüne Reconciliation-Plan ist jetzt auch **über einen separaten Workflow tatsächlich ausführbar**, allerdings **erst nach Freigabe** und ausschließlich für die bestehende synthetische Test-Preview. Es wird kein bestehender E6H-Deploy und kein produktiver M6-Workflow verändert.

- **GitHub Actions:** `ULC Linz – Lifecycle-Tabellen in Preview abgleichen` (`.github/workflows/ulc-linz-p04-lifecycle-preview.yml`), Branch `main`, Standardaktion `inspect` (rein lesend).
- **Migrationsaktion:** `migrate` nur bei gesonderter Betreiberfreigabe, `apply=true`, bestätigtem Preview-Backup und Wiederherstellungsbereitschaft sowie exakt `ULC-P04-LIFECYCLE-PREVIEW` als Freigabereferenz. Keine automatische Ausführung nach Merge. Kein Übernehmen einer Freigabe bei GitHub-Reruns.
- **Schreibschutz der Operation:** `tooling/ulc-linz-lifecycle-schema-preview.mjs` verifiziert zunächst alle drei Neon-Origin-Credentials auf dieselbe Preview-DB mit unterschiedlichen kanonischen Rollen. Zusätzlich kontrolliert es tatsächliche `current_database()`/`current_user` der SQL-Verbindung **vor und innerhalb der Transaktion**. Der Workflow arbeitet nur auf `main` und benutzt dieselbe Preview-Concurrency wie bestehende Deploys.
- **Atomare SQL-Aktion:** innerhalb einer DB-Transaktion Advisory Lock, Zustand erneut lesen, genau die drei **originalen kanonischen** SQL-Dateien ausführen, kompletten Zustand erneut prüfen; Fehler führt zu SQL-Rollback. Vollständig bestehender Stand ergibt `already-current` statt Wiederanwendung.
- **Post-Apply:** Datenbankschema und tatsächliche Berechtigungen der beiden Preview-Runtime-Rollen **rein lesend** kontrollieren. Die App- und Security-Log-Rolle dürfen auf den vier neu angelegten Lifecycle-/Marker-Tabellen **kein INSERT/UPDATE/DELETE** erhalten. **Der allgemeine D4-Reconciler mit breiten Tabellen-Schreibrechten wird ausdrücklich nicht aufgerufen.** Falls bestehende Default Grants diese Bedingung verletzen, endet der Lauf als FAIL; keine automatische Berechtigungskorrektur und kein Deployment. Spätere notwendige Modulrollen werden gesondert und eingeschränkt freigegeben.
- **Gleiches SQL im Test:** `tooling/ulc-linz-lifecycle-schema-reconcile.postgres.test.mjs` verwendet den exportierten tatsächlichen Transaktionspfad in einer **wegwerfbaren PostgreSQL-Datenbank**; zusätzlich No-op-Rerun. Die Quality-CI prüft falsche DB/Rolle, fehlende Freigabe und den rein lesenden Standardmodus.

**Betriebsreihenfolge:** 1. PR-Review/CI und ausdrücklicher Merge; 2. Preview-Backup-/Recovery-Beleg überprüfen; 3. Workflow mit `inspect` auf `main`; 4. nach neuer expliziter Freigabe `migrate`; 5. Postchecks/bei Bedarf fokussierter synthetischer Handytest. **Kein** Datenbankschritt wurde in diesem Arbeitspaket ausgelöst.

**Kein Produktions-Go-live:** Die vier Tabellen erlauben nicht automatisch das Live-Subject-Erasure/Restore für alle Datenowner. #656 bleibt ein weiterer Security-Entwurf, P01-Rechts-/Provider-/Backupnachweise und bestehende `blocked`-Production-Contracts sind separat offen.

## Abnahme

- Exakte PR-HEAD-CI: Quality + PostgreSQL-E2E **PASS**, PostgreSQL-Test tatsächlich gelaufen.
- Vollständiger Satz aus drei bestehenden Dateien ergibt genau vier Nachholtabellen und drei Funktionen/zwei Trigger. Teilstand und Rollback **FAIL-CLOSED**.
- Danach können **P01 fachliche Zielregeln (#619)**, **P02 Medien-/Favorites/Usage**, **P03 Schreibschutz (#656)** und **P04 Restore/Betrieb** in einen gezielt freizugebenden privaten Pilot integriert werden. Bereits getestete UI-Module nicht erneut komplett abnehmen.

Verknüpft: [Produktiv-Sprint #607](https://github.com/martinirrgeher-cloud/appbasis/issues/607), [Übergabe #530](https://github.com/martinirrgeher-cloud/appbasis/issues/530).
