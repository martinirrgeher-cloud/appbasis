# Phase 2E7 – Reference Preview Deployment Contract

## Ziel

Die Reference-App besitzt einen reproduzierbaren, ausschließlich manuell ausgelösten Deployment-Pfad für den nicht-produktiven Cloud-Vertical-Slice auf Cloudflare mit Neon/PostgreSQL und Hyperdrive.

Nach dem PostgreSQL-Permission-Cutover ist PostgreSQL die einzige Business-Permission-Authority. Die privilegierte Rollenadministration bleibt eine getrennte Control Plane: Der öffentliche Reference Worker enthält keine `PostgresRoleAdministration`, sondern leitet ausschließlich den expliziten Gateway-Pfad `/api/admin/roles...` über ein internes Cloudflare Service Binding an einen nicht öffentlich erreichbaren Role-Admin-Worker weiter.

## Verbindlicher aktueller Zustand

- PostgreSQL ist die einzige Runtime-Authority für AppBasis-Business-Permissions.
- Der normale Reference-Deploy verifiziert die persistente PostgreSQL-Permission-Authority vor Build und Deployment.
- `apps/reference/wrangler.jsonc` verwendet bewusst `keep_vars: false`.
- Die ephemere Deployment-Konfiguration besitzt genau eine unverschlüsselte Worker-Variable: `APPBASIS_BASE_URL` als `plain_text`.
- `APPBASIS_BASE_URL` wird aus der geschützten GitHub-Environment-Variable `APPBASIS_PREVIEW_URL` abgeleitet und als kanonische HTTPS-Origin validiert.
- `APPBASIS_REFERENCE_MEMBER_IDENTITY_IDS` und `APPBASIS_REFERENCE_ADMIN_IDENTITY_IDS` sind sowohl als `plain_text` als auch als `json` verboten.
- Andere unerwartete `plain_text`- oder `json`-Variablen sind ebenfalls unzulässig. Jedes `json`-Binding blockiert den Deploy-Abschluss.
- Worker-Secrets werden durch einen normalen Deploy unabhängig von `keep_vars` nicht gelöscht.
- `BETTER_AUTH_SECRET` bleibt in beiden Runtime-Workern ein extern verwaltetes Cloudflare-Secret und muss denselben Session-Vertrag absichern; sein Wert darf nie im Repository oder in Workflow-Logs erscheinen.
- Der öffentliche Reference Worker besitzt exakt ein internes Service Binding `ROLE_ADMIN` auf `appbasis-reference-role-admin`.
- `appbasis-reference-role-admin` verwendet `workers_dev: false` und `preview_urls: false`, deklariert keine öffentliche Route und ist nur über das Service Binding erreichbar.
- Der Role-Admin-Worker besitzt seinen eigenen `HYPERDRIVE`-Binding, dieselbe kanonische `APPBASIS_BASE_URL` und den bestehenden `PostgresRoleAdministration`-Vertrag.
- Der Role-Admin-Worker authentifiziert den unveränderten Session-Cookie selbst und verlangt serverseitig weiterhin `app:use` plus `users:manage`; Actor und Audit-Reason werden nicht vom Browser vertraut übernommen.
- Der echte Deploy prüft zusätzlich den Cloudflare-Remote-Zustand fail-closed: `workers.dev` und Preview URLs müssen deaktiviert sein, es darf keine Custom Domain und in keiner zugänglichen Account-Zone eine Worker-Route auf `appbasis-reference-role-admin` zeigen.
- Der authentifizierte Deploy-Smoke verwendet den verifizierten `demo.user`, der persistent ausschließlich `demo:member` besitzt. Derselbe Session-Cookie muss den Admin-Worker erreichen und dort mit `403 PERMISSION_DENIED` abgewiesen werden; damit werden gemeinsamer Session-Vertrag, Service Binding und deny-by-default live bewiesen, ohne einen Secret-Wert auszulesen.
- Die historische Permission-Cutover-Workflow-Datei bleibt als expliziter, auditierbarer Migrationspfad erhalten. Nur dieser historische Cutover-Pfad darf Legacy-Worker-Settings als Migrationsinput lesen.

## Zwei Worker, eine öffentliche Origin

### `appbasis-reference`

Der normale Reference Worker bleibt der einzige öffentliche Worker der Reference-App. Er bedient Auth, Tasks und die vorhandene UI. Für Rollenadministration akzeptiert er ausschließlich:

- `/api/admin/roles`
- `/api/admin/roles/...`

