# Phase 2E7 – Reference Preview Deployment Contract

## Ziel

Die Reference-App besitzt einen reproduzierbaren, ausschließlich manuell ausgelösten Deployment-Pfad für den nicht-produktiven Cloud-Vertical-Slice auf Cloudflare mit Neon/PostgreSQL und Hyperdrive.

Der Vertrag wurde nach dem PostgreSQL-Permission-Cutover aktualisiert. Der normale Reference-Deploy ist jetzt die Source of Truth für unverschlüsselte Worker-Variablen; die historischen Cloudflare-Permission-Allowlists sind kein zulässiger Runtime- oder Deployment-Vertrag mehr.

## Verbindlicher aktueller Zustand

- PostgreSQL ist die einzige Runtime-Authority für AppBasis-Business-Permissions.
- Der normale Reference-Deploy verifiziert die persistente PostgreSQL-Permission-Authority vor Build und Deployment.
- `apps/reference/wrangler.jsonc` verwendet bewusst `keep_vars: false`.
- Die ephemere Deployment-Konfiguration besitzt genau eine unverschlüsselte Worker-Variable: `APPBASIS_BASE_URL`.
- `APPBASIS_BASE_URL` wird aus der geschützten GitHub-Environment-Variable `APPBASIS_PREVIEW_URL` abgeleitet und als kanonische HTTPS-Origin validiert.
- `APPBASIS_REFERENCE_MEMBER_IDENTITY_IDS` und `APPBASIS_REFERENCE_ADMIN_IDENTITY_IDS` dürfen nach dem normalen Deploy nicht mehr als Worker-Plaintext-Bindings existieren.
- Andere unerwartete Plaintext-Bindings sind ebenfalls unzulässig.
- Secrets bleiben außerhalb des Repositories. Ein normaler Wrangler-Deploy löscht vorhandene Worker-Secrets nicht; `BETTER_AUTH_SECRET` bleibt daher als Secret erhalten.
- Die historische Permission-Cutover-Workflow-Datei bleibt als expliziter, auditierbarer Migrationspfad erhalten. Nur dieser historische Cutover-Pfad darf Legacy-Worker-Settings als Migrationsinput lesen; der normale Deploy wertet sie nicht als Permission-Authority aus.

## Scope

- manueller GitHub-Actions-Workflow `Reference Preview Deploy`
- GitHub-Environment `reference-preview` als Deployment-Grenze
- gepinnte Node-/pnpm-/GitHub-Action-Versionen entsprechend der normalen CI
- frozen install und vollständiges `verify:repo` vor jedem Deployment
- ephemere Wrangler-Input-Konfiguration für die echte `HYPERDRIVE`-Binding und die repository-eigene Plaintext-Konfiguration
- Hyperdrive-ID ausschließlich aus dem geschützten GitHub-Environment
- Cloudflare-Account-ID und API-Token ausschließlich aus dem geschützten GitHub-Environment und nur in den Remote-Guard-, Hyperdrive-, Deploy- und Remote-Verifikationsschritten
- Query-Caching der bereits vorhandenen Reference-Hyperdrive-Konfiguration wird vor Build/Deploy idempotent deaktiviert
- kanonische Preview-Origin ausschließlich als credential-freie HTTPS-Origin
- `keep_vars: false`, damit Wrangler die generierte Konfiguration als Source of Truth für Plaintext-Variablen verwendet
- explizite Read-only-Prüfung, dass der erwartete Worker `appbasis-reference` bereits existiert
- explizit deaktiviertes Wrangler Auto-Provisioning/Auto-Create beim Deployment
- Build über den vorhandenen Cloudflare-Vite-Plugin-Pfad
- Deployment über die bereits gepinnte lokale Wrangler-Version
- Remote-Snapshot der Worker-Settings unmittelbar nach dem Deployment
- fail-closed Verifikation der tatsächlich deployten Plaintext-Bindings vor Health und Acceptance-Smoke
- Health-Smoke und authentifizierter Demo-v0.1-Acceptance-Smoke unmittelbar nach erfolgreicher Binding-Verifikation

