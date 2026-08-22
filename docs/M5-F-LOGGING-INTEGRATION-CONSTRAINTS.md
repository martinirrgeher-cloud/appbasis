# M5-F – Logging-Integration: M5-G-/M5-H-Folgeverträge

Stand: 2026-08-19, 16:29 Europe/Vienna

## Status

Ergänzung zum finalen Vorbereitungspaket und zur bestehenden M5-F-Calendar-Retention-Spezifikation. Keine Implementierung, kein Providerwrite und keine Änderung der aktuellen M5-F/G/H-Owner.

Diese Ergänzung schließt zwei beim abschließenden Architekturreview erkannte Integrationsgrenzen, die vor einer späteren realen Logging-Materialisierung zwingend berücksichtigt werden müssen.

## 1. M5-G – Logging verändert den realen Datenfluss

Der heutige M5-G-Vertrag ist absichtlich fail-closed: Ein später tatsächlich vorhandener zusätzlicher Telemetry-/Logging-Flow blockiert die Provider-Evidence, bis der kanonische reale Datenfluss bewusst aktualisiert und bewertet wurde.

Der vorbereitete M5-F-Pfad würde mindestens neue reale Beziehungen materialisieren:

- ULC Production Worker -> Cloudflare Tail Worker,
- Cloudflare Tail Worker -> ULC Production Neon/PostgreSQL Security-Log-Persistenz,
- Scheduled Maintenance Worker -> ULC Production Neon/PostgreSQL Retention-Cleanup,
- geschützter Evidence-/Operations-Read -> Security-Log-/Privilege-Inventar, soweit für reale Evidence benötigt.

Daraus folgt:

1. Vor positiver M5-F-Production-Evidence muss das **bestehende M5-G-Inventar** den dann tatsächlich materialisierten Logging-/Maintenance-Datenfluss enthalten.
2. Es wird keine parallele zweite M5-G-Datenflussliste erstellt.
3. Nur die wirklich implementierten Beziehungen werden aufgenommen; keine hypothetischen SaaS-/Telemetry-Flows.
4. DPA/AVV, Subprozessoren, Transfers, Verschlüsselung und Datenregion werden auf den aktualisierten realen Flow neu bewertet.
5. F/G/H/I/J müssen weiterhin denselben realen Resource-Binding-/Zeitfenster-Snapshot verwenden.
6. Bis zur Aktualisierung bleibt M5-G bzw. die daraus abhängige High-Privacy-/J-Evidence korrekt fail-closed offen.

## 2. M5-H – heutiger Service-Binding-Vertrag passt nicht blind auf Tail/Cron

Der aktuelle M5-H-Consumer modelliert jede inventarisierte privilegierte Cloudflare-Komponente als dedizierte nicht öffentliche Ressource mit **exakt einer internen Service-Binding-Beziehung von der öffentlichen ULC-Runtime**.

Das ist für den heutigen ULC-Stand korrekt, kann aber die vorbereiteten Logging-Komponenten nicht ungeprüft darstellen:

- Ein Tail Worker ist als Tail-Consumer des Producer Workers gebunden und **nicht automatisch ein Service Binding**.
- Ein Scheduled Maintenance Worker wird über einen Cron Trigger ausgeführt und benötigt **keine direkte Service-Binding-Beziehung von der öffentlichen Runtime**.
- Der Maintenance Worker besitzt Retention-/Delete-Autorität und darf deshalb nicht aus einer privilegierten Komponenten-/Least-Privilege-Inventur verschwinden.
- Der Tail Worker besitzt Security-Log-Ingest-Autorität und muss ebenfalls bewusst klassifiziert werden.

Daraus folgt für den späteren technischen Logging-Slice:

1. M5-H-Komponententaxonomie vor Implementierung erneut gegen den realen Tail-/Scheduled-Vertrag prüfen.
2. Tail-/Cron-Beziehungen **nicht** als fiktive Service Bindings ausgeben, nur um den heutigen H-Shape zu erfüllen.
3. Falls beide Worker als privilegierte Komponenten in H fallen, den bestehenden H-Owner klein und fail-closed um die tatsächlich benötigten Beziehungstypen erweitern, beispielsweise getrennte providerbelegte Bindungsarten für Tail-Consumer und Scheduled-Execution.
4. Falls eine Komponente fachlich nicht in H fällt, muss ihre Privilegien-/No-Public-Ingress-/Least-Privilege-Evidence trotzdem in einer bereits kanonischen Security-Grenze vollständig belegt sein; sie darf nicht aus der Evidence verschwinden.
5. Keine zweite Control-Plane-Plattform oder parallele H-Evidence bauen.
6. Jede solche H-Vertragsänderung invalidiert die alte H-Production-Evidence und benötigt vollständige Tests, Exact-Head-CI, ChatGPT-Security-Review und finalen Codex auf dem tatsächlichen finalen Integrationshead.

## 3. Empfohlene serielle Reihenfolge nach #165

Keinen F-/G-/H-Fundamentvertrag parallel verändern.

Empfohlene Reihenfolge:

1. #163/#165 vollständig abschließen.
2. M5-F Calendar Retention / Security-Log-Persistenz als kleinen realen Vertical Slice umsetzen.
3. Im selben Integrationszyklus den dadurch **tatsächlich** neu entstandenen M5-G-Datenfluss aktualisieren.
4. M5-H nur soweit erweitern, wie die realen Tail-/Scheduled-Komponenten es zwingend benötigen.
5. vollständige gemeinsame Exact-Head-CI.
6. ChatGPT Privacy-/Security-/Architecture-Review über F↔G↔H.
7. Findings gebündelt korrigieren und CI erneut.
8. genau ein finaler Codex-Review auf dem gemeinsamen finalen Head.

Damit entsteht kein Codex-Zwischenreview und keine Drift zwischen F, G und H.

## 4. Cloudflare-Providercheck vor Umsetzung

Aktuelle öffentliche Cloudflare-Dokumentation bestätigt grundsätzlich:

- Tail Workers verarbeiten Ausführungsinformationen eines Producer Workers und können Daten filtern/weiterleiten,
- Cron Triggers führen einen Worker über `scheduled()` periodisch aus,
- das Worker-Inventar ist read-only über `GET /accounts/{account_id}/workers/scripts` lesbar,
- die List-Workers-API liefert unter anderem vorhandene `tail_consumers`.

Account-/Planfähigkeit ist damit **nicht** bewiesen. Vor einer realen Umsetzung muss sie für den tatsächlich gewählten Cloudflare-Account read-only bestätigt werden. Insbesondere wird keine kostenpflichtige Tail-Worker-Fähigkeit nur aufgrund öffentlicher Dokumentation vorausgesetzt oder aktiviert.

## 5. Externe Wirkung

Keine.

- kein Codex,
- keine M5-F/G/H-Codeänderung,
- kein Cloudflare-/Neon-Write,
- kein Worker,
- kein Cron Trigger,
- kein DB-Schema,
- kein Secret,
- keine Production-Evidence,
- keine Produktionsfreigabe.