Der Gateway-Code enthält keine Rollenadministrationslogik und keinen `PostgresRoleAdministration`. Er schreibt lediglich den externen Präfix `/api/admin/roles` auf den bereits gepinnten internen Admin-Vertrag `/api/roles` um und leitet den vollständigen Request über `ROLE_ADMIN.fetch(...)` weiter. Cookie, HTTP-Methode, Query und Body bleiben erhalten. Fehlt das Service Binding, antwortet der Gateway fail-closed mit `503`.

Andere Pfade werden niemals an den Admin-Worker weitergeleitet. Insbesondere bleibt `/api/roles` im normalen App-Worker kein öffentlicher Rollenendpunkt.

### `appbasis-reference-role-admin`

Der Role-Admin-Worker ist eine interne Control Plane. Seine Repository-Konfiguration liegt in `apps/reference/wrangler.role-admin.jsonc` und muss dauerhaft folgende Grenzen erfüllen:

- `main: ./worker/role-admin.ts`
- `workers_dev: false`
- `preview_urls: false`
- keine `route` oder `routes`
- keine ausgehenden Service Bindings
- `keep_vars: false`

Die Laufzeit erstellt aus der vorhandenen PostgreSQL-Verbindung den bestehenden `PostgresPermissionStore` und `PostgresRoleAdministration`. Es entsteht kein zweites Permission-Modell. `/api/health` bleibt auch hier DB- und Secret-unabhängig; alle Rollenendpunkte bleiben ohne vollständige Runtime-Konfiguration fail-closed.

## Scope des manuellen Deployments

- manueller GitHub-Actions-Workflow `Reference Preview Deploy`
- GitHub-Environment `reference-preview` als Deployment-Grenze
- frozen install und vollständiges `verify:repo` vor jedem Deployment
- ephemere Wrangler-Konfigurationen für beide Worker
- echte `HYPERDRIVE`-Binding ausschließlich aus dem geschützten GitHub-Environment
- kanonische Preview-Origin ausschließlich als credential-freie HTTPS-Origin
- explizite Read-only-Prüfung, dass **beide** Worker bereits existieren
- explizit deaktiviertes Wrangler Auto-Provisioning/Auto-Create
- Deployment des internen Role-Admin-Workers **vor** dem öffentlichen Reference Worker
- Remote-Snapshot und fail-closed Binding-Verifikation des Role-Admin-Workers vor Änderung des öffentlichen Gateway-Workers
- fail-closed Remote-Ingress-Prüfung für `workers.dev`, Preview URLs, Custom Domains und Zone-Routes vor Änderung des öffentlichen Gateway-Workers
- Remote-Snapshot und fail-closed Binding-Verifikation des Reference Workers vor Health und Acceptance-Smoke
- Health-Smoke und authentifizierter Demo-v0.1-Acceptance-Smoke nach erfolgreicher Remote-Verifikation
- der authentifizierte Acceptance-Smoke muss zusätzlich die gemeinsame Role-Admin-Session und die erwartete `users:manage`-Verweigerung des Member-Benutzers bestätigen

## Warum ephemere Wrangler-Konfigurationen

Die reale Hyperdrive-ID und die Preview-Origin sind Environment-spezifisch und gehören nicht in das Repository.

`tooling/reference-preview-deploy-config.mjs` liest deshalb die beiden providerfreien Source-Konfigurationen:

- `apps/reference/wrangler.jsonc`
- `apps/reference/wrangler.role-admin.jsonc`

und erzeugt owner-only temporär:

- `apps/reference/wrangler.preview.generated.json`
- `apps/reference/wrangler.role-admin.preview.generated.json`

Beide temporären Dateien ergänzen ausschließlich:

- `HYPERDRIVE` mit der geschützten Provider-ID
- `vars.APPBASIS_BASE_URL` mit der normalisierten `APPBASIS_PREVIEW_URL`

Der Renderer verweigert persistierte Hyperdrive-Bindings, persistierte Environment-`vars`, ungültige Provider-IDs, nicht-kanonische Preview-Origins und aktiviertes `keep_vars`. Für den normalen Worker pinnt er zusätzlich exakt das `ROLE_ADMIN`-Service-Binding. Für den Admin-Worker verweigert er öffentliche `workers.dev`-/Preview-URL-Freigaben, öffentliche Routen und ausgehende Service Bindings.

## GitHub-Environment `reference-preview`

### Secrets

- `CLOUDFLARE_ACCOUNT_ID`
- `CLOUDFLARE_API_TOKEN`
- `APPBASIS_HYPERDRIVE_ID`
- `APPBASIS_DATABASE_URL`
- `APPBASIS_SMOKE_PASSWORD`
- optional `APPBASIS_SMOKE_NEW_PASSWORD`

Die Werte werden nicht in das Repository geschrieben und nur den benötigten Schritten bereitgestellt. Provider-Identifikatoren und geschützte Werte werden in Actions-Logs maskiert.

