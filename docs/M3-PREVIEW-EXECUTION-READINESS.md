# M3 Preview Execution Readiness

Dieser Slice ergänzt einen vollständig read-only Vorabcheck vor weiteren realen M3-Provideränderungen.

## Zweck

Die kontrollierte M3-Reihenfolge beginnt grundsätzlich mit der dedizierten Preview-Datenbank und deren Migrationen. In einer bereits teilweise vorbereiteten Preview-Umgebung kann dieser Zustand jedoch schon vorhanden sein. Der Workflow `M3 Preview Execution Readiness` prüft deshalb vor weiteren Writes, ob die später benötigten geschützten Inputs formal gültig sind und ob die bestehende dedizierte M3-Datenbank read-only erreichbar ist und das erwartete Schema besitzt.

## Geprüfte Verträge

Der Preflight verwendet die bereits bestehenden M3-Verträge für:

- exakte dedizierte Preview-Datenbank-URL,
- tatsächliche read-only Datenbankverbindung und erwartetes M3-Schema,
- Better-Auth-Secret,
- technischen Root-Admin-Bootstrap,
- Smoke-Principals-Bootstrap,
- erlaubte und verweigerte Acceptance-Credentials.

Zusätzlich prüft er read-only, ob die geschützten Cloudflare-Zugangsdaten den Workers-Account und dessen `workers.dev`-Subdomain lesen können.

## Sicherheitsgrenze

Der Preflight:

- hat kein `apply`-Flag,
- führt keine Migration aus,
- führt auf PostgreSQL nur Schema-Reads aus,
- erstellt keinen Hyperdrive,
- erstellt keinen Worker,
- lädt keine Worker-Version hoch,
- routet keinen Traffic,
- erzeugt keine Identitäten, Rollen oder Tasks,
- rotiert keine Secrets,
- gibt keine Secretwerte aus.

Er beweist nicht, dass spätere Provider-Writes garantiert erfolgreich sein werden. Er reduziert aber den vermeidbaren Teilzustand „weitere Mutation erfolgt, späteres Pflicht-Secret oder die erwartete Preview-Datenbank ist unbrauchbar“ und bleibt bei fehlender oder inkonsistenter Evidenz fail-closed.

## Reale M3-Reihenfolge danach

Nach einem grünen Preflight wird der vorhandene Providerzustand autoritativ gelesen und nur der noch fehlende Teil der bestehenden Reihenfolge ausgeführt:

1. dedizierte Preview-Datenbank und Migrationen verifizieren beziehungsweise kontrolliert vervollständigen,
2. Hyperdrive vorbereiten,
3. Preview-Worker vorbereiten,
4. Initial-Version ohne Traffic hochladen,
5. technischen Root-Admin bootstrappen,
6. Smoke-Principals und Permissions bootstrappen,
7. exakte Initial-Version auf Preview routen,
8. Health/Auth/Permission/Tasks-Acceptance-Smokes durchführen.

Vorhandene korrekte Providerressourcen werden wiederverwendet; fehlende oder mehrdeutige Zustände werden nicht blind überschrieben. Alle schreibenden Provider- und Datenbankaktionen bleiben ausdrücklich freigabepflichtig.
