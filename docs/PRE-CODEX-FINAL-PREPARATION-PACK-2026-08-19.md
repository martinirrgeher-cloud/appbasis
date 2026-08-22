# AppBasis – finales Vorbereitungspaket vor Codex

Stand: 2026-08-19, 16:25 Europe/Vienna

## Status

Dieses Dokument bündelt ausschließlich die letzten fünf sicheren Vorbereitungen vor dem morgigen Codex-/Merge-Ablauf. Es verändert weder die eingefrorenen Review-Heads #163/#165 noch Runtime, Schema, Migrationen, Providerzustand oder Produktion.

Verbindliche Quellen bleiben Entscheidungsregister, Betriebsakte, Roadmap/Gates, Runbook und die aktuellen Repository-Verträge. Bei Abweichungen wird fail-closed gestoppt.

Live-Snapshot zum Zeitpunkt dieser Vorbereitung:

- `main`: `e7fb8dbd5e76041109e2f045eabc50fc803c13a0`
- #163: Head `ab0e2c609c96463ddc015a4227589d22f5a7f2b1`, Draft, mergeable, Exact-Head-CI #1173 PASS
- #165: Base-SHA `ab0e2c609c96463ddc015a4227589d22f5a7f2b1`, Head `dc82bf4e4e89f7bc2261670f90a6bdc85743a727`, Draft, mergeable, Exact-Head-CI #1200 PASS
- #135 ist weiterhin ausschließlich Vorbereitungsstrang

Alle SHA-/CI-Werte sind nur Vorbereitungssnapshot und müssen vor jeder Codex-/Merge-Aktion live neu gelesen werden.

---

# 1. #165 – Restack Execution Pack nach #163-Squash

## 1.1 Heutige eindeutige Stack-Grenze

Der aktuelle #165-Head ist gegenüber seinem tatsächlichen Base-SHA `ab0e2c...` exakt 37 Commits voraus. Der Merge-Base ist ebenfalls exakt `ab0e2c...`.

Der isolierte #165-Diff umfasst heute genau diese 12 Pfade:

1. `docs/M6-ULC-FIRST-PROVIDER-WRITE-PREFLIGHT.md`
2. `docs/M6-ULC-MIGRATION-SMOKE-REHEARSAL.md`
3. `docs/M6-ULC-PRODUCTION-PREFLIGHT.md`
4. `package.json`
5. `tooling/ulc-linz-m6-first-provider-write-preflight.mjs`
6. `tooling/ulc-linz-m6-first-provider-write-preflight.test.mjs`
7. `tooling/ulc-linz-m6-migration-smoke-rehearsal.mjs`
8. `tooling/ulc-linz-m6-migration-smoke-rehearsal.test.mjs`
9. `tooling/ulc-linz-m6-production-preflight.mjs`
10. `tooling/ulc-linz-m6-production-preflight.test.mjs`
11. `tooling/ulc-linz-m6-provider-state-preflight.mjs`
12. `tooling/ulc-linz-m6-provider-state-preflight.test.mjs`

Diese Liste ist die **Restack-Allowlist**. Nach dem #163-Squash darf der neue #165-Diff gegen den dann aktuellen `main` nur diese Pfade enthalten, außer ein zusätzlicher Integrationsfix ist fachlich zwingend, einzeln erklärt und erneut vollständig geprüft.

## 1.2 Morgen unmittelbar nach #163 Post-Merge-CI

Vor jedem Git-Transfer live pinnen:

1. neuen `main`-SHA,
2. tatsächlichen #165-Head,
3. tatsächlichen #165-Base-SHA,
4. tatsächlichen Merge-Base zwischen Base und Head,
5. aktuellen 12-Dateien-Diff.

Wenn der tatsächliche #165-Base-SHA nicht mehr dem erwarteten Stack-Anker entspricht: STOP und neuen Trennpunkt bestimmen.

## 1.3 Bevorzugter Transfer

Bevorzugte Semantik:

