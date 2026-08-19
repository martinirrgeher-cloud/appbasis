# M5-F – ULC Production Security Logging Sink Options

Stand: 2026-08-19

## Status

**Architektur-/Provider-Entscheidungsvorlage – keine Providerfreigabe und kein Providerwrite.**

Dieses Dokument bereitet den realen M5-F-/M6-Logging-Schritt für `ulc-linz` vor. Es legt noch keinen kostenpflichtigen Anbieter verbindlich fest, erzeugt keinen Logging-Sink, keinen Cloudflare Tail Worker, kein Secret und kein Deployment.

## 1. Verbindlicher bestehender M5-F-Vertrag

Der aktuelle Repository-Vertrag akzeptiert `auditSecurityLogging=true` nur bei gemeinsam belegter Production-Evidence für:

- konkrete ULC-Production-Runtime-Bindung,
- konkreten Sink mit Provider-Identität,
- strukturierte Security-Event-Erfassung,
- geschützten operativen Zugriff,
- vollständiges Sink-Inventar,
- keine öffentliche Read-API,
- `retentionMonths = 12`,
- Retention-Nachweis aus Provider-API,
- frische, zum selben Production-Resource-Snapshot gehörende Evidence.

Der aktuelle Security-Event-Vertrag ist bewusst klein. Er protokolliert nur normalisierte Denial-Ereignisse und schließt insbesondere Credentials, Sessions, Request-Bodies und Backenddetails aus. Bei Authorization-Denials können jedoch `actorPrincipalId` und `organizationId` enthalten sein; der Log-Sink ist deshalb als personenbezogen/pseudonym behandelt und muss DPA/AVV, Datenregion, Transfers, Subprozessoren und Zugriffsschutz erfüllen.

## 2. Warum direkter Cloudflare-OTel-Logexport nicht die bevorzugte M5-F-Lösung ist

Cloudflare empfiehlt OpenTelemetry für neue allgemeine Observability-Exporte. Der aktuelle OTel-Logexport umfasst jedoch nicht nur die bewusst schmalen ULC-Security-Events, sondern auch Application-/Console-Logs sowie systemgenerierte Worker-Logs. Workers Logs enthalten zusätzlich Invocation-Logs, Request-/Response-Metadaten, Fehler und Exceptions.

Für M5-F wäre ein 100-%-Sampling erforderlich, wenn kein Security-Denial verloren gehen darf. Damit würde ein direkter OTel-Export den Drittanbieter-Scope unnötig auf alle Worker-Logs erweitern.

**Architekturempfehlung:** Für den M5-F-Security-Sink nicht pauschal alle Worker-Logs per OTel exportieren.

Das ist keine Ablehnung von Cloudflare OTel für spätere allgemeine Observability. Es ist eine Datenminimierungsentscheidung für den engeren M5-F-Security-Logging-Zweck.

## 3. Empfohlener Delivery-Pfad

### Variante A – dedizierter nicht öffentlicher Tail Worker (bevorzugt)

Zielpfad:

`ULC Production Worker -> Tail Worker -> gefilterte [ulc-linz-security]-Events -> externer EU-Sink`

Begründung:

- der bestehende ULC-Worker und sein Security-Eventvertrag müssen nicht zu einer zweiten Logging-Plattform umgebaut werden,
- Cloudflare Tail Workers sind ausdrücklich für kundenspezifisches Filtern/Transformieren und anschließendes Senden an HTTP-Endpunkte vorgesehen,
- nur die bereits normalisierten `[ulc-linz-security]`-Events werden nach außen weitergegeben,
- Invocation-Request-Metadaten, sonstige Console-Logs, normale Runtimefehler und Exceptions werden nicht automatisch an den M5-F-Drittanbieter übertragen,
- der Tail Worker benötigt keinen öffentlichen HTTP-Ingress,
- ein Delivery-Fehler kann die bereits verweigerte Anwendungstransaktion nicht öffnen oder deren Denial-Antwort verändern,
- die zusätzliche Worker-Ressource ist ein konkreter Verbraucher für eine heute reale M5-F-Anforderung und keine vorsorgliche Plattformabstraktion.

### Fail-closed Anforderungen an den späteren Tail-Worker-Slice

Falls diese Variante später freigegeben wird, muss der kleine Vertical Slice mindestens beweisen:

1. nur Tail-Handler; kein öffentlicher `fetch()`-Ingress,
2. nur Logs mit dem exakten M5-F-Präfix `[ulc-linz-security] ` werden berücksichtigt,
3. Payload nach dem Präfix muss als JSON parsebar sein und exakt zum freigegebenen Security-Event-Schema gehören,
4. keine Request-Headers, Request-URL, IP, Cookies, Response-Bodies, Exceptions oder übrigen Tail-Event-Metadaten werden in den externen Payload kopiert,
5. Ingest-Credential ist ausschließlich ein Secret des Delivery-Workers und erscheint nie in Repository/Evidence/UI,
6. Credential erhält nur minimale Ingest-Berechtigung für den dedizierten Production-Security-Datensatz,
7. Sinkfehler werden ohne Event-Payload geloggt und führen nicht zu einer rekursiven Tail-Kette,
8. Tail Worker selbst ist nicht sein eigener Tail-Consumer,
9. Delivery-/Sink-Inventar wird im bestehenden Cloudflare-Telemetry-Inventar vollständig sichtbar,
10. kein zweiter M5-F-Evidence-Owner entsteht; `tooling/ulc-linz-m5-audit-security-logging-evidence.mjs` bleibt die Gate-Grenze.

### Variante B – direkter OTel-Export des gesamten Worker-Logstroms

**Nicht bevorzugt für M5-F.**

Vorteile:

- wenig eigene Delivery-Logik,
- Cloudflare empfiehlt OTel für allgemeine Observability,
- Destination Health ist providerseitig sichtbar,
- `persist=false` kann Cloudflare-Dashboard-Persistenz vermeiden.

Nachteile für ULC M5-F:

- exportiert breiteren Worker-Log-/Systemlog-Scope als die Security-Events,
- 100-%-Sampling wäre für vollständige Security-Denials notwendig,
- vergrößert Datenschutz-/Subprozessor-/Kosten-Scope,
- verwischt die Trennung zwischen allgemeiner Operations-Observability und dem engen M5-F-Security-Audit-Sink.

Diese Variante darf nur gewählt werden, wenn später bewusst akzeptiert wird, dass der vollständige exportierte Logscope Teil des M5-G-Datenflussinventars und der Datenschutzbewertung wird.

### Variante C – direkter HTTP-Sink aus der ULC Runtime

Aktuell **nicht empfohlen**.

Der bestehende `UlcLinzSecurityEventLogger` ist synchron und der generierte Produktions-Worker injiziert derzeit keinen externen Logger. Eine direkte HTTP-Ausleitung würde damit Runtime-/Generator-/ExecutionContext-Verträge erweitern. Für den heutigen Verbraucher ist der Tail-Worker-Pfad kleiner und hält die Application-Runtime vom Drittanbieter getrennt.

## 4. Providervergleich für den externen Sink

### Axiom Cloud – bevorzugter Kandidat, noch nicht freigegeben

Aktuell positiv:

- Axiom dokumentiert `EU Central 1 (AWS)` als Edge Deployment.
- Event-Ingest und Edge-Queries können über `eu-central-1.aws.edge.axiom.co` regional gebunden werden.
- Axiom Cloud unterstützt benutzerdefinierte Dataset-Retention, auch länger als den Organisationsdefault bzw. `Forever`.
- Retention ist dataset-spezifisch und über Provider/API-Modelle als Tage erfassbar.
- DPA vorhanden; SCC-/Transfermechanismen sind dokumentiert.
- Verschlüsselung at rest und in transit ist dokumentiert.
- Rollen-/Zugriffskontrollen und Audit-Funktionen sind vorhanden; einzelne Enterprise-/Add-on-Funktionen müssen vor Kauf erneut geprüft werden.
- Cloudflare und Axiom dokumentieren beide Integrationspfade für Workers/OTel.
- aktuelle Preisrichtung für Axiom Cloud: Plattform ab ca. USD 25/Monat plus Nutzung; tatsächliches Angebot muss unmittelbar vor Kauf erneut geprüft werden.

Wichtige Vorbehalte:

