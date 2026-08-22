# M5-G – ULC Provider Evidence Consumer Preflight

Stand: 2026-08-17

## Zweck

Dieser Preflight bereitet den nächsten technischen M5-G-Slice für **ULC Linz v0.1** vor. Er definiert den späteren read-only Evidence-Consumer, ohne Providerressourcen anzulegen, zu verändern oder produktive Daten abzurufen.

Verbindliche Architekturgrundlage ist ADR-022:

- Cloudflare Standard Workers
- kontrollierte globale transiente Verarbeitung; ausdrücklich **nicht EU-only**
- persistente personenbezogene Primärdaten in der eigenen Neon-Produktivdatenbank in **EU / Frankfurt**
- Cloudflare soweit möglich zustandslos bezüglich personenbezogener Fach-/Identity-Daten
- keine zusätzlichen Cloudflare-Persistenzdienste für personenbezogene ULC-Daten in M5 v0.1 ohne neue Entscheidung

Dieser Preflight setzt kein M5-Kriterium auf `verified`.

## Architekturgrenze

Der spätere Consumer ist **Control-Plane-/Evidence-Logik**, keine Funktion der öffentlichen ULC-App-Runtime.

Er darf:

- ausschließlich read-only Provider-/Konfigurationsmetadaten lesen
- ausschließlich für die eindeutig gebundene ULC-Produktionsumgebung arbeiten
- app-spezifische Evidence erzeugen
- fehlende oder widersprüchliche Evidence fail-closed als `open` behandeln

Er darf nicht:

- Cloudflare- oder Neon-Ressourcen erzeugen, ändern oder löschen
- Deployments auslösen
- Secrets rotieren
- Datenbankmigrationen ausführen
- produktive Fach- oder Identity-Daten lesen
- Provider-Tokens, Connection Strings oder Secretwerte in Evidence schreiben
- Reference-/Preview-Evidence als Produktionsnachweis verwenden
- eine generische Provider-Compliance-Plattform ohne weiteren realen Verbraucher einführen

## Abhängigkeiten vor technischer Umsetzung

Der technische Slice wird erst aktiviert, wenn die folgenden Voraussetzungen real vorhanden und ausdrücklich freigegeben sind:

1. eindeutige ULC-Produktions-Cloudflare-Runtime
2. eindeutige ULC-Neon-Produktionsressource
3. Neon-Produktionsregion soll `EU / Frankfurt` bzw. die autoritative Providerkennung für Frankfurt sein
4. read-only bzw. minimal privilegierte Providerzugriffe für Evidence-Abfragen
5. geklärte Stelle für Evidence-Ausführung, bevorzugt geschützte CI-/Control-Plane-Grenze

Keine dieser Ressourcen wird durch diesen Preflight erstellt.

## Zieloutput

Der Consumer erzeugt einen kleinen app-spezifischen Evidence-Snapshot für `ulc-linz` und `production`.

Mindestens erforderlich:

```text
schemaVersion
application
environment
observedAt
validUntilOrReviewAt
providerModel
providers[]
dataFlows[]
criteria
```

### Feste Bindungen

- `application = ulc-linz`
- `environment = production`
- `providerModel = standard-workers-global-transient`
- `euOnly = false`
- erlaubter Provider-Scope im personenbezogenen Produktivdatenpfad: `cloudflare`, `neon-postgresql`

Fremde App-, Preview-, Reference- oder unbekannte Environment-Evidence ist ungültig.

## Cloudflare-Evidence

Der Consumer muss die konkrete ULC-Produktionsruntime eindeutig identifizieren können, ohne Secrets oder personenbezogene Nutzdaten zu lesen.

Mindestens zu prüfen:

### Runtime-Bindung

- eindeutiger Worker-/Service-Identifier der ULC-Produktion
- Account-/Umgebungsbindung
- erwarteter öffentlicher Produktions-Hostname bzw. Routing-Bezug, soweit für die ULC-Zielarchitektur verwendet
- keine Verwechslung mit Preview/Reference

### Standard-Workers-Modell

Der Snapshot muss ausdrücklich dokumentieren:

- Regional Services werden nicht als Voraussetzung behauptet
- Customer Metadata Boundary wird nicht als Voraussetzung behauptet
- TLS-Terminierung/Worker-Ausführung wird **nicht als EU-only** bezeichnet
- `providerModel = standard-workers-global-transient`

Ein Providerzustand darf nicht fälschlich aus dem Fehlen von Regional Services als Fehler gewertet werden. Fehlerhaft wäre dagegen jede Evidence, die den Standard-Workers-Zustand als EU-only darstellt.