## Warum eine ephemere Wrangler-Konfiguration

Die `HYPERDRIVE`-Binding benötigt eine reale Cloudflare-Hyperdrive-ID. Diese ID ist Environment-spezifisch und gehört nicht in die wiederverwendbare Repository-Konfiguration. Ebenso ist die konkrete Preview-Origin Environment-spezifisch.

Darum bleibt `apps/reference/wrangler.jsonc` frei von Provider-IDs und Environment-spezifischen `vars`. Vor dem Build erzeugt `tooling/reference-preview-deploy-config.mjs` eine ignorierte temporäre Datei `apps/reference/wrangler.preview.generated.json`. Diese ergänzt ausschließlich:

- `HYPERDRIVE` mit der geschützten Provider-ID
- `vars.APPBASIS_BASE_URL` mit der normalisierten `APPBASIS_PREVIEW_URL`

Der Renderer verweigert persistierte Hyperdrive-Bindings, persistierte `vars`, ungültige Provider-IDs, nicht-kanonische Preview-Origins und jede Repository-Konfiguration, die `keep_vars` wieder aktiviert.

Der Cloudflare-Vite-Plugin verwendet diese temporäre Input-Konfiguration beim Build. Nach dem Workflow wird die temporäre Datei unabhängig vom Erfolg entfernt.

## GitHub-Environment `reference-preview`

### Secrets für Deployment

- `CLOUDFLARE_ACCOUNT_ID`
- `CLOUDFLARE_API_TOKEN`
- `APPBASIS_HYPERDRIVE_ID`
- `APPBASIS_DATABASE_URL`
- `APPBASIS_SMOKE_PASSWORD`
- optional `APPBASIS_SMOKE_NEW_PASSWORD`

Die Werte werden nicht in das Repository geschrieben und nur den Schritten bereitgestellt, die sie benötigen.

- `APPBASIS_DATABASE_URL` ist nur für den PostgreSQL-Permission-Authority-Verifier sichtbar.
- `APPBASIS_HYPERDRIVE_ID` ist nur für Validierung, ephemeres Rendering und die Cache-Policy-Anpassung sichtbar.
- `CLOUDFLARE_ACCOUNT_ID` und `CLOUDFLARE_API_TOKEN` sind auf Worker-Existenzcheck, Hyperdrive-Cache-Policy, Deploy und den nachgelagerten Worker-Settings-Snapshot begrenzt.
- Demo-Smoke-Credentials sind ausschließlich im Acceptance-Schritt verfügbar.
- Provider-Identifikatoren und geschützte Werte werden in Actions-Logs maskiert; Provider-Antworten mit unnötigen Metadaten werden nicht ausgegeben.

### Variable

- `APPBASIS_PREVIEW_URL` – kanonische, credential-freie HTTPS-Origin des Reference-Previews; Pfad, Query und Fragment sind nicht zulässig

Diese Variable ist zugleich die Vertrauensgrenze für Smoke und die Quelle für die deployte Worker-Variable `APPBASIS_BASE_URL`.

## Pre-existing Worker und Hyperdrive als harte Voraussetzung

Der Deployment-Workflow darf weder den Worker noch die Hyperdrive-Konfiguration selbst anlegen. Vor Build/Upload wird mit dem read-only Wrangler-Pfad geprüft, dass `appbasis-reference` im ausgewählten Cloudflare-Account bereits existiert und lesbar ist. Die Hyperdrive-ID muss bereits als geschütztes Environment-Secret vorhanden sein.

Fehlt der Worker oder kann er mit den bereitgestellten Credentials nicht gelesen werden, endet der Workflow vor jeder externen Änderung. Deploy und Hyperdrive-Update laufen mit explizit deaktiviertem Auto-Provisioning/Auto-Create.

## PostgreSQL-Permission-Authority-Gate

Vor der Hyperdrive-Änderung, dem Build und dem Deploy wird der isolierte Permission-Authority-Verifier ausgeführt. Er muss den persistenten Schema-v3-Endzustand und die Reference-Systemzuordnungen bestätigen.

