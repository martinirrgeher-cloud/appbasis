# P05 – Acht-Owner- und Provider-Fakten zum kontrollierten Echtbetrieb

**Erhebung: 22.11.2026, read-only.** Technischer Beleg- und Entscheidungsanhang, **keine Rechtsfreigabe, kein Erasure-Auftrag, kein Restore und keine Retention-Aktivierung**.

Zentraler operativer Stand: [GitHub #607](https://github.com/martinirrgeher-cloud/appbasis/issues/607). Einmaliges Betreiber-Entscheidungsblatt und noch unveröffentlichte Eltern-/Trainerinformation: [P05-PILOT-DATENSCHUTZ-UND-BETRIEBSABNAHME.md](./P05-PILOT-DATENSCHUTZ-UND-BETRIEBSABNAHME.md). Dieser Anhang ersetzt keine der beiden Quellen.

## 1. Tatsächliche 69-Tabellen-Inventur ohne Personeninhalte

**Datenquelle:** Neon `appbasis-ulc-linz-production` / Default `production` / `neondb`; PostgreSQL 18 Frankfurt (`aws-eu-central-1`). Exakte Ist-Tabelleliste aus `pg_catalog.pg_tables` mit P01 `apps/ulc-linz/privacy/p01-operator-retention-candidate.json` (Git-Blob `1554a662039f604abc67380630a73b591022a0e1`) und bereits integriertem 3-Tabellen-Delta `p05-production-69-table-coverage-delta.json` (Git-Blob `c59df2a2acc55143ccb941c385bb3de716fcd5a1`) verglichen: **69/69 deckungsgleich, 0 fehlende/zusätzliche Tabellen, 0 doppelte Namen**.

Die anschließenden 69 Einzel-COUNT-Abfragen wurden **nur lesend** als aggregierte Ergebnisse unter `neondb_owner` ausgeführt, **ohne Datensatzfelder, Identitäten oder Texte zurückzugeben**. Die folgende Zuordnung ist eine fachliche Zweckgruppierung, **keine** Behauptung, dass jede Gruppe exakt einem der acht technischen Daten-Owner entspricht.

| P01-Zweckgruppe + P05-Delta | Tabellen | Tabellen mit Zeilen | Zeilen insgesamt |
| --- | ---: | ---: | ---: |
| Konten/Mitgliedschaften/Rechte | 11 | 9 | 48 |
| Identitätsoperationen | 1 | 1 | 3 |
| Athleten-/Trainerstammdaten | 5 | 0 | 0 |
| Security-/Trainer-/Lifecycle-Audit | 4 | 2 | 45 |
| Anwesenheit/Registrierung/Trainerpräsenz | 4 | 0 | 0 |
| Trainingstermine/Freitext | 1 | 0 | 0 |
| persönliche Favoriten | 3 | 0 | 0 |
| Nutzungsereignisse (einschließlich neuer Katalogzuordnung) | 4 | 0 | 0 |
| Pläne/Blöcke/Dokumentation/Revisionen | 9 | 0 | 0 |
| private Medienmetadaten | 1 | 0 | 0 |
| Löschmarker (einschließlich zwei neuer Markerarten) | 8 | 0 | 0 |
| alte Verifikation | 1 | 0 | 0 |
| allgemeine Konfiguration/Gruppen | 17 | 5 | 67 |
| **Summe** | **69** | **17** | **163** |

**Interpretationsgrenze:** 163 Zeilen bedeuten weder 163 Personen noch 163 Vorgänge. In der produktiven Trainings-/Athletenhistorie sind aktuell keine Datensätze; es bestehen aber **authentifizierungs-, mitgliedschafts- und protokollbezogene Daten**. Ein Nullbestand beweist **nicht**, dass künftige 8-Owner-Löschungen oder ein älterer Restore vollständig sicher sind. Security-Audit-Zeilen müssen selbst datenschutzrechtlich eingeordnet werden.

## 2. Acht persistente Daten-Owner: vorhandener Sicherheitsprüfer statt Neubau

Der bereits auf `main` vorhandene `apps/ulc-linz/worker/p3-cross-owner-restore-admission.ts` nennt exakt:

| Technischer Daten-Owner | Schon vorhanden | Weiterhin offen vor Live-Erasure/Restore-Promotion |
| --- | --- | --- |
| `identity` | Identitäts-/Login- und lokale Lösch-/Rollen-Tests | Neueste autoritative Identitätslöschung, alte Sessions/Kopien und Rechte nach Quarantäne-Restore |
| `permissions` | Getrennte SQL- und Audit-Berechtigungsprüfungen | Alle aktuellen und historischen Grants/Revoke-/Audit-Referenzen auf die gelöschte Person |
| `athletes` | Kanonische Athletenlöschmarker und personengebundene Transaktionsguards | Autorität/Frist, Nachbar-/Fremdorg-Isolation, erneute Athletenanlage nach älterem Backup |
| `exercise-catalog` | Geschützte Katalognutzung, persönliche Favoriten- und Marker-Schemata; private Medien im Worker gesperrt | Personenzuordnung aller Alt-Nutzungen; Quarantäne-Replay; Provider-Medien-Existenz/Löschung tatsächlich beweisen |
| `training-blocks` | Geschützter Usage-Write, separater Erasure-Principal, v7-Guard und entzogene App-UPDATE/DELETE-Rechte | Revisions-/Notizfreitexte, vollständige Favorite-/Usage-/Restoredatenbehandlung |
| `training-documentation` | SQL-Guard, Revisionen und isolierte reale PG-Tests | Alle historischen Teilnehmerreferenzen **und** Freitext-Fremdnamen, verifizierte Rollenzugriffe im Remote-Workflow |
| `training-plans` | Vorhandene subjectgebundene Löschung-/Replay-Tests | Alle Personenreferenzen in Plan- und Revisionseinträgen, auch nach älterem Backup |
| `ulc-linz-lifecycle` | **Nur live** in produktivem Neon nach separat freigegebenem atomarem `CREATE OR REPLACE FUNCTION` am 22.11. gegen alte MVCC-Snapshots gehärtet; 11/11 Nachprüfungen mit App-/Owner-Rolle PASS, exakter [Transaktions- und Prüfnachweis in #607](https://github.com/martinirrgeher-cloud/appbasis/issues/607) | **Originalmigration v17 reproduziert diesen Hotfix noch NICHT**: vor Quarantäne-Restore/Fresh-Install Bytevergleich und separate Migrationsfreigabe erforderlich. Zusätzlich Session-Notizen, Trainer-/Actor-/Proxy-Verweise, atomarer Lösch-Koordinator und Cross-Owner-Replay |

Der **vorhandene** Acht-Owner-Prüfer verweigert bei fehlender neuerer unabhängiger Löschquelle, unvollständigem Backup-Horizont, fehlendem Owner, offenen Freitexten, Mediennachweisen, alten Schreibwegen, verbliebenen Zeilen oder abgelaufener 35-Tage-Autorität die Quarantänefreigabe. **Selbst wenn sämtliche acht Owner technisch PASS melden, liefert er nur `OPERATOR_REVIEW_REQUIRED`; `permitsPromotion=false`, `permitsDeployment=false`, `permitsDeletion=false`.** Die zugehörigen PostgreSQL- und Vitest-Regressionen bestehen bereits und werden nicht als neuer Benutzer-Funktionstest verlangt.

### Zusätzlich nach Codex-Review: produktive SQL-Hotfix-Quelle ≠ deklarierte Erstinstallationsmigration

**Eindeutige Live-Evidenz, nicht nur lokale Test-CI:** [#607, Abschnitt „P05-G02 tatsächlicher produktiver DDL-Cutover – PASS“](https://github.com/martinirrgeher-cloud/appbasis/issues/607) dokumentiert den von der Vereinsbetreiberfreigabe gedeckten Neon-`run_sql_transaction` vom **22.11.2026** auf `bold-dew-01343606` / `br-muddy-heart-b1vtydvc` (`production`) / `neondb`. Exakt **eine** `CREATE OR REPLACE FUNCTION public.ulc_linz_training_subject_write_fence()` wurde unter `neondb_owner` ausgeführt, mit gesperrter Vorprüfung gegen die veröffentlichte Migration, exaktem Postcheck und COMMIT (**6/6 Statements PASS**). Eine **unabhängige** Prüfung nach COMMIT unter `ulc_linz_application` und `neondb_owner` ergab **11/11 PASS**: `pg_proc.prosrc` entspricht exakt dem geprüften SQL-Kandidaten aus Git-Blob `2e193fffab6a1c8f4918f46de0e434426f877a06`; gleicher OID `115099`, Owner, `SECURITY DEFINER`, unveränderte Owner-only-ACL und Suchpfad, **3/3 aktive** Fences, 69 Tabellen und **0 geänderte Fach-/Markerzeilen**. Damit ist **die aktuelle produktive Live-Funktion** nachweislich gehärtet.

**P06 v19 deklarative Wiederherstellung – technischer Sollzustand im neuen Repository-Manifest:** Die historische `0017_ulc_linz_training_subject_write_fence.sql` bleibt unverändert und erzeugt zunächst die alte Funktion. Die **neue explizit nachgelagerte Owner-Migration `0018_ulc_linz_training_subject_isolation_reconciliation.sql`** ersetzt in der **angemeldeten v19-Owner-Migrationskette (46 statt 45 Dateien, weiterhin 69 Tabellen)** den Funktionskörper durch die exakte, am 22.11. bereits produktiv autorisierte und isoliert geprüfte Version. Sie ändert weder Tabellen, Trigger, ACL, Eigentümer, Suchpfad noch die 35-Tage-Löschmarker. Der separate PostgreSQL-E2E `p06-fresh-restore-fence-v19.postgres.e2e.test.ts` bildet **v18 → v19 und die komplette neue Erstinstallation** auf `localhost` nach und prüft alle drei Writer. **Diese neue Manifest-/Migrationsevidenz wird erst nach exakt grünem P06-PR-CI und unabhängiger Review als technisch PASS bezeichnet**; ein Commit im Repository allein ist keine ausgeführte Wiederherstellung.

**Restore-Sicherheitsgrenze bleibt:** Ein **älteres physisches Backup** kann vor der v19-Migration entstanden sein. Vor jeder Freigabe eines solchen Restore müssen (1) Writer/Ingress in Quarantäne bleiben, (2) die genau passende, getrennt genehmigte Migration/Reconciliation ausgeführt oder die vorhandene v19-Funktion bytegenau nachgewiesen werden, (3) tatsächlicher Rollen-/ACL-/Triggerstand geprüft und (4) **alle acht Daten-Owner samt neuerer Löschquelle, Freitext-/Medienreferenzen und vollständigem Backup-/Export-Horizont** unabhängig freigegeben werden. Nicht die historische Migration `0017` nachträglich überschreiben, nicht die produktive SQL-Funktion erneut ohne Auftrag anwenden. Der konkrete Ablauf wird im [P06-Restore-Runbook](./P06-RESTORE-V19-CHECKLIST.md) dokumentiert.

**Nicht belegt:** Ein realer, vollständig unabhängiger neuerer Erasure-Quellstand samt Replay über alle acht Owner eines älteren produktiven Datenbankbackups; die vollständige Liste möglicher lokaler/weiterer Exporte; die Freitextbereinigung in fremden Dokumenten/Logs. Nicht aus dem aktuellen leeren Athletenbestand auf diese Zusicherung schließen. Originale 35-Tage-Quellmarker und `postExpiryRetry=deny` unverändert; nicht verlängern.

## 3. Provider-Fakten – öffentliche aktuelle Quellen vs. Vereins-/Kontonachweis

| Thema | Öffentlich / technisch tatsächlich geprüft | Was **nicht** als belegt gelten darf |
| --- | --- | --- |
| Cloudflare DPA | [Offizielle aktuelle Cloudflare Data Processing Addendum](https://www.cloudflare.com/cloudflare-customer-dpa/) und [Cloudflare-Unterauftragsverarbeiter](https://www.cloudflare.com/gdpr/subprocessors/). Die öffentliche DPA regelt Kundenseite als Verantwortlichen/Vertragspartner; die konkrete Geltung/Vertragsidentität muss aus dem tatsächlich verwendeten Konto zugeordnet werden. | Dokumentversion, Annahme/Berechtigung, betroffene Services, Subprozessoren und Datenschutzkontakt der konkreten Vereinsnutzung sind **nicht aus der öffentlichen Webseite** nachgewiesen |
| Neon-Vertragslage **Stand 14.10.2026** | [Neon Product Specific Schedule](https://neon.com/platform-terms) nennt jetzt **Databricks, Inc.** als Vertragspartei für Neon; es verweist auf das aktuelle Databricks-MCSA/DPA und führt zusätzlich zu deren Subprozessoren **Grafana Labs in den USA** als Infrastruktur-Anbieter an. [Databricks DPA](https://www.databricks.com/legal/data-protection-addendum), [Subprozessorenliste](https://www.databricks.com/legal/databricks-subprocessors). | Die alte Neon-DPA-Datei aus 2024 darf nicht **ungeprüft** als allein maßgebliche aktuelle Vereinbarung gelten. Databricks-/Neon-Self-Service-Kundenidentität, gebundene DPA-Version und rechtlich erforderliche Drittland-/Unterauftragsbeurteilung bleiben kontospezifisch offen. Die Erwähnung von Grafana bedeutet **nicht automatisch** nachgewiesenen Transfer bestimmter ULC-Inhalte dorthin |
| Tatsächliche Neon-Region | `aws-eu-central-1` Frankfurt, PostgreSQL 18, History `21600s` (= 6 h) am 22.11. per Neon-Projektmetadaten überprüft. | Eine EU-Datenbankregion beweist **keine ausschließlich europäische Verarbeitung über alle Dienstleister/Logs** |
| Verschlüsseltes R2-Backup | [Cloudflare R2 Jurisdiction-Dokumentation](https://developers.cloudflare.com/r2/reference/data-location/) erläutert explizite EU-Jurisdiction; K2 [manueller verschlüsselter R2-Upload PASS](https://github.com/martinirrgeher-cloud/appbasis/actions/runs/45004350767) inklusive 30-Tage-Regelprüfung. | R2-EU-Jurisdiction für Backup beweist keine EU-only-Regel für Cloudflare Worker/andere Drittanbieter; erster eigenständiger K2-Schedule-Lauf erst **23.11.2026** kontrollierbar |
| Neon-Test-/Recovery-Kopien | Am 22.11. nochmals **1 Default + 3 Non-Default**. `ulc-p02-erasure-isolated-rehearsal-20261122` und `ulc-p2-51to69-final-rehearsal-20261120` beide TTL **19.12.2026 23:00 UTC**; Parent `ulc-p2-production-current-backup-20261120` noch ohne TTL (Kind-Abhängigkeit), beauftragter konditionierter Ablauf-Nachtrag **20.12.**. Manueller Snapshot `snap-odd-hat-b1yz457q` endet **05.12.2026 23:00 UTC**. | Fehlende Parent-TTL ist **nicht** automatisch erledigt; unbekannte externe/providerinterne Exporte dürfen nicht als gelöscht behauptet werden |

Die frühere **Bestätigung des Betreibers**, dass die persönlich geführten Anbieteraccounts offiziell für ULC Linz verwendet werden, bleibt **gültig und wird nicht erneut eingeholt**. Die sachliche Prüfung dieser öffentlichen Quellen ist **kein fingierter neuer Vertragsabschluss oder Rechts-GO**. Keine geheimen Account-IDs, Dokumente, Passwörter oder personenbezogenen Benutzerdaten in dieses Repository schreiben.

## 4. Kleine, echte Restfreigabe-Matrix – nur eine abschließende Betreiberentscheidung

- **Technisch schon PASS:** Vorhandene mobile Modul-/Login-Tests, produktive 69-Tabellen-SQL-Readiness, **3/3 ausschließlich live im Neon-Produktivbranch gehärtete Training-Löschschutz-Trigger** nach ausdrücklich genehmigtem 22.11.-Funktions-Write und 11/11 unabhängigem Nachcheck, private Worker-Security-Smoke, isolierter lokaler HTTP+PostgreSQL-E2E, K2-Backup manuell. **Nicht** für frische/ältere Restore-Schemata verallgemeinern; die v17-Migration enthält die Hotfix-Änderung noch nicht. Die geprüften Nullbestände nicht nochmals erzeugen.
- **Heute durch Repository-Scope nicht rechtlich ersetzbar:** Vereinsverantwortlichkeit und Datenschutzkontakt, geprüfte Rechtsgrundlagen und Eltern-/Trainerinformation, tatsächlich gebundener aktueller Cloudflare-/Databricks-Neon-DPA-/Subprozessorenstand; tatsächliche Drittland-/Backup-/Exportbeurteilung.
- **Technisch noch nicht global PASS:** Acht-Owner-No-Resurrection über alte Backups, unabhängige neue Erasure-Autorität, Freitext-/Trainer-/Actor-Bezüge und Provider-Medien; vollständige Quarantäne-Replay-Probe. Bestehenden P3-Gate nutzen, **nicht duplizieren**.
- **Kalenderbedingt offen:** erster unabhängiger geplanter K2-Upload am **23.11.2026, 03:19 UTC**, vorhandene einmalige Kontrolle am selben Tag. Kein neuer Backup-Test.
- **Bewusst weiter gesperrt:** `legalApproval=false`, `runtimeActive=false`, `applicationLifecycle=blocked`, `privacy=blocked`, `exercise-catalog/training-blocks/training-documentation`-Lifecycle-Gates. Private Minderjährigenmedien bleiben gesperrt. Neon-Free-`production.protected=false` ist dokumentiertes Restrisiko, **kein Upgrade beauftragt**.

**Entscheidungsregel:** Vor dem geschützten personenbezogenen Echtbetrieb braucht es **einen gebündelten, formal zuständigen Go-/No-Go-Entscheid**, dessen Rechts-/Vereinsreferenzen außerhalb dieses GitHub-Dokuments hinterlegt werden. Ein morgiger Backup-PASS allein darf diese Gegenstände nicht nachträglich auf `ready` setzen. **Keine Cloudflare-/Neon-/R2-/SQL-Schreiboperationen durch dieses Dokument.**
