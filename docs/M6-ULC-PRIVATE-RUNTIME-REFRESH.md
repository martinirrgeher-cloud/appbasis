# M6 – ULC Linz privater Runtime-Refresh

## Zweck

Dieser Slice schließt den Lifecycle nach dem **ersten** privaten ULC-Produktionsdeploy. Die bestehenden Initial-Workflows bleiben bewusst auf den Erstzustand mit null Deployments begrenzt. Für einen bereits privat deployten Worker wird stattdessen ein eigener, fail-closed Refresh-Pfad verwendet.

Der Pfad ist erforderlich, weil die M5-Production-Evidence den deployten ULC-Worker absichtlich an den **exakten aktuellen `main`-SHA** bindet. Diese Provenienzprüfung wird nicht abgeschwächt.

## Sicherheitsgrenze

Ein Runtime-Refresh ist weiterhin reine nicht öffentliche Produktionsvorbereitung:

- Worker exakt `appbasis-ulc-linz-production`,
- `workers.dev`/Subdomain deaktiviert,
- Preview URLs deaktiviert,
- keine Worker-Routen und keine Domains,
- vor dem Refresh exakt ein 100%-Deployment,
- deployte Version muss aus der kanonisch markierten ULC-Production-Versionhistorie stammen,
- deployte Version muss an denselben aktuellen Better-Auth-Secret-HMAC gebunden sein,
- keine Traffic-Splits,
- keine unbekannten Versionen,
- exakt die vier zugelassenen Runtime-Bindings,
- Application- und Security-Log-Hyperdrive bleiben getrennt,
- keine Domain-Aktivierung und keine Production-Release-Autorisierung.

Der Refresh ändert weder M5-Kriterien noch M6-Readiness-Semantik. Er erzeugt keinen allgemeinen Provider-Orchestrator und keine zweite Generatorimplementierung.

## Zwei getrennte mutierende Schritte

Die Projektregel „jeder mutierende Schritt einzeln ausdrücklich freigegeben“ bleibt erhalten. Deshalb gibt es zwei getrennte `workflow_dispatch`-Workflows mit unterschiedlichen exakten Bestätigungen.

### 1. Aktuelle Runtime-Version hochladen

Workflow: `M6 ULC Production Runtime Refresh Configuration`

Exakte Bestätigung:

`REFRESH-CONFIGURE-ULC-PRODUCTION-RUNTIME`

Der Workflow:

1. liest Worker, Versionen, Deployment und Routen,
2. akzeptiert nur den geschlossenen privaten Ist-Zustand,
3. verifiziert den bisherigen 100%-Deploy als bekannte historische ULC-Version mit aktuellem Auth-Secret-HMAC,
4. löst die beiden bestehenden dedizierten Hyperdrives über den bestehenden Vertrag auf,
5. rendert die bestehende Produktions-Wrangler-Konfiguration,
6. lädt nur dann eine neue Version hoch, wenn für den exakten aktuellen `main`-SHA und HMAC noch keine existiert,
7. prüft anschließend die exakten vier Bindings,
8. beweist, dass der bestehende private Deploy durch diesen Schritt **nicht** verändert wurde.

Der Schritt deployt die neue Version nicht.

### 2. Exakte aktuelle Version privat deployen

Workflow: `M6 ULC Private Production Refresh Deploy`

Exakte Bestätigung:

`REFRESH-DEPLOY-ULC-PRIVATE-PRODUCTION`

Der Workflow:

1. liest den Providerzustand erneut frisch,
2. verlangt genau eine konfigurierte Version für aktuellen `main`-SHA + aktuellen HMAC,
3. prüft erneut die exakten Runtime-Bindings,
4. deployt ausschließlich diese Version mit 100%,
5. liest den Providerzustand erneut,
6. akzeptiert nur exakt einen 100%-Deploy auf dieser Version bei weiterhin geschlossenem Ingress.

Ist die aktuelle Version bereits exakt privat deployt, bleibt der Workflow idempotent und führt keinen zweiten Deployment-Write aus.

## Wiederverwendeter Vertrag

`tooling/ulc-linz-m6-private-runtime-refresh.mjs` ist ein kleiner gemeinsamer Validator für genau diese zwei realen Workflow-Verbraucher. Er ersetzt keine bestehenden M6-Providerverträge und enthält selbst keinen Provider-Write.

Er blockiert insbesondere bei:

- öffentlicher Route/Domain/Subdomain/Preview-URL,
- fehlendem oder gesplittetem Deployment,
- unbekannter Versionshistorie,
- Auth-Secret-HMAC-Drift,
- fehlender/duplizierter aktueller Version,
- unbekannten oder abweichenden Runtime-Bindings,
- gemeinsamem Application-/Security-Log-Hyperdrive.

## Abgrenzung

Dieser Slice autorisiert weder den Workflow-Start noch M5 Evidence, Retention-Cleanup, Domain-Aktivierung oder Release. Jeder tatsächliche Provider-/Datenbank-Write bleibt eine separate Betreiberentscheidung unmittelbar vor dem jeweiligen Schritt.