Die technische Better-Auth-Admin-Grenze ist fail-closed: Ein technischer Admin darf weder AppBasis-Identity-State noch Permission-Principal, Rollenbindung, direkten Grant oder direkten Revoke besitzen.

Der normale Deploy liest keine historischen Allowlist-Werte, um Berechtigungen abzuleiten oder zu verifizieren.

## Hyperdrive-Freshness-Policy

Die Reference-App verwendet dieselbe PostgreSQL-Verbindung für Authentifizierung, Sessions, Identity-State, Berechtigungsentscheidungen und den Demo-Tasks-Vertical-Slice. Sicherheitskritische Reads und Read-after-write-Pfade müssen frisch sein.

Deshalb wird Query-Caching für die bereits vorhandene Reference-Hyperdrive-Konfiguration vor jedem manuellen Deployment idempotent deaktiviert. Erlaubt ist ausschließlich diese Cache-Policy-Anpassung auf der bereits gebundenen Hyperdrive-ID; Erstellung, Austausch, Löschung sowie Änderungen an Origin, Zugangsdaten, Verbindungslimit oder TLS/mTLS bleiben verboten.

## Worker-Konfigurations-Authority

Nach dem PostgreSQL-Cutover gilt für den normalen Reference-Worker:

- `BETTER_AUTH_SECRET` bleibt ein extern verwaltetes Cloudflare-Secret.
- `APPBASIS_BASE_URL` ist die einzige zulässige Plaintext-Variable und wird durch die generierte Deployment-Konfiguration gesetzt.
- `HYPERDRIVE` wird durch den Deployment-Pfad gebunden.
- die historischen Plaintext-Bindings `APPBASIS_REFERENCE_MEMBER_IDENTITY_IDS` und `APPBASIS_REFERENCE_ADMIN_IDENTITY_IDS` sind verboten.
- jede weitere unerwartete Plaintext-Variable ist verboten.

`keep_vars: false` ist absichtlich Teil dieses Vertrags: Wrangler ersetzt dashboardseitig verwaltete Plaintext-Variablen beim Deploy durch die deklarierte `vars`-Konfiguration. Worker-Secrets werden durch einen normalen Deploy unabhängig von `keep_vars` nicht gelöscht.

Unmittelbar nach dem Deploy lädt der Workflow die echten Remote-Worker-Settings in eine owner-only temporäre Datei. `tooling/reference-preview-worker-settings.mjs` akzeptiert den Deploy nur, wenn exakt ein Plaintext-Binding existiert und dieses `APPBASIS_BASE_URL` mit der geschützten Preview-Origin ist. Erst danach dürfen Health und Acceptance-Smoke laufen.

## Neon/PostgreSQL-Zustand

Der normale Deployment-Slice führt keine Schema-Migration und keine ad-hoc Datenbankadministration aus. Datenbankschema und Permission-Cutover bleiben getrennte, versionierte Control-Plane-Pfade.

Der Demo-User erhält seine Business-Berechtigung ausschließlich über die persistente PostgreSQL-Permission-Authority, derzeit über die Rolle `demo:member`. Technische Better-Auth-Admins bleiben vollständig außerhalb dieser Business-Permission-Grenze.

## Workflow-Verhalten

`Reference Preview Deploy` läuft ausschließlich über `workflow_dispatch` und verwendet die gemeinsame Concurrency-Gruppe `reference-preview-deploy`.

Ablauf:

1. Repository auschecken, ohne Git-Credentials zu persistieren.
2. Node und pnpm in den gepinnten Versionen einrichten.
3. Frozen install ausführen.
4. `verify:repo` ausführen.
5. Hyperdrive-ID und Preview-Origin fail-closed prüfen und maskieren.
6. Ephemere Wrangler-Konfiguration mit `APPBASIS_BASE_URL` und `HYPERDRIVE` rendern.
7. Bestätigen, dass der bestehende Reference Worker lesbar ist.
8. Isolierten PostgreSQL-Permission-Authority-Verifier bauen und ausführen.
9. Query-Caching der bestehenden Hyperdrive-Konfiguration deaktivieren.
10. Reference-App mit der ephemeren Input-Konfiguration bauen.
11. Ohne Provisioning oder Auto-Create deployen; die generierte Konfiguration ersetzt Remote-Plaintext-Variablen.
12. Die tatsächlich deployten Worker-Settings über die Cloudflare-API in eine temporäre owner-only Datei lesen.
13. Fail-closed prüfen, dass ausschließlich `APPBASIS_BASE_URL` als Plaintext-Binding existiert und der geschützten Preview-Origin entspricht.
14. Öffentlichen Health-Vertrag prüfen.
15. Geschützte Demo-Smoke-Credentials validieren und den authentifizierten, mutierenden Demo-v0.1-Acceptance-Smoke ausführen.
16. Generierte Deployment-, Permission-Authority- und Worker-Settings-Artefakte immer entfernen.

Der separate Workflow `Reference Preview Smoke` bleibt für explizite manuelle Checks und die Selbstvalidierung relevanter Vertragsänderungen bestehen.

## Harte Grenzen

- kein automatischer Deploy auf PR oder `main`
- keine Erstellung oder Löschung von Neon-, Hyperdrive- oder Worker-Ressourcen
- keine Änderung der vorhandenen Hyperdrive-Konfiguration außer dem explizit freigegebenen Deaktivieren des Query-Caches
- keine Migration gegen eine externe Datenbank im normalen Deploy
- keine Erstellung technischer Admins oder Demo-User
- keine Runtime-Secrets im Repository
- keine Cloudflare-/Hyperdrive-IDs im Repository
- keine Environment-spezifischen Plaintext-`vars` in `apps/reference/wrangler.jsonc`
- keine historischen Permission-Allowlist-Bindings im normal deployten Worker
- keine job-weite Exposition von Cloudflare-Remote-Credentials
- kein Passwort, Session-Cookie oder Datenbank-Zugang in Workflow-Logs
- kein Deploy bei fehlendem Worker
- kein Deploy bei ungültiger persistenter PostgreSQL-Permission-Authority
- kein erfolgreicher Deploy-Abschluss bei unerwarteten Remote-Plaintext-Bindings
- kein Wrangler Auto-Provisioning oder Auto-Create
- keine Änderung der Identity-, Permission-, Task- oder HTTP-Semantik durch diesen Deploymentvertrag

## Abnahmekriterien

- Repository-Wrangler-Konfiguration enthält keine reale Hyperdrive-ID und keine Environment-spezifischen `vars`.
- `keep_vars` ist explizit `false`.
- Renderer bindet exakt `HYPERDRIVE` und `APPBASIS_BASE_URL` aus geschützten Deployment-Metadaten.
- Renderer verweigert fehlende/unsichere IDs, persistierte Hyperdrive-Bindings, persistierte `vars`, aktiviertes `keep_vars` und nicht-kanonische Preview-Origins.
- PostgreSQL-Permission-Authority wird vor jeder externen Deploy-Änderung fail-closed verifiziert.
- Query-Caching wird auf der vorhandenen Hyperdrive-ID vor Build/Deploy explizit deaktiviert.
- Deploy kann keine neue Cloud-Ressource provisionieren oder automatisch anlegen.
- nach dem Deploy wird der echte Remote-Worker-Zustand geprüft.
- `APPBASIS_REFERENCE_MEMBER_IDENTITY_IDS` und `APPBASIS_REFERENCE_ADMIN_IDENTITY_IDS` fehlen im deployten Worker.
- exakt ein Plaintext-Binding `APPBASIS_BASE_URL` bleibt bestehen und entspricht `APPBASIS_PREVIEW_URL`.
- `BETTER_AUTH_SECRET` bleibt als Secret erhalten und wird nicht als Plaintext materialisiert.
- Health wird erst nach erfolgreicher Remote-Binding-Verifikation geprüft.
- der mutierende Demo-v0.1-Acceptance-Smoke bestätigt Auth, Session, Task-Persistenz und Status-Toggle.
- normale CI bleibt vollständig grün.

Nicht mergen, bevor Exact-Head-CI und finaler Codex-Re-Review sauber sind.
