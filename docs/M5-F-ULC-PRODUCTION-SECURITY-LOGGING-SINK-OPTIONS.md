# M5-F – ULC Production Security Logging Sink Options

Stand: 2026-08-19

## Status

**Entscheidungsreife Architekturvorlage – keine Providerfreigabe und kein Providerwrite.**

Dieses Dokument bereitet den realen M5-F-/M6-Logging-Schritt für `ulc-linz` vor. Es erzeugt keinen Logging-Sink, keinen Cloudflare Tail Worker, kein Secret und kein Deployment.

Die aktuelle Vorbereitung trifft bewusst zwei getrennte Aussagen:

1. **Delivery-Architektur:** Für den engen M5-F-Security-Event-Pfad ist ein dedizierter nicht öffentlicher Cloudflare Tail Worker die bevorzugte technische Richtung.
2. **Sink-Provider:** Keiner der aktuell geprüften SaaS-Kandidaten wird jetzt ausgewählt oder beschafft, weil keiner den AppBasis-Vertrag **exakt 12 Kalendermonate** mit der heute dokumentierten nativen Retention-Evidence eindeutig erfüllt.

Damit bleibt `auditSecurityLogging` korrekt fail-closed `open`.

---

## 1. Bestehender M5-F-Vertrag ist maßgeblich

Der aktuelle Repository-Consumer `tooling/ulc-linz-m5-audit-security-logging-evidence.mjs` akzeptiert `auditSecurityLogging=true` nur bei gemeinsam belegter Production-Evidence für:

- konkrete ULC-Production-Runtime-Bindung,
- konkreten Sink mit Provider-Identität,
- strukturierte Security-Event-Erfassung,
- geschützten operativen Zugriff,
- vollständiges Sink-Inventar,
- keine öffentliche Read-API,
- `retentionMonths = 12`,
- `retentionSource = provider-api`,
- frische Evidence,
- identisches Resource-Binding-Zeitfenster und dieselbe Runtime-Bindung wie die reale Production-Resource-Evidence.

Der heutige Consumer ist **providerneutral**. Er schreibt weder Better Stack noch Axiom, Grafana oder Neon als Sink vor.

Wichtig: Die Vorbereitung darf nicht so tun, als erfülle eine frei normalisierte Zahl `12` bereits den Vertrag. Der zugrunde liegende reale Retention-Mechanismus muss die bestätigte fachliche Semantik tragen.

## 2. Security-Event-Vertrag und Datenminimierung

Der bestehende ULC-Security-Eventvertrag ist bewusst klein und sanitisiert.

Nicht in den M5-F-Sink gehören insbesondere:

- Passwörter,
- Cookies oder Session-Tokens,
- Request-Bodies,
- Credentials/Secrets,
- Datenbankadressen oder Providerfehlerdetails,
- Subject-IDs,
- unbestätigte Organisationskontexte,
- vollständige Request-/Response-Metadaten.

Bei Authorization-Denials können dagegen nach autoritativ bestätigter Same-Organization-Membership `actorPrincipalId` und `organizationId` Teil des normalisierten Security-Events sein. Der Sink ist deshalb als personenbezogen/pseudonym zu behandeln und fällt vollständig unter DPA/AVV, Datenregion, Transfers, Subprozessoren, Verschlüsselung, Least Privilege und Retention.

---

## 3. Bevorzugter Delivery-Pfad: dedizierter nicht öffentlicher Tail Worker

### Zielpfad

```text
ULC Production Worker
  -> Cloudflare Tail Worker
  -> Filter: nur exaktes [ulc-linz-security]-Eventschema
  -> später ausdrücklich freigegebener persistenter Security-Log-Sink
```

Cloudflare dokumentiert Tail Workers als erweiterten Pfad für kundenspezifisches Filtern, Transformieren und Weiterleiten von Worker-Ereignissen. Der Tail-Handler erhält die normalen Worker-Bindings über `env`; damit kann ein späterer realer Slice entweder einen HTTP-Ingest-Endpunkt oder – nach eigener Prüfung – einen gebundenen Datenbankpfad verwenden.

### Warum nicht pauschal OpenTelemetry exportieren?

