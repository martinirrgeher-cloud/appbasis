# M5 – ULC Production Evidence Package

Stand der Vorbereitung: 2026-08-19, 14:49 Europe/Vienna

## Status

**Ausführungsreife Evidence-Sammelvorlage – keine Production-Evidence und keine Providerfreigabe.**

Dieses Dokument beschreibt, welche realen Nachweise nach Existenz der ausdrücklich freigegebenen ULC-Produktionsressourcen in einem kontrollierten read-only Evidence-Lauf gesammelt werden müssen. Es ersetzt keinen M5-Owner und setzt kein Kriterium auf `verified`.

Der kanonische Repository-Vertrag auf dem aktuellen M5-Härtungsstand bleibt maßgeblich. Alle dynamischen Provider-/Vertragsangaben werden unmittelbar vor dem echten Evidence-Lauf erneut aus offiziellen/autoritativen Quellen gelesen.

## 1. Ziel

Nach den freigegebenen M6-Provider-/Deployment-Schritten soll genau **ein korrelierbares Production-Evidence-Paket** entstehen, aus dem die bestehenden Owner M5-F/G/H/I/J fail-closed ableiten können.

Das Paket muss insbesondere verhindern:

- Mischung von Evidence aus verschiedenen Runtime-/DB-/Sink-Snapshots,
- Wiederverwendung alter Evidence nach Restore/Deployment/Binding-Change,
- Verwechslung von Providerfähigkeiten mit realer Account-/Ressourcenkonfiguration,
- Aufnahme von Secrets, Connection Strings oder personenbezogenen Rohdaten,
- Erfinden positiver Booleans aus Operator-Text.

## 2. Gemeinsamer Snapshot-Anker

Vor F/G/H/I/J wird **ein** aktueller Production Resource Binding Snapshot gelesen und validiert.

Dieser Snapshot muss mindestens die heute bereits kanonisch verwendeten Bindungen umfassen:

- `application = ulc-linz`
- `environment = production`
- Runtime-Entrypoint und Runtime-Contract-Digest
- `providerModel = standard-workers-global-transient`
- `euOnly = false`
- Neon Project-/Branch-/Database-Binding
- Neon Region aus Provider-API
- Cloudflare Account-/Runtime-/Hostname-/Database-Binding
- vollständiges Cloudflare Binding-Inventar
- vollständiges Cloudflare Telemetry-Inventar
- keine unerwartete personenbezogene Cloudflare-Persistenz
- dedizierte Produktionsressourcen
- `observedAt`
- `validUntilOrReviewAt`

Der kanonische M5-G-Resource-Binding-Fingerprint wird ausschließlich aus diesem validierten Snapshot berechnet.

**Regel:** Jede volatile F/G/H/I/J-Evidence, die eine konkrete Production-Ressource betrifft, muss auf denselben Resource-Binding-Fingerprint und dasselbe Evidence-Zeitfenster zurückführbar sein.

## 3. Evidence-Erfassungsreihenfolge

Nach Abschluss aller dafür ausdrücklich freigegebenen Produktionswrites:

1. finalen Repository-/Runtime-Head pinnen,
2. Production Resource Binding Snapshot lesen,
3. Resource-Binding-Fingerprint berechnen,
4. M5-F Logging-/Retention-Evidence lesen,
5. M5-G Provider-/Compliance-Evidence lesen,
6. M5-H geschützten Control-Plane-Snapshot lesen,
7. Backup-/Restore-Evidence und Least-Privilege/Operator-Evidence für M5-I lesen,
8. F/G/H/I gegen denselben Snapshot/Fingerprint prüfen,
9. erst danach M5-J 12/12-Komposition ausführen.

Wird während dieser Sequenz eine relevante Ressource verändert, wird der Lauf verworfen und von Schritt 1 neu begonnen.

## 4. M5-F – Audit & Security Logging