```text
git rebase --onto <new-main> <actual-#165-base-sha> agent/m6-ulc-production-preflight
```

Der alte #163-Stack-Anteil wird damit nicht erneut auf den neuen Squash-Main übertragen. Anschließend wird #165 auf `main` retargetet.

Der Rebase ist nur zulässig, wenn die 37 Commits tatsächlich ausschließlich zur #165-spezifischen Range nach dem gepinnten Base-SHA gehören.

## 1.4 Sicherer Fallback

Wenn der Rebase wegen eines #163-Codex-Fixes oder unklarer Historie nicht eindeutig lösbar ist:

- frischen Branch vom neuen `main` erzeugen,
- ausschließlich die verifizierte #165-Commit-Range nach dem tatsächlichen alten Base-SHA übertragen,
- alternativ die 12 beabsichtigten Dateiänderungen semantisch sauber übernehmen,
- keine alte M5-Historie übernehmen.

Kein blindes Force-Pushen eines unklaren Rebases.

## 1.5 Diff-Gate nach Transfer

Pflichtprüfungen vor CI:

- Merge-Base = neuer `main` oder bewusst erklärter aktueller Anker,
- Diffpfade gegen die 12-Dateien-Allowlist prüfen,
- keine M5-B/C/D/E/F/G/H/I/J-Datei erneut im Diff,
- keine Generator-/Runtime-/Security-Grundlage aus #163 versehentlich überschrieben,
- `package.json` enthält nur die beabsichtigte Testregistrierung/Integration,
- kein Provider-Write wird freigeschaltet,
- `providerWriteAllowed=false`, `releaseAuthorized=false`, `explicitApprovalRequired=true` bleiben semantisch erhalten.

Unerwarteter Zusatzpfad oder alte M5-Historie = STOP vor CI/Codex.

## 1.6 Finales Gate

Erst danach:

1. vollständige literal Exact-Head-CI,
2. ChatGPT Diff-/Architektur-/Security-/Operations-Review,
3. Findings gebündelt beheben,
4. nach Head-Änderung vollständige CI erneut,
5. finalen Head pinnen,
6. genau ein finaler Codex-Review,
7. Expected-Head-Squash-Merge,
8. Post-Merge-CI auf `main`.

---

# 2. M5-F – konkreter minimaler Neon/PostgreSQL-Security-Log-Pfad

## 2.1 Architekturentscheidung für die Vorbereitung

Die bestehende `M5-F Calendar Retention Evidence`-Spezifikation bleibt maßgeblich. Dieses Paket präzisiert nur den kleinsten realen Verbraucher für `controlled-calendar-enforcement`.

Bevorzugte Richtung:

```text
ULC Production Worker
  -> Cloudflare Tail Worker (nur Ingest-Rechte)
  -> ULC-eigene Production PostgreSQL/Neon-DB, Security-Log-Schema

Cloudflare Scheduled Maintenance Worker (nur Retention-Rechte)
  -> täglicher kalendergenauer Cleanup derselben Security-Log-Tabelle
```

Es entsteht keine allgemeine Logging-Plattform und kein neuer AppFactory-Provider-Layer.

## 2.2 Warum zwei nicht öffentliche Worker statt eines Kombi-Workers

Die Security-Grenze soll Least Privilege real beweisen:

- Tail/Ingest darf `INSERT`, aber kein `SELECT`, `UPDATE`, `DELETE`.
- Retention-Cleanup darf nur den exakt notwendigen `DELETE` gegen die Security-Log-Tabelle ausführen.
- geschützter Operations-/Evidence-Read darf `SELECT`, aber kein `INSERT`, `UPDATE`, `DELETE`.
- die öffentliche ULC-Runtime erhält keinen direkten Security-Log-DB-Zugriff.

Wenn Ingest und Cleanup im selben Worker mit workerweiten Bindings/Credentials kombiniert würden, würde der Ingest-Pfad faktisch auch Delete-Autorität besitzen. Das wäre für den heutigen realen Verbraucher unnötig breit.

Daher Vorbereitungsempfehlung:

1. **Tail-Ingest-Worker**: nur `tail()`; kein öffentlicher `fetch()`-Ingress; nur Ingest-Credential/Binding.
2. **Retention-Maintenance-Worker**: nur `scheduled()`; kein öffentlicher `fetch()`-Ingress; nur Cleanup-Credential/Binding; täglich.

Keine weitere Worker-Abstraktion ohne zweiten realen Verbraucher.

## 2.3 Datenbank-Ownership

Der Security-Log-Pfad soll innerhalb der **ULC-eigenen dedizierten Production-Datenbank** liegen. Kein zusätzliches Neon-Projekt wird allein für Logging vorausgesetzt oder angelegt.

Das wahrt die App-Isolation: keine andere eigenständige App teilt diese Produktionsdatenbank.

Ein zusätzliches dediziertes Neon-Projekt wäre nur bei einem später konkret belegten Isolation-/Betriebsbedarf neu zu entscheiden und wäre ein eigener freigabepflichtiger Providerwrite.

## 2.4 Minimale Persistenz

Konkrete Namen werden erst im Implementierungsslice an Repository-Konventionen angepasst. Semantisch erforderlich ist genau eine app-spezifische Security-Log-Tabelle mit:

- serverseitig erzeugter Event-ID,
- autoritativem DB-`created_at` als Retention-Anker,
- Event-Schema-Version,
- Event-Typ,
- exakt validiertem/sanitisiertem Security-Event-Payload.

Keine zusätzlichen personenbezogenen Felder werden für Analytics erfunden.

`occurredAt` aus dem bereits validierten Event darf im Payload erhalten bleiben, aber die Löschgrenze richtet sich nach dem serverseitigen DB-`created_at`. Damit kann ein Event-Zeitstempel die Retention-Grenze nicht manipulieren.

Security-Events sind im normalen Pfad unveränderlich: Runtime-Rollen erhalten kein `UPDATE`.

## 2.5 DB-Rollen / Privilegien

Minimal getrennt:

### Migration-/Owner-Rolle
- DDL/Ownership nur für kontrollierte Migration,
- nicht als Runtime-Credential verwenden.

### Ingest-Rolle
- `INSERT` ausschließlich auf Security-Log-Tabelle,
- kein `SELECT`, `UPDATE`, `DELETE`, DDL.

### Operations-/Evidence-Read-Rolle
- `SELECT` ausschließlich soweit für geschützte operative Abfrage und Evidence notwendig,
- kein `INSERT`, `UPDATE`, `DELETE`, DDL.

### Retention-Rolle
- ausschließlich der notwendige `DELETE` auf der Security-Log-Tabelle,
- kein `INSERT`/`UPDATE`,
- kein DDL,
- Rückgabe nur aggregierte Delete-Anzahl.

Zusätzlich:

- keine relevanten Rechte für `PUBLIC`,
- Trigger, Funktionen, Jobs, TTLs oder sonstige Delete-fähige Pfade vollständig inventarisieren,
- unbekannte zweite Delete-Grenze = M5-F fail-closed.

## 2.6 Tail-Ingest-Vertrag

Der Tail Worker darf nur die bereits bestehende normalisierte ULC-Security-Event-Grenze konsumieren:

- ausschließlich `[ulc-linz-security] `-Einträge,
- Präfix entfernen,
- JSON parsen,
- exaktes Event-Schema erneut validieren,
- keine URL, Header, IP, Request-/Response-Bodies, Exceptions oder Tail-Metadaten übernehmen,
- `getUnredacted()` nicht verwenden,
- keine Credentials oder Providerdetails loggen,
- Sinkfehler dürfen die bereits verweigerte Producer-Anfrage nicht nachträglich verändern.

Die bestehenden Event-Typen und Datenminimierung bleiben unverändert maßgeblich.

## 2.7 Kalendergenauer Cleanup

Semantik identisch zum bestehenden Permissions-Audit-Vertrag:

```text
created_at < now - 12 * INTERVAL '1 month'
```