`BETTER_AUTH_SECRET` ist bewusst **kein** GitHub-Deployment-Secret dieses Workflows. Es bleibt als Cloudflare-Worker-Secret vorhanden. Vor dem ersten echten Role-Admin-Deploy muss `appbasis-reference-role-admin` bereits existieren und mit dem für dieselbe Reference-Session notwendigen `BETTER_AUTH_SECRET` ausgestattet sein. Der Workflow liest oder kopiert den Secret-Wert niemals.

Für die Remote-Ingress-Prüfung muss der vorhandene Cloudflare-API-Token neben dem bereits notwendigen Workers-Scripts-Zugriff auch die betroffenen Zonen lesen und deren Worker-Routes lesen können. Fehlen diese Leserechte, endet der Deploy fail-closed vor der Änderung des öffentlichen Reference Workers.

### Variable

- `APPBASIS_PREVIEW_URL` – kanonische, credential-freie HTTPS-Origin des Reference-Previews; Pfad, Query und Fragment sind nicht zulässig

## Pre-existing Worker und Hyperdrive als harte Voraussetzung

Der Deployment-Workflow darf weder Worker noch Hyperdrive-Konfiguration selbst anlegen. Vor jeder externen Änderung wird read-only geprüft, dass folgende Worker bereits existieren und lesbar sind:

- `appbasis-reference`
- `appbasis-reference-role-admin`

Fehlt einer der Worker, endet der Workflow vor Deployment. Deploy und Hyperdrive-Update laufen mit explizit deaktiviertem Auto-Provisioning/Auto-Create.

Die Hyperdrive-ID muss bereits als geschütztes Environment-Secret vorhanden sein. Query-Caching wird auf dieser bereits vorhandenen Hyperdrive-Konfiguration vor Build/Deploy idempotent deaktiviert; Erstellung, Austausch, Löschung sowie Änderungen an Origin, Zugangsdaten, Verbindungslimit oder TLS/mTLS bleiben verboten.

## PostgreSQL-Permission-Authority-Gate

Vor Hyperdrive-Änderung, Build und Deploy wird der isolierte Permission-Authority-Verifier ausgeführt. Er muss den persistenten Schema-v3-Endzustand und die Reference-Systemzuordnungen bestätigen.

Die technische Better-Auth-Admin-Grenze bleibt fail-closed: Ein technischer Admin darf weder AppBasis-Identity-State noch Permission-Principal, Rollenbindung, direkten Grant oder direkten Revoke besitzen.

Der normale Deploy liest keine historischen Allowlist-Werte, um Berechtigungen abzuleiten oder zu verifizieren.

## Remote Worker Authority

Nach dem Deploy von `appbasis-reference-role-admin` lädt der Workflow dessen echte Cloudflare-Settings in eine owner-only temporäre Datei. `tooling/reference-preview-worker-settings.mjs` akzeptiert den internen Worker nur, wenn:

- exakt `APPBASIS_BASE_URL` als zulässige unverschlüsselte Variable vorhanden ist,
- kein `json`-Binding vorhanden ist,
- `BETTER_AUTH_SECRET` als `secret_text` vorhanden ist,
- exakt ein `HYPERDRIVE`-Binding namens `HYPERDRIVE` vorhanden ist,
- kein Service Binding vorhanden ist.

Zusätzlich liest der Workflow den Worker-Subdomain-Status, die accountweiten Worker-Custom-Domains und die Worker-Routes aller über den Token zugänglichen Zonen. `workers.dev` und Preview URLs müssen deaktiviert sein; Custom Domains und Zone-Routes für `appbasis-reference-role-admin` müssen leer sein. Jede nicht prüfbare oder positive Exposition blockiert den öffentlichen Deploy.

Erst danach darf der öffentliche Reference Worker deployt werden.

Nach dessen Deploy akzeptiert derselbe Verifier den öffentlichen Worker nur, wenn:

- exakt `APPBASIS_BASE_URL` als zulässige unverschlüsselte Variable vorhanden ist,
- kein `json`-Binding vorhanden ist,
- exakt ein Service Binding `ROLE_ADMIN` auf `appbasis-reference-role-admin` zeigt.

Damit ist nicht nur die Repository-Konfiguration, sondern auch der tatsächlich deployte Remote-Zustand Teil des Gates.

## Workflow-Verhalten

`Reference Preview Deploy` läuft ausschließlich über `workflow_dispatch` und verwendet die gemeinsame Concurrency-Gruppe `reference-preview-deploy`.

Ablauf:

1. Repository auschecken, Node/pnpm einrichten und frozen install ausführen.
2. `verify:repo` vollständig ausführen.
3. Hyperdrive-ID und Preview-Origin fail-closed validieren und maskieren.
4. Beide ephemeren Wrangler-Konfigurationen rendern und validieren.
5. Read-only bestätigen, dass beide Worker bereits existieren.
6. PostgreSQL-Permission-Authority-Verifier bauen und ausführen.
7. Query-Caching der bestehenden Hyperdrive-Konfiguration deaktivieren.
8. Reference-App mit der ephemeren öffentlichen Worker-Konfiguration bauen.
9. `appbasis-reference-role-admin` ohne Provisioning/Auto-Create deployen.
10. Role-Admin-Remote-Settings lesen und Secret/Hyperdrive/Plaintext-Authority fail-closed verifizieren.
11. Role-Admin-Remote-Ingress für `workers.dev`, Preview URLs, Custom Domains und alle lesbaren Zone-Routes fail-closed ausschließen.
12. `appbasis-reference` ohne Provisioning/Auto-Create deployen.
13. Reference-Remote-Settings lesen und Plaintext-/Service-Binding-Authority fail-closed verifizieren.
14. Öffentlichen Health-Vertrag prüfen.
15. Geschützte Demo-Smoke-Credentials validieren und den authentifizierten, mutierenden Demo-v0.1-Acceptance-Smoke ausführen; derselbe Smoke muss mit dem bestehenden Member-Session-Cookie am Role-Admin-Gateway exakt `403 PERMISSION_DENIED` erhalten.
16. Alle generierten Deployment-, Permission-Authority- und Worker-Settings-Artefakte immer entfernen.

## Harte Grenzen

- kein automatischer Deploy auf PR oder `main`
- keine Erstellung oder Löschung von Neon-, Hyperdrive- oder Worker-Ressourcen
- keine Runtime-Migration oder ad-hoc Datenbankadministration
- keine Runtime-Secrets im Repository
- keine Cloudflare-/Hyperdrive-IDs im Repository
- keine Environment-spezifischen `vars` in den Source-Wrangler-Konfigurationen
- kein öffentliches `workers.dev`, keine Preview URL, keine Custom Domain und keine Zone-Route für `appbasis-reference-role-admin`
- keine direkte Rollenadministration im normalen Reference-App-Worker
- kein Browser-vertrauenswürdiger Actor- oder Audit-Kontext
- keine historischen Permission-Allowlist-Bindings als `plain_text` oder `json`
- keine unerwarteten unverschlüsselten `plain_text`-/`json`-Variablen
- kein Passwort, Session-Cookie oder Datenbank-Zugang in Workflow-Logs
- kein Deploy bei fehlendem Worker
- kein Deploy bei ungültiger persistenter PostgreSQL-Permission-Authority
- kein öffentlicher Reference-Deploy, wenn der interne Admin-Worker seine Remote-Authority- oder Remote-Ingress-Prüfung nicht besteht
- kein erfolgreicher Deploy-Abschluss bei falschem oder fehlendem `ROLE_ADMIN`-Service-Binding
- kein Wrangler Auto-Provisioning oder Auto-Create

## Abnahmekriterien

- beide Source-Wrangler-Konfigurationen bleiben frei von realer Hyperdrive-ID und Environment-spezifischen `vars`.
- `keep_vars` ist für beide Worker explizit `false`.
- der öffentliche Worker pinnt exakt `ROLE_ADMIN` → `appbasis-reference-role-admin`.
- der Admin-Worker pinnt `workers_dev: false` und `preview_urls: false` und besitzt keine öffentliche Route.
- Renderer und Tests verweigern eine Aufweichung dieser Control-Plane-Grenze.
- PostgreSQL-Permission-Authority wird vor jeder externen Deploy-Änderung fail-closed verifiziert.
- der interne Worker wird vor dem öffentlichen Gateway deployt und remote geprüft.
- `BETTER_AUTH_SECRET` bleibt im Admin-Worker als Secret erhalten und wird nie materialisiert oder geloggt.
- `workers.dev`, Preview URLs, Custom Domains und Zone-Routes des Admin-Workers werden vor dem öffentlichen Deploy remote fail-closed ausgeschlossen.
- der öffentliche Remote-Worker besitzt exakt das erwartete interne Service Binding.
- Health wird erst nach erfolgreicher Remote-Binding-Verifikation geprüft.
- der mutierende Demo-v0.1-Acceptance-Smoke bestätigt weiterhin Auth, Session, Task-Persistenz und Status-Toggle.
- derselbe Smoke bestätigt, dass die bestehende `demo.user`-Session den Admin-Worker erreicht und dort wegen fehlendem `users:manage` exakt deny-by-default abgewiesen wird.
- normale CI bleibt vollständig grün.

Nicht mergen, bevor Exact-Head-CI und finaler Codex-Re-Review sauber sind.
