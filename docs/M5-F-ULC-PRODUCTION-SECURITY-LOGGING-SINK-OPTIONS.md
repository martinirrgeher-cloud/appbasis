# M5-F – ULC Production Security Logging Sink Options

Stand: 2026-08-19

## Status

**Architektur-/Provider-Entscheidungsvorlage – keine Providerfreigabe und kein Providerwrite.**

Dieses Dokument bereitet den realen M5-F-/M6-Logging-Schritt für `ulc-linz` vor. Es legt noch keinen kostenpflichtigen Anbieter verbindlich fest, erzeugt keinen Logging-Sink, keinen Cloudflare Tail Worker, kein Secret und kein Deployment.

## 1. Bestehender M5-F-Vertrag

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

## 2. Datenminimierung: kein pauschaler OTel-Export als M5-F-Default

Cloudflare empfiehlt OpenTelemetry für neue allgemeine Observability-Exporte. Der aktuelle OTel-Logexport umfasst jedoch Application-/Console-Logs **und systemgenerierte Worker-Logs**. Workers Logs umfassen Invocation-Logs, Custom Logs, Errors und Exceptions.

Für M5-F müsste ohne vorgelagerte Filterung 100 % gesampelt werden, damit kein Security-Denial verloren geht. Damit würde der Drittanbieter-Scope unnötig auf den gesamten Worker-Logstrom erweitert.

**Architekturempfehlung:** Für den engen M5-F-Security-Sink nicht pauschal alle Worker-Logs per OTel exportieren.

OTel bleibt für spätere allgemeine Operations-Observability eine mögliche getrennte Entscheidung.

## 3. Empfohlener Delivery-Pfad

### Dedizierter nicht öffentlicher Tail Worker

Zielpfad:

`ULC Production Worker -> Tail Worker -> nur [ulc-linz-security]-Events -> externer EU-Sink`

Cloudflare Tail Workers sind ausdrücklich für kundenspezifisches Filtern/Transformieren und anschließendes Senden an HTTP-Endpunkte vorgesehen. Das ist für den heutigen M5-F-Verbraucher kleiner und datenärmer als ein Export des vollständigen Worker-Logstroms.

Vorteile:

- bestehender ULC-Security-Eventvertrag bleibt die Quelle,
- nur bereits normalisierte Security-Events verlassen Cloudflare in Richtung Log-Sink,
- Request-Header, Request-URL, IP, übrige Invocation-Metadaten, normale Runtimefehler und Exceptions werden nicht automatisch an den M5-F-Sink übertragen,
- kein öffentlicher HTTP-Ingress am Delivery-Worker,
- Delivery-Fehler können eine bereits verweigerte App-Anfrage nicht wieder öffnen,
- reale Anforderung, daher kein spekulativer Plattform-Layer.

### Fail-closed Anforderungen an einen späteren Tail-Worker-Slice

Falls später ausdrücklich freigegeben:

1. nur `tail()`-Handler, kein öffentlicher `fetch()`-Ingress,
2. nur Logs mit exaktem Präfix `[ulc-linz-security] ` berücksichtigen,
3. Payload danach als JSON parsen und exakt gegen das freigegebene Security-Event-Schema validieren,
4. keine übrigen Tail-Event-/Request-/Exception-Metadaten in den externen Payload kopieren,
5. Ingest-Credential nur als Secret des Delivery-Workers,
6. Credential nur mit minimaler Ingest-Berechtigung für den dedizierten ULC-Production-Security-Sink,
7. Sinkfehler ohne Event-Payload protokollieren,
8. Tail Worker nicht selbst als Tail-Consumer konfigurieren,
9. Delivery-Ressource und Telemetry vollständig im bestehenden Cloudflare-Inventar erfassen,
10. kein zweiter M5-F-Evidence-Owner; `tooling/ulc-linz-m5-audit-security-logging-evidence.mjs` bleibt Gate-Grenze.

## 4. Providervergleich

### 1. Better Stack – Region Germany – derzeit bevorzugter Kandidat

Aktuell positiv:

- Telemetry-Quellen können selbst bedienbar mit `data_region = germany` angelegt werden.
- `logs_retention` ist pro Quelle in Tagen konfigurierbar und über Provider-API auslesbar.
- OpenTelemetry wird unterstützt; für den empfohlenen Tail-Worker-Pfad kann der dedizierte Ingest-Endpunkt verwendet werden.
- Sicherheitsseite dokumentiert standardmäßige Speicherung in EU-Regionen, AES-256 at rest sowie HTTPS/TLS in transit.
- DPA vorhanden; Restricted Transfers werden über DPF bzw. SCCs abgedeckt.
- veröffentlichte DPA-Schedules enthalten die aktuelle Subprozessorliste und Security Measures.
- Provider-API liefert Sink-ID, Datenregion und Retention – damit ist die spätere M5-F-Evidence gut maschinenprüfbar.
- aktuelle Preisbasis für Logs: USD 0.10/GB Ingestion und USD 0.05/GB/Monat Retention; für eine kleine Vereins-App voraussichtlich geringe variable Kosten. Der tatsächliche Preis/Plan muss vor Bestellung erneut geprüft werden.
- Spending Alerts/Limits verfügbar.