### 4.1 Delivery-/Sink-Bindung

Read-only zu belegen:

- konkrete ULC-Production-Runtime,
- konkreter Security-Log-Sink,
- Sink-Identität aus autoritativem Provider-/DB-State,
- tatsächlich konfigurierte Delivery-Ressource,
- exakter M5-F-Security-Event-Vertrag,
- strukturierte Event-Erfassung aktiv,
- vollständiges Sink-/Delivery-Binding-Inventar,
- kein öffentlicher Read-/Query-Endpunkt,
- geschützter operativer Zugriff.

Der geplante dedizierte Cloudflare Tail-Worker-Pfad darf nur die bereits sanitizierten `[ulc-linz-security]`-Events weiterleiten. Vollständige Request-/Tail-/Exception-Metadaten gehören nicht in den M5-F-Sink.

### 4.2 Retention

M5-F verlangt **exakt 12 Kalendermonate**.

Der spätere technische `M5-F Calendar Retention Evidence`-Slice darf nur einen tatsächlich implementierten Modus akzeptieren:

- `provider-native-calendar`, oder
- `controlled-calendar-enforcement`.

Für controlled PostgreSQL enforcement zusätzlich:

- DB-Delete-Authority/Privileges vollständig inventarisiert,
- keine unbekannte TTL-/Trigger-/Job-/Routine-Grenze mit Early-Delete-Wirkung,
- täglicher Cleanup-Execution-Binding real belegt,
- letzter erfolgreicher Lauf frisch,
- Contract-/Acceptance-Digests passen.

### 4.3 Cloudflare Workers Logs / allgemeine Observability

Cloudflare Workers Logs sind **nicht** der 12-Monats-M5-F-Sink. Die offizielle Workers-Logs-Dokumentation beschreibt derzeit maximal 7 Tage Retention und umfasst Invocation-, Custom-, Error-/Exception-Logs.

Darum muss das Production-Evidence-Paket zusätzlich festhalten:

- ob Workers Logs/Observability für die ULC-Runtime aktiviert ist,
- welche Felder/Logs real persistiert werden,
- welche Retention tatsächlich gilt,
- ob dieser Datenfluss bereits im M5-G-Telemetry-Inventar enthalten ist.

Eine aktivierte breite Observability darf nicht still als der enge M5-F-Security-Log-Pfad ausgegeben werden.

## 5. M5-G – Provider Compliance

### 5.1 Cloudflare

Der reale Evidence-Lauf muss den aktuellen ADR-022-Vertrag bestätigen:

- Runtime = Standard Workers,
- `euOnly = false`,
- keine EU-only-Behauptung,
- tatsächliche Runtime-/Route-Bindung,
- vollständiges Binding-Inventar,
- vollständiges Telemetry-/Logging-Inventar,
- keine unerwartete personenbezogene Cloudflare-Persistenz,
- tatsächlicher Transportverschlüsselungsstatus,
- Zustand von Regional Services / Customer Metadata Boundary nur als beobachteter Zustand, nicht als v0.1-Pflicht.

Aktuelle offizielle Vertragsbaseline, die am Ausführungstag erneut verifiziert wird:

- Cloudflare DPA Version/Wirksamkeitsstand,
- Cloudflare-Subprozessorenliste für die tatsächlich verwendeten Developer-Platform-Dienste,
- Transfermechanismen des DPA,
- Security-/Encryption-Baseline.

Die aktuelle DPA-Baseline beschreibt Cloudflare als Processor/Sub-Processor, internationale Transfers/SCCs und eine fortlaufend gepflegte Subprozessorenliste. Diese öffentliche Baseline ersetzt **nicht** den account-spezifischen Nachweis, dass die Bedingungen für den tatsächlichen ULC-Account gelten.

### 5.2 Neon/PostgreSQL

Read-only zu belegen:

- konkrete Production Project-/Branch-/Database-Bindung,
- Region exakt `aws-eu-central-1` aus Provider-API,
- dedizierte Produktionsressource,
- tatsächliche verschlüsselte DB-Verbindung,
- At-Rest-Encryption für die reale Ressource/Providerkonfiguration,
- Backup-/Recovery-Pfade im selben Provider-Scope,
- keine Credentials im normalen Evidence-Output.

Aktuelle offizielle Baseline, am Ausführungstag erneut zu verifizieren:

- AWS Europe (Frankfurt) / `aws-eu-central-1` wird von Neon unterstützt,
- Neon dokumentiert TLS für Datenübertragung und AES-256 at rest,
- Neon Platform Services werden über das Product Specific Schedule in die Databricks-Vertrags-/DPA-Struktur eingebunden,
- die Neon-spezifische Subprozessorenliste ist Teil dieser Vertragskette.

### 5.3 Legal-Evidence – keine statischen Wahrheiten

Für Cloudflare und Neon/Databricks werden getrennte Evidence-Einträge gesammelt für:

- DPA – öffentliche aktuelle Baseline,
- DPA Account Binding – tatsächliche Vertragsbindung,
- Subprozessoren – aktuelle Liste,
- Security/Verschlüsselung,
- Processing Model,
- Region,
- bei Neon zusätzlich aktuelle `terms`/Product-Specific-Schedule-Evidence.

Jeder Eintrag benötigt:

- Provider,
- Dokumenttyp,
- kanonische Quelle,
- Dokumentversion oder `updatedAt`,
- exakten Service Scope,
- `observedAt`,
- `validUntilOrReviewAt`,
- Kennzeichnung öffentliche Baseline vs. account-spezifische Evidence,
- Transfermodell konsistent mit ADR-022, soweit einschlägig.

Provider-Webseiten werden **nicht** als dauerhaft unveränderliche Repositorywahrheit behandelt.

## 6. Datenfluss- und Telemetry-Inventar

Vor M5-G `verified` müssen alle tatsächlich realen Flows in der aktuellen ULC-v0.1-Grenze erfasst sein.

Mindestens erwartet:

1. User/Browser → Cloudflare Runtime – Application Request Processing
2. Cloudflare Runtime → Neon/PostgreSQL – Application Persistence
3. geschützte AppBasis Control Plane → Cloudflare – Provider Evidence Read
4. geschützte AppBasis Control Plane → Neon/PostgreSQL – Provider Evidence Read
5. Neon/PostgreSQL → Neon/PostgreSQL – Managed Backup/Recovery
6. M5-F Delivery Worker → tatsächlicher Security-Log-Sink, **sobald dieser reale Flow existiert**
7. weitere aktivierte Cloudflare Logs/Telemetry-Ziele, **nur wenn real vorhanden**

Ein neuer realer Datenfluss ist kein Grund, ihn aus der Evidence zu verstecken. Er erweitert den Scope fail-closed und verlangt die passende Datenschutz-/Providerbewertung.

## 7. M5-H – privilegierte Control Plane

Read-only und über eine geschützte Control-Plane-Grenze zu belegen:

- exakte öffentliche ULC-Runtime-Bindung,
- vollständiges Inventar aller tatsächlich privilegierten Komponenten,
- vollständiges Binding-Inventar der öffentlichen Runtime,
- bei jeder privilegierten Komponente: eigene/dedizierte Ressource, nicht identisch mit öffentlicher Runtime,
- kein `workers.dev`-Ingress,
- keine Preview URL,
- keine Custom Domain,
- keine Worker Route,
- kein öffentlicher Fallback,
- ausschließlich beabsichtigte interne Service-Binding-Beziehungen.

Ein vollständig belegtes leeres privilegiertes Komponenten-Inventar bleibt zulässig, solange der aktuelle ULC-Runtimevertrag weiterhin keine privilegierte öffentliche Admin-/Export-/Lifecycle-/Audit-Control-Plane materialisiert.