### Persistenz-/Binding-Inventar

Für M5 v0.1 muss fail-closed geprüft werden, welche Cloudflare-Bindings die reale ULC-Runtime besitzt.

Personenbezogene Persistenz über zusätzliche Cloudflare-Dienste ist ohne neue Entscheidung nicht erlaubt. Daher müssen insbesondere unerwartete persistente Datenpfade sichtbar werden, z. B.:

- KV
- D1
- R2
- Durable Objects
- Queues/Workflows, sofern sie personenbezogene Daten transportieren könnten
- sonstige externe Service Bindings mit Datenverarbeitung

Der Consumer soll keine pauschale Sperre anhand bloßer Produktnamen bauen. Er soll die realen Bindings inventarisieren und für nicht im ULC-v0.1-Vertrag abgedeckte Datenpfade `dataRegion`/`subprocessors` fail-closed offen lassen.

### Logs / Telemetry

Evidence muss festhalten, ob und welche Cloudflare-Observability-/Loggingpfade für die reale ULC-Produktion aktiviert sind, soweit dies autoritativ read-only bestimmbar ist.

Pflichtbewertung:

- keine Secretwerte im Snapshot
- keine unnötigen personenbezogenen Payloads als beabsichtigter Loggingvertrag
- ohne Customer Metadata Boundary keine EU-only-Aussage für Customer Logs/Traffic-Metadaten

## Neon/PostgreSQL-Evidence

Mindestens zu prüfen:

### Produktionsressource

- eindeutiges Neon-Projekt / eindeutige Produktionszuordnung
- eindeutiger Produktionsbranch bzw. die für AppBasis maßgebliche Produktionsdatenbankzuordnung
- keine Wiederverwendung von Preview-/Test-Ressourcen als Production-Evidence

### Region

- autoritative Providerregion der realen Produktionsressource
- muss dem bestätigten Ziel **EU / Frankfurt** entsprechen
- unbekannte, fehlende oder abweichende Region => `dataRegion = open`

Der Consumer darf keine Region aus Hostnamen, Branchnamen oder lokalem Konfigurationswunsch erraten, wenn eine autoritative Providerangabe verfügbar sein muss.

### Verschlüsselung

App-spezifische Evidence kombiniert später:

- aktuelle offizielle Providerfähigkeit für TLS/At-Rest-Verschlüsselung
- reale ULC-Konfiguration, soweit read-only belegbar
- Secret-Grenze: keine DB-Credentials in Snapshot/Manifest/Repository

Providerdokumentation allein verifiziert `encryption` nicht.

## Vertrags-/DPA-/Subprozessoren-Evidence

Veränderliche Providerunterlagen werden nicht als unveränderliche Wahrheit in den technischen Consumer eingebrannt.

Der Snapshot benötigt für jede verwendete Dokument-/Vertragsreferenz mindestens:

- Provider
- Dokumenttyp
- Referenz/Quelle
- `observedAt`
- `validUntilOrReviewAt`
- konkreten Dienstbezug

Für Neon gilt die aktuelle Databricks/Neon-Vertragskette; für Cloudflare die für den tatsächlich verwendeten Worker-/Developer-Platform-Scope relevanten Unterlagen.

Der technische Consumer darf nur prüfen, dass frische, app-spezifisch zugeordnete Evidence vorhanden ist. Juristische Bewertung wird nicht durch String-Matching automatisiert.

## Datenfluss-Evidence

Der reale Snapshot muss mindestens die tatsächlich vorhandenen ULC-v0.1-Flüsse gegen das Inventar prüfen:

1. Browser -> Cloudflare ULC Runtime
2. Cloudflare ULC Runtime -> Neon/PostgreSQL Produktion
3. geschützte CI/Control Plane -> Provider APIs, soweit Evidence-Abfragen stattfinden
4. Neon Backup/Recovery innerhalb des Providerdienstes
5. Cloudflare Logs/Telemetry, soweit real aktiviert

Neue reale Datenflüsse oder Provider erweitern den Scope fail-closed und dürfen nicht still ignoriert werden.

## Kriterienauswertung

Die vier M5-G-Kriterien bleiben getrennt:

### `dataRegion`

Kann erst `verified` werden, wenn:

- Neon-Produktion autoritativ Frankfurt bestätigt ist
- Cloudflare-Verarbeitungsmodell exakt ADR-022 entspricht
- keine unbekannten personenbezogenen Persistenz-/Datenflüsse offen sind
- der Snapshot ausdrücklich `euOnly = false` für Standard Workers trägt

### `dpa`

