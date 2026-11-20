# P02-I – Kontrolliertes Runtime-Schema-Gate für 69 Tabellen (Preview, weiterhin Opt-in)

**Stand 20.11.2026 – Draft; keine Live-Freischaltung, kein Merge, keine Datenänderung.**

## Technischer Fortschritt

Die bereits vorhandenen, ausdrücklich freiwilligen Startprüfungen der beiden geschützten Schreibwege wurden für eine **künftige** vollständige 69-Tabellen-Preview erweitert:

- `exercise-catalog-protected-runtime-readiness.ts`: akzeptiert weiterhin die bisherige **68-Tabellen-Preview**, wenn der Katalog-Löschmarker für die App nur lesbar, nicht veränderbar ist. Eine **69-Tabellen-Preview** ist erst dann zulässig, wenn zusätzlich `ulc_linz_training_subject_deletion` und **alle drei** app-owned Trainings-Write-Fence-Trigger auf Anwesenheit, Anmeldung und Änderungshistorie vorhanden sind. Der App-Account darf auf den Trainings-Löschmarker **überhaupt keine** Tabellenrechte (SELECT/INSERT/UPDATE/DELETE/TRUNCATE) besitzen.
- `training-block-verified-runtime-readiness.ts`: erlaubt weiter **66 Tabellen** für den isolierten Alt-Preview-Opt-in und **68 Tabellen** nur bei beiden vollständigen Katalog-Guards. Die **69er Variante** verlangt zusätzlich denselben vollständigen Trainingsmarker-/3-Trigger-/Rechte-Negativnachweis.
- Beide Funktionen prüfen weiterhin `current_database() = 'appbasis_ulc_linz_preview'` und `current_user = 'appbasis_ulc_linz_preview_application'`, sowie die bisherigen katalog-/planbezogenen Tabellen und detaillierten SQL-Rechte. **Keine** Freigabe für Production `neondb`, sonstige Datenbanken oder eine administrative Migrationsrolle.
- Die Funktionen bleiben im normalen `postgres.ts`-Runtime-Aufbau unverändert nur bei den bisherigen expliziten, programmatischen Opt-ins erreichbar. Standard-/Legacy-Module sowie U12/U14/Kindertraining, Training und Katalog sind **nicht** umgeschaltet, und keine neue Option aus der Worker-Umgebung wurde hinzugefügt.

## Reale Nur-Lese-Prüfung gegen Neon

Die Original-SQL-Abfragen aus den beiden aktualisierten TypeScript-Startprüfungen wurden mit der **tatsächlichen Anwendungsrolle**, rein lesend, gegen folgende vorhandene Datenbankzweige ausgeführt:

| Ziel | Tabellen | App-eigener Trainingsmarker | Drei Write-Fences | App darf Marker lesen/ändern? | Befund |
|---|---:|---|---:|---|---|
| Isolierte Production-Testkopie `neondb`, `br-calm-breeze-b18nlqw0` | **69** | ja | 3 | **nein** | Technische Guard-Metadaten **PASS**; korrekterweise **kein** Runtime-PASS, weil die Rolle/DB nicht Preview sind |
| Unveränderte Preview `appbasis_ulc_linz_preview` | **66** | nein | 0 | nein | Bereits bekannte, gezielt blockierte Opt-ins: Katalog-Guards und drei Block-Usage-Rollenrechte fehlen |

Der Vergleich verwendet nur `pg_catalog` und `has_table_privilege`. Es wurden **keine Athleten-, Mitglieder-, Login- oder Trainingsdatensätze gelesen**, keine Rechte gewährt und keine Provider-Objekte verändert. Er beweist **nicht**, dass ein komplett geschützter Worker auf der echten Preview schon startet.

## Regression und Grenzen

Die bestehenden Unit-Tests sind um explizite **69er Positivfälle** und **fehlende Trigger, teilweise Migration, Markerrechte, falsche DB/Rolle** als Negativfälle erweitert. Die bestehende 66-/68-Logik und Standard-Runtime-Verdrahtung bleibt erhalten.

**Noch offen für eine kontrollierte Pilot-Aktivierung:** registrierte Owner-Migrationen für v17 + Katalog-v5 + P03-D; 69er Upgrade und minimal geprüfte ACL **in Preview** nach ausdrücklicher Entscheidung; gesonderte Autorisierung des privilegierten Owner-Löschers, P01/D2/Restore-/R2-/Trainer- und Freitextbehandlung, Test der echten geschützten Worker-Opt-ins und Handy-Abnahme. Auch nach erfolgreicher CI **keine automatische Go-live-Freigabe**.

Die Module bleiben bewusst auf dem bisherigen Betriebsstand. PR #659–#666 werden nicht gemergt oder deployed; dieser PR bleibt ebenfalls Draft.