Workers Logs umfassen nicht nur die eng normalisierten M5-F-Security-Events, sondern auch Invocation-Logs, Custom Logs, Errors und Exceptions. Ein pauschaler OTel-Export würde deshalb den externen personenbezogenen/technischen Datenfluss unnötig verbreitern.

Für allgemeine Operations-Observability kann OTel später separat bewertet werden. M5-F benötigt heute nur den realen Security-Event-Verbraucher.

### Fail-closed Anforderungen an einen späteren Tail-Worker-Slice

Falls der Slice später ausdrücklich freigegeben wird:

1. ausschließlich `tail()`-Handler; kein öffentlicher `fetch()`-Ingress,
2. nur Logeinträge mit exaktem Präfix `[ulc-linz-security] ` berücksichtigen,
3. Payload anschließend als JSON parsen und exakt gegen das freigegebene Security-Event-Schema validieren,
4. keine Request-URL, Header, IP, Tail-Request-Metadaten, Exceptions oder sonstige Invocation-Daten in den Sink-Payload übernehmen,
5. `getUnredacted()` nicht verwenden,
6. Sink-Credential bzw. DB-Binding ausschließlich am Tail Worker und nach Least Privilege,
7. kein Query-/Admin-Credential als Ingest-Credential wiederverwenden,
8. asynchrone Delivery ausschließlich über den Tail-Execution-Kontext kontrolliert abschließen,
9. Sinkfehler dürfen die bereits verweigerte Producer-Anfrage nicht nachträglich öffnen,
10. Sink-/Delivery-Fehler selbst ohne Security-Event-Payload bzw. Secret protokollieren,
11. Tail Worker nicht selbst wieder als Tail-Producer/-Consumer-Schleife konfigurieren,
12. Delivery-Ressource, Bindings und Telemetry vollständig im bestehenden Cloudflare-Inventar erfassen,
13. kein zweiter M5-F-Evidence-Owner; der bestehende M5-F-Consumer bleibt die Gate-Grenze.

---

## 4. Verbindliche Retention-Semantik: exakt 12 Kalendermonate

Der aktuelle M5-F-Consumer verlangt:

```text
retentionMonths === 12
```

AppBasis verwendet für die bereits implementierte Permission-Administration-Audit-Retention eine kalenderbasierte PostgreSQL-Grenze mit `INTERVAL '1 month'`. Für den Production-Security-Sink wird dieselbe fachliche Bedeutung beibehalten:

**12 Monate = exakt 12 Kalendermonate.**

Daraus folgt:

1. `365`, `366` oder `360` Tage sind nicht allgemein identisch mit zwölf Kalendermonaten.
2. Eine native Provider-Policy `12 months` oder `1 year` ist nur ausreichend, wenn ihre autoritative Semantik tatsächlich kalenderäquivalent nachgewiesen werden kann.
3. Eine Provider-API, die ausschließlich eine Tageszahl liefert, darf nicht allein durch Normalisierung auf `retentionMonths = 12` hochgestuft werden.
4. Ein Provider darf Daten nicht vor der kalenderbasierten 12-Monats-Grenze automatisch löschen.
5. Werden Daten nach dieser Grenze länger gehalten, braucht es einen kontrollierten exakten Lösch-/Enforcement-Pfad; eine bloße längere native Tagesretention reicht ebenfalls nicht als vollständiger M5-F-Nachweis.
6. Bis die reale Retention autoritativ belegt ist, bleibt `auditSecurityLogging` fail-closed offen.

Diese Semantik wird in diesem Vorbereitungsstrang **nicht abgeschwächt**.

---

## 5. Aktueller SaaS-Vergleich – Ergebnis 2026-08-19

### Better Stack – Germany

Aktuell positiv:

- Log-Sources besitzen eine auswählbare Datenregion einschließlich Germany.
- Source-Identität, Datenregion und Retention sind über Provider-API abfragbar.
- DPA und Subprozessoren-/Security-Schedules sind öffentlich dokumentiert.
- Verschlüsselung at rest sowie TLS/HTTPS in transit sind dokumentiert.
- dedizierter Ingest-Pfad eignet sich grundsätzlich für den gefilterten Tail-Worker-Ansatz.

Entscheidender Blocker:

