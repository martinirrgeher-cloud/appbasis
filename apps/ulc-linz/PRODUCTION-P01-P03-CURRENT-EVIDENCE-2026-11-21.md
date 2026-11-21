# ULC Linz – P01/P02/P03: geprüfter Produktionsstand und verbleibende Freigaben

**Stand:** 21. November 2026. **Zweck:** konkrete, quellbezogene Abgrenzung von technischem Nachweis, Vereinsentscheidung und Datenschutz-/Providerfreigabe. **Kein Release, keine Lösch-/Retention-Aktivierung und keine Produktivfreigabe.**

## 1. P01 – Aktueller Provider- und Datenbankbefund (nur lesend)

Direkt über den verbundenen Neon-Projektzugang geprüft:

| Nachweis | Aktueller Befund | Grenze |
| --- | --- | --- |
| Neon-Produktion | Projekt `appbasis-ulc-linz-production`, Region `aws-eu-central-1`, PostgreSQL 18 | Region ist ein Projektkonfigurationsbeleg, **kein** AVV-/Unterauftragsverarbeiter-Nachweis |
| Retentionsmetadaten | `history_retention_seconds = 21600` (= 6 Stunden) | Betrifft Projekt-Historie, **nicht** separate Backups, Exporte oder R2 |
| Produktionsbranch | `production`, Standardbranch, `protected=false` | Branch-Protection und Wiederanlauf organisatorisch weiter prüfen |
| Tatsächliche SQL-Datenbank | `neondb`, 69 öffentliche Basistabellen, 6 aktivierte eigene Trigger | Anzahl beweist keine vollständige Löschung bzw. alle Guard-Funktionen |
| Verein und Rollen | 4 aktive Trainingsgruppen, 2 aktive ULC-Mitgliedschaften, 1 aktive `ulc-linz:admin`-Rolle | Nur aggregierte Werte, keine Personendaten ausgelesen |
| Technischer ULC-Admin | Produktionsworkflow #44947982491 erfolgreich | Erstlogin/Passwortwechsel und Rechte-Handyabnahme stehen aus |
| Privater Worker | Refresh, Deploy, Security-Smoke, Lifecycle-Preflight auf `main=75947292eece97cdc707915ebf2802136b91443c` erfolgreich | Kein öffentlicher Zugang und keine gesamte Fach-/Privacy-Freigabe |

**Bereits fachlich entschieden (nicht neu zu genehmigen):** P01-Zielregeln vom 14.11. unter `PRODUCTION-PRIVACY-P01-OPERATOR-APPROVAL-PROPOSAL.md` und `privacy/p01-operator-retention-candidate.json`. Der Kandidat enthält `legalApproval=false`, `runtimeActive=false`; die Löschmarker bleiben bei **35 Tagen und danach deny**. D1–D4 bleiben Grundsätze und noch keine aktivierte Löschautomatik.

**Noch erforderliche echte Betreiber-/Rechts-/Providerbelege:**
1. Rechtliche Zwecke und Fristen je Kategorie; Kinder-/Trainerdaten, Freitexte, fremde Teilnehmer und Auskunft/Löschung; geeignete Vereins-/Datenschutzfreigabe.
2. Cloudflare-/Neon-AVV, Unterauftragsverarbeiter, tatsächliche Speicher- und Kopienregionen, Zugriffs- und Aufbewahrungsfristen.
3. Maximaler Restore-/Backup-Horizont aus Neon, verschlüsselten R2-Dumps und allen externen Exporten; tägliche Sicherung, Restore-Quarantäne und auditierbarer neuerer Löschbeleg über **alle acht Owner**.
4. Anbieterbestätigte Medienobjektlöschung einschließlich möglicher Sicherungskopien, angemessener Replay-/Reupload-Schutz. Bis dahin private Medien im produktiven HTTP-Worker **deaktiviert lassen**.

## 2. P02 – Gezielte technische Sicherheitskorrektur in diesem Paket

