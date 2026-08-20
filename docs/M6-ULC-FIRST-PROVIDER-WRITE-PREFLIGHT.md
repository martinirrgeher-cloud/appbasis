# M6 – ULC Linz erster Provider-Write: Preflight

## Zweck

Dieser Preflight ist die letzte read-only Provider-Inventur vor der kontrollierten Produktionsvorbereitung. Der erste mögliche spätere Write bleibt `neon-production-database`.

Ein erfolgreicher Inventarcheck autorisiert **weder** den Provider-Write **noch** bereits dessen Freigabe. Der Output bleibt ausdrücklich:

- Phase `production-preparation`
- `productionPreparationGateEvidenceConsumed=false`
- `productionPreparationEligible=false`
- `productionReady=false`
- `publicExposureAllowed=false`
- `providerWriteAllowed=false`
- `executionAuthorized=false`
- `explicitApprovalRequired=true`

Der Reader prüft nur Providerzustand. Der Eintritt in die Produktionsvorbereitung benötigt zusätzlich die separate M3-Gate-Evidence. M4 und M5 sind nach dem kanonischen Phasenmodell nicht Voraussetzung für jeden nicht öffentlichen Vorbereitungsschritt, bleiben aber zwingend für Production Ready und vor jeder öffentlichen Production-Exposition.

## Neon-Ziel

ULC Linz v0.1 verwendet:

- Projektname `appbasis-ulc-linz-production`
- Neon
- `aws-eu-central-1` / Frankfurt
- dedizierte Produktionsressource
- explizite Regionswahl beim Create
- keinen Provider-Default für die Region
- exakt denselben Organisationsscope für Inventur und späteren Create
- keine blinde Neuerzeugung oder Adoption bei vorhandenen/kollidierenden ULC-Produktionsressourcen

Die Evidence muss frisch und vollständig sein; das Gültigkeitsfenster beträgt maximal 15 Minuten. Provider-/Organisations-IDs werden nicht in den Ergebnis-Snapshot übernommen.

## Cloudflare-Sicherheitsvertrag

Der spätere Worker `appbasis-ulc-linz-production` muss bis zur kontrollierten öffentlichen Aktivierung geschlossen bleiben:

- `workers.dev=false`
- Preview URLs aus
- kein öffentliches Ingress
- geschlossene Ingress-Konfiguration bereits beim initialen Create/ersten Deploy
- kein ULC-Anwendungscode auf einem unbeabsichtigt öffentlichen Zwischenzustand

Nach dem Phasenmodell darf die öffentliche Domain erst aktiviert werden, nachdem reale M5-Evidence und Backup-/Recovery-Evidence erfolgreich sind.

## Read-only Provider-State-Reader

`tooling/ulc-linz-m6-provider-state-preflight.mjs` verwendet ausschließlich Provider-API-Reads und übergibt normalisierte Evidence an `evaluateUlcLinzM6FirstProviderWritePreflight()`.

### Neon

- `GET /api/v2/projects` mit dem späteren `org_id`
- vollständige Cursor-Pagination, `limit=400`, maximal 25 Seiten / 10.000 Projekte
- volle Seite ohne eindeutigen Fortsetzungsnachweis blockiert fail-closed
- `unavailable_project_ids` muss leer sein
- terminaler leerer/null Cursor ist nur auf einer kurzen letzten Seite zulässig
- `GET /api/v2/regions` mit demselben `org_id`
- Regionsinventar verwendet den Provider-Identifier `id`; Projektobjekte verwenden weiterhin `region_id`
- Frankfurt gilt nur bei `id=aws-eu-central-1` als verfügbar

Der akzeptierte spätere Create-Mechanismus ist `neon-api-v2-project-create-region-id`; ein Mechanismus ohne explizite Regionswahl wird abgewiesen.

### Cloudflare

Vor dem ersten Neon-Write wird zusätzlich `GET /client/v4/accounts/{accountId}/workers/scripts` gelesen. Der Endpoint wird als vollständiges Single-Page-Inventar behandelt. Exakte oder plausibel kollidierende ULC-Linz-Production-Worker blockieren.

## Inputs

Nur Namen, nie Werte im Repository:

- `NEON_API_KEY`
- `NEON_ORG_ID`
- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`
- `ULC_LINZ_M6_NEON_CREATE_METHOD=neon-api-v2-project-create-region-id`

Aufruf:

```sh
node ./tooling/ulc-linz-m6-provider-state-preflight.mjs
```

Credentials werden nicht im Ergebnis ausgegeben; Fehler verwenden feste Fehlercodes.

## Fail-closed-Fälle

Blockiert wird insbesondere bei unvollständiger Pagination, `unavailable_project_ids`, Scope-Drift, Cursor-Schleifen, stale Evidence, fehlender Frankfurt-Verfügbarkeit, ungeeignetem Create-Mechanismus, bestehenden Produktionskandidaten, Cloudflare-Kollisionen, unsicheren Shapes/Gettern/Prototypen, zusätzlichen unerwarteten Feldern oder Vertragsdrift.

## Entscheidende Freigabegrenze

Ein grüner Provider-Inventarcheck bedeutet nur: **der gelesene Providerzustand ist für den vorgesehenen Vorbereitungspfad konsistent**. Er bedeutet ausdrücklich nicht:

- M3-Gate konsumiert,
- Provider-Write freigabefähig,
- M4 oder M5 erfüllt,
- Production Ready,
- öffentliche Exposition erlaubt,
- Release erlaubt.

Ein späterer schreibender Vorbereitungsschritt muss vor Ausführung M3-Evidence und die ausdrückliche Freigabe dieses konkreten mutierenden Schritts konsumieren. Dieser PR enthält keinen solchen Executor.
