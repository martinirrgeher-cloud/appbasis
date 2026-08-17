# M5-G – ULC Production Resource Binding Preflight

Stand: 2026-08-17

## Zweck

Dieser Preflight definiert den sicheren Übergang zwischen später ausdrücklich freigegebenen **realen ULC-Produktionsressourcen** und dem bereits vorbereiteten read-only M5-G Provider-Evidence-Consumer.

Er provisioniert keine Ressourcen, führt keine Migration aus, deployt keinen Worker und autorisiert keine Produktion.

Verbindliche Grundlagen:

- ADR-022: ULC v0.1 verwendet Standard Cloudflare Workers mit kontrollierter globaler Transient-Verarbeitung; ausdrücklich nicht EU-only.
- Persistente personenbezogene Primärdaten sollen in einer eigenen Neon-Produktionsdatenbank in EU / Frankfurt liegen.
- M6 verlangt getrennte Nachweise für eigene Produktionsdatenbank, eigenen Produktions-Worker und eigene Domain, definiert aber bewusst noch keine allgemeine Provider-Orchestrierung.
- Der wiederholbare allgemeine Produktions-Lifecycle wird erst nach dem ersten real bewiesenen Produktionspfad in FC1 verallgemeinert.
- Provider-IDs, Datenbankadressen und Secretwerte gehören nicht in `appbasis.app.json` oder `appbasis.database.json`.

## Architekturgrenze

M5-G benötigt reale Produktionsressourcen als **Evidence-Ziel**, darf daraus aber keinen zweiten Provisionierungs- oder Deploymentpfad ableiten.

Daher bleiben drei Verantwortungen strikt getrennt:

1. **Ressource bereitstellen** – spätere ausdrücklich freizugebende externe Aktion.
2. **Ressource binden** – kontrollierte Zuordnung der realen Providerressource zu `ulc-linz` / `production`, ohne Secrets in App-Manifeste zu schreiben.
3. **Evidence lesen** – read-only Prüfung der gebundenen Ressource gegen M5-G.

Der M5-G-Evidence-Consumer darf niemals selbst aus einem fehlenden Ziel eine Ressource erzeugen.

## Aktueller Ausgangszustand

Die ULC-App ist im technisch vorbereiteten Runtime-Branch bereits kanonisch als `ulc-linz` definiert und besitzt aktuell ausschließlich die Plattformdienste `identity` und `permissions`; Fachmodule sind noch leer.

`appbasis.database.json` beschreibt ausschließlich die Schema-/Migrationsownership für `identity` und `permissions`. Es enthält keine Neon-Projekt-ID, Datenbankadresse oder Credentials.

Der verbundene Neon-Account enthält zum Beobachtungszeitpunkt keine eindeutig zuordenbare ULC-Produktionsressource. Im Repository ist ebenfalls keine eindeutig gebundene ULC-Produktions-Cloudflare-Runtime vorhanden.

Diese Beobachtung ist dynamisch und kein dauerhafter Architekturvertrag.

## Keine Wiederverwendung des Preview-Pfads als Produktionspfad

Der bestehende Generated-Preview-Deployment-Vertrag ist ein bewährtes Sicherheitsmuster, aber kein Produktionsvertrag.

Wiederverwendbare Prinzipien:

- Provider-IDs und Ursprungsadressen bleiben Deployment-/Environment-Inputs.
- Secretwerte werden nicht in gerenderte App-Artefakte geschrieben.
- Worker-, Secret-, Hyperdrive-, Migration- und Smoke-Schritte bleiben getrennte Verantwortungen.
- Infrastrukturaktionen sind explizit, validiert und fail-closed.
- normale Deployments dürfen fehlende Infrastruktur nicht stillschweigend erzeugen.

Nicht automatisch übertragbar:

- Preview-GitHub-Environment
- Preview-Hostname/-Origin
- Preview-Worker-Ziel
- Preview-Hyperdrive-Ziel
- Preview-Datenbankname
- `workers.dev`-Verhalten
- Preview-spezifische Health-Adapter oder Workflow-Namen