Der private HTTP-Abruf von Katalogvideos verwendete bisher `media.storageKey` aus der eigenen SQL-Metadatenzeile direkt bei einem Storage-`GET`. Ein fehlerhafter oder alter Row-Key hätte dadurch auf ein fremdes Objekt zeigen können, obwohl die SQL-Abfrage organisationsbeschränkt war. Der DELETE-Pfad verlangte dagegen bereits den exakten abgeleiteten Key.

**Änderung:** Ein gemeinsamer strenger Referenzvalidator prüft Organisation, Übung, Medien-ID und exakt den kanonisch abgeleiteten Objektschlüssel; GET und DELETE verwenden ihn. Auf unbekannte/fremde Referenzen erfolgt **kein Provider-GET/DELETE**. Offline-Negativtests decken fremde Organisation, Übung, Medien-ID, Key und ungültige Metadaten ab.

**Weitere P02-Sicherung:** Der produktive Plan→Block-Readiness-Check verweigert nun direktes UPDATE/DELETE/TRUNCATE auf personenbezogen zugeschriebenen Block-Usage-Zeilen und jegliches INSERT/UPDATE/DELETE/TRUNCATE auf deren Löschmarker für die normale App-Rolle. Die tatsächlichen Produktions- **und** Preview-Rollen wurden rein lesend geprüft: beide haben diese gefährlichen Rechte nicht. **Offenes Risiko:** die vorhandene Produktions-App-Rolle besitzt derzeit weiterhin UPDATE/DELETE auf der *alten, nicht attributierten* `appbasis_training_block_usage`-Tabelle. Das ist kein Freigabebeleg für Legacy-Usage und erfordert getrennte Owner-/Migration-/GRANT-Abnahme, bevor historische Usage als vollständig geschützt gelten darf.

**Nicht gelöst:** vollständiger providerbestätigter Lösch- und Restore-Horizont, Reupload-Race, historische persönliche Usage, 8-Owner-Koordination. `exercise-catalog` und `training-blocks` bleiben `blocked`.

## 3. P03 – Beendete Mitgliedschaften nicht weiter berechtigen

Der Doku-Access-Service las `active` und Quellrolle aus `ulc_linz_membership`, aber nicht die zusätzlich persistierte Spalte `ended_at`. Er verweigert jetzt auch dann den Zugriff, wenn eine fälschlich noch aktive Mitgliedschaft bereits ein Enddatum besitzt. Zusätzlich bewertet der **gemeinsame** `PostgresUlcLinzScopePersistence.resolveMembership` beendete Zeilen unabhängig vom noch gesetzten `active`-Flag als inaktiv. Bestehende Rollen-/Capability-Prüfungen bleiben bestehen; Unit- und echte PostgreSQL-Negativtests erzwingen **active=true + ended_at gesetzt => DENY**. Diese gemeinsame Änderung beeinflusst auch weitere Modulzugriffe und bleibt deshalb vor Merge/Deployment besonders reviewpflichtig.

**Nicht gelöst:** atomare Berechtigungsneubewertung unmittelbar beim Doku-SQL-Write, reale HTTP-Anmeldung unter den echten Benutzerrollen, vollständige Freitext-/Revisionen-/Trainer-Audit-Löschung und Restore-Nachweise. `training-documentation.authorization` und `applicationLifecycle/privacy` bleiben `blocked`.

## 4. Release-Entscheidung und nächster kritischer Pfad

Der echte M6-Composition-Lauf [#44950068674](https://github.com/martinirrgeher-cloud/appbasis/actions/runs/44950068674) ist vor einem Release korrekt am Produktionsvertrag gescheitert. Die hier gezeigten P02-/P03-Fixes sind **Teilkorrekturen**, keine Rechtfertigung, `appbasis.production.json` auf `ready` zu setzen. Weitere technische Umsetzung muss an [Sprint #607](https://github.com/martinirrgeher-cloud/appbasis/issues/607) anknüpfen: Cross-Owner-Writer/Restore, Dokumentationsauthorization, kontrollierte rechtliche Providerfreigabe und vollständige P04-E2E. Erst danach ein neuer exakt SHA-gebundener Composition-Gate-Lauf; vorher weder Ingress noch echte Vereinsdaten freigeben.
