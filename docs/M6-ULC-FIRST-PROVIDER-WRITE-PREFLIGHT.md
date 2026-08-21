# M6 – ULC Linz erster Provider-Write: Preflight

## Zweck

Dieser Preflight ist die letzte read-only Provider-Inventur vor der kontrollierten Produktionsvorbereitung. Der erste mögliche spätere Write bleibt `neon-production-database`, **sofern** die exakt vorgesehene Produktionsdatenbank noch nicht existiert.

Ein erfolgreicher Inventarcheck autorisiert **weder** einen Provider-Write **noch** bereits dessen Freigabe. Der Output bleibt ausdrücklich:

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
- explizite Regionswahl beim Create, falls ein Create noch erforderlich ist
- keinen Provider-Default für die Region
- exakt denselben Organisationsscope für Inventur und späteren Create
- keine blinde Neuerzeugung oder Adoption bei abweichenden/kollidierenden ULC-Produktionsressourcen

Eine bereits vorhandene Ressource darf den Schritt `neon-production-database` ausschließlich dann als bereits erfüllt repräsentieren, wenn im vollständigen Providerinventar **genau ein** ULC-Production-Kandidat existiert und dieser gleichzeitig exakt `appbasis-ulc-linz-production` heißt und exakt `aws-eu-central-1` meldet. Jeder zweite Kandidat, jeder abweichende Name und jede abweichende Region blockiert fail-closed. Diese Verifikation ist read-only und autorisiert keinen weiteren mutierenden Schritt.

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
- ein erfolgreicher Regions-Response bestätigt Frankfurt nur bei `id=aws-eu-central-1`
- ein erfolgreicher Regions-Response ohne Frankfurt blockiert fail-closed
- ausschließlich HTTP 404 auf `/regions` darf die Regionsverifikation bis unmittelbar nach einem erforderlichen, ausdrücklich freigegebenen Create verschieben; Auth-, Transport-, JSON-, Shape- und andere HTTP-Fehler blockieren weiterhin fail-closed
- ein 404 wird nicht als positive oder negative Verfügbarkeitsaussage ausgegeben: `targetRegionAvailable=null`

Der akzeptierte spätere Create-Mechanismus ist `neon-api-v2-project-create-region-id`; ein Mechanismus ohne explizite Regionswahl wird abgewiesen. Die Create-Region bleibt hart auf `aws-eu-central-1` gepinnt; Provider-Default bleibt verboten.

Wenn die exakt vorgesehene Produktionsressource bereits im vollständigen Projektinventar vorhanden ist und ihre `region_id` exakt Frankfurt bestätigt, meldet der Preflight `existingExactProductionResourceVerified=true`, `firstProviderWriteRequired=false` und `firstProviderWriteAlreadySatisfied=true`. Die Ressource wird dabei nicht verändert.

Wenn ein Create noch erforderlich ist, bleibt die Post-Create-Verifikation Pflicht. Der neu erzeugte Neon-Projektzustand muss unmittelbar read-only zurückgelesen werden. `verifyUlcLinzM6CreatedNeonProjectRegion()` akzeptiert ausschließlich ein Provider-Projekt mit `region_id=aws-eu-central-1`. Fehlende, malformed oder abweichende `region_id` blockiert jeden weiteren Produktionsvorbereitungsschritt fail-closed. Migration, Binding, Deployment, öffentliche Exposition und Release dürfen dann nicht fortgesetzt werden.

### Cloudflare

Vor dem ersten noch erforderlichen Provider-Write wird zusätzlich `GET /client/v4/accounts/{accountId}/workers/scripts` gelesen. Der Endpoint wird als vollständiges Single-Page-Inventar behandelt. Exakte oder plausibel kollidierende ULC-Linz-Production-Worker blockieren.

## Production-Worker Pre-Write

Wenn die exakte Neon-Zielressource bereits verifiziert ist und kein Cloudflare-Worker-Kandidat existiert, darf `tooling/ulc-linz-m6-production-worker-prewrite.mjs` ausschließlich den **festen Zielzustand des nächsten geplanten mutierenden Schritts** verifizieren. Der Output ist kein Executor und autorisiert keinen Write.

Der Zielzustand ist fest:

- Schritt `production-worker`
- Provider `cloudflare`
- Workername exakt `appbasis-ulc-linz-production`
- `workersDev=false`
- `previewUrls=false`
- `publicIngress=false`
- `applicationCodeUploadAllowed=false`
- erforderliche Preparation-Gate-Evidence: `M3_DONE`
- `productionPreparationGateEvidenceConsumed=false`
- `productionPreparationEligible=false`
- `providerWriteAllowed=false`
- `executionAuthorized=false`
- `explicitApprovalRequired=true`

Wichtig: Der reine Provider-State-Reader darf den Worker **noch nicht als freigabefähig vorbereitet** melden. Solange die separate, vertrauenswürdig gebundene M3-Gate-Evidence nicht konsumiert wurde, lautet der Zustand `worker-target-verified-blocked-awaiting-m3-gate-evidence`. Erst ein nachgelagerter Gate-Consumer darf aus gültiger M3-Evidence einen preparation-eligible Zustand ableiten; auch dann bleibt eine separate ausdrückliche Betreiberfreigabe vor dem realen Cloudflare-Write zwingend.

Die Pre-Write-Auswertung blockiert fail-closed, wenn die Provider-Inventur nicht vollständig/verifiziert ist, ein Worker-Kandidat existiert, die Neon-Produktionsdatenbank nicht bereits als exakt verifiziert gilt oder irgendein vorgelagerter Safety-Status einen Write bzw. öffentliche Exposition bereits erlaubt.

Der bestehende Workflow `M6 ULC Provider State Preflight` darf den Worker-Zielzustand deshalb nur dann read-only auswerten, wenn `existingExactProductionResourceVerified=true` bestätigt ist. Ist stattdessen ein Neon-Create legitim noch erforderlich (`firstProviderWriteRequired=true` und `firstProviderWriteAlreadySatisfied=false`), wird die Worker-Pre-Write-Auswertung übersprungen. Widersprüchliche Neon-Readiness-Zustände blockieren fail-closed. Der Workflow enthält weiterhin keinen Cloudflare-Write.

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

Blockiert wird insbesondere bei unvollständiger Pagination, `unavailable_project_ids`, Scope-Drift, Cursor-Schleifen, stale Evidence, explizit fehlender Frankfurt-Verfügbarkeit in einem erfolgreichen Regionsinventar, ungeeignetem Create-Mechanismus, mehreren oder abweichenden Produktionskandidaten, Cloudflare-Kollisionen, unsicheren Shapes/Gettern/Prototypen, zusätzlichen unerwarteten Feldern oder Vertragsdrift. HTTP 404 auf `/regions` ist nur dann tolerierbar, wenn keine bereits vorhandene Zielressource ihre Region verifizieren kann und ein späterer Create noch erforderlich ist.

## Entscheidende Freigabegrenze

Ein grüner Provider-Inventarcheck bedeutet nur: **der gelesene Providerzustand ist für den vorgesehenen Vorbereitungspfad konsistent**. Er bedeutet ausdrücklich nicht:

- M3-Gate konsumiert,
- ein noch erforderlicher Provider-Write freigabefähig,
- M4 oder M5 erfüllt,
- Production Ready,
- öffentliche Exposition erlaubt,
- Release erlaubt.

Ist die exakte Neon-Zielressource bereits vorhanden und verifiziert, entfällt ausschließlich deren Neuerzeugung. Jeder nachfolgende mutierende Schritt benötigt weiterhin seine eigene ausdrückliche Freigabe. Dieser PR enthält keinen mutierenden Executor.