Vorbehalte:

- DPA erlaubt trotz EU-Datenregion bestimmte internationale Verarbeitung; die aktuelle Subprozessorliste enthält unter anderem AWS USA, Cloudflare global und weitere US-Dienste. Das muss als Transfer-/Subprozessor-Evidence akzeptiert werden und darf nicht als EU-only vermarktet werden.
- Retention ist providerseitig in Tagen ausgedrückt. Eine reine Tageszahl genügt für den kanonischen AppBasis-Vertrag von exakt 12 Kalendermonaten nicht.
- AI-/Zusatzfunktionen sind für den M5-F-Sink nicht erforderlich und sollen nicht vorsorglich aktiviert werden.

**Vorläufige Rangfolge: 1. Better Stack Germany.** Noch keine Bestellung/Freigabe.

### 2. Axiom Cloud – EU Central 1 – starke Alternative

Positiv:

- aktuelle Edge-Dokumentation nennt `EU Central 1 (AWS)` für Ingest und Edge-Queries,
- benutzerdefinierte Dataset-Retention, auch länger als Default bzw. `Forever`,
- DPA mit SCC-/Transfermechanismen,
- AES-256/TLS sowie ISO 27001/SOC 2 dokumentiert,
- dataset-spezifische Zugriffskontrolle und API-Evidence möglich,
- Axiom und Cloudflare dokumentieren Integrationspfade,
- aktuelle Preisrichtung Axiom Cloud: ca. USD 25/Monat Plattformgebühr plus Nutzung.

Vorbehalte:

- Axioms aktuelle Edge-Dokumentation nennt EU Central 1, während eine ebenfalls aktuelle Limits-Tabelle beim Axiom-Cloud-Plan noch `US` als supported edge deployment ausweist. Vor Kauf muss die tatsächliche EU-Central-Verfügbarkeit des gewählten Plans autoritativ bestätigt werden. Ohne Nachweis: STOP.
- zentrale Account-/Management-Funktionen sind nicht automatisch EU-only.
- aktuelle Subprozessorliste muss am Freigabetag aus dem Trust Center erfasst werden.
- höhere Fixkosten als Better Stack für den erwartbar kleinen ULC-Security-Logstrom.
- Soweit die konkrete Retention nur als feste Tageszahl konfiguriert/nachgewiesen werden kann, reicht auch diese Darstellung allein nicht für exakt 12 Kalendermonate.

**Vorläufige Rangfolge: 2. Axiom EU Central.**

### 3. Grafana Cloud EU – belastbare Alternative

Positiv:

- Cloudflare dokumentiert Grafana Cloud als OTel-Zielprovider,
- mehrere EU-Regionen,
- offizielles DPA und veröffentlichte Subprozessorliste,
- Logs-Retention bis maximal `1 year` konfigurierbar; API dokumentiert Retention in 30-Tage-Schritten,
- gut etablierte Zugriffskontrollen/Observability-Funktionen.

Vorbehalte:

- Pro startet aktuell bei USD 19/Monat plus Nutzung und standardmäßig 30 Tagen Log-Retention; längere Retention verursacht Zusatzkosten bzw. muss konkret für den Plan bestätigt werden,
- für den reinen ULC-Security-Sink funktional umfangreicher als nötig,
- direkte OTel-Ausleitung bliebe zu breit; auch bei Grafana wäre der gefilterte Tail-Worker-Pfad bevorzugt,
- die UI-Bezeichnung `1 year` darf nur dann als AppBasis-Evidence für 12 Kalendermonate gelten, wenn die autoritative Providersemantik tatsächlich kalenderäquivalent ist; 30-Tage-Schritte allein genügen dafür nicht.

**Vorläufige Rangfolge: 3. Grafana Cloud EU.**

## 5. Nicht ausreichende / nicht bevorzugte Optionen

### Cloudflare Workers Logs allein

Nicht ausreichend: aktuelle maximale native Retention auf Workers Paid beträgt 7 Tage.

### Direkter Cloudflare-OTel-Export des gesamten Worker-Logstroms

Nicht als M5-F-Default: zu breiter Datenumfang. Nur nach bewusster neuer Datenfluss-/Privacy-Bewertung für allgemeine Observability.

### Cloudflare R2 als primärer Security-Log-Sink

Nicht ohne neue Architektur-/Datenschutzentscheidung. ADR-022 sieht für ULC v0.1 keine zusätzliche Cloudflare-Persistenz personenbezogener Daten vor. Security-Logs können Actor-/Organisationsbezug enthalten.

### ULC Neon-Produktionsdatenbank als primärer Security-Log-Sink

Nicht bevorzugt. Ein separater Observability-Sink reduziert gemeinsame Ausfall-/Zugriffsdomänen zwischen Anwendungsdaten und Sicherheitsbeobachtung.

### Direkter HTTP-Sink aus der ULC Application Runtime

