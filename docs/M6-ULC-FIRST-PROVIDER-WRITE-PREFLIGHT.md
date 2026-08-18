# M6 – ULC Linz erster Provider-Write: Preflight

## Zweck

Dieser Preflight ist die letzte read-only Grenze **unmittelbar vor** dem ersten externen M6-Write.

Der erste mögliche Write bleibt:

`neon-production-database`

Auch bei vollständig erfolgreichem Preflight gilt weiterhin:

- `providerWriteAllowed = false`
- `executionAuthorized = false`
- `explicitApprovalRequired = true`

Ein erfolgreicher Preflight ist damit nur die technische Voraussetzung, um anschließend eine ausdrückliche Freigabe für den Provider-Write einzuholen.

## Neon-Ziel

ULC Linz v0.1 verwendet als app-spezifischen ersten Produktionsdatenbank-Zielvertrag:

- Projektname: `appbasis-ulc-linz-production`
- Provider: Neon
- Region: `aws-eu-central-1` / Frankfurt
- dedizierte Produktionsressource
- Region muss beim Create **explizit** gesetzt werden
- Provider-Default-Region ist nicht zulässig
- die **tatsächlich ausgewählte Create-Methode** muss eine explizite Regionsauswahl unterstützen
- die Provider-Inventur muss aus exakt demselben Organisations-/Create-Scope stammen, in den später geschrieben würde
- existiert bereits eine gleichnamige oder plausibel kollidierende ULC-Linz-Produktionsressource, wird nicht blind neu erzeugt

Der Preflight akzeptiert nur frische, vollständige Provider-API-Inventarevidence. Das Evidence-Fenster ist auf höchstens 15 Minuten begrenzt. Provider- oder Organisations-IDs werden nicht in den Ergebnis-Snapshot übernommen.

## Cloudflare-Sicherheitsvertrag für den nachfolgenden Worker-Schritt

Der spätere Produktions-Worker erhält app-spezifisch den Zielnamen:

`appbasis-ulc-linz-production`

Vor bzw. beim ersten Create/Deploy muss gelten:

- `workers.dev = false`
- Preview URLs = false
- kein öffentliches Ingress
- die geschlossene Ingress-Konfiguration wird bereits beim initialen Create oder ersten Deploy angewandt
- bevor ULC-Anwendungscode hochgeladen wird, muss der geschlossene Ingress-Zustand feststehen

Damit darf kein Zwischenzustand entstehen, in dem der Produktions-Worker unbeabsichtigt über `workers.dev` oder eine Preview URL erreichbar ist, bevor die kontrollierte Domain-Aktivierung erfolgt.

## Ausführbarer read-only Provider-State-Reader

`tooling/ulc-linz-m6-provider-state-preflight.mjs` erzeugt die Provider-Evidence nicht aus Operator-Behauptungen, sondern liest sie direkt aus den Provider-APIs und übergibt den normalisierten Neon-Anteil anschließend an `evaluateUlcLinzM6FirstProviderWritePreflight()`.

Der Reader besitzt ausschließlich `GET`-Pfade.

### Neon

Er liest:

- `GET /api/v2/projects` mit dem **späteren Create-Organisationsscope** als `org_id`
- alle Projektseiten über den von Neon gelieferten Cursor, `limit=400`
- `unavailable_project_ids`; bereits ein Eintrag macht die Inventur unvollständig und blockiert
- `GET /api/v2/regions` mit demselben `org_id`
- Frankfurt ausschließlich dann als verfügbar, wenn `aws-eu-central-1` in dieser organisationsspezifischen Regionsantwort vorhanden ist

Der aktuell akzeptierte spätere Create-Mechanismus ist bewusst exakt benannt:

`neon-api-v2-project-create-region-id`

Damit wird nur ein Create-Pfad vorbereitet, der beim Neon-v2-Project-Create `region_id` explizit setzt. Ein Connector oder anderer Mechanismus, der nur einen Provider-Default verwenden kann, scheitert bereits vor dem ersten Provider-Read fail-closed.

### Cloudflare

Der Reader liest zusätzlich vor dem ersten Neon-Write:

- `GET /client/v4/accounts/{accountId}/workers/scripts`
- vollständiges Worker-Inventar des späteren Cloudflare-Account-Scopes
- exakte und plausibel kollidierende ULC-Linz-Production-Worker-Namen

