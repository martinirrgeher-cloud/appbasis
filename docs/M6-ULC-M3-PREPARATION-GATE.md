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

1. akzeptiert ausschließlich den geschlossenen Worker-Create-Plan aus dem vorherigen M6-Slice,
2. liest die aktuelle `apps/m3-preview/appbasis.app.json`,
3. ruft `deriveM3PreviewAcceptanceEvidence()` auf,
4. bleibt bei Datei-, Contract-, Definition-, HTTP-, JSON-, Run- oder sonstigem Evidence-Fehler fail-closed.

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

Der Cloudflare-Beta-Create-Vertrag muss unmittelbar vor einem späteren realen Write zusätzlich erneut read-only verifiziert werden (`betaCapabilityReverificationRequired=true`).

## Nicht enthalten

Dieser Slice enthält ausdrücklich keinen:

- Cloudflare-API-Write,
- Worker-Create,
- Code-/Versions-Upload,
- Route-/Domain-Attachment,
- Secret-Write,
- Deployment,
- Production-Release.
