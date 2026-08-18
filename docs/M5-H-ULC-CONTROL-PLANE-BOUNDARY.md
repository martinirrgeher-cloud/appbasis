# M5-H – ULC Linz privilegierte Control-Plane-Grenze

## Ziel

M5-H belegt für **ULC Linz / production**, dass privilegierte Control-Plane-Komponenten nicht unnötig öffentlich erreichbar sind. Die normale ULC-Anwendungsruntime darf ihren vorgesehenen öffentlichen Ingress besitzen. Dieser Slice baut **keinen** neuen Admin-Pfad, keinen privilegierten Worker und keine zweite Control-Plane-Architektur.

## Bestehender Vertrag

Das bereits etablierte Reference-Muster bleibt die technische Vorlage für eine privilegierte Worker-Grenze:

- `workers.dev` deaktiviert,
- Preview-URLs deaktiviert,
- keine Custom Domain,
- keine öffentliche Worker Route,
- bei benötigter Kommunikation ausschließlich eine eindeutige interne Service-Binding-Beziehung.

Der provider- und Reference-spezifische Cloudflare-Reader bleibt in `tooling/reference-role-admin-ingress.mjs`. M5-H extrahiert daraus nur den kleinen stabilen **No-Public-Ingress-Snapshot** als gemeinsamen Vertrag. Die Reference-Providerlogik, der Reference-Workername und die Reference-Evidence werden nicht als ULC-Nachweis wiederverwendet.

## ULC-spezifische Evidence-Bindung

`tooling/ulc-linz-m5-control-plane-evidence.mjs` akzeptiert ausschließlich gemeinsam:

1. die bereits bestehende, frische ULC-Production-Resource-Binding-Evidence,
2. eine geschützte read-only Control-Plane-Inventarevidence für exakt dieselbe App, Umgebung, Cloudflare-Account-Bindung, öffentliche Runtime und dasselbe Evidence-Zeitfenster.

Der H-Consumer pinnt zusätzlich den aktuell sicherheitsgeprüften öffentlichen ULC-Runtime-Vertrag (`worker/app.ts` + `worker/index.ts`) über seine Git-Blob-Identitäten. Jede Änderung an diesen öffentlichen Routing-/Entrypoint-Grenzen invalidiert H fail-closed und verlangt eine bewusste erneute H-Prüfung. Dadurch kann ein später eingebetteter privilegierter `/api/admin/...`-Pfad nicht durch ein leeres Providerinventar unbemerkt H erfüllen.

Der H-Consumer verlangt:

- `application = ulc-linz`,
- `environment = production`,
- Cloudflare-Identität aus `provider-api`,
- vollständiges Inventar privilegierter Komponenten,
- vollständiges Binding-Inventar der öffentlichen Runtime,
- maximal 24 Stunden alte Evidence,
- keine Mehrdeutigkeit zwischen öffentlicher Runtime und privilegierten Komponenten,
- keine doppelt inventarisierte privilegierte Runtime.

Für jede inventarisierte privilegierte Komponente gilt zusätzlich:

- eigene/dedizierte Control-Plane-Ressource,
- nicht identisch mit der öffentlichen ULC-Runtime,
- `workers.dev = false`,
- Preview-URLs = false,
- keine Custom Domain,
- keine Worker Route,
- kein öffentlicher Fallback,
- exakt eine interne Service-Binding-Beziehung von der gebundenen öffentlichen ULC-Runtime zu dieser Komponente.

Fehlt ein Nachweis oder driftet App, Environment, Account, Runtime, Evidence-Zeitfenster, Ingress oder Binding, liefert der Consumer fail-closed `{}`.

## Aktueller ULC-Zustand

Der aktuelle ULC-Repository-Stand exponiert keinen öffentlichen Rollen-, Lifecycle-, Export- oder Audit-Control-Plane-Endpunkt. Deshalb wird **keine privilegierte Providerressource nur für M5-H erfunden**.

Ein vollständig belegtes leeres privilegiertes Komponenten-Inventar ist zulässig: Es beweist für den beobachteten, exakt gebundenen Production-Snapshot, dass keine separate privilegierte Worker-Ressource vorhanden ist, deren öffentlicher Ingress verborgen bliebe. Sobald später eine privilegierte Komponente eingeführt wird, muss sie im vollständigen Inventar erscheinen und die strengere No-Public-Ingress- plus Internal-Binding-Prüfung bestehen.

## Evidence- und Produktionsgrenze

Dieser Repository-Slice erzeugt keine reale Production-Evidence. Echte `privilegedControlPlaneIsolation=true`-Evidence setzt weiterhin einen aktuellen geschützten read-only Provider-/Control-Plane-Snapshot der **tatsächlichen** ULC-Produktionsressourcen voraus.

Es werden nicht durchgeführt:

- kein Cloudflare-/Neon-Create oder -Write,
- kein Deployment,
- keine Domain-/Route-/Service-Binding-Änderung,
- keine Secretänderung,
- keine produktive Datenbankänderung,
- keine Produktionsfreigabe.

Die spätere Factory-Komposition bleibt Eigentum von M5-J. M5-H liefert ausschließlich seinen eigenen Criterion-Output `{ privilegedControlPlaneIsolation: true }` oder fail-closed `{}`.