Runtime-/Entrypoint-Drift invalidiert H.

## 8. M5-I – High Privacy / Backup / Least Privilege

M5-I darf nur aus den realen Ownern abgeleitet werden.

Zusätzlich zu F/G/H wird gesammelt:

### Backup/Restore

- konkrete gebundene ULC-Production-DB,
- Backup-/Snapshot-Konfiguration,
- Recovery Point/Restore-Ziel,
- isolierter Restore vor Promotion,
- Datenintegritätsnachweis,
- Auth-Smoke,
- Permission-Allow-/Deny-Smoke,
- Application-Smoke,
- Restore-Reconciliation gegen autoritativ neuere Löschmarker,
- kein reaktiviertes gelöschtes Subject,
- Evidence desselben Production-DB-Bindings.

### Least Privilege

- reale Produktionsrollen/Scopes entsprechen der kanonischen ULC-Policy,
- Runtime-/Ingest-/Query-/Cleanup-/Control-Plane-Credentials besitzen nur den jeweiligen benötigten Scope,
- keine Operator-/Admin-Berechtigung wird aus Convenience in die öffentliche App-Runtime übertragen,
- unbekannte Zusatzprivilegien blockieren.

### Operator Assessment

- versionierte repository-seitige ULC-Operatorentscheidung weiterhin aktuell,
- tatsächlicher Provider-/Runtime-/Datenflusszustand widerspricht ihr nicht.

## 9. M5-J – finaler 12/12-Lauf

M5-J wird **zuletzt** ausgeführt.

Zulässig sind ausschließlich Outputs der kanonischen Owner:

- G: `dataRegion`, `dpa`, `encryption`, `subprocessors`
- B: `rolesAndPermissions`
- C/D: `deletionConcept`, `retention`
- E: `dataExport`
- F: `auditSecurityLogging`
- I: `highPrivacyProfile`
- Repository: `secretsOutsideAppManifests`
- H: `privilegedControlPlaneIsolation`

Fixture-/Hand-/Operator-Booleans sind keine Production-Evidence.

Nur 12/12 ergibt den bestehenden M5-`productionReady`-Boolean. Dieser M5-Boolean ist weiterhin **kein Production Release**.

## 10. Freshness

Die aktuelle F/G/H-Evidence-Grenze arbeitet in einem engen, höchstens 24 Stunden alten Production-Snapshot.

Für den tatsächlichen Evidence-Lauf gilt deshalb:

- `observedAt` einmal festlegen,
- `validUntilOrReviewAt` gemeinsam setzen,
- den Lauf innerhalb eines engen Operatorfensters durchführen,
- alle volatile Evidence auf denselben Ressourcen-Snapshot beziehen,
- keine Mischung alter und neuer Providerreads.

Wenn ein externer Legal-Dokumentstand keine technische 24h-Freshness besitzt, wird trotzdem der **Abruf-/Prüfzeitpunkt** des aktuellen Dokumentstands in das gemeinsame Evidence-Paket aufgenommen. Die Legal-Source-Version bleibt separat erhalten.

## 11. Invalidation – wann alles neu erhoben werden muss

Mindestens folgende Ereignisse invalidieren die volatile Production-Evidence:

- Worker-/Runtime-Deployment oder Runtime-Contract-Digest ändert sich,
- Production DB/Project/Branch ändert sich,
- Hyperdrive/DB-Binding ändert sich,
- Hostname/Route/Public Ingress ändert sich,
- Security-Log-Sink oder Delivery-Binding ändert sich,
- Logging-/Telemetry-Konfiguration ändert sich,
- privilegierte Control-Plane-Komponente/Binding ändert sich,
- ein Production-Restore wird finalisiert,
- Backup-/Recovery-Konfiguration ändert sich relevant,
- DPA-/Terms-/Subprozessoren-/Transferlage ändert sich,
- Evidence läuft aus oder kann nicht mehr autoritativ reproduziert werden.

