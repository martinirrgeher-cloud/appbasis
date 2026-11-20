# P02-G – Reale Schema-Inventur und synthetischer In-Place-Upgrade-Test 51→69

**Stand: 20.11.2026. Draft / ausschließlich lesende Neon-Metadaten + lokale, wegwerfbare PostgreSQL-18-Datenbank. Kein Preview-/Production-Apply.**

## Verifizierte Ausgangslage (Neon, read-only)

Die beiden realen ULC-Neon-Projekte wurden am 20.11.2026 über SQL-Katalogabfragen **nur lesend** geprüft:

| Merkmal | Production (neondb) | Preview (appbasis_ulc_linz_preview) |
|---|---:|---:|
| Tabellen in `public` | 51 | 66 |
| Spalten in `public` | 378 | 489 |
| Constraints in `public` | 542 | 732 |
| Indizes in `public` | 111 | 141 |
| Non-internal Trigger | 0 | 3 |
| Erkennbares SQL-Migrationsjournal | keines | keines |

**Kein** SQL-Migrationsjournal wurde unter öffentlich sichtbaren Schema-/Journal-/Migrationstabellen gefunden; daraus darf **nicht** abgeleitet werden, dass jede frühere Migration ausgeführt wurde. Drei Preview-Trigger sind die zwei `appbasis_training_documentation_...`-Schutztrigger und der `ulc_linz_registration_calendar_guard_trg`. Bestehende gemeinsamen Tabellen zeigen nach Katalogabgleich **sechs** additive, in Production noch fehlende Spalten: `appbasis_training_group.attendance_mode`, `appbasis_training_block_revision.audience_ids` und `.category`, `ulc_linz_training_session.training_content_titles` und `.training_content_items`, `ulc_linz_training_attendance.training_content_slots`. Die zwei Funktionsrollen-Checks haben unterschiedliche zulässige `source_role`-Werte.

**Genau 15 Preview-Tabellen fehlen vollständig** in Production. Die oben genannten Deltas lassen sich auf **17 noch nicht im Production-Schema repräsentierte Original-Owner-Migrationsdateien** zurückführen; die vollständige Liste steht im SQL-Test unter `MISSING_PRODUCTION_MIGRATIONS`. Kalender-v17 ist in Preview bereits vorhanden, im App-Manifest weiterhin **nicht** registriert. Die Katalog-v5-Guards (+2) und der P03-D-Trainings-Löschmarker (+1) sind weiterhin **nur Kandidaten**, keine angemeldeten Live-Migrationen.

## Neues Paket

`tooling/ulc-linz-p02-g-synthetic-upgrade.postgres.test.mjs` wird durch `.github/workflows/ci.yml` zwingend auf **PostgreSQL 18 mit localhost** ausgeführt. Eine Provider-URL wird ausdrücklich abgelehnt. Die Datenbank wird mit Zufallsnamen erstellt und sicher beseitigt; ausschließlich synthetische Benutzer-/Athleten-/Trainingsdaten.

1. Lädt exakt die 41 registrierten Originaldateien des App-Manifests und konstruiert eine **51-Tabellen-Baseline**, indem nur die 17 konkret nachgewiesenen Lücken ausgelassen werden. Der Vergleich verlangt die **exakte** Liste der 51 realen Production-`public`-Tabellen, nicht nur die Zahl 51.
2. Fügt in diese alte Baseline tatsächliche Legacy-Trainingsgruppe, Trainingseinheit, Anwesenheit und Katalogübung ein.
3. Spielt die **17 Originaldateien innerhalb einer Transaktion** auf diesen bestehenden Datenbestand, erzwingt einen Fehler und verlangt vollständigen Rollback bis zu exakt 51 Tabellen, einschließlich Erhalt sämtlicher Legacy-Daten.
4. Wendet danach dieselben originalen SQL-Statements in genau deklarierter Owner-Reihenfolge atomar an und prüft **64 Tabellen**, alle sechs neuen Spalten, unveränderte Legacy-Zeilen und sinnvolle Defaults für alte Trainingseinheiten.
5. Fügt den weiterhin unregistrierten **v17-Kalender** in einer separaten Transaktion hinzu → **66 Tabellen**.
6. Fügt die zwei bisher unregistrierten katalogeigenen Schutzrelationen hinzu → **68 Tabellen**.
7. Prüft den weiterhin unregistrierten app-owned P03-D-Schreibschutzentwurf → **69 Tabellen**, unveränderte Alt-Daten und weiterhin zulässige Updates nicht gelöschter Athleten.

Dies ist ein **vollständiger synthetischer DDL-Aufrüstungspfad**, keine Simulation mit nur leeren Tabellen. Der CI-Test führt jedoch **keine echte Production-Backup-Restauration** durch und verifiziert keine echten historischen Daten, Owner-Rechte, R2-Medien oder alle fremden Referenzen.

## Entscheidungsregeln für die nächste Betreiberfreigabe

- Echtes **51→69-In-Place-Upgrade** ist trotz dieses Tests **nicht** zur Ausführung in Production oder Preview freigegeben.
- Vor einem autorisierten Probelauf: frisches unveränderliches Production-Backup, **physisch isolierte Kopie**, aktuelles Schema-Inventar/Constraints/Funktionen/Indizes, reale Zeilenzahlen und sensible Daten unter beschränkten Betreiberrechten, geprüftes Restore- und Rollback-Verfahren, minimal notwendige SQL-Rollen sowie Nachweis, welche DDL in früheren Versionen tatsächlich ausgeführt wurden. Kein Blind-Apply.
- Vor privatem Echtbetrieb: P01/D2-Datenschutz-/Löschentscheidung, cross-owner- und Restore-No-Resurrection-Gates einschließlich Trainer-/Akteursbezug, Freitext, private Medien, Kalender-/Anmeldungs-/Trainingsplanrechte, finaler mobiler Regressionstest und Betreiberfreigabe.
- **Keine** Manifeste, laufenden Worker, Provider-Datenbanken, SQL-Rollen, produktiven Nutzer oder Deployments wurden durch dieses Paket verändert.

**Status:** Technischer Testkandidat; Production weiterhin BLOCKED. Bezug #530/#607 und die Draft-Kette #659→#664.
