# ULC Linz – P1/P2: ein konsolidiertes Paket zum geschützten Echtbetrieb

**Stand:** 19.11.2026 · **Status:** technische Inventur + vorbereiteter Implementierungsscope, **KEINE** automatische Datenschutz-, Lösch-, Rollen-, Produktiv- oder Deploymentfreigabe.

**Ziel:** Bestehende ULC-App mit allen sechs Standardmodulen plus Anwesenheit/Anmeldung/Trainer-Audit für eine kleine Pilotgruppe produktiv machen. **Keine Parallel-App, keine erneute UI-Entwicklung, keine stillen Teilmodule, keine pauschalen GRANTs.** Projekt-Source-of-Truth: [#607](https://github.com/martinirrgeher-cloud/appbasis/issues/607), Übergabe [#530](https://github.com/martinirrgeher-cloud/appbasis/issues/530).

## 1. Belegte neue Fortschritte – nicht erneut entwickeln

| Bereich | Tatsächlicher Stand | Noch kein Beleg für |
| --- | --- | --- |
| Preview-Schema P04 | 19.11. nach Betreiberfreigabe exakt drei kanonische SQL-Dateien atomar migriert, **62 → 66 Tabellen**, 4 neue, 3 Guardfunktionen, 2 Trigger; 8/8 geprüfte App-/Security-Tabellenrollen ohne DML auf neuen Tabellen. Anwesenheit/Doku-Handytest PASS | Published v17 Produktionsmigration, vollständige Cross-Owner-Erasure |
| PostgreSQL-Backup | [R2 Backup #44606974536](https://github.com/martinirrgeher-cloud/appbasis/actions/runs/44606974536) vom 19.11. wirklich per pg_dump verschlüsselt hochgeladen und gehasht; [Restore #44602778793](https://github.com/martinirrgeher-cloud/appbasis/actions/runs/44602778793) des Vorgänger-Dumps vom 18.11. in gesonderte leere Quarantäne **PASS** | Automatische tägliche Sicherung/Retention, Wiederherstellung privater R2-Mediendateien, vollständiger Löschreplay |
| Übungskatalog-Medien | Bereits in main aktiver privater Medien-DELETE mit einem separaten Provider-GET und SQL-Finalisierung nur bei bestätigtem Erfolg; Negativtests vorhanden | Löschbeleg für sämtliche Providerkopien/Backups, Re-Upload-Race und direkter SQL-Bypass |
| P01 | Der Betreiber bestätigte 14.11. eine **fachliche Zielrichtung** mit bedarfsabhängigen Fristen; [vorbereiteter PR #619](https://github.com/martinirrgeher-cloud/appbasis/pull/619) enthält jetzt eine maschinell prüfbare **66-Tabellen-Zuordnung** statt veralteter 64er-Abdeckung | DSGVO-Rechtsgrundlagen, Verantwortlichenzuständigkeit, D2 A/B, Provider-AVV, live Retention-Timer oder rechtlich geprüfte Policy |

**Wichtige Schema-Grenze:** `apps/ulc-linz/appbasis.database.json` hat **41 kanonische Migrationen / 64 daraus resultierende Tabellen (v16)**. Zwei zusätzliche Preview-Kalendertabellen sind in der aktuellen *unregistrierten* `0016_ulc_linz_registration_calendar.sql` beschrieben. Die Datenschutzklassifikation erfasst alle **66 vorhandenen Preview-Tabellen**, registriert dadurch aber **keine** v17-Produktionsmigration. In der späteren Produktionskette muss v17 separat und migrationskonsistent geregelt werden.

## 2. P1: offene **fachliche und rechtliche** Entscheidungen, eine gebündelte Freigabe

Die vorgeschlagene, bereits als Zielrichtung bestätigte Matrix unter `privacy/p01-operator-retention-candidate.json` ordnet jede Preview-Tabelle einer von 13 Zweck-/Fristengruppen zu; besondere Fälle umfassen historische Anmeldenotizen, Inhalts-JSON, Revisionen, freies Usage-`source_ref/note`, Trainer und nicht eindeutig zuordenbare Alttexte.

**Vor erster echter personenbezogener Speicherung verbindlich zu dokumentieren:**

1. Wer entscheidet im Verein verantwortlich über Datenverarbeitung, Auskunft, Berichtigung und Löschung? Welche Zwecke/Rechtsgrundlagen und Informationen an Betroffene gelten für Athleten, Eltern, Trainer, besonders Minderjährige?
2. Welche Fristen sind **erforderlich** für Anwesenheiten/Registrierungen, Trainernachweise, Plan-/Dokurevisionen und persönliche Favoriten/Usage; welche gesetzlich abweichenden Aufbewahrungspflichten gelten konkret? Die Vorschläge 12/24 Monate und 90-Tage-Freitextprüfung sind **keine** gesetzlichen Pauschalfristen.
3. **D2**: bestehende Athleten-Löschquelle bleibt **35 Tage, danach deny**. Vor finaler Wahl zwischen Abschluss aller Owner und sämtlicher wiederherstellbarer Kopien innerhalb dieses Horizonts (A) oder neuem zweck-/fristenbegrenzt genehmigtem Minimal-Löschbeleg (B) erst den **tatsächlichen Maximalhorizont** sämtlicher Backups, Snapshots, Exporte und Mediakopien belegen. Nie ohne Entscheidung eine längere Tabelle aktivieren.
4. **D1/D3/D4**: unklare historische Notizen nicht heuristisch Personen zuordnen; keine erkennbaren neuen Minderjährigenmedien ohne Rechtsgrundlage/Providerbeleg; Restore nur in isolierter Quarantäne und nach kompletter aktueller Löschautorität/Owner-Re-Deletion produktiv freischalten.
5. Cloudflare- und Neon-Vertrags-/Auftragsverarbeitungsbelege, Zugriffe, R2-Medien und Backupfrist dokumentieren; Datenschutzhinweise und Zuständigkeit freigeben.

Diese Punkte **nicht** durch grüne CI, bereits vorhandene Vorschlagsdokumente oder vorgetäuschte automatische Löschung ersetzen.

## 3. P2: produktive technische Restarbeiten – auf vorhandenen Code aufbauen

| Enger Umsetzungsschnitt | Bereits vorhanden / nicht neu bauen | Wirklich noch erforderlicher Produktivnachweis |
| --- | --- | --- |
| **P2-A: Katalog-Favoriten + Usage** | `modules/exercise-catalog/src/postgres-repository.ts` hat **opt-in** `favoriteFenceMode=require-catalog-erasure-marker` und `usageWriteMode=require-explicit-subject` samt transaktionalen Schreibsperren; echte P02-G/H-PostgreSQL-E2E | Authentischen Athlet-/Identity-Owner in allen tatsächlichen Aufrufpfaden prüfen; Legacy-Direktschreiber und freies `source_ref/note` sicher behandeln; vollständige Berechtigungs- und Restore-Proben. Aktuelle Standard-Defaults bleiben **legacy-unprotected**, also KEINE produktive Freigabe. |
| **P2-B: private Medien** | Bestätigter Provider-DELETE im realen ULC-Worker, SQL pending bei Fehler und Retrys sowie Tests | Exklusiven abschließenden SQL-Löschpfad, konkurrierende Neuanlage, realen Provider-Lifecycle inkl. separater Media-Backups und Kinderdatenregel belegen. Datenbankdump enthält keine Medienobjekte. |
| **P2-C: Trainingsblöcke** | Revisionen, Favoriten/Usage, Lösch-/Wiederherstellungshelfer und reale PostgreSQL-E2E; nach P04 vier Lifecycle-Tabellen vollständig in Preview | Durchgängiger, autorisierter Subject-Writer/No-Resurrection-Guard **für sämtliche** Aufrufe (auch Legacy), Retention/Usage-Owner und vollständige R2-/Restore-Reconciliation; Module-Contract bleibt blockiert. |
| **P2-D: Dokumentation + ULC-eigene Daten** | Guard-Funktionen/Trigger für Dokumentation in Preview, Runtime-Tests, P03-Entwurf [#656](https://github.com/martinirrgeher-cloud/appbasis/pull/656) und N16 Session-/Trainer-Guards [#602](https://github.com/martinirrgeher-cloud/appbasis/pull/602) | Authentifizierte Rechte, reale Undo/Erase-/Revisions-/Fremdteilnehmer-Fälle und gleichzeitige Writer über Trainings-/Anwesenheits-/Anmeldehistorie samt Trainer-Audit. **Keine** blinde Freischaltung der alten Drafts oder Lösch-SQL. |
| **P2-E: integrative Freigabe** | Identity, Athleten, Planung und Countdown-Verträge `ready`; Backup/Restore PostgreSQL PASS; Handytests der bestehenden Module | Exakte Inhalts-/Git-Evidence für die übrigen 3 Module und App-Lifecycle, unabhängige negative Rollen-/Tenant-/Concurrency-/Backuptests, M6 `production-contract.mjs ulc-linz --require-ready` erst bei echtem PASS; separater Produktions-DB/Worker-Pilot. |

## 4. Umsetzung und Abnahmereihenfolge ohne Mikrofreigaben

1. **Jetzt in einem PR:** P1-Entscheidungsvorschlag auf **66** echte Preview-Tabellen korrigieren; P2-Lücken matrixartig auf genau die aktiven Repositories/Tests beziehen; maschinelle Regressionen einbauen; keine Runtime-Sicherheitsautomatik aktivieren.
2. **Nächster technischer PR-Scope, gebündelt:** tatsächliche P2-A/B/C Writer-Pfade und Rechte prüfen und nur gesichert autorisierbare Guards implementieren; Standardmodule vollständig in echte PostgreSQL-E2E aufnehmen. `#656` und `#602` **nicht** still mitmergen; priorisierte Kernteile reviewen oder gesondert freigeben.
3. **Integrativer Freigabe-Scope:** P1-Verantwortlichen-/Providerentscheidung und D2-Horizont verbinden mit P2-D/E, fehlschlagssicheren Lösch-/Restore-/Medienkontrollen und minimalen Rechten. Fehlender Nachweis bleibt `blocked`.
4. **Erst dann:** Produktionsverträge in einem Review auf `ready` setzen, eine exakte Release-SHA/CI prüfen, getrennte Produktionsdatenbank/Worker konfigurieren und einen geschützten Pilot mit allen sechs Modulen freigeben.

**Arbeitsgrenze dieses PRs:** Kein Merge/Deploy, keine Daten-/Rollen-/Policy-/Workflow-/Provider-Mutation, keine neuen Löschmarker, keine Änderung der bestehenden funktionsfähigen Mobiloberfläche. Die Produktiv-Kriterien bleiben **fail-closed**; CI kann nur die technische Vorbereitung bestätigen.
