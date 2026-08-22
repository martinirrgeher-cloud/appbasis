# M6 – ULC Linz M3 Production-Preparation Gate

## Zweck

Dieser Slice konsumiert ausschließlich die bereits bestehende, kanonische M3-Preview-Acceptance-Evidence als Voraussetzung für den Eintritt in M6 Phase A.

Es entsteht keine zweite M3-Evidence-Architektur. Maßgeblich bleibt `tooling/factory-ui/m3-preview-acceptance-evidence.mjs` mit dem dort gebundenen Acceptance-Run, dem akzeptierten M3-Contract-Digest und dem akzeptierten App-Definition-Digest.

## Roadmap-Grenze

Für M6 Phase A gilt:

- M3 DONE / reale Preview-Acceptance belegt
- aktueller Providerzustand read-only geprüft
- jeder mutierende Schritt separat ausdrücklich freigegeben

Das Konsumieren der M3-Evidence darf deshalb nur die Produktionsvorbereitung als fachlich zulässig markieren. Es autorisiert keinen Provider-Write.

## Consumer

`tooling/ulc-linz-m6-production-worker-m3-gate.mjs`:

1. akzeptiert ausschließlich den exakten geschlossenen Worker-Create-Plan aus dem vorherigen M6-Slice,
2. blockiert zusätzliche oder driftende Create-/Body-Felder fail-closed,
3. liest die aktuelle `apps/m3-preview/appbasis.app.json`,
4. ruft `deriveM3PreviewAcceptanceEvidence()` auf,
5. bleibt bei Datei-, Contract-, Definition-, HTTP-, JSON-, Run- oder sonstigem Evidence-Fehler fail-closed.

Bei gültiger Evidence wird ausschließlich folgender Übergang erlaubt:

- `productionPreparationGateEvidenceConsumed=true`
- `productionPreparationEligible=true`
- Status `worker-create-prepared-awaiting-operator-approval`

Unverändert gesperrt bleiben:

- `providerWriteAllowed=false`
- `executionAuthorized=false`
- `publicExposureAllowed=false`
- `productionReady=false`
- `releaseAuthorized=false`
- `explicitApprovalRequired=true`

`productionPreparationEligible=true` ist ausdrücklich **kein Freshness-Nachweis für Providerzustand**. Unmittelbar vor einem späteren realen Worker-Write müssen deshalb beide Grenzen erneut read-only verifiziert werden:

- aktueller Cloudflare-/Providerzustand (`providerStateReverificationRequired=true`),
- weiterhin verfügbarer atomar geschlossener Cloudflare-Beta-Create-Vertrag (`betaCapabilityReverificationRequired=true`).

## Nicht enthalten

Dieser Slice enthält ausdrücklich keinen:

- Cloudflare-API-Write,
- Worker-Create,
- Code-/Versions-Upload,
- Route-/Domain-Attachment,
- Secret-Write,
- Deployment,
- Production-Release.