Für Produktion werden diese Werte erst im späteren konkreten M6-Produktionsslice festgelegt und geprüft.

## Neon – spätere Produktionsressource

Vor M5-G-Evidence muss eine reale, eindeutig ULC zugeordnete Neon-Produktionsressource vorhanden sein.

Mindestens bindbar müssen sein:

- Neon-Projekt-ID
- autoritative Providerregion
- Produktionsbranch bzw. für AppBasis maßgebliche Produktionsdatenbankzuordnung
- logischer Datenbankname
- Zuordnung `application = ulc-linz`
- Zuordnung `environment = production`

Pflichtgrenzen:

- Region muss autoritativ Frankfurt entsprechen; keine Ableitung aus Namen oder Hoststrings.
- Preview-/Reference-/Restore-Projekte dürfen nicht als ULC-Produktion wiederverwendet werden.
- Connection String und Credentials bleiben geschützte Deployment-/Control-Plane-Secrets.
- Keine Provider-ID und kein Credentialwert wird in `appbasis.app.json` oder `appbasis.database.json` aufgenommen.

Der vorhandene `PostgresProvisioningConnection`-/`createPostgresDatabase()`-Vertrag arbeitet auf einer bereits vorhandenen PostgreSQL-Verbindung. Er ist kein Neon-Account-/Projekt-Provisionierer und darf nicht als solcher interpretiert werden.

## Cloudflare – spätere Produktionsressource

Vor M5-G-Evidence muss eine reale, eindeutig ULC zugeordnete Cloudflare-Produktionsruntime vorhanden sein.

Mindestens bindbar müssen sein:

- Cloudflare Account-/Zielumgebung
- eindeutiger Produktions-Worker-/Service-Identifier
- Produktionshostname bzw. Routingbezug
- reale Runtime-Bindings
- reale Observability-/Telemetry-Konfiguration, soweit read-only bestimmbar
- Zuordnung `application = ulc-linz`
- Zuordnung `environment = production`

Pflichtgrenzen aus ADR-022:

- Standard Workers sind zulässig.
- `euOnly = false` muss explizit bleiben.
- Regional Services / Customer Metadata Boundary werden nicht vorausgesetzt.
- zusätzliche personenbezogene Persistenzpfade über KV, D1, R2, Durable Objects oder andere nicht freigegebene Dienste benötigen eine neue Bewertung und halten betroffene M5-G-Kriterien fail-closed offen.

Der spätere M6-Produktionsslice legt erst dann den konkreten Produktions-Worker-, Domain- und gegebenenfalls Hyperdrive-Vertrag fest. M5-G erfindet dafür keine Namen oder Provider-IDs vorab.

## Hyperdrive / Runtime-DB-Bindung

Der bestehende Preview-Vertrag zeigt das gewünschte Sicherheitsmuster:

- Hyperdrive-Erstellung ist eine getrennte Infrastrukturaktion.
- normale Deployments lösen eine vorhandene Konfiguration nur auf und validieren sie.
- Provider-ID bleibt außerhalb der App-Manifeste.
- direkter PostgreSQL-Origin und Ziel-Datenbank werden gegen den erwarteten Vertrag geprüft.
- Secretwerte werden nicht protokolliert.

Für ULC-Produktion wird ein entsprechender konkreter Vertrag erst im M6-Produktionsslice festgelegt. Dieser Preflight entscheidet weder den Produktions-Hyperdrive-Namen noch seine Provider-ID und erstellt keine Cloudflare-Ressource.

## Bindungs-Evidence

Der spätere Resource-Binding-Schritt soll einen kleinen technischen, secrets-freien Identitätsnachweis erzeugen oder bereitstellen, den der M5-G-Evidence-Consumer eindeutig konsumieren kann.

Minimal erforderlich:

```text
schemaVersion
application = ulc-linz
environment = production
cloudflare.accountBinding
cloudflare.runtimeBinding
cloudflare.hostnameBinding
neon.projectBinding
neon.region
neon.productionDatabaseBinding
observedAt
```

Dabei gilt:

