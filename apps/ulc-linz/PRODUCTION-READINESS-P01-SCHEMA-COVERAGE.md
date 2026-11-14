# P01 – Dateninventar v16 und priorisierter Restumfang für den Echtbetrieb

**Stand:** 14.11.2026 · **Status:** technische Read-only-/Test-Vorbereitung, **KEINE** Datenschutz-, Sicherheits- oder Produktivfreigabe.  
**Basis:** `main=da9e61548c33d37a9f234cc5aaf566f9048384cc`; kanonischer Manifest-Blob `74f956c48a98b834f2ef581b9ffc8e7fa126ac87`.  
**Referenzen:** [P00](./PRODUCTION-READINESS-P00.md), [P01-Beschlussentwurf](./PRODUCTION-PRIVACY-P01-DECISION-PACK.md), [P02](./PRODUCTION-READINESS-P02.md), [P03](./PRODUCTION-READINESS-P03.md), [P03-B](./PRODUCTION-READINESS-P03-B-WRITER-AUDIT.md), [Sprint #607](https://github.com/martinirrgeher-cloud/appbasis/issues/607).

## 1. Präziser Schema-/Inventar-Abgleich

| Maßnahme | Befund |
| --- | --- |
| `appbasis.database.json` | **41 Migrationsdateien**, 8 Owner, ULC-eigener Owner Schema **v16** |
| Altes `privacy/m5-data-inventory.json` | **34 deklarierte Migrationsdateien**, ULC-Owner fälschlich v9; **64 bereits eingetragene Tabellennamen** |
| SQL-Abgleich (statische `CREATE TABLE`-Deklarationen aller 41 Dateien) | **64 unterschiedliche Tabellen**, von der bereits vorhandenen Tabelleliste abgedeckt. Die Lücke betraf **7 Migrationseinträge und darin hinzugekommene Felder**, nicht sieben fehlende Tabellen |
| Alte als offen markierte Zeilen | **26 der 64** bestehenden Tabellen führen mindestens eine `pending`-/`not-activated`-/`not-implemented`-Angabe in Retention-/Deletion-Evidence. **Diese Zustände bleiben offen** |
| Erneuerte Inventar-Metadaten | ULC-Owner v16/16 Migrationen, alle 41 Quell-Migrationen; `scope=repository-declared-schema-v16-review-not-runtime-evidence`. **Keine Aussage, welche Migrationen im aktiven Preview-/Produktivsystem installiert sind** |
| Künftige Driftkontrolle | Neuer nichtproduktiver Vitest `test/privacy-schema-manifest-coverage.test.ts`: Eigentümer-Versionen, exakte Manifestpfade, statische 64 Tabellen, sieben neue Felder-/Migration-Bezüge und bestehende Fail-Closed-Policy |

**Nicht gleichsetzen:** ein statisch korrektes Repository-Inventar ist **keine Laufzeit-Datenbankinspektion**, kein aktueller Providervertrag und kein Nachweis einer vollständigen Löschung. Das alte `current-materialized-v0.5`-Etikett wird für die aktualisierte Quellsicht ausdrücklich nicht weiter als aktuelle Live-Aussage verwendet.

## 2. Neu erfasste sieben Migrationen – personenbezogene Wirkung

| ULC-Migration | Tatsächliche Änderung | Weiter erforderlicher Nachweis |
| --- | --- | --- |
| 0009 – Functionary-Rolle | Zulässige `source_role` in Membership und Lifecycle-Deletion um `functionary` erweitert | Rollen-/Zugriffs-Audit, Funktionärs-Lifecycle und Restore-Prüfung |
| 0010 – Registration-Notizen | `note` in aktueller Registration **und** append-only `registration_change`; jeweils bis 160 Zeichen | Frist, Rechte, Nachlauf-/Freitextlöschung, Export, alte Change-History; Leeren aktueller Note entfernt alte History nicht |
| 0011 – Youth-Trainingsinhalte | `training_session.training_content_titles` und `training_attendance.training_content_slots` | Personenbezogene Inhalte in Sitzungstiteln, Zuweisung mit Athletenlöschung und Statistikabgleich |
| 0012 – Youth-Trainingskatalog | `training_session.training_content_items` JSONB | Freitext-/Metadaten-Risiko, Historie, Berechtigung, Lösch-/Redaktionskonzept |
| 0013 – U12-Jugendkategorien | Tabelle `ulc_linz_youth_content_category` | Prüfen, dass an sich allgemeine Label nicht als persönliche Notiz missbraucht werden |
| 0014 – U14/Kinder-Kategorien | Tabelle `ulc_linz_youth_group_category` | Gleiches Freitext-/Rollen- und Aufbewahrungsprinzip für U14/Kindertraining |
| 0015 – Traineranwesenheit | Tabelle `ulc_linz_training_trainer_attendance` mit `trainer_id` | Historischer Trainer-Personenbezug auch nach Gruppenaustritt, Export, Retention und Lösch-/Restore-Guard |

Alle sieben SQL-Dateien gehören zum ULC-eigenen Datenowner. **Auch die Tabellen aus 0013/0014/0015 waren in der Liste mit 64 Tabellennamen bereits vorhanden** und dürfen nicht doppelt angelegt werden.

## 3. Verbleibende technische Arbeitspakete – Reihenfolge und klare Abnahmen

| Priorität | Arbeitspaket / Umfang | PASS-Kriterium / aktuell |
| --- | --- | --- |
| **P01-Fach** – harte externe Voraussetzung | Eine **verbindliche** Vereinserklärung zu Datenzwecken und konkreten Fristen; Minderjährige/Eltern, Rechte, Freitext, D1–D4, rechtlich zulässige Löschbelege und Zugang für Verantwortliche. Provider/AVV/Region und maximalen Backup-/Export-Horizont prüfen | Unterzeichnet/entschieden, Evidenz und Zuständigkeit datiert. **BLOCKED**, nicht aus einer Entwickler-CI ableitbar |
| **P01-Tech** – Inventar | 41-Migrationsabgleich + Metadaten korrigieren + automatische Schema-Driftkontrolle. Anschließend tatsächlich angewandte Schema-Versionen in isolierter Preview/Production **nur read-only** mit manifestierter Umgebung und Versionsnachweis bestätigen | Dokumentations-/Test-CI auf exakter SHA PASS; unabhängig davon Live-Schema-/Bindings noch **offen** |
| **P03-E** – atomarer Write-Guard | Den P03-D-Test-Prototyp **erst nach P01** in einen gesonderten freizugebenden Datenbank-/Security-Draft übertragen: alle Attendance-/Registration-/Change-/Trainer-/Freitext-Writer einschließen, org+subject-scoped Locks und vollständige Origin/Expiry-Regeln. Keine lediglich HTTP-seitige Sperre | Echte PG-E2E: S1/S2/S5/S6 nach wirksamer Löschung verweigern Rebirth auch bei alten Clients, unmittelbarer SQL-Nutzung und konkurrierenden Verbindungen; Nachbar und Session unverändert. **Nur isolierter Prototyp PASS; Live BLOCKED** |
| **P03-F** – vollständiger Lifecycle | Alle 8 Owner prüfen (Identität, Rollen, Athleten, App-Owner, Katalog, Blöcke, Planung, Doku), historische Drittteilnehmer, Actor-IDs, Trainerpräsenz, persönliche Notizen, aktuelle und alte Revisionen; keine falsche Löschquittung bei Teilfehler | S3/S4/S7/S8, Cross-Org und Retry/Crash-/Restore-Rehearsal in isolierten realen PG-Datenbanken erfolgreich. **BLOCKED** |
| **P02-F** – Katalog, Blöcke, Medien | Usage/Favorites, uneindeutige Legacy-Notizen; private Medien inklusive **wirklichem** Storage-Provider-Löschbeleg, nicht nur Metadaten | Geprüfte Objektlöschung, Fristen, Retry-/Providerfehler, Reconciliation und No-Resurrection; Katalog und Blöcke bleiben Teil des Zielumfangs. **BLOCKED** |
| **P04** – Betrieb, Integrationsprüfung, Production-Gates | Cloudflare-Worker↔Neon-Bindings, wirkliche Datenregion, Subprozessoren/AVV, Zugriff, PITR/Backups und alle Exporte, private Tests/Rollen, isolierter Restore, M6-Refresh-/Rollback-/Monitor-Nachweis | Auf **exakt freigegebene** Release-SHA, tatsächliche Belege und vollständig gelöste Produktionsblocker geprüft; kein automatisches `--require-ready` aufgrund bloß grünem CI. **BLOCKED** |
| **P05** – geschlossener Pilot aller bisherigen Module | Getrennte Echtdatenumgebung, begrenzter Benutzerkreis, Backups/Recovery, mobile Abnahme der **veränderten** Abläufe; nicht wiederholen, was unverändert bereits PASS war | Explizite Betreiberfreigabe für Migration, Security/Privacy, privates Deployment und Go-live. **BLOCKED** |

**Neon-Read-only-Befund, nicht Betreiberfreigabe:** Das verbundene Projekt `appbasis-ulc-linz-production` meldet `aws-eu-central-1` (Frankfurt), 6 Stunden `history_retention_seconds`, eine als `archived` und `protected=false` markierte Default-Branch sowie keine derzeit gelisteten Snapshots. Dies **beweist weder die App-Anbindung noch den gesamten Backup-/Export-Horizont**. Kein Schreib-/Restore-/Aktivierungseingriff erfolgte.

## 4. Freigabegrenzen und Aufwand

- **Sofort autonom zulässig:** Code-/Migrations-/Dateninventur, nichtaktivierende Test-/Design-Drafts, echte PostgreSQL-E2E ausschließlich in kurzlebigen Testdatenbanken, Evidence-Differenzprüfung und normale CI.
- **Erst gesondert:** geltende Datenfristen/Datenschutz-Policy, Berechtigungs-/Lösch-/Write-Guard-Runtime, produktive SQL-Migration, Provider-/Backup-Änderung, Production-Contract-`ready`, Private-Preview-/Produktivdeploy, produktiver Datenimport oder Echtbetrieb.
- **Wichtig für CI/Contracts:** Durch Änderung des Inventar-JSON können bisherige Evidence-Bindings ungültig werden. **Nicht** reflexhaft Pin-SHAs erneuern. Vor Go-live müssen die bestehenden Contracts und ihre Belege inhaltlich erneut geprüft werden; der Entwurf hält alle bisherigen `m5`-Sperrstatus unverändert.
- **Restaufwand:** Die früher grob genannte Spanne 20–40 Personentage ist weiterhin **nicht belastbar neu geschätzt**. Rechtliche Entscheidungen, Umfang der tatsächlich gespeicherten Fremd-Backups und cross-owner Race-Cases sind gegenwärtig offen.

**Ergebnis:** Statische Migrations-/Tabelleninventur auf Repo-v16 aktualisiert; Produktion weiterhin **privacy=blocked** und **keine** Go-live-Freigabe.