- `logs_retention` wird in der offiziellen Source-API als **Integer in Tagen** konfiguriert und zurückgegeben.
- Die aktuell geprüfte API dokumentiert Source-Retention bzw. vollständiges Source-Löschen, aber keinen app-spezifischen kalenderbasierten Event-Retention-Vertrag, der den heutigen M5-F-Vertrag unverändert erfüllt.

Bewertung:

**Guter operativer SaaS-Kandidat, aber heute nicht M5-F-native-ready. Keine Bestellung.**

### Axiom Cloud – EU Central 1

Aktuell positiv:

- aktuelle Edge-Dokumentation nennt `EU Central 1 (AWS)` als verfügbaren Edge-Deployment-Standort,
- bei einem dort angelegten Dataset bleiben Event-Ingest, Storage, Query-Ausführung und Query-Ergebnisse laut aktueller Edge-Dokumentation im ausgewählten Edge Deployment,
- Dataset-Identität, Edge Deployment und Retention sind API-seitig auslesbar,
- Dataset-spezifische Zugriffsrechte und getrennte Ingest/Query/Trim-Rechte sind vorhanden,
- DPA und Transfermechanismen sind dokumentiert,
- Dataset Trim ermöglicht zusätzlich kontrollierte Datenlöschung.

Entscheidende Blocker/Vorbehalte:

- Dataset-Retention wird in der aktuellen API als `retentionDays` **Integer in Tagen** geführt.
- Der Trim-Pfad löscht Datenblöcke vor einer Grenze; ältere Events können erhalten bleiben, wenn sie einen Block mit neueren Events teilen. Das ist kein nachweisbar exakter Event-für-Event-Kalendermonatsvertrag.
- Vor Kauf muss zusätzlich die tatsächliche EU-Central-Verfügbarkeit des konkret gewählten Plans/Add-ons autoritativ bestätigt werden; eine allgemeine Produktfähigkeit ist keine Account-/Plan-Evidence.

Bewertung:

**Technisch starker EU-SaaS-Kandidat, aber heute ebenfalls nicht M5-F-native-ready. Keine Bestellung.**

### Grafana Cloud – EU / Germany

Aktuell positiv:

- Grafana Cloud bietet eine europäische AWS-Region in Germany (`eu-central-1`) für Self-Serve/Marketplace,
- DPA und Subprozessorenliste sind veröffentlicht,
- dedizierte Access Policies können Query-/Delete-Rechte trennen,
- Loki besitzt einen API-Pfad für explizite Log-Löschanforderungen.

Entscheidender Blocker:

- die aktuelle Cloud-Logs-Retention ist standardmäßig 30 Tage,
- die dokumentierte konfigurierbare Retention muss ein **Vielfaches von 30 Tagen** sein,
- die maximale dokumentierte Retention wird zwar als `1 year` bezeichnet, die API-/Konfigurationsrestriktion belegt damit aber nicht automatisch exakt zwölf Kalendermonate.

Bewertung:

**Belastbare Observability-Plattform, aber der native Retention-Vertrag belegt den heutigen M5-F-Kalendervertrag nicht. Keine Bestellung.**

### Ergebnis der drei SaaS-Kandidaten

Es gibt aktuell **keinen sicheren Sieger**.

Die frühere Rangfolge „Better Stack zuerst“ wird deshalb nicht als Providerentscheidung fortgeführt. Funktional und preislich attraktive Eigenschaften sind nachrangig, solange das verbindliche Retention-Gate nicht erfüllt werden kann.

---

## 6. Alternative: dedizierter Neon/PostgreSQL-Security-Log-Sink

Diese Alternative ist neu als **prüfenswerte Architekturvariante**, aber ausdrücklich noch nicht beschlossen oder implementiert.

### Warum sie relevant ist

- Neon/PostgreSQL gehört bereits zum bestätigten ULC-v0.1-Provider-Scope.
- PostgreSQL kann die bestehende AppBasis-Semantik `created_at < now - 12 * INTERVAL '1 month'` exakt ausdrücken.
- Eine eigene Security-Log-Tabelle bzw. besser ein dediziert gebundener Security-Log-Datenbankpfad könnte getrennte Ingest-/Query-/Cleanup-Berechtigungen erhalten.
- Der Tail-Handler besitzt Worker-Bindings über `env`; Hyperdrive ist ein reguläres Cloudflare-Worker-Binding. Damit ist ein Tail-Worker-zu-PostgreSQL-Pfad technisch prüfbar.
- Es würde kein dritter Logging-Provider in den M5-G-DPA-/Subprozessor-Scope aufgenommen.