- Provider-IDs dürfen nur in geschützter Control-Plane-/Deployment-Evidence vorkommen, nicht im normalen App-Manifest oder UI-Snapshot.
- Secretwerte, Tokens, DB-Passwörter und vollständige Connection Strings sind verboten.
- Fremde App-/Environment-Bindungen sind ungültig.
- Ein Ressourcenname allein ist kein ausreichender Identitätsnachweis, wenn eine autoritative Provider-ID verfügbar ist.

## Reihenfolge beim späteren Übergang

Wenn die Voraussetzungen erreicht sind, ist die sichere Reihenfolge:

1. Live-State von `main`, allen offenen PRs, Heads, CI und Reviews erneut prüfen.
2. M4/M5/M6-Gates und aktuelle Produktionsvoraussetzungen erneut prüfen.
3. Nutzer erklärt die konkrete externe Ressourcenaktion ausdrücklich frei.
4. Konkrete ULC-Produktionsressourcen über den dann festgelegten ersten M6-Produktionspfad bereitstellen; keine generische Multi-App-Orchestrierung vorwegnehmen.
5. Ressourcenidentität und Zielumgebung bindbar machen, ohne Secrets in App-Manifeste zu schreiben.
6. M5-G Provider-Evidence ausschließlich read-only gegen genau diese Ressourcen erfassen.
7. `dataRegion`, `dpa`, `encryption`, `subprocessors` getrennt auswerten.
8. Erst bei vollständiger frischer Evidence kann M5 `productionReady=true` erreichen.
9. M6 übernimmt `securityPrivacyReady` ausschließlich aus dem bestehenden M5-Vertrag.
10. Eine spätere Produktionsaktion verlangt erneut eine frische ausdrückliche Nutzerfreigabe; Readiness ist keine Release-Autorisierung.

## Fail-closed-Fälle

Der Übergang bleibt blockiert, wenn mindestens eines gilt:

- keine eindeutige ULC-Produktionsressource vorhanden
- Preview-/Reference-/Restore-Ressource wird als Produktion angeboten
- Neon-Region fehlt oder ist nicht Frankfurt
- Cloudflare-Runtime wird fälschlich als EU-only dokumentiert
- zusätzliche nicht bewertete personenbezogene Provider-/Persistenzpfade existieren
- Provider-ID/Environment-Zuordnung ist mehrdeutig
- Secretwerte würden in Repository, App-Manifest oder normalen Factory-Snapshot gelangen
- M5-G-Evidence ist veraltet, widersprüchlich oder nicht an `ulc-linz` / `production` gebunden
- ein Produktionsworkflow versucht fehlende Infrastruktur stillschweigend anzulegen
- eine frühere Nutzerzustimmung wird als dauerhafte Release-Autorisierung wiederverwendet

## Was vor einer späteren Nutzerfreigabe konkret erklärt werden muss

Bevor erstmals ULC-Produktionsressourcen angelegt oder verändert werden, wird dem Nutzer mindestens genannt:

- welche Neon-Ressource angelegt werden soll und in welcher Region
- welche Cloudflare-Ressource angelegt bzw. gebunden werden soll
- ob dadurch Kosten entstehen können
- welche Secrets/geschützten Environment-Werte benötigt werden
- welche Ressourcen noch leer bleiben und welche Daten noch nicht migriert werden
- dass die Aktion noch keine Produktionsfreigabe und kein Nutzertraffic ist
- wie die Ressource anschließend read-only für M5-G verifiziert wird

## Exit-Kriterien dieses Vorbereitungspakets

Dieser Preflight ist abgeschlossen, wenn:

- Provisionierung, Binding und Evidence als getrennte Verantwortungen feststehen
- Preview-Verträge nur als Sicherheitsmuster und nicht als Produktionsimplementierung verwendet werden
- keine Produktionsressourcennamen/-IDs erfunden werden
- Neon- und Cloudflare-Bindungsanforderungen definiert sind
- Secret-/Manifestgrenzen definiert sind
- fail-closed Übergangsfälle definiert sind
- die spätere ausdrückliche Freigabegrenze klar ist
- keine externe Ressource erzeugt, verändert oder kostenpflichtig aktiviert wurde