Verbindlich:

- serverseitig komponierte Clock,
- kein Request-/Client-`now`,
- exakt auf der Grenze bleibt erhalten,
- nur strikt ältere Zeilen werden gelöscht,
- Monatsenden/Schaltjahre über PostgreSQL-Kalendersemantik,
- Delete-Ergebnis nur aggregiert,
- Cleanup-Fehler erzeugt niemals positive Production-Evidence.

Ausführung zunächst täglich über den minimalen Scheduled Maintenance Worker.

## 2.8 Evidence-Bindung

`auditSecurityLogging=true` darf später nur entstehen, wenn gemeinsam belegt sind:

- reale ULC-Production-Resource-Binding-Evidence,
- konkrete Tail-Worker-/Sink-Bindung,
- exakte Event-Schema-/Runtime-Pins,
- geschützter operationaler Zugriff,
- vollständiges Sink-Inventar,
- keine öffentliche Read-API,
- DB-Privilege-Inventar für Ingest/Read/Cleanup,
- keine unbekannte Delete-/TTL-/Job-Grenze,
- exakter Retention-Owner-/Migration-/Acceptance-Digest,
- reale Scheduler-/Execution-Bindung,
- letzter erfolgreicher Cleanup-Lauf innerhalb des Evidence-Fensters,
- dasselbe Resource-Binding-/Zeitfenster wie die übrige volatile M5-Evidence.

Der bestehende M5-F-Owner bleibt der einzige Owner von `auditSecurityLogging`.

## 2.9 Tests für den späteren Slice

Zusätzlich zu der bestehenden Calendar-Retention-Spezifikation mindestens:

1. Tail Worker besitzt kein Cleanup-/Delete-Binding.
2. Maintenance Worker besitzt kein Ingest-/Query-Binding.
3. beide Worker besitzen keinen öffentlichen `fetch()`-Ingress.
4. öffentliche ULC-Runtime besitzt kein Security-Log-DB-Binding.
5. Ingest-Rolle kann INSERT und wird bei SELECT/UPDATE/DELETE abgewiesen.
6. Read-Rolle kann SELECT und wird bei INSERT/UPDATE/DELETE abgewiesen.
7. Retention-Rolle kann ausschließlich den erwarteten Cleanup-Write.
8. `PUBLIC` erhält keine relevanten Rechte.
9. DB-`created_at` ist Retention-Anker; manipuliertes Payload-`occurredAt` verändert den Cutoff nicht.
10. Event exakt an der 12-Monatsgrenze bleibt.
11. 1 ms älter wird entfernt.
12. Monatsende und Schaltjahr werden real PostgreSQL-E2E geprüft.
13. unbekannter Trigger/Job/TTL/Delete-Owner blockiert Evidence.
14. fehlgeschlagener oder veralteter Cleanup blockiert Evidence.
15. M5-I/J bleiben bei fehlender F-Evidence fail-closed.

## 2.10 Noch notwendige spätere Entscheidung

Noch **nicht** entschieden oder ausgeführt:

- tatsächlicher Logging-Sink/Create,
- tatsächliche Worker/Create-/Deploy-Aktion,
- tatsächliche DB-Migration,
- Secrets/Binds,
- kostenpflichtige Cloudflare-Funktion,
- Production-Evidence.

Vor dem technischen Slice werden aktuelle Cloudflare-/Neon-Plan- und Accountfähigkeiten erneut autoritativ geprüft.

---

# 3. Production-Ready-Terminologie – Entscheidungs-Paket

Die bestehende Datei `FACTORY-PRODUCTION-READINESS-TERMINOLOGY-PROPOSAL.md` enthält bereits die fachliche Empfehlung. Dieses Paket macht die Entscheidung explizit wählbar, ohne sie vorwegzunehmen.

## Option A – empfohlen: Semantik präzisieren, interne Kompatibilität erhalten

Lifecycle:

1. **Security & Privacy Ready** = exakt M5, 12/12 M5-Kriterien.
2. **Production Ready** = vollständiger technischer Pre-Release-Zustand aus kanonischen Preview-/M5-/M6-/Recovery-/Deployment-/Smoke-Verträgen.
3. **Produktion freigegeben** = Production Ready plus separates ausdrückliches Release-Gate.

Das bestehende interne M5-Feld `productionReady` darf vorerst aus Kompatibilitätsgründen bestehen bleiben. Die UI darf diesen internen Feldnamen aber nicht als vollständigen FC1-Lifecycle-Status darstellen.

Vorteile:

- geringster technischer Churn,
- keine unnötige Evidence-/Contract-Pin-Kaskade,
- Roadmap und FC1 werden fachlich eindeutig,
- Production Ready wird breiter und nicht schwächer,
- Release bleibt separat.

## Option B – internes M5-Feld sofort umbenennen

Nicht empfohlen.

Grund:

- hoher Änderungsumfang quer durch Evaluatoren, Fixtures, Snapshot-/Evidence-Pins und UI,
- keine zusätzliche Sicherheitswirkung gegenüber Option A,
- unnötiges Risiko unmittelbar vor dem ersten realen M6-Durchlauf.

## Option C – M5 weiterhin in der UI als vollständiges `Production Ready` anzeigen

Abzulehnen.

Grund:

- widerspricht der breiteren Roadmap-/FC1-Semantik,
- könnte trotz offenen Recovery-/Production-/Migration-/Deployment-/Smoke-Gates einen zu starken Status behaupten.

## Empfehlung zur Entscheidung

**Option A.**

Keine neue allgemeine Readiness-Plattform bauen. Der breite Production-Ready-Zustand muss später aus den bestehenden kanonischen Gates komponiert werden; keine parallele zweite Kriterienwelt.

## Quellenpflege nach ausdrücklicher Annahme

Erst nach Nutzerentscheidung:

1. Entscheidungsregister zuerst präzisieren; bei unverändertem Register wäre ADR-023 der nächste Kandidat.
2. Betriebsakte konsistent aktualisieren.
3. Roadmap/Gates präzisieren, insbesondere Schrittfreigaben vs. finale Release-Freigabe.
4. Runbook aktualisieren.
5. erst danach den konsolidierten #136/#166-UI-Slice finalisieren.

Bis dahin bleibt dies eine Entscheidungsvorlage und verändert keinen Runtime-/Gate-Vertrag.

---

# 4. Nach-Codex-Warteschlange

Diese Queue startet erst, wenn #163 **und** #165 erfolgreich gemerged sind und die jeweilige Post-Merge-CI auf `main` PASS ist.

## 4.1 #164 – M4 Recovery Acceptance

Aktueller Charakter: reine Dokumentation eines bereits real geprüften M4-Restore-Nachweises.

Späterer Ablauf:

1. aktuellen `main` nach #165 pinnen,
2. #164 sauber auf diesen `main`-Stand bringen,
3. erwarteter spezifischer Diff bleibt grundsätzlich eine Recovery-Acceptance-Dokumentationsdatei; jeder zusätzliche Code-/Runtime-/Security-Pfad ist STOP/Review,
4. vollständige literal Exact-Head-CI,
5. ChatGPT Dokumentations-/Operations-/Konsistenzreview,
6. genau ein finaler Codex-Review auf dem tatsächlichen finalen Head,
7. Expected-Head-Squash-Merge,
8. Post-Merge-CI.

Empfohlenes Codex-Modell: **Terra / max**, solange es beim reinen Dokumentationsdiff bleibt. Bei neuem Security-/Runtimecode auf **Sol / max** wechseln.

## 4.2 #134 – Reference M5 Control-Plane Evidence

Dieser PR hat bereits frühere Codex-Findings/Reviews auf älteren Heads. Für den späteren finalen Merge zählt ausschließlich der tatsächliche finale neue Head.

Ablauf:

1. auf dann aktuellen `main` bringen,
2. Main-Drift und Reference-Evidence-Freshness neu bewerten,
3. vollständige literal Exact-Head-CI,
4. ChatGPT Security-/Control-Plane-Review,
5. genau ein finaler Codex-Review auf dem tatsächlichen finalen Head,
6. Expected-Head-Squash-Merge,
7. Post-Merge-CI,
8. danach Reference-Evidence auf dem tatsächlichen neuen `main` frisch erheben; keine alte Evidence als aktuell behandeln.

Empfohlenes Codex-Modell: **Sol / max**.

## 4.3 #136 + #166 – ein konsolidierter UI-Slice

Nicht einzeln reviewen oder mergen.

Heutige isolierte Pfade:

### #136 gegen aktuellen main
- `docs/M6-RELEASE-READINESS-UI-SLICE.md`
- `tooling/factory-ui/app.js`
- `tooling/factory-ui/production-readiness-status.js`

### #166 zusätzlich gegen #136
- `tooling/factory-ui/app.js`
- `tooling/factory-ui/production-readiness-status.js`
- `tooling/factory-ui/production-readiness-status.test.mjs`

Heutige konsolidierte Pfad-Union = 4 Dateien:

1. `docs/M6-RELEASE-READINESS-UI-SLICE.md`
2. `tooling/factory-ui/app.js`
3. `tooling/factory-ui/production-readiness-status.js`
4. `tooling/factory-ui/production-readiness-status.test.mjs`

Späterer Ablauf:

1. Terminologieentscheidung aus Punkt 3 abschließen,
2. frischen UI-Branch vom dann aktuellen `main`,
3. ausschließlich den beabsichtigten #136/#166-UI-Slice übertragen,
4. akzeptierte Terminologie auf vorhandene kanonische Gates verdrahten; keine zweite Readiness-Berechnung,
5. keine Provider-IDs/DB-Adressen/Secrets anzeigen,
6. kein aktiver Production-Release-Button,
7. vollständige Exact-Head-CI,
8. ChatGPT UI-/Architektur-/Security-Review,
9. finaler Codex genau einmal,
10. Expected-Head-Squash-Merge + Post-Merge-CI.

Empfohlenes Codex-Modell: **Terra / max**, wenn der finale Diff read-only UI/Lifecycle bleibt. Sobald Gate-/Security-/Release-Semantik im Code verändert wird: **Sol / max**.

## 4.4 #135

#135 bleibt Vorbereitungsstrang. Solange er weiter verändert wird, erhält er keinen Codex-Zwischenreview. Später wird entschieden, welche vorbereitenden Dokumente nach dem realen M6-Durchlauf noch kanonisch übernommen werden.

---

# 5. Read-only Provider-Rehearsal

## 5.1 Ziel

Nur prüfen, ob der spätere `runUlcLinzM6ProviderStatePreflight()` auf Basis heutiger zugänglicher Providerzustände plausibel vorbereitet ist.

Kein Providerwrite und keine positive Production-Evidence.

## 5.2 Neon – heute tatsächlich read-only geprüft

Im aktuell verbundenen Neon-Account wurden vier Projekte gelesen:

- `appbasis-m4-r2-restore` – US East
- `appbasis-m3-preview` – US East
- `appbasis-generated-tasks-preview` – US East
- `appbasis-reference-preview` – US East

Zusätzliche Suche nach `ulc` ergab **kein Projekt**.

Daraus folgt für den heutigen read-only Rehearsal:

- kein vorhandener ULC-Projektname gefunden,
- kein vorhandener Kandidat `appbasis-ulc-linz-production` gefunden,
- alle aktuell sichtbaren Projekte liegen in US-Regionen,
- es existiert heute kein sichtbares ULC-Produktionsprojekt in Frankfurt.

Das ist **keine** Create-Freigabe.

Noch nicht autoritativ über den heutigen Connector belegt:

- vollständiges organisationsbezogenes `/regions`-Inventar,
- damit auch nicht `targetRegionAvailable=true` nach exakt demselben Vertrag wie der Repository-Preflight.

