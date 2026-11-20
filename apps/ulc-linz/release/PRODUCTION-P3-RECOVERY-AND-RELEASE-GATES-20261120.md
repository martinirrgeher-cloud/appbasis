# ULC Linz P3 — Gesamtpaket statt M6-Einzelfehler

**Verifiziert 20.11.2026; Stand main vor diesem PR: `fa716b95552ed6985d85c55e24cf5ccbeae6640f`.** Dieses Dokument ist ein Umsetzungsplan und **keine** Produktionsfreigabe, keine Datenlöschrichtlinie und kein Deployment.

## Live-Ergebnis aus dem M6-Gesamtcheck

GitHub [Run 44813939055](https://github.com/martinirrgeher-cloud/appbasis/actions/runs/44813939055), zwei voneinander unabhängige Jobs:
- Pilot-Secrets `m4-dr`: **12/12 vorhanden**, beide bisherigen Cloudflare-Token für GET `/workers/subdomain` **HTTP 200**. Das ist **kein** Nachweis einer WRITE-Berechtigung.
- Repository-Secret für separaten neuen Produktions-Token: vorhanden und Cloudflare-GET erfolgreich.
- Application-/Security-Log-DB-URLs: Syntax und direkter Neon-Host PASS, Rollen sind verschieden. Das beweist noch keine tatsächliche Passwort-Loginverbindung.
- Worker `appbasis-ulc-linz-production`: exakter Name, kein workers.dev-Ingress, keine Preview-URLs, keine zugeordneten Domains/Routen: PASS.
- Worker **existiert bereits mit `deployed_on != null`, 10 historischen Deployments und 35 erkannten Versionen**. Daher sind `m6-ulc-production-runtime-config.yml` und `m6-ulc-private-production-deploy.yml` (Erstinstallation, Null-Deployments) **strukturell falsch** und dürfen auf diesem Worker nicht erneut gestartet werden.
- Exaktes **Security-Log-Hyperdrive PASS**; exaktes **Application-Hyperdrive BLOCKED** (fehlend, inkorrekt oder unzureichende Hyperdrive-Leserechte). Keine Hyperdrive-Veränderung ohne präzisen Vergleich und Backup-/Rollbackfreigabe.
- App-Produktionskomposition `blocked`; die Module `exercise-catalog`, `training-blocks`, `training-documentation` und die übergreifenden Datenschutz-/Lifecycle-Nachweise sind ebenfalls `blocked`.

Production Neon `bold-dew-01343606 / br-muddy-heart-b1vtydvc / neondb` hatte bei der letzten lesenden Abnahme **69 Tabellen, 501 Spalten, 145 Indizes, drei aktive Training-Fence-Trigger und fünf getrennte Loginrollen**. Der P2-Datenabgleich stellte **51/51 Alttabellen, 141/141 ursprüngliche Zeilen** unverändert fest. Recovery-Snapshot `snap-odd-hat-b1yz457q` läuft am **05.12.2026 23:00 UTC** ab; davor muss bei weiterem produktiven Datenwrite ein neuer, geprüfter Recovery-Punkt existieren.

## P3-A — Infrastruktur: einmaliger Abgleich statt Probedeploys

**Bereits hier umgesetzt:** Der lesende Gesamt-Preflight unterscheidet künftig jeden einzelnen Hyperdrive-Vertragsparameter (Namenseindeutigkeit, Host, Port, Datenbank, Loginrolle, PostgreSQL-Protokoll, Query-Cache) **ohne Ausgabe von Verbindungsdaten**. Außerdem beurteilt er den **bestehenden** privaten Worker mit dem kanonischen `evaluateUlcLinzPrivateRuntimeRefreshState`-Vertrag; historische Deployment-Einträge sind nicht automatisch ein Fehler.

**Unmittelbar nach Prüflauf:**
1. Nur **lesen**: Anwendungshyperdrive als *fehlt*, *doppelt*, *abweichender Host/Port/DB/Login/Cache* oder *API-Recht fehlt* klassifizieren. Kein öffentliches Öffnen des Workers.
2. Bestehende aktive Worker-Version auf exakt einen 100%-Traffic-Eintrag, bekannte historische Versionsannotation, aktuelle Better-Auth-Secret-HMAC und geschlossene Routen prüfen. Bei Auth-Secret-Drift **STOP**, nicht blind Upload/Deploy erzwingen.
3. Existiert die Application-Hyperdrive-Ressource mit falschem Ursprung, ist ein explizit autorisierter, gegen genau diese ID gebundener **Credential-Reconcile** erforderlich; fehlt sie, ist eine dedizierte **Create**-Freigabe nötig. **Nicht** den vorhandenen Worker neu anlegen oder löschen; Security-Log-Hyperdrive unverändert lassen.
4. Nach PASS und gesonderter Betreiberfreigabe ausschließlich `m6-ulc-production-runtime-refresh-config.yml` und `m6-ulc-private-production-refresh-deploy.yml` verwenden. Beide Workflow-Inputs müssen das geprüfte neue `main`-SHA treffen; das zweite Deployment bleibt privat.

**PASS:** Getrennte korrekte App-/Security-Hyperdrives, vorhandene Worker-Active-Deployment-Provenienz, keine öffentliche Route, kein Unknown Version/Role Drift, freigegebener frischer Recovery-Punkt.

## P3-B — Module und echte Daten: zusammenhängendes, prüfbares Umsetzungspaket

Aktuelle Quellstände sind **nicht** mit Freigabe zu verwechseln. Folgende Module und ihre bereits vorhandenen Bausteine sind pro Owner abzunehmen:

| Bereich | Bereits vorhandene Bausteine | Noch nötiger vollständiger Nachweis |
|---|---|---|
| Katalog | Postgres-Repository, favorite/usage-SQL, privater Medien-Löschkoordinator, 0004-Migration, guarded Tests | Autorisierter echter Schreibpfad mit `require-catalog-erasure-marker`, verbindliche Identitätszuordnung der Nutzung, Media-Provider-Abwesenheitsnachweis und Sperre gegen Neuanlage/Restore |
| Blöcke | Revisions-/Favoriten-/Usage-Repository, Tombstone/Restore-Helper, PostgreSQL-E2E | Automatisierter Owner-übergreifender Live-Löschpfad mit verifiziertem Subjekt, konkurrierenden Writes, Versionen/Historie und No-Resurrection |
| Dokumentation | Postgres-Repository, Access-/HTTP-Service, Subjektmarker, Revision-/Redaction-/Restore-Tests | Vollständig produktiv gebundener Auth-/Rollen-/Scope-Nachweis, revisionssicherer Writer- und Delete-Fence, Teilnehmer in fremden Dokumentrevisionen, Cross-Owner-Restore |
| App-Anwesenheit/Anmeldung/Trainer | Drei aktive Stale-Subject-Fence-Trigger, getrennte App-Daten und Audits | Fachlich festgelegte Lebensdauer für Trainingsinhalte/Freitext, wiederholbares vollständiges Backup-/Lösch-/Restore-Replay aller Besitzer |

Die bestehenden `modules/*/appbasis.production.json` bleiben bewusst auf `blocked`, bis diese Kriterien durch konkrete, verifizierte Tests und die erforderliche fachliche Freigabe erfüllt sind. Bloßes Setzen auf `ready` wäre eine Scheinlösung. Bereits mobile-abgenommene unveränderte Funktionen müssen nicht erneut von Grund auf getestet werden.

## P3-C — Datenlebenszyklus und Datenschutz ohne Endlos-Gates

Die **fachliche Zielvorgabe** vom 14.11. ist als `privacy/p01-operator-retention-candidate.json` dokumentiert, aber ausdrücklich **keine** rechtliche-/Providerfreigabe oder automatische Löschaktivierung. Bestehend: 35 Tage Markerautorität, nach Ablauf **deny**, automatische Purges deaktiviert.

Vor echtem Vereinsbetrieb mit Kinder-/Personendaten einmalig **konkret** entscheiden und belegen:
- Datenminimierung und Aufbewahrung nach Training, Kontakten, Sicherheitsprotokoll, Freitext und Dokumentrevision.
- Wie Löschentscheidungen bei alten Backup-Ständen über **alle acht Daten-Owner** gültig bleiben, auch nach 35 Tagen (gegebenenfalls Restore isoliert verweigern statt automatisch ältere Daten zu reaktivieren).
- Ob private Medien gebraucht werden; bis Anbieter-/Auftragsverarbeitungs-/Löschbeleg vorhanden ist: **keine personenbezogenen Kinderbilder neu erfassen**.
- Vor öffentlicher Pilotfreigabe den vollständigen `node tooling/production-contract.mjs ulc-linz --require-ready`-Gate mit den tatsächlichen unveränderten Modulen prüfen.

**Nicht nötig:** zusätzliche Token auf Verdacht, Neuanlegen des Workers, erneute 51→69-Migration, pauschales Freigeben von PRIVACY/GUARD-Rechten, wiederholte Erstinstallations-Workflows.

## P3-D — Geschützter Test und geordneter Start

Erst nach P3-A/B/C-PASS: **ein** frischer M6-Probelauf auf exakt eingefrorenem Release-SHA mit dediziertem Login-/Rechtesmoke, U12/U14/Kindertraining, IRG, Übungen/Blöcken, Plänen, Dokumentation, Datenexport und Sicherung. Danach gesonderte Betreiberfreigabe für Pilot-Ingress und erst nach Handy-Abnahme für Echtbetrieb. Bei FAIL bleibt bestehende produktive Worker-Version unverändert oder wird über geprüfte Version-Rollback-Prozedur wiederhergestellt; kein Daten-Restore ohne Subjekt-/Lösch-Reconcile.

**Arbeitsfreigaberegel:** Ohne gesonderte Freigabe nur lesen, isoliert testen, Dokumentation/PRs vorbereiten. Produktions-Cloudflare-/Neon-Writes, Module-`ready`-Promotions, Merges, Deploys, produktive Löschungen und öffentliche Freischaltung bleiben gesperrt.