Aktuell nicht bevorzugt. `UlcLinzSecurityEventLogger` ist synchron und der generierte Produktions-Worker injiziert derzeit keinen externen Logger. Ein direkter Netzwerk-Sink würde Runtime-/Generator-/ExecutionContext-Verträge erweitern; der Tail-Worker-Slice ist für den heutigen realen Verbraucher enger.

## 6. Verbindliche Retention-Semantik: exakt 12 Kalendermonate

Der aktuelle M5-F-Consumer verlangt:

`retentionMonths === 12`

Diese Semantik wird **nicht** auf eine feste Tageszahl umgedeutet. AppBasis verwendet für bestehende Audit-Retention bereits eine kalenderbasierte Monatsgrenze (`12 * INTERVAL '1 month'`). Für den Production-Security-Sink gilt daher derselbe fachliche Maßstab:

**12 Monate = exakt 12 Kalendermonate.**

Konsequenzen für Provider-Evidence:

1. Eine autoritativ dokumentierte native Policy `12 months` oder `1 year` kann nur dann akzeptiert werden, wenn ihre Providersemantik nachweislich einer kalenderbasierten Jahres-/Monatsfrist entspricht.
2. Eine alleinige feste Tageszahl wie `365`, `366` oder `360` Tage ist **kein** äquivalenter Nachweis für exakt 12 Kalendermonate, weil keine feste Tageszahl für jedes Startdatum dieselbe Kalendergrenze beschreibt.
3. Ein Provider, der ausschließlich feste Tage konfigurieren bzw. belegen kann, erfüllt den heutigen M5-F-Vertrag damit nicht allein. Dann ist vor Production entweder ein ausdrücklich kontrollierter kalenderbasierter Retention-/Delete-Mechanismus erforderlich oder ein Provider/Plan mit nachweisbar passender nativer Semantik zu wählen.
4. Eine solche spätere Enforcement-Lösung wäre ein eigener realer Vertical Slice mit eigenem CI-/Security-/Review-Gate; sie wird in diesem Vorbereitungs-PR nicht erfunden.
5. Bis eine konkrete Providerkonfiguration diese Semantik autoritativ belegt, bleibt `auditSecurityLogging` fail-closed offen.

Damit ist die Architektursemantik geklärt, **nicht** die Providerwahl. Better Stack bleibt bevorzugter Kandidat, aber seine reine `logs_retention`-Tagesangabe reicht ohne zusätzlichen kalenderäquivalenten Nachweis oder Enforcement nicht für M5-F.

## 7. Empfohlene spätere Zielkonfiguration – noch nicht autorisiert

Wenn Better Stack nach den finalen Checks bestätigt wird:

- eigene Telemetry-Quelle nur für `ulc-linz` Production Security Events,
- `data_region = germany`,
- kein eigener R2-/S3-Bucket für v0.1,
- minimaler Ingest-Token nur für diese Quelle,
- getrennte menschliche Query-/Admin-Berechtigungen nach Least Privilege,
- keine öffentliche Read-API,
- Retention nur mit autoritativ belegter Übereinstimmung zur kanonischen 12-Kalendermonats-Semantik; eine feste Tageszahl allein reicht nicht,
- DPA-/Subprozessor-/Transfer-Evidence mit Abrufdatum,
- Provider-API-Evidence für Source/Sink-ID, Region und Retention,
- nur das bestehende normalisierte Security-Event-Schema wird übertragen,
- Kostenalarm vor Produktionsstart konfigurieren.

## 8. Manuelle Freigabepunkte vor irgendeinem Write

Später ausdrücklich zu bestätigen:

1. konkreter Sink-Anbieter und Plan,
2. Kostenrahmen,
3. DPA/AVV und Vertragsbindung des Accounts,
4. aktuelle Subprozessoren und internationale Transfers,
5. Datenregion des konkreten Sink,
6. autoritativer Nachweis der kanonischen 12-Kalendermonats-Retention,
7. Sink-/Source-Anlage,
8. Anlage/Deployment des nicht öffentlichen Tail Workers,
9. Ingest-Credential/Secret,
10. Aktivierung des Tail-Consumers am Production Worker.

Jeder mutierende Provider-/Deployment-Schritt bleibt separat freigabepflichtig. Diese Entscheidungsvorlage autorisiert keinen davon.

## 9. Offizielle Research-Baseline – 2026-08-19

Cloudflare:

- https://developers.cloudflare.com/workers/observability/exporting-opentelemetry-data/
- https://developers.cloudflare.com/workers/observability/logs/workers-logs/
- https://developers.cloudflare.com/workers/observability/logs/tail-workers/

Better Stack:

- https://betterstack.com/pricing
- https://betterstack.com/security
- https://betterstack.com/dpa
- https://betterstack.com/dpa/schedules
- https://betterstack.com/docs/logs/api/create-a-source/

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

Vor jedem realen Providerwrite müssen Preise, Planfähigkeiten, DPA/Subprozessoren, Regionen und Retention erneut frisch geprüft werden.