Der echte M6-Preflight muss diesen Punkt vor einem späteren Create weiterhin frisch providerseitig lesen.

## 5.3 Cloudflare – heutige Toolgrenze

In dieser Sitzung steht kein account-spezifischer Cloudflare-Reader zur Verfügung, mit dem das reale Worker-Inventar des Nutzeraccounts gelesen werden kann.

Daher werden ausdrücklich **nicht** behauptet:

- vollständiges Worker-Inventar,
- Nichtvorhandensein von `appbasis-ulc-linz-production`,
- aktuelle Tail-Worker-/Planfähigkeit,
- reale Worker-/Binding-/Telemetry-Konfiguration.

Der vollständige `runUlcLinzM6ProviderStatePreflight()` kann heute deshalb nicht als PASS bezeichnet werden.

Fail-closed Status:

- Neon project-name collision: aktuell read-only **nicht gefunden**
- Neon target-region account availability: **nicht vollständig verifiziert**
- Cloudflare worker inventory: **nicht verifiziert**
- Cloudflare production-candidate collision: **nicht verifiziert**
- `providerWriteAllowed`: **false**
- `executionAuthorized`: **false**

## 5.4 Später benötigte minimale Cloudflare-Read-Grenze

Der Repository-Preflight verwendet ausschließlich:

```text
GET /accounts/{accountId}/workers/scripts
```

Für die spätere Vorprüfung ist nur ein read-only Worker-Script-Inventar notwendig. Keine Write-Berechtigung soll nur zur Inventur vergeben werden.

Account-ID und Credential gehören nicht in Manifest, PR-Text, normale Factory-UI oder Evidence-Output.

## 5.5 Voraussetzungen für den echten M6-Provider-Preflight

Unmittelbar vor dem ersten möglichen Providerwrite:

1. Live-GitHub-Gate vollständig grün.
2. aktueller #165-Vertrag auf `main`.
3. Neon-Create-Organisation eindeutig gewählt.
4. vollständiges Neon-Projektinventar inklusive Pagination/unavailable-projects.
5. organisationsbezogenes Neon-Regionen-Inventar; Frankfurt `aws-eu-central-1` autoritativ verfügbar.
6. Cloudflare-Account eindeutig gewählt.
7. vollständiges read-only Worker-Inventar.
8. kein exakter/plausibler ULC-Production-Kandidat.
9. Evidence-Fenster frisch.
10. Ergebnis bleibt trotz PASS bei `providerWriteAllowed=false` und `explicitApprovalRequired=true`.

Erst danach kann eine **separate ausdrückliche Nutzerfreigabe** den ersten tatsächlichen Write `neon-production-database` autorisieren.

---

# Abschluss dieses Vorbereitungspakets

Mit diesem Dokument sind die fünf angeforderten Vorbereitungen bis zur sicheren Grenze durchgeführt:

1. #165-Restack mit harter 12-Dateien-Allowlist und Fallback vorbereitet.
2. M5-F-Neon/PostgreSQL-Security-Log-Pfad auf Least-Privilege-/Retention-/Evidence-Ebene konkretisiert.
3. Production-Ready-Terminologie als explizites Entscheidungs-Paket vorbereitet.
4. Nach-Codex-Warteschlange für #164, #134 und den konsolidierten #136/#166-Slice festgelegt.
5. Read-only Provider-Rehearsal durchgeführt; Neon teilweise real verifiziert, Cloudflare bewusst fail-closed offen.

## Externe Wirkung

Keine Provider-/Produktionswirkung.

Insbesondere:

- kein Codex ausgelöst,
- #163/#165 nicht verändert,
- kein Merge,
- keine historischen PRs geschlossen,
- keine Neon-/Cloudflare-Ressource erzeugt oder geändert,
- kein Secret gesetzt oder gelesen/committed,
- keine Produktionsdatenbankmigration,
- kein Worker-Deployment,
- kein DNS/Public Ingress,
- kein Logging-Sink,
- kein Cleanup-Lauf,
- kein Production-Smoke,
- keine Produktionsfreigabe.
