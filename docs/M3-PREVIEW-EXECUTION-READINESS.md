# M3 Preview Execution Readiness

Dieser Slice ergänzt einen vollständig read-only Vorabcheck vor der ersten realen M3-Provideränderung.

## Zweck

Die M3-Reihenfolge beginnt mit einer realen Migration der dedizierten Preview-Datenbank. Damit diese erste Mutation nicht erfolgt, obwohl ein später benötigtes Preview-Secret fehlt oder formal unbrauchbar ist, kann vorher der Workflow `M3 Preview Execution Readiness` ausgeführt werden.

## Geprüfte Verträge

Der Preflight verwendet die bereits bestehenden M3-Verträge für:

- Preview-Datenbank-URL und Better-Auth-Secret,
- technischen Root-Admin-Bootstrap,
- Smoke-Principals-Bootstrap,
- erlaubte und verweigerte Acceptance-Credentials.

Zusätzlich prüft er read-only, ob die geschützten Cloudflare-Zugangsdaten den Workers-Account und dessen `workers.dev`-Subdomain lesen können.

## Sicherheitsgrenze

Der Preflight:

- hat kein `apply`-Flag,
- führt keine Migration aus,
- erstellt keinen Hyperdrive,
- erstellt keinen Worker,
- lädt keine Worker-Version hoch,
- routet keinen Traffic,
- erzeugt keine Identitäten, Rollen oder Tasks,
- rotiert keine Secrets,
- gibt keine Secretwerte aus.

Er beweist nicht, dass spätere Provider-Writes garantiert erfolgreich sein werden. Er reduziert aber den vermeidbaren Teilzustand „erste Mutation erfolgt, späteres Pflicht-Secret fehlt“ und bleibt bei fehlender oder inkonsistenter Evidenz fail-closed.

## Reale M3-Reihenfolge danach

Nach einem grünen Preflight bleibt die bestehende kontrollierte Reihenfolge unverändert:

1. Preview-Datenbank migrieren,
2. Hyperdrive vorbereiten,
3. Preview-Worker vorbereiten,
4. Initial-Version ohne Traffic hochladen,
5. technischen Root-Admin bootstrappen,
6. Smoke-Principals und Permissions bootstrappen,
7. exakte Initial-Version auf Preview routen,
8. Health/Auth/Permission/Tasks-Acceptance-Smokes durchführen.

Alle schreibenden Provider- und Datenbankaktionen bleiben ausdrücklich freigabepflichtig.
