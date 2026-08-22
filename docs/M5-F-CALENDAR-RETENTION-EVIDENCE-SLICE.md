# M5-F – Calendar Retention Evidence Slice

Stand der Vorbereitung: 2026-08-19, 14:42 Europe/Vienna

## Status

**Implementierungsreife Spezifikation, aber noch keine Implementierung.**

Dieses Dokument konkretisiert ausschließlich den nächsten kleinen technischen M5-F-Slice. Es ändert weder den aktuellen M5-F-Consumer noch Runtime, Schema, Migration, Providerzustand oder Produktion.

Der Slice darf erst nach dem #163/#165-Integrationspfad bzw. auf einer dann aktuellen Basis umgesetzt werden. Vor Umsetzung ist der GitHub-Live-State erneut vollständig zu prüfen.

## 1. Verbindliche Ausgangslage

Der aktuelle M5-F-Consumer `tooling/ulc-linz-m5-audit-security-logging-evidence.mjs` akzeptiert heute nur ein exaktes Logging-Evidence-Schema mit unter anderem:

- `application = ulc-linz`
- `environment = production`
- `inventorySource = provider-api`
- `sinkIdentitySource = provider-api`
- `structuredEventCaptureEnabled = true`
- `protectedOperationalAccess = true`
- `retentionMonths = 12`
- `retentionSource = provider-api`
- `sinkInventoryComplete = true`
- `publicReadEndpointPresent = false`
- identischer Runtime-/Resource-Binding-Snapshot wie die übrige reale Production-Evidence
- Evidence jünger als 24 Stunden

Das aktuelle Schema kann deshalb einen selbst kontrollierten kalendergenauen PostgreSQL-Cleanup nicht korrekt ausdrücken.

Die bestehende AppBasis-Retention-Semantik ist bereits eindeutig: `created_at < now - 12 * INTERVAL '1 month'`. Daten exakt auf der Grenze bleiben erhalten; nur strikt ältere Daten werden gelöscht.

## 2. Problem, das der Slice lösen muss

M5-F darf **nicht** aus einer Tageszahl wie 365/366/360 künstlich `12 Monate` ableiten.

Gleichzeitig darf ein Speicher, der Daten länger als zwölf Kalendermonate hält, nicht allein deshalb als compliant gelten. Für diesen Fall ist ein eigener kontrollierter kalenderbasierter Enforcement-Nachweis notwendig.

Der Slice muss daher zwei und nur zwei zulässige Retention-Pfade unterstützen:

1. `provider-native-calendar`
2. `controlled-calendar-enforcement`

Unbekannte dritte Modi bleiben fail-closed.

## 3. Zielarchitektur des Evidence-Vertrags

Der bestehende M5-F-Owner bleibt alleiniger Owner von `auditSecurityLogging`.

Kein zweiter Readiness-Evaluator und keine neue allgemeine Retention-Plattform entstehen.

Der technische Slice ergänzt den heutigen Logging-Evidence-Vertrag um eine **strukturierte Retention-Evidence**, statt das vorhandene `retentionSource = provider-api` semantisch umzudeuten.

### Vorgeschlagener neuer Retention-Evidence-Shape

Der konkrete Code darf Namen noch leicht an bestehende Repository-Konventionen anpassen, die Semantik ist jedoch verbindlich:

```text
retentionEvidence = {
  schemaVersion: 1,
  application: "ulc-linz",
  environment: "production",
  observedAt: <ISO timestamp>,
  validUntilOrReviewAt: <ISO timestamp>,
  sinkBindingId: <opaque id>,
  retentionMonths: 12,
  mode: "provider-native-calendar" | "controlled-calendar-enforcement",
  ...modeSpecificFields
}
```

Gemeinsam verpflichtend:

- exakter eigener Plain-Object-Shape,
- keine Accessors, Symbols oder geerbten Felder,
- exakt derselbe `sinkBindingId` wie die Logging-Evidence,
- dasselbe `observedAt`-/`validUntilOrReviewAt`-Fenster wie Resource-/Logging-Evidence,
- `retentionMonths` exakt numerisch `12`,
- maximal 24 Stunden alte Production-Evidence,
- keine Credentials, Connection Strings, Provider-Rohantworten oder personenbezogene Logdaten.

## 4. Modus A – `provider-native-calendar`

Dieser Modus ist nur zulässig, wenn die reale Providerkonfiguration selbst den exakten Kalendervertrag trägt.

Notwendige mode-spezifische Evidence:

```text
mode = "provider-native-calendar"
policyIdentitySource = "provider-api"
policyIdentity = <opaque provider policy id>
policyStateSource = "provider-api"
calendarSemanticsContract = <repository-pinned provider contract id/digest>
```

Der Adapter/Consumer muss beweisen:

- konkrete Sink-Identität stammt aus Provider-API,
- konkrete aktive Retention-Policy stammt aus Provider-API,
- Repository pinnt die dazu passende offizielle Provider-Semantik,
- Policy löscht nicht vor `event timestamp + 12 calendar months`,
- Policy hält Daten auch nicht unkontrolliert über diese Grenze hinaus,
- Account-/Plan-Konfiguration entspricht genau der gepinnten Semantik.

Eine Provider-API mit bloßem `retentionDays` reicht ausdrücklich nicht.

Fehlt irgendein Teil, liefert der M5-F-Owner `{}`.

## 5. Modus B – `controlled-calendar-enforcement`

Dieser Modus ist der vorbereitete Kandidat für einen dedizierten PostgreSQL/Neon-Security-Log-Pfad.

### 5.1 Speicher- und Delete-Ownership-Grundlage

Für PostgreSQL ist die Untergrenze nicht sinnvoll als frei erfundenes `provider-api`-Boolean zu modellieren. Maßgeblich ist stattdessen der reale Datenbank-/Ownership-Vertrag:

- die Security-Log-Tabelle besitzt **keine native/konfigurierte TTL oder zweite automatische Early-Delete-Route**,
- ausschließlich der definierte Retention-Owner darf regulär abgelaufene Security-Log-Zeilen löschen,
- Ingest-Credential besitzt kein `DELETE`,
- geschützter Query-/Operations-Zugriff besitzt kein `DELETE`, sofern nicht für einen ausdrücklich getrennten Incident-/Legal-Delete-Fall notwendig und dann separat auditiert,
- keine öffentliche Runtime erhält Delete-Rechte auf die Security-Log-Tabelle,
- Trigger, Funktionen, Jobs oder weitere Credentials mit Delete-Wirkung werden vollständig inventarisiert; unbekannte Delete-Pfade blockieren fail-closed.

Damit wird nachgewiesen, dass Daten nicht vor der kalenderbasierten Grenze durch einen parallelen normalen Retention-Pfad verschwinden können.

Eine kürzere Provider-/Storage-Retention oder ein unbekannter automatischer Delete-Mechanismus ist unzulässig.

Eine längere/native unbegrenzte Tabellenhaltung ist zulässig, **wenn und nur wenn** der kontrollierte Cleanup die obere 12-Kalendermonats-Grenze zuverlässig durchsetzt.

### 5.2 Exakter Cleanup-Vertrag

Der Retention-Owner muss fachlich dieselbe Semantik verwenden wie der bestehende Permission-Audit-Owner:

```sql
created_at < ($1::timestamptz - (12 * INTERVAL '1 month'))
```

Verbindlich:

- serverseitig komponierte Clock,
- kein Request-/Clientparameter für `now`,
- ungültige Clock vor Write ablehnen,
- nur strikt ältere Events löschen,
- Event exakt auf der Grenze behalten,
- Delete-Ergebnis nur aggregiert zurückgeben,
- keine Log-Payloads im Cleanup-Resultat,
- DB-/Providerfehler sanitisiert behandeln,
- Cleanup-Fehler erzeugt niemals positive M5-F-Evidence.

### 5.3 Production-Evidence für controlled enforcement

Vorgeschlagene mode-spezifische Evidence:

```text
mode = "controlled-calendar-enforcement"
deleteAuthoritySource = "database-contract"
exclusiveDeleteOwner = "ulc-linz-security-log-retention"
deleteAuthorityContractDigest = <sha256 digest>
databaseInventorySource = "protected-database-read"
databaseInventoryFingerprint = <sha256 fingerprint>
enforcementContractDigest = <sha256 contract digest>
executionBindingSource = "provider-api"
executionBindingId = <opaque id>
lastSuccessfulExecutionAt = <ISO timestamp>
executionFreshnessHours = 24
acceptanceContractDigest = <sha256 digest>
```

Der geschützte Database-Evidence-Reader muss mindestens ableiten:

- konkrete gebundene Production-DB/Security-Log-Tabelle,
- tatsächliche Rollen-/Privilege-Grenze für `INSERT`/`SELECT`/`DELETE`,
- keine unbekannten Delete-fähigen App-Credentials,
- keine unbekannte TTL-/Trigger-/Job-/Routine-Grenze mit Early-Delete-Wirkung,
- exakte Migration-/Owner-Identität.

`databaseInventoryFingerprint`, `executionBinding...` und `lastSuccessfulExecutionAt` dürfen nicht aus UI-/Operator-Text übernommen werden. Sie werden aus geschütztem realem DB-/Provider-/Execution-State abgeleitet.

Ein Cleanup-Lauf mit `deleted_count = 0` kann als Execution-Nachweis zulässig sein, solange Execution-Binding, Owner-Vertrag und reale DB-Grenze vollständig belegt sind. M5-F muss nicht zwölf Monate auf das erste tatsächlich abgelaufene Event warten; die Kalendersemantik wird zusätzlich im realen PostgreSQL-E2E bewiesen.

### 5.4 Execution Owner

Der Slice darf **keinen generischen Scheduler** einführen.

Bevorzugte Reihenfolge:

1. prüfen, ob der ohnehin reale dedizierte M5-F-Delivery-Worker den kleinen `scheduled()`-Cleanup-Handler zusammen mit seiner Tail-Aufgabe sauber tragen kann,
2. nur wenn diese konkrete Kombination technisch/vertraglich nicht sauber ist: eigener minimaler `ulc-linz`-M5-F-Maintenance-Worker,
3. keine Plattformabstraktion für zukünftige Apps ohne zweiten realen Verbraucher.

Cloudflare Cron Trigger sind für periodische Maintenance-Aufgaben vorgesehen. Der spätere Implementierungsslice muss die konkrete Handler-/Deploymentkombination jedoch mit einem Contract-Test beweisen, bevor sie als Architekturannahme gilt.

Der Cleanup-Zeitplan soll zunächst **täglich** sein. Eine häufigere Ausführung liefert für den 12-Monats-Vertrag keinen relevanten Mehrwert und würde nur Operations-/Kostenfläche erhöhen.

## 6. PostgreSQL-Security-Log-Owner – Minimalumfang

Falls der Neon/PostgreSQL-Pfad gewählt wird, darf der Slice nur den real benötigten ULC-M5-F-Verbraucher materialisieren.

Minimal notwendig:

- eigene Security-Log-Tabelle/Owner-Grenze,
- eigener Insert-Vertrag für das bereits sanitizierte Security-Event-Schema,
- eigener Retention-Owner,
- getrennte Least-Privilege-Berechtigungen für Ingest, Cleanup und geschützte Query/Operations,
- keine direkte Wiederverwendung einer Identity-/Permissions-/Lifecycle-Audit-Tabelle,
- keine allgemeine Audit-Plattform,
- keine Fachmodul-Persistenz.

Die genaue Tabellenstruktur wird erst im technischen Slice aus dem bereits bestehenden `security-events.ts`-Schema abgeleitet. Es werden keine zusätzlichen personenbezogenen Felder erfunden.

## 7. Notwendige Tests des späteren technischen Slices

### 7.1 Retention-Unit-/Contract-Tests

Mindestens:

1. 12 Kalendermonate werden nicht in Tage normalisiert.
2. Event 1 ms vor der Kalendergrenze wird gelöscht.
3. Event exakt auf der Grenze bleibt erhalten.
4. Event 1 ms nach der Grenze bleibt erhalten.
5. Monatsenden/Schaltjahr werden mit PostgreSQL-Kalendersemantik geprüft.
6. ungültige Server-Clock blockiert vor Write.
7. unbekannter Retention-Modus blockiert.
8. zusätzliche/missing/accessor/symbol/inherited Evidence blockiert.
9. Sink-Binding-Mismatch blockiert.
10. Zeitfenster-Mismatch zu Resource-/Logging-Evidence blockiert.
11. stale Evidence >=24h blockiert.
12. fehlgeschlagener Cleanup blockiert controlled enforcement.
13. zusätzliche Delete-Berechtigung für Ingest/öffentliche Runtime blockiert.
14. unbekannter Trigger/Job/Routine mit Delete-Wirkung blockiert.
15. Database-Inventory-Fingerprint-Drift blockiert.

### 7.2 PostgreSQL-E2E

Bei controlled enforcement real gegen isoliertes PostgreSQL:

- Migration/Schema anwenden,
- getrennte Testrollen für Ingest/Query/Cleanup materialisieren,
- beweisen, dass Ingest/Query keine normalen Delete-Rechte besitzen,
- Testevents um mehrere Kalendergrenzen schreiben,
- Cleanup über den echten Owner ausführen,
- exakt erwartete Datensätze bleiben/löschen,
- keine Payload wird im Cleanup-Resultat zurückgegeben,
- Transaktions-/Fehlerfall prüfen,
- Datenbankinventar/Privileges gegen den Evidence-Reader prüfen,
- anschließend realen Evidence-Deriver gegen den gebundenen Testzustand prüfen.

### 7.3 M5-F-Integration

- `auditSecurityLogging=true` nur bei vollständig valider Resource-, Logging- und Retention-Evidence,
- jeder einzelne Teilnachweis separat entfernbar → Ergebnis `{}`,
- M5-I/J bleiben bei fehlender F-Evidence fail-closed,
- kein zweiter Owner für `auditSecurityLogging`.

## 8. Contract-Pinning

Der spätere Slice muss die sicherheitsrelevanten konkreten Verträge pinnen, mindestens:

- aktuelles ULC-Security-Event-Schema,
- M5-F-Deriver,
- Retention-Owner,
- DB-Privilege-/Inventory-Evidence-Reader,
- PostgreSQL-E2E/Acceptance,
- Execution-/Scheduler-Binding-Vertrag,
- bei Neon: konkrete Security-Log-Persistenz-/Migrationseigentümerschaft.

Eine Änderung an Event-Schema, Retention-Owner, DB-Delete-Grenze oder Execution-Binding invalidiert die Production-Evidence fail-closed und verlangt eine neue Prüfung.

## 9. Keine vorzeitige Providerentscheidung

Diese Spezifikation entscheidet **nicht**, dass Neon zwingend der finale Security-Log-Sink wird.

Sie legt nur fest:

- wie ein provider-native kalendergenauer Sink belegt werden müsste,
- wie ein kontrolliert kalendergenauer PostgreSQL-Sink belegt werden müsste,
- dass beide denselben strengen M5-F-Gate-Owner bedienen.

Providerwahl, kostenpflichtige Ressource und echte Provisionierung bleiben jeweils eigene ausdrückliche Nutzerfreigaben.

## 10. Implementierungsreihenfolge nach Freigabe

Wenn der Slice später tatsächlich umgesetzt wird:

1. Live-State + finalen `main` prüfen.
2. Bestehenden M5-F-Consumer und aktuelle Security-Event-Verträge erneut lesen.
3. Kleinsten realen Retention-Modus implementieren – kein paralleler zweiter Modus ohne realen Verbraucher.
4. Unit/Adversarial Tests.
5. PostgreSQL-E2E, falls controlled enforcement.
6. vollständige CI.
7. ChatGPT Diff-/Architektur-/Security-/Privacy-Review.
8. Findings gebündelt beheben.
9. Exact-Head-CI erneut vollständig PASS.
10. genau ein finaler Codex-Review auf dem tatsächlichen finalen Head.

## 11. DONE für diesen Vorbereitungspunkt

Punkt 6 gilt als vorbereitet, wenn diese Spezifikation im Prep-PR liegt und CI/Review auf dem Prep-Head grün sind.

Der spätere technische Slice ist dagegen erst DONE, wenn reale, fail-closed testbare Calendar-Retention-Evidence implementiert ist.

## 12. Externe Wirkung

Keine.

Insbesondere wurden durch diese Spezifikation nicht ausgeführt:

- kein Logging-Sink angelegt,
- kein Tail Worker angelegt/deployed,
- kein Cron Trigger angelegt,
- keine Neon-Datenbank/Tabelle/Migration verändert,
- kein Secret gesetzt,
- keine kostenpflichtige Ressource erzeugt,
- keine Production-Evidence auf `true` gesetzt,
- keine Produktionsfreigabe.