### Warum diese Variante den heutigen M5-F-Vertrag noch nicht erfüllt

Der aktuelle M5-F-Evidence-Consumer verlangt `retentionSource = provider-api`.

Ein selbst kontrollierter PostgreSQL-Cleanup wäre dagegen **repository-/runtime-/DB-enforced Retention**. Er darf nicht fälschlich als Provider-API-Retention ausgegeben werden.

Deshalb gilt:

**Neon ist heute noch kein drop-in-konformer M5-F-Sink.**

### Weitere Nachteile/Risiken

- Anwendungsdaten und Security-Logging lägen beim selben Datenbankprovider; die Failure-/Provider-Domain wäre weniger unabhängig als bei einem externen Observability-Anbieter.
- Eine neue Security-Log-Persistenz braucht eigenen Owner, Schema-/Migration-/Access-Vertrag und PostgreSQL-E2E.
- Keine bestehende ULC-Fach-/Identity-/Permissions-Tabelle darf als Abkürzung missbraucht werden.
- Ein eigener Log-Sink darf keine zweite allgemeine Audit-Plattform entstehen lassen; der reale Verbraucher bleibt nur ULC M5-F.
- Eine zusätzliche Neon-Ressource bzw. ein zusätzliches kostenpflichtiges Projekt wäre weiterhin ein separater zustimmungspflichtiger Providerwrite.

Bewertung:

**Beste derzeit erkennbare technische Richtung, um den exakten Kalendervertrag ohne Policy-Abschwächung zu erfüllen – aber nur nach einem kleinen M5-F-Evidence-/Retention-Vertical-Slice.**

---

## 7. Notwendiger nächster technischer Slice: M5-F Calendar Retention Evidence

Die aktuelle Vorbereitung zeigt eine echte Vertragslücke zwischen dem strikten M5-F-Evidence-Schema und real verfügbaren Provider-Retention-Modellen.

Der nächste technische Slice soll diese Lücke **nicht durch Lockerung**, sondern durch explizite Evidence schließen.

### Ziel

Der bestehende M5-F-Owner soll genau zwei zulässige Retention-Modi unterscheiden können:

#### Modus A – provider-native-calendar

Zulässig nur, wenn:

- Provider-API die konkrete Sink-Identität liefert,
- Provider-API die konkrete Retention liefert,
- die Providerdokumentation/Accountkonfiguration autoritativ belegt, dass `12 months`/`1 year` tatsächlich der kalenderbasierten 12-Monats-Semantik entspricht,
- keine Daten vor der Grenze gelöscht werden,
- keine Daten nach der Grenze unkontrolliert weiter gespeichert werden.

#### Modus B – controlled-calendar-enforcement

Zulässig nur, wenn:

- der Provider/Speicher die Daten mindestens bis zur jeweiligen 12-Kalendermonats-Grenze sicher hält,
- ein eigener kleiner Retention-Owner den exakten kalenderbasierten Cutoff serverseitig berechnet,
- Cleanup ausschließlich Daten **strictly older** als die Grenze entfernt,
- Events exakt auf der Grenze erhalten bleiben,
- Cleanup-Ergebnis und tatsächliche Persistenz mit realem E2E-Nachweis geprüft werden,
- ein fehlgeschlagener Cleanup das M5-F-Gate fail-closed hält,
- Evidence die Provider-/Sink-Bindung und den konkreten Enforcement-Vertrag gemeinsam pinnt,
- kein Client-/Requestparameter den Cleanup-Zeitpunkt frei manipulieren kann,
- keine neue generische Retention-Plattform gebaut wird.

### Für einen Neon-Kandidaten zusätzlich

Ein späterer Neon-Slice müsste mindestens beweisen:

1. dedizierte Security-Log-Persistenz, nicht in bestehenden fremden Owner-Tabellen,
2. minimaler Ingest-Principal ohne Query-/Adminrechte,
3. getrennte menschliche/operative Query-Berechtigung,
4. kein öffentlicher Read-Endpunkt,
5. exaktes normalisiertes Security-Event-Schema,
6. PostgreSQL-E2E für Insert, Denial, Schema-Drift und Retention-Grenze,
7. exakt 12 Kalendermonate: älter als Grenze gelöscht, exakt auf Grenze erhalten,
8. invalid/future Clock fail-closed vor Write,
9. Tail-Worker-Delivery ohne Übernahme übriger Tail-Metadaten,
10. Sink-/Resource-Evidence bleibt secrets-frei,
11. M5-G Datenfluss-/Telemetry-Inventar wird um diesen realen Pfad ergänzt,
12. Backup-/Restore-Verhalten des Security-Log-Sinks wird separat bewertet, damit gelöschte Logs nicht außerhalb der akzeptierten Retention unkontrolliert wiederhergestellt werden.

### Review-/Integrationsgrenze

Dieser technische Slice berührt Security-, Persistence- und Evidence-Verträge. Deshalb:

- nicht parallel zu einem anderen Slice an derselben M5-F-/Schema-/Runtime-Grenze,
- erst auf dem dann aktuellen integrierten M5-Unterbau,
- vollständige Exact-Head-CI,
- ausführlicher ChatGPT-Diff-/Architektur-/Security-Review,
- Findings gebündelt beheben,
- Exact-Head-CI erneut,
- genau ein finaler Codex-Review auf dem tatsächlichen finalen Head.

Dieser Vorbereitungs-PR implementiert den Slice **nicht**.

---

## 8. Nicht zulässige Abkürzungen

### 365/366/360 Tage einfach als „12 Monate“ normalisieren

Nicht zulässig. Das würde den bestätigten Retention-Vertrag still abschwächen.

### `retentionSource = provider-api` erfinden

Nicht zulässig. Ein app-/DB-enforced Cleanup darf nicht als native Provider-Retention ausgegeben werden.

### Cloudflare Workers Logs allein

Nicht ausreichend: die native Workers-Logs-Retention ist deutlich kürzer als zwölf Monate.

### Vollständigen Worker-Logstrom an einen Drittanbieter senden

Nicht als M5-F-Default. Das verbreitert den Datenfluss unnötig gegenüber dem vorhandenen normalisierten Security-Eventvertrag.

### Cloudflare R2 als schnelle Abkürzung

Nicht ohne neue Entscheidung. ADR-022 erlaubt keine zusätzliche personenbezogene Cloudflare-Persistenz für ULC v0.1 ohne neue Bewertung.

### Bestehende ULC-Produktionsdatenbanktabellen zweckentfremden

Nicht zulässig. Wenn Neon als Sink gewählt wird, braucht Security Logging einen klaren eigenen Persistenz-/Access-/Retention-Vertrag.

### Provider jetzt vorsorglich bestellen

Nicht zulässig und nicht sinnvoll. Die aktuelle Recherche hat gerade gezeigt, dass die entscheidende Retention-Acceptance noch nicht geschlossen ist.

---

## 9. Entscheidung nach dieser Vorbereitung

### Festgelegt für die weitere technische Planung

- **Delivery:** dedizierter nicht öffentlicher Tail Worker.
- **Datenumfang:** nur exakt validierte `[ulc-linz-security]`-Events verlassen den Producer-Pfad.
- **Retention:** exakt 12 Kalendermonate; keine stille Tages-Normalisierung.
- **Gate:** M5-F bleibt fail-closed bis reale Sink-/Access-/Retention-Evidence vorhanden ist.
- **Providerbeschaffung:** derzeit keine.
- **Nächster technischer Prüfpfad:** kleiner `M5-F Calendar Retention Evidence`-Slice; Neon/PostgreSQL als bevorzugt zu validierende konkrete Variante, weil der Kalendervertrag dort technisch direkt ausdrückbar ist und kein neuer Provider-Scope entsteht.

### Noch nicht entschieden

- ob Neon tatsächlich der finale Security-Log-Sink wird,
- ob dafür dieselbe Neon-Organisation, ein separates Projekt oder eine andere dedizierte Ressourcenform verwendet wird,
- konkrete Ressourcennamen/IDs,
- konkrete Kosten/Pläne,
- Credentials/Secrets,
- reale Provider-/DB-/Deployment-Writes.

Diese offenen Punkte werden erst nach dem technischen Retention-Slice und unmittelbar vor einem realen Write entschieden.

---

## 10. Manuelle Freigabepunkte vor irgendeinem realen Write