- Axioms aktuelle Edge-Dokumentation nennt EU Central 1, während eine andere aktuelle Limits-Tabelle für `Axiom Cloud` noch nur `US` als supported edge deployment ausweist. **Diese Provider-Dokumentationsinkonsistenz muss vor Bestellung über den tatsächlichen Account-/Plan-Create-Flow oder Support autoritativ geklärt werden.** Ohne belegbares EU Central für den gewählten Plan: STOP.
- Account-/Management-Funktionen laufen über die zentrale Axiom-Plattform; EU-Edge bedeutet daher nicht automatisch vollständige EU-only-Verarbeitung des gesamten Kundenkontos.
- aktuelle Subprozessorliste muss am Freigabetag aus dem Axiom Trust Center erfasst und akzeptiert werden.
- die Provider-Retention wird in Tagen konfiguriert; siehe offene Retention-Semantik unten.

**Vorläufige Rangfolge: 1. Axiom**, sofern EU Central für den tatsächlich gewählten Plan belegbar ist und DPA/Subprozessoren/Transfers sowie Kosten manuell akzeptiert werden.

### Grafana Cloud EU – belastbare Alternative

Positiv:

- Cloudflare dokumentiert Grafana Cloud als direkten OTel-Zielprovider.
- mehrere EU-Regionen verfügbar.
- offizielles DPA und veröffentlichte Subprozessorliste.
- Logs-Retention ist bis maximal `1 year` konfigurierbar; API verlangt Perioden in 30-Tage-Schritten.
- Provider-Dokumentation erlaubt zusätzliche Retention über den 30-Tage-Default.

Nachteile/Unsicherheiten:

- Pro startet aktuell bei USD 19/Monat plus Nutzung, aber die Pricing-Seite weist für Pro standardmäßig 30 Tage Logs aus und verweist für längere Retention auf zusätzliche Optionen/Support; konkrete 12-Monats-Kosten müssen vor Bestellung verbindlich bestätigt werden.
- für M5-F würde auch hier der direkte Cloudflare-OTel-Export unnötig breite Logs exportieren; bei Auswahl bleibt der gefilterte Tail-Worker-Pfad bevorzugt.

**Vorläufige Rangfolge: 2. Grafana Cloud EU.**

### Better Stack Germany – technische Alternative, rechtlich noch nicht vollständig vorbereitet

Positiv:

- selbst bedienbare Telemetry-Region `germany`,
- OpenTelemetry unterstützt,
- Retention pro Quelle in Tagen konfigurierbar und über API auslesbar,
- aktuelle Pricing-Seite nennt USD 0.10/GB Ingestion und USD 0.05/GB/Monat Retention; konkrete Gesamtkosten hängen vom Volumen/Plan ab,
- Spending Alerts/Limits verfügbar.

Vorbehalte:

- DPA-/Subprozessoren-Evidence wurde in diesem Vorbereitungslauf noch nicht so vollständig autoritativ erfasst wie für Axiom/Grafana,
- Retention ist ebenfalls tagebasiert,
- „Host data in your own bucket“ bzw. Cloudflare R2 wird **nicht** als Abkürzung gewählt: R2 wäre eine zusätzliche Cloudflare-Persistenz für potenziell personenbezogene Security-Logs und würde ADR-022 neu öffnen.

**Vorläufige Rangfolge: 3. Better Stack Germany.**

## 5. Verworfene bzw. nicht ausreichende Optionen

### Cloudflare Workers Logs allein

Nicht ausreichend: aktuelle maximale native Retention beträgt 7 Tage auf Workers Paid, nicht 12 Monate.

### Cloudflare R2 als primärer Security-Log-Sink

Nicht ohne neue Architektur-/Datenschutzentscheidung. ADR-022 sieht für ULC v0.1 keine zusätzliche Cloudflare-Persistenz personenbezogener Daten vor. Security-Logs können Actor-/Organisationsbezug enthalten.

### ULC Neon-Produktionsdatenbank als primärer Security-Log-Sink

Nicht bevorzugt: Die Security-Evidence soll einen geschützten operativen Sink mit eigener Identität besitzen. Ein separater Observability-Sink verbessert Incident-Isolation und verhindert, dass Anwendungspersistenz und Sicherheitsbeobachtung denselben Ausfall-/Zugriffspfad teilen.

## 6. Offene Sol-Entscheidung: `12 Monate` versus providerseitige Tage

Der aktuelle M5-F-Consumer verlangt exakt:

`retentionMonths === 12`

Axiom und Better Stack konfigurieren Retention providerseitig in **Tagen**. Grafana beschreibt im UI `1 year`, die API dokumentiert jedoch Vielfache von 30 Tagen bis maximal 1 Jahr.

Es wäre sicherheitsfachlich falsch, stillschweigend `365 Tage == exakt 12 Kalendermonate` zu behaupten.

Vor der finalen Providerwahl muss deshalb **einmal** entschieden und danach der Evidence-Vertrag konsistent umgesetzt werden:

- entweder `12 Monate` wird als providerneutrale Mindestdauer von einem Jahr formalisiert und die zulässige Provider-Repräsentation explizit normalisiert,
- oder der gewählte Provider muss eine autoritativ nachweisbare native `12 months`-/`1 year`-Policy liefern, die der M5-F-Evidence-Reader ohne semantische Erfindung verifizieren kann.

Bis diese Semantik entschieden ist, darf kein Provider aufgrund einer bloßen `365`-Tage-Einstellung als M5-F-verifiziert gelten.

## 7. Empfohlene spätere Zielkonfiguration – noch nicht autorisiert

Wenn Axiom nach den offenen Checks bestätigt wird:

- dedizierter Axiom-Datensatz nur für `ulc-linz` Production Security Events,
- Edge: `EU Central 1 (AWS)`,
- Ingest/Query über den EU-Edge-Endpunkt, nicht über einen US-routenden Standard-Query-Pfad,
- minimaler Ingest-only API Token für den Tail Worker,
- getrennte menschliche Query-/Admin-Berechtigungen nach Least Privilege,
- keine öffentliche Read-API,
- Retention nach der noch zu präzisierenden 12-Monats-Semantik,
- geschützter operativer Zugriff,
- Subprozessor-/Transfer-/DPA-Evidence mit Abrufdatum,
- Provider-API-Evidence für Sink-Identität und Retention,
- Testevent enthält ausschließlich das bereits freigegebene Security-Event-Schema.

## 8. Manuelle Freigabepunkte vor irgendeinem Write

Der Nutzer/Betreiber muss später ausdrücklich bestätigen:

1. konkreten Sink-Anbieter und Plan,
2. Kostenrahmen,
3. DPA/AVV und Vertragsbindung des verwendeten Accounts,
4. aktuelle Subprozessoren und internationale Transfers,
5. Datenregion / tatsächliche EU-Edge-Verfügbarkeit des gewählten Plans,
6. Retention-Semantik nach der Sol-Präzisierung,
7. Anlage des Sink-Datensatzes,
8. Anlage/Deployment des nicht öffentlichen Tail Workers,
9. Anlage des Ingest-Credentials/Secrets,
10. Aktivierung des Tail-Consumers am Production Worker.

Jeder mutierende Provider-/Deployment-Schritt bleibt separat freigabepflichtig. Diese Entscheidungsvorlage autorisiert keinen davon.

## 9. Offizielle Quellen – Research-Baseline 2026-08-19

Cloudflare:

- https://developers.cloudflare.com/workers/observability/exporting-opentelemetry-data/
- https://developers.cloudflare.com/workers/observability/logs/workers-logs/
- https://developers.cloudflare.com/workers/observability/logs/tail-workers/
- https://developers.cloudflare.com/workers/observability/exporting-opentelemetry-data/axiom/
- https://developers.cloudflare.com/workers/observability/exporting-opentelemetry-data/grafana-cloud/

Axiom:

- https://axiom.co/docs/reference/edge-deployments
- https://axiom.co/docs/reference/datasets
- https://axiom.co/docs/send-data/opentelemetry
- https://axiom.co/docs/legal/data-processing
- https://axiom.co/docs/platform-overview/security
- https://trust.axiom.co/subprocessors

Grafana:

- https://grafana.com/docs/grafana-cloud/send-data/logs/config-self-serve-api/
- https://grafana.com/pricing/
- https://grafana.com/legal/list-of-subprocessors/

Better Stack:

- https://betterstack.com/pricing
- https://betterstack.com/docs/logs/api/create-a-source/
- https://betterstack.com/security

Vor jedem realen Providerwrite müssen Preise, Planfähigkeiten, DPA/Subprozessoren, Regionen und Retention erneut frisch geprüft werden.