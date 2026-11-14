# P01 – Vereinsentscheidung zum geschützten ULC-Echtbetrieb

**Stand:** 14.11.2026 · **Status: FACHLICHE ZIELREGELN BESTÄTIGT; RECHTS-/PROVIDER-/TECHNIK-FREIGABEN OFFEN.**
Quelle: [P01-Bestand](./PRODUCTION-PRIVACY-DECISIONS-P01-DRAFT.md), [P00](./PRODUCTION-READINESS-P00.md), [P02](./PRODUCTION-READINESS-P02.md), [P03](./PRODUCTION-READINESS-P03.md), [P03-B](./PRODUCTION-READINESS-P03-B-WRITER-AUDIT.md). Dieser Text ist keine neue Retention-Policy und keine Produktionsfreigabe.

## Vier Entscheidungen in einem Beschluss

| Code | Fachliche Empfehlung | Vor Freigabe zu klären |
| --- | --- | --- |
| D1 – Nutzungsnotizen | Neue personenbezogene Freitext-Usage in Katalog/Blöcken möglichst vermeiden. Mehrdeutige alte Usage-/Notiz-/Quellreferenzen als potentiell personenbezogen behandeln, nur eng berechtigt prüfen und **nicht anhand von Textmustern einem Athleten zuordnen**. | Braucht der Verein überhaupt persönliche Nutzungsverläufe? Wer entscheidet über Aufbewahrung, manuelle Prüfung und gesetzliche Löschsperren? |
| D2 – Löschbeleg | **Bestehende 35 Tage und post-expiry=deny beibehalten**, bis eine neue Entscheidung gilt. Für vollständig sichere Wiederherstellung entweder A: nachgewiesen lückenloser Abschluss aller Owner und Beseitigung aller älteren wiederherstellbaren Kopien innerhalb dieser Frist; oder B: separat genehmigte minimale, atomar belegte Löschautorität mit Zweck/Expiry abhängig vom tatsächlich dokumentierten Backup-Horizont. **B bevorzugt, sofern datenschutzrechtlich zulässig und technisch belegt.** | Variante A/B, Zweck, konkreter Backup-Horizont, minimale gespeicherte Merkmale, rechtliche Grundlage, Lösch-/Widerspruchsverfahren |
| D3 – Private Medien | SQL-Metadatenabschluss **erst nach** bestätigter wirklicher Objektlöschung beim Speicheranbieter; Replay, Fehler/Retry, Zugriffe und Region nachweisen. Der Übungskatalog bleibt im Gesamtumfang. | Medienarten, Kinderbilder, Speicheranbieter/Region, AVV, echte Objektlöschung und Fristen |
| D4 – Restore | Immer zunächst isoliert/quarantänisiert ohne Live-Writer; vollständige neuere Löschautorität aller Owner, Re-Deletion und Restdatenprüfung vor Freischaltung nachweisen. Bei Lücken Restore-Promotion verweigern. | Wer gibt Restore frei? Wie lange bleiben Provider-Backups/Exports real zugänglich? |

## Fristen: technisch vorhanden, aber nicht pauschal rechtlich genehmigt

| Datenbereich | Vorhandene technische Vorgabe laut `privacy/m5-data-inventory.json` im App-Verzeichnis | Betreiberentscheidung |
| --- | --- | --- |
| Stammdaten/Identität/Athleten/Kontakte | In mehreren Bestands-Pfaden 12 Kalendermonate nach Deaktivierung/Austritt/Zweckende | Rechtsgrund, Anlass und tatsächliche Frist freigeben oder begründet ändern |
| Sicherheits-, Berechtigungs-, Trainer-Audit | Für mehrere Auditpfade 12 Monate; einzelne Aktivierungen noch ausstehend | Je Auditzweck begründen, berechtigte Einsicht und Ausnahmen klären |
| Anwesenheit, Selbstanmeldung, Änderungen, Trainertermine | Keine in P01 genehmigte pauschale Frist | Pro Zweck und historische Notizen/Personenbezüge entscheiden |
| Plan-, Doku-, Block-, Katalogrevisionen/Favoriten/Usage | Uneinheitliche Lifecycle- und Markerbelege, unklare personenbezogene Alttexte | Zweck, Frist und Drittpersonenredaktion festlegen |
| Private Mediendateien | SQL-Status ist **kein** Nachweis der Providerlöschung | Provider, Speicherregion, Frist, Ausführung und Auditbeleg |
| Backups/Löschmarker | 35 Tage Original-Subject-Autorität; danach deny; App-spezifischer Cloudflare-/Neon-Nachweis offen | Vollständigen Wiederherstellungshorizont einschließlich exportierter Kopien, D2 A/B und Dokumentationsfrist festlegen |

**Rechtsrahmen:** DSGVO Art. 5 (Zweckbindung, Minimierung, Speicherbegrenzung) und Art. 17 (Löschung und Ausnahmen); keine allgemeine gesetzliche 12-Monats-Frist für Trainingsteilnahmen. Quelle: https://eur-lex.europa.eu/eli/reg/2016/679/oj


**Aktueller Stand (14.11.2026):** Die Inventarlücke aus dem früheren `current-materialized-v0.5` wurde technisch in PR #616 behoben: `m5-data-inventory.json` erfasst jetzt alle **41 aktuellen Manifestmigrationen** und **64 Tabellen**, sieben zusätzliche ULC-Migrations-/Feldrisiken und einen automatischen Drift-Test. **26 Tabellen** tragen weiterhin offene `pending`/`not-activated`/`not-implemented`-Nachweise. Das ist ein **Repository-v16-Abgleich und kein Nachweis des tatsächlich deployten Datenbankschemas**.

### Abgleich mit dem aktuellen Datenbankschema (Read-only, 14.11.2026)

Der vorangegangene Abgleich **41 vs. 34 Migrationen** ist in der aktuellen Inventarversion geschlossen: Die sieben zuvor fehlenden ULC-Migrationen (0009–0015) sind ausdrücklich erfasst, alle 64 Tabellen bereits zugeordnet. **Unvollständig bleiben rechtlich genehmigte Fristen, Feld-/Löschpfade, Live-Schema, Restore und Providerbelege.** Dies sind die betroffenen zusätzlich geprüften Felder:

- **0009:** Vereinsfunktionär als zusätzliche `membership.source_role` und Lösch-Quellrolle; Rollen-/Audit-Auswertung muss diese Identität berücksichtigen.
- **0010:** je 160 Zeichen optionale **persönliche Anmeldenotiz** sowohl in der aktuellen `training_registration` als auch in der dauerhaften `registration_change`-Historie. Das bloße Leeren der aktuellen Notiz lässt historische Kopien unberührt.
- **0011–0012:** bis fünf Trainingsinhaltstitel/JSON-Metadaten in `training_session` und personenbezogene Inhaltszuordnungen `training_attendance.training_content_slots`. Titel/JSON können trotz fachlichem Zweck Freitext enthalten; sie sind beim Erasure-/Export-Audit gesondert zu prüfen.
- **0013–0014:** zwei zusätzliche Tabellen `ulc_linz_youth_content_category` und `ulc_linz_youth_group_category`. Kataloglabels sind **nicht automatisch** personenbezogen, solange Freitextnamen nicht ausgeschlossen sind.
- **0015:** `ulc_linz_training_trainer_attendance` enthält historische `trainer_id`-Verknüpfungen, die laut Migration auch nach Gruppenwechsel erhalten bleiben. Löschung und Audit-/Retention-Frist müssen gesondert für Traineridentitäten greifen.

**P01-Gate:** Der **statische** Migrationsabgleich auf 41 ist erledigt; personenbezogene Feldbehandlung, aktuelle Deploy-Migrationen, freigegebene Retention und vollständige Cross-Owner-Erasure- sowie Restore-Belege sind **weiterhin offen**.

## Produktive Providerbelege: noch offen

Das aktuelle `privacy/m5-provider-compliance-inventory.json` führt **Cloudflare** (Worker/Hyperdrive) und **Neon PostgreSQL** (Zielregion EU/Frankfurt) auf, jeweils mit offenen App-Produktionsbelegen. **Eine angegebene Zielregion ist keine bestätigte tatsächliche Produktionsregion.** Erforderlich: Vertrags-/AVV-/Unterauftragsverarbeiter-Nachweis, Region, Verschlüsselung, genaue Snapshot-/Backup-Aufbewahrung, Restore-Fähigkeit, Zuständigkeit und geprüfte Gültigkeit.

### Read-only Neon-Kontrollbefund (14.11.2026)

Direkte Abfrage der verbundenen Neon-Projektverwaltung (ohne Datenbankabfrage oder Änderung):

- Projektname `appbasis-ulc-linz-production`: konfigurierte Region **`aws-eu-central-1`** (Frankfurt), PostgreSQL 18.
- Neon-API-Feld `history_retention_seconds=21600` = **6 Stunden** verfügbare Projekt-Änderungshistorie gemäß Projektmetadaten. **Das ist nicht die vollständige gesetzliche oder technische Aufbewahrungsdauer** sämtlicher Snapshots, Exporte, Fremdbackups oder Wiederherstellungsmedien.
- Snapshots-Liste für das Produktionsprojekt: **keine Einträge**; automatische Snapshotplanung der Default-Branch: **leere Liste**. Dies beweist weder ein vollständiges Fehlen von Backups noch ihre maximale Lebensdauer.
- Default-Branch `production` wird von Neon als `archived` und `protected=false` gemeldet. Der tatsächliche Zugriffs-/Betriebszustand und produktive Cloudflare-Worker-Bindings müssen getrennt verifiziert werden; **keine automatische Aktivierung, Branchschutz- oder Restoreänderung**.
- Offene Belege: konkrete App-to-Neon-Verbindung, Cloudflare-Projekt/Region, tatsächlich mögliche Restore-Horizonte einschließlich Exporte, AVV/DPA, Subprozessoren, Verschlüsselungs-/Berechtigungsnachweise.

**Folgerung für D2:** Aus dem 6-Stunden-PITR-Metadatenwert **darf nicht** geschlossen werden, dass die vorhandene 35-Tage-Quellautorität für sämtliche Backup-/Restore-Situationen genügt. Das D2-A/B-Gate bleibt offen.


## Aktualisierte Schema-Inventur und technische Prioritäten

Die **41** derzeit deklarierten Migrationen erzeugen statisch **64** Tabellen; **alle 64** waren bereits in der früheren Tabellenliste enthalten. Korrigiert wurden die fehlenden sieben ULC-Migrationszuordnungen (v9 → v16) und die daraus resultierenden personenbezogenen Feldrisiken. Ein neuer automatischer Drift-Test prüft Manifest, Inventar und `privacy=blocked`. Konkrete Restarbeitspakete, Prüfkriterien und Freigabegrenzen: [P01-Schema- und Produktionsgatematrix](./PRODUCTION-READINESS-P01-SCHEMA-COVERAGE.md).

Dies ist **keine Aussage über das tatsächlich ausgerollte Datenbankschema**. Das aktualisierte Inventar verwendet deshalb ausdrücklich `repository-declared-schema-v16-review-not-runtime-evidence`. Die D1–D4-Sicherheitsgrundsätze sind als fachliche Zielvorgabe bestätigt. Ihre technische Wirksamkeit, rechtliche Belege und insbesondere die D2-Variante A/B samt Backup-Horizont sind weiterhin offen.

## Konkretisierte fachliche Fristenvorschläge – noch nicht genehmigt

Eine vollständige, testbare Klassifikation aller 64 Tabellen in 13 Entscheidungskategorien sowie der gesonderten Freitext-/Historienfelder wurde als **fachlich bestätigte, noch nicht aktivierte Zielvorgabe** im [P01-Betreiber-Entscheidungsvorschlag](./PRODUCTION-PRIVACY-P01-OPERATOR-APPROVAL-PROPOSAL.md) und `privacy/p01-operator-retention-candidate.json` vorbereitet. **Vorschläge sind keine gesetzliche Pflicht und keine Betriebsfreigabe.** Die tatsächlich freigegebene Frist kann je Zweck abweichen; die aktuelle 35-Tage-Löschquelle ist unverändert und nach Ablauf nicht verlängerbar.

## Betreiberfreigabe – fachliche Zielregeln bestätigt, Nachweise weiter offen

- [x] Fachliche Zielregeln und D1–D4-Grundsätze am 14.11.2026 in der Unterhaltung ausdrücklich bejaht (kein unterschriebener Nachweis, keine D2-B-Retention-Freigabe)
- [ ] Konkrete Vereinsfunktion, vollständiger schriftlicher Beschluss und Datenschutzprüfung
- [ ] Zwecke, Betroffeneninformation, Rechtsgrundlage und Rollen für Minderjährige/Eltern/Trainer sowie Auskunft/Berichtigung/Löschung
- [x] Fachliche Fristenvorschläge (12/24 Monate, 90-Tage-Prüfung, 35-Tage-Marker) als bedingte Zielvorgabe bestätigt
- [ ] Rechtliche Erforderlichkeit, Fristbeginn und Ausnahmen **pro Datenkategorie** dokumentiert
- [x] D1-Grundsatz: historische persönliche Usage und Freitext eingeschränkt behandeln, keine geratenen Zuordnungen
- [ ] D1 operative Zuständigkeiten und konkrete Lösch-/Prüfwege nachgewiesen
- [x] D2-Grundsatz: bestehende 35 Tage/deny bis zur gesonderten fundierten A/B-Entscheidung beibehalten
- [ ] D2 Variante A/B, reale Backup-Grenze, minimaler Löschbeleg und Löschbeleg-Retention separat beschlossen
- [x] D3-Grundsatz: keine neuen identifizierbaren Minderjährigenmedien ohne Provider-/Rechts-/Löschbeleg
- [ ] D3 tatsächlicher Provider/Medienarten, physischer Löschbeweis, AVV/Region bestätigt
- [x] D4-Grundsatz: Restore nur quarantänisiert, mit neuerer Löschquelle und allen Ownern
- [ ] D4 vollständige Wiederherstellungskette und Freigabeverantwortlicher nachgewiesen
- [ ] Cloudflare-/Neon-Produktionsbelege tatsächlich eingeholt und geprüft

**Weiterarbeit bis zur Sicherheits-/Provider- und Produktivfreigabe:** Isolierte Negativtests und Draft-Design zulässig. **Keine** Änderung produktiver Fristen, Berechtigungen, SQL-Migrationen, Löschrouten, Backup-Promotion, Freigabeverträge oder Deployments. Alle sechs Bestandsmodule samt ULC-Anmeldung/Anwesenheit bleiben Ziel des Pilotstarts. P03-D #615 ist ein Test-Prototyp, kein aktiver Guard.
