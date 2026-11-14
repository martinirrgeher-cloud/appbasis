# P01 – Vereinsentscheidung zum geschützten ULC-Echtbetrieb

**Stand:** 14.11.2026 · **Status: ENTWURF – NICHT GENEHMIGT.**
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

## Produktive Providerbelege: noch offen

Das aktuelle `privacy/m5-provider-compliance-inventory.json` führt **Cloudflare** (Worker/Hyperdrive) und **Neon PostgreSQL** (Zielregion EU/Frankfurt) auf, jeweils mit offenen App-Produktionsbelegen. **Eine angegebene Zielregion ist keine bestätigte tatsächliche Produktionsregion.** Erforderlich: Vertrags-/AVV-/Unterauftragsverarbeiter-Nachweis, Region, Verschlüsselung, genaue Snapshot-/Backup-Aufbewahrung, Restore-Fähigkeit, Zuständigkeit und geprüfte Gültigkeit.

## Betreiberfreigabe – alle Felder noch offen

- [ ] Verantwortliche Vereinsfunktion, Datum und Datenschutzprüfung
- [ ] Zwecke, Betroffeneninformation, Rechtsgrundlage und Rollen für Minderjährige/Eltern/Trainer sowie Auskunft/Berichtigung/Löschung
- [ ] Frist und Fristbeginn **pro Datenkategorie** bestätigt, gesonderte berechtigte Ausnahmen dokumentiert
- [ ] D1: historische persönliche Usage und Freitext, zuständige Prüfung und Löschweg beschlossen
- [ ] D2: Variante A/B, reale Backup-Grenze, minimaler Löschbeleg und Löschbeleg-Retention beschlossen
- [ ] D3: tatsächlicher Provider/Medienarten, physischer Löschbeweis, AVV/Region bestätigt
- [ ] D4: isolierter Restore, Vollständigkeit neuer Autorität und Freigabeverantwortlicher bestätigt
- [ ] Cloudflare-/Neon-Produktionsbelege tatsächlich eingeholt und geprüft

**Weiterarbeit bis zum Beschluss:** Read-only Audit, isolierte Negativtests und Draft-Design zulässig. **Keine** Änderung produktiver Fristen, Berechtigungen, SQL-Migrationen, Löschrouten, Backup-Promotion, Freigabeverträge oder Deployments. Alle sechs Bestandsmodule samt ULC-Anmeldung/Anwesenheit bleiben Ziel des Pilotstarts. P03-D #615 ist ein Test-Prototyp, kein aktiver Guard.