Kann erst `verified` werden, wenn frische account-/dienstbezogene Vertrags-/DPA-Evidence für Cloudflare und Neon/Databricks vorliegt.

### `encryption`

Kann erst `verified` werden, wenn Providerfähigkeit und reale ULC-Konfiguration für alle relevanten Datenpfade zusammen ausreichend belegt sind.

### `subprocessors`

Kann erst `verified` werden, wenn aktuelle, dienstbezogene Providerlisten/Transfer-Evidence vorhanden und innerhalb der festgelegten Reviewfrist sind.

Kein Kriterium darf ein anderes implizit verifizieren.

## Freshness-Vertrag

Jeder Evidence-Snapshot benötigt:

- `observedAt`
- `validUntilOrReviewAt`
- Quelle/Providerreferenz
- App-/Environment-Bindung

Fail-closed `open` bei:

- fehlender Zeitangabe
- abgelaufener Reviewfrist
- Clock-/Parsingfehler
- nicht mehr abrufbarer oder widersprüchlicher Quelle
- falscher App/Environment-Bindung
- Provider-/Konfigurationsdrift

Es wird kein universelles Maximalalter erfunden. Die Reviewfrist wird pro Evidenztyp festgelegt und spätestens vor Production Gate erneut geprüft.

## Fehler- und Secret-Vertrag

Providerfehler werden sanitisiert. Evidence und Logs dürfen insbesondere nicht enthalten:

- API Tokens
- Authorization Header
- Cookies
- Datenbankpasswörter
- Connection Strings mit Credentials
- Secretwerte
- produktive personenbezogene Datensätze

Bei Provider-Timeout, 401/403, 404 für erwartete Ressourcen, unvollständigem JSON oder unbekanntem Schema bleibt das betroffene Kriterium `open`.

## Technischer Zuschnitt des späteren Slices

Bevorzugt ein kleiner ULC-spezifischer Slice, z. B.:

- ein Evidence-Reader/Normalizer unter bestehendem M5-/Control-Plane-Tooling
- ein ULC-spezifischer Evaluator
- Fixture-basierte Tests für Cloudflare- und Neon-Metadaten
- kein Runtime-Endpunkt
- keine öffentliche Route
- keine Providerwrites

Erst wenn ein zweiter realer App-Verbraucher dieselbe Semantik benötigt, wird geprüft, ob gemeinsame Teile abstrahiert werden sollen.

## Testmatrix für den späteren Slice

Mindestens fixture-basiert testen:

1. korrekte ULC-Produktion + Standard Workers + Neon Frankfurt => G-Evidence kann technisch vollständig sein, sofern Vertrags-/Freshness-Evidence ebenfalls gültig ist
2. Preview-Evidence statt Produktion => fail-closed
3. Reference-App statt ULC => fail-closed
4. Neon falsche Region => `dataRegion = open`
5. Neon Region unbekannt => `dataRegion = open`
6. Standard Workers werden als EU-only behauptet => fail-closed
7. unerwarteter persistenter Cloudflare-Datenpfad => betroffene Kriterien `open`
8. zusätzlicher unbekannter Provider => fail-closed
9. veraltete DPA-/Subprozessor-Evidence => jeweiliges Kriterium `open`
10. fehlendes `observedAt` oder `validUntilOrReviewAt` => fail-closed
11. Provider-API-Fehler/Timeout/invalid JSON => fail-closed
12. Secret-/Credential-Feld in normalisiertem Output => Test muss fehlschlagen
13. Preview-Region Frankfurt darf Production-Region nicht verifizieren
14. ein erfülltes Kriterium darf kein anderes implizit auf `verified` setzen

## Exit-Kriterien des Vorbereitungsslices

Dieser Preflight ist abgeschlossen, wenn:

- ADR-022 eindeutig konsumiert wird
- spätere Providerabfragen auf read-only begrenzt sind
- Produktiv-/Preview-/Reference-Bindungen getrennt sind
- Evidence-Schema und Freshness feststehen
- Fail-closed- und Secret-Grenzen feststehen
- Testmatrix feststeht
- keine Produktivressource oder kostenpflichtige Providerfunktion angelegt wurde

## Nächster sicherer Schritt

Solange #144 und #145 die zwei aktiven Entwicklungsstränge belegen, bleibt M5-G Vorbereitung.

Sobald ein Entwicklungsplatz frei ist **und** die realen ULC-Produktionsressourcen ausdrücklich freigegeben und eindeutig gebunden sind, kann aus diesem Preflight ein kleiner technischer read-only Provider-Evidence-Slice entstehen.

Vor jedem Start erneut Live-State von `main`, allen offenen PRs, Heads, CI und Reviews prüfen.