Nach einer tatsächlichen Restore-Finalisierung werden insbesondere F/G/H/I/J neu erhoben; alte Resource-Binding-Fingerprints werden nicht wiederverwendet.

## 12. Sanitization / was niemals ins normale Evidence-Paket gehört

Nicht speichern/ausgeben:

- API Tokens,
- Passwörter,
- Session Tokens/Cookies,
- Connection Strings,
- Secret-Werte,
- private Keys,
- vollständige Provider-Rohantworten,
- Datenbankadressen, sofern nicht zwingend nur innerhalb geschützter transienter Evaluation benötigt,
- Account-/Org-/Project-/Binding-IDs im normalen Factory-Snapshot,
- personenbezogene Security-Log-Payloads,
- Request-/Response-Bodies.

Geschützte Evidence-Reader dürfen interne opaque Binding-IDs transient zur Korrelation verwenden. Normale Factory-/UI-Ausgaben enthalten nur semantische Zustände und nicht reversible Fingerprints.

## 13. Stop-Regeln

M5-J nicht ausführen bzw. Ergebnis nicht als Production-Evidence verwenden, wenn:

- Resource-Binding-Snapshot nicht vollständig validiert ist,
- Fingerprints zwischen F/G/H/I widersprechen,
- Provider-/Legal-Evidence stale/unklar ist,
- Telemetry-/Binding-/Datenflussinventar nicht vollständig ist,
- ein unbekannter personenbezogener Persistenzpfad existiert,
- Restore/Reconciliation nicht vollständig bewiesen ist,
- Evidence sensible Rohdaten enthält,
- während des Evidence-Laufs eine relevante Ressource verändert wurde.

## 14. Operator-Ergebnis des späteren echten Laufs

Der normale Operator-Output soll ausschließlich enthalten:

- Prüfzeit/Freshness-Fenster,
- Repository-/Runtime-Head/Digest in sanitizierter Form,
- Resource-Binding-Fingerprint,
- F/G/H/I/J Kriterienstatus,
- fehlende Nachweise/Blocker,
- explizit `productionReleaseAuthorized = false`, solange das getrennte M6-Release-Gate nicht freigegeben wurde.

Keine Provider-IDs/Secrets/PII.

## 15. Aktuelle offizielle Baseline – nur Vorbereitung

Bei Erstellung dieser Vorlage am 2026-08-19 wurde aus offiziellen Quellen bestätigt:

- Cloudflare DPA aktuell Version 6.4, wirksam 2026-04-03; enthält Subprocessor-/Transferregeln und Security Measures.
- Cloudflare pflegt eine eigene aktuelle Subprozessorenliste für Cloudflare Services/Developer Platform.
- Cloudflare dokumentiert Verschlüsselung von Customer Data at rest und in transit in seinen Security-Vertragsunterlagen.
- Neon unterstützt AWS Europe Frankfurt `aws-eu-central-1`.
- Neon dokumentiert TLS 1.2/1.3 für Daten in transit und AES-256 at rest.
- Neon Platform Services nutzen das Neon Product Specific Schedule als Ergänzung der Databricks-Vertrags-/DPA-Struktur; dessen Neon-spezifische Subprozessorenreferenz ist maßgeblich.

**Diese Liste wird unmittelbar vor echter Production Evidence erneut geprüft.**

## 16. DONE für Punkt 7

Punkt 7 ist vorbereitet, wenn dieses Evidence-Paket im Prep-PR liegt, der Diff ausschließlich dokumentarisch ist und vollständige Exact-Head-CI + ChatGPT-Review grün sind.

## 17. Externe Wirkung

Keine.

Insbesondere kein Providerread mit Secrets, kein Providerwrite, keine Ressource, keine Migration, kein Deploy, kein Restore, keine Production-Evidence, keine Freigabe.