Später ausdrücklich zu bestätigen:

1. finaler Sink-Pfad und Ressourcentyp,
2. Kostenrahmen,
3. DPA/AVV und Vertragsbindung des real verwendeten Providers,
4. aktuelle Subprozessoren und internationale Transfers,
5. Datenregion des konkreten Sinks,
6. autoritativer Nachweis der exakten 12-Kalendermonats-Retention,
7. Sink-/DB-/Source-Anlage,
8. Anlage/Deployment des nicht öffentlichen Tail Workers,
9. Ingest-Credential bzw. DB-Binding/Secret,
10. Aktivierung des Tail-Consumers am Production Worker.

Jeder mutierende Provider-/Deployment-/DB-Schritt bleibt separat freigabepflichtig.

---

## 11. Offizielle Research-Baseline – 2026-08-19

Die folgenden Quellen sind Planungsgrundlage und keine Production-Evidence. Preise, Planfähigkeiten, Regionen, DPA/Subprozessoren und Retention werden unmittelbar vor jedem späteren Write erneut live geprüft.

### Cloudflare

- https://developers.cloudflare.com/workers/observability/logs/tail-workers/
- https://developers.cloudflare.com/workers/runtime-apis/handlers/tail/
- https://developers.cloudflare.com/workers/runtime-apis/bindings/
- https://developers.cloudflare.com/hyperdrive/get-started/
- https://developers.cloudflare.com/workers/observability/logs/workers-logs/

### Better Stack

- https://betterstack.com/docs/logs/api/create-a-source/
- https://betterstack.com/docs/logs/api/get-a-single-source/
- https://betterstack.com/docs/logs/api/update-source/
- https://betterstack.com/docs/logs/api/delete-an-existing-source/
- https://betterstack.com/security
- https://betterstack.com/dpa
- https://betterstack.com/dpa/schedules
- https://betterstack.com/pricing

### Axiom

- https://axiom.co/docs/reference/edge-deployments
- https://axiom.co/docs/reference/datasets
- https://axiom.co/docs/restapi/endpoints/createDataset
- https://axiom.co/docs/restapi/endpoints/getDataset
- https://axiom.co/docs/restapi/endpoints/trimDataset
- https://axiom.co/docs/reference/settings
- https://axiom.co/docs/legal/data-processing

### Grafana

- https://grafana.com/docs/grafana-cloud/regions/
- https://grafana.com/docs/grafana-cloud/send-data/logs/config-self-serve-api/
- https://grafana.com/docs/grafana-cloud/send-data/logs/delete-log-lines/
- https://grafana.com/legal/data-processing-agreement/
- https://grafana.com/legal/list-of-subprocessors/
- https://grafana.com/pricing/

---

## 12. Exit-Kriterien dieses Vorbereitungspunkts

Punkt 3 „Production Security Logging entscheidungsfertig machen“ ist dokumentarisch abgeschlossen, wenn:

- [x] bestehender M5-F-Evidence-Vertrag gegen den aktuellen technischen Consumer geprüft ist,
- [x] Tail Worker als engster Delivery-Pfad festgelegt ist,
- [x] SaaS-Kandidaten gegen Region, Zugriff, Provider-Evidence und Retention neu geprüft sind,
- [x] erkannt ist, dass keiner der drei geprüften SaaS-Kandidaten den exakten Kalendervertrag heute nativ belegt,
- [x] keine vorsorgliche Providerbeschaffung empfohlen wird,
- [x] Neon/PostgreSQL als konkrete nächste technische Retention-Variante abgegrenzt ist,
- [x] klar ist, warum Neon den heutigen `retentionSource = provider-api`-Vertrag noch nicht unverändert erfüllt,
- [x] der notwendige kleine `M5-F Calendar Retention Evidence`-Slice mit Fail-closed-Acceptance beschrieben ist,
- [x] keine bestehende Retention-/Security-Policy abgeschwächt wurde,
- [x] keine Providerressource, kein Secret, keine produktive DB und kein Deployment durch diese Vorbereitung verändert wurde.

Der nächste Schritt ist damit **kein Providerkauf**, sondern die spätere technische Validierung/Implementierung des klar abgegrenzten Retention-Evidence-Slices auf dem dann aktuellen integrierten M5-Unterbau.