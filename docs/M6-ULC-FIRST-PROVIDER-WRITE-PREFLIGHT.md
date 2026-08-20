# M6 – ULC Linz First Provider-Write Preflight

## Zweck

Dieser Vertrag prüft unmittelbar vor dem ersten möglichen M6-Provider-Write, ob der autoritativ gelesene Providerzustand zum ausgewählten Create-Scope passt. Er erteilt selbst **keine** Schreibfreigabe.

Auch ein erfolgreiches Ergebnis bleibt:

- `providerWriteAllowed = false`
- `executionAuthorized = false`
- `explicitApprovalRequired = true`

## Neon-Inventargrenze

Die Evidence darf ein vollständiges Mehrseiteninventar enthalten. Die zulässige Gesamtgröße entspricht dem Reader-Vertrag von 25 Seiten zu jeweils maximal 400 Projekten, also **10.000 Projekte**. Ein sauberes Inventar mit mehr als 400 Projekten darf nicht allein deshalb blockiert werden.

Der Reader muss seinerseits beweisen, dass das Inventar vollständig ist. Volle Seiten ohne Fortsetzungsbeweis sind unvollständig und dürfen nicht als `inventoryComplete=true` in diesen Evaluator gelangen.

Der Evaluator prüft weiterhin fail-closed:

- exakte App-/Environment-/Provider-API-Bindung,
- frische Evidence innerhalb des 15-Minuten-Fensters,
- identischen späteren Create-Scope,
- autoritative Zielregion Frankfurt,
- explizite Regionswahl im Create-Mechanismus,
- keine exakte oder plausible vorhandene ULC-Production-Ressource,
- keine unsicheren/credential-shaped Evidence-Felder oder -Werte.

## Erster möglicher Write

Der erste mögliche Write bleibt die dedizierte Neon-Produktionsdatenbank `appbasis-ulc-linz-production` in `aws-eu-central-1`. Provider-Default-Regionen sind nicht zulässig.

Die spätere Cloudflare-Worker-Erzeugung bleibt ebenfalls geschlossen vorbereitet: `workers.dev=false`, Preview URLs aus, kein öffentliches Ingress vor kontrollierter Domain-Aktivierung.

## Wirkung

Dieser Preflight erzeugt oder verändert selbst keine Providerressource und ersetzt niemals die ausdrückliche Nutzerfreigabe für einen externen Write.