Eine bestehende Produktionsressource wird nicht adoptiert oder überschrieben. Schon ein plausibler Kollisionskandidat blockiert den Preflight.

Die spätere Worker-Erstellung bleibt davon getrennt: `workers.dev=false`, Preview URLs `false` und kein Public Ingress werden weiterhin erst am Worker-Create/ersten Deploy kontrolliert gesetzt und danach erneut read-only verifiziert.

## Ausführung

Der Reader benötigt nur die Namen der bestehenden Secret-/Scope-Inputs, niemals Werte im Repository:

- `NEON_API_KEY`
- `NEON_ORG_ID` – derselbe Scope, in den später geschrieben würde
- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`
- `ULC_LINZ_M6_NEON_CREATE_METHOD=neon-api-v2-project-create-region-id`

Aufruf:

```sh
node ./tooling/ulc-linz-m6-provider-state-preflight.mjs
```

API-Tokens werden nur als Bearer-Header verwendet. Fehlerausgaben enthalten ausschließlich feste Fehlercodes; Provider-Response-Bodies, Credentials, Connection Strings sowie Account-/Org-IDs werden nicht in das Ergebnis übernommen.

## Read-only Provider-Evidence

`evaluateUlcLinzM6FirstProviderWritePreflight()` akzeptiert ausschließlich:

- `source = provider-api`
- vollständige Neon-Projektinventur
- Bestätigung, dass Inventur und ausgewählter Create-Scope identisch sind
- Providerbestätigung, dass Frankfurt verfügbar ist
- Bestätigung, dass die **ausgewählte** Create-Methode eine explizite Regionsauswahl unterstützt
- frische Zeitstempel
- keine Secrets, Credentials oder Connection Strings

Die Projektinventur wird im Speicher geprüft, aber nicht in den Ergebnis-Snapshot übernommen.

Der ausführbare Provider-State-Reader ergänzt davor zusätzlich die vollständige Cloudflare-Worker-Kollisionsprüfung. Auch sein Erfolgsoutput bleibt `providerWriteAllowed=false` und `executionAuthorized=false`.

## Fail-closed-Fälle

Der Preflight blockiert mindestens bei:

- unvollständigem Neon-Providerinventar
- Neon-`unavailable_project_ids`
- abweichendem Inventur-/Create-Scope
- Neon-Cursor-Schleifen oder nicht vollständig lesbarer Pagination
- nicht autoritativer Quelle
- veralteter Evidence
- zu langem Evidence-Gültigkeitsfenster
- fehlender Frankfurt-Verfügbarkeit im ausgewählten Neon-Organisationsscope
- ausgewähltem Create-Mechanismus ohne explizite Regionsauswahl
- bereits vorhandener exakter Produktionsressource
- plausibel kollidierender Neon- oder Cloudflare-ULC-Linz-Produktionsressource
- fehlerhafter oder unvollständiger Cloudflare-Worker-Inventur
- unsicherem Evidence-Inhalt
- manipulierten Array-Prototypen/Gettern
- zusätzlichen unerwarteten Evidence-Feldern
- Drift zum bestehenden M6-Ausführungsplan oder #155-Resource-Binding-Vertrag

## Tests

`tooling/ulc-linz-m6-provider-state-preflight.test.mjs` ist verpflichtend in Root-`verify:apps` registriert und prüft insbesondere:

- ausschließlich `GET`-Requests und keine Request-Bodies
- vollständige Neon-Cursor-Pagination
- Blockade bei `unavailable_project_ids`
- organisationsbezogene Frankfurt-Verfügbarkeit
- Cloudflare-Worker-Kollisionen
- Provider-API-/Shape-Anomalien
- Cursor-Loops
- Accessor-basierte Providerwerte
- keine Rückgabe von API-Keys, Tokens, Org- oder Account-IDs
- keine Providerreads bei einem nicht explizit regionsfähigen Create-Mechanismus
- erfolgreiche Evidence autorisiert trotzdem keinen Write

## Kein Provider-Write

Dieser Preflight besitzt keine Create-, Update-, Deploy-, Secret-, Migration- oder Delete-Funktion.

Er kann ausschließlich lesen/validieren und liefert niemals selbst eine Providerfreigabe.
