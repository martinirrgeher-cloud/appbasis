# Phase 2E7 – Reference Preview Deployment Contract

## Ziel

Die Reference-App erhält einen reproduzierbaren, ausschließlich manuell ausgelösten Deployment-Pfad für den ersten nicht-produktiven Cloud-Vertical-Slice auf Cloudflare mit Neon/PostgreSQL und Hyperdrive.

Dieser Slice erstellt oder verändert noch keine externe Cloud-Ressource. Er definiert nur den Repository-seitigen Deployment-Vertrag, damit das spätere echte Preview reproduzierbar und ohne Provider-IDs oder Zugangsdaten im Repository deployt werden kann.

## Scope

- manueller GitHub-Actions-Workflow `Reference Preview Deploy`
- GitHub-Environment `reference-preview` als Deployment-Grenze
- gepinnte Node-/pnpm-/GitHub-Action-Versionen entsprechend der normalen CI
- frozen install und vollständiges `verify:repo` vor jedem Deployment
- ephemere Wrangler-Input-Konfiguration für die echte `HYPERDRIVE`-Binding
- Hyperdrive-ID ausschließlich aus dem geschützten GitHub-Environment
- Cloudflare-Account-ID und API-Token ausschließlich aus dem geschützten GitHub-Environment
- `keep_vars: true`, damit bereits kontrolliert im Cloudflare-Environment gesetzte Runtime-Variablen beim Code-Deployment erhalten bleiben
- Build über den vorhandenen Cloudflare-Vite-Plugin-Pfad
- Deployment über die bereits gepinnte lokale Wrangler-Version
- Health-Smoke unmittelbar nach erfolgreichem Deployment
- Repo-Verify testet die ephemere Deployment-Konfiguration ohne echte Provider-Ressource

## Warum eine ephemere Wrangler-Konfiguration

Die `HYPERDRIVE`-Binding benötigt eine reale Cloudflare-Hyperdrive-ID. Diese ID ist Environment-spezifisch und gehört nicht in die wiederverwendbare Repository-Konfiguration.

Darum bleibt `apps/reference/wrangler.jsonc` provider-ID-frei. Vor dem Build erzeugt `tooling/reference-preview-deploy-config.mjs` eine ignorierte temporäre Datei `apps/reference/wrangler.preview.generated.json`, die ausschließlich die bestehende Wrangler-Konfiguration plus die Laufzeit-Binding enthält.

Der Cloudflare-Vite-Plugin verwendet diese temporäre Input-Konfiguration beim Build und erzeugt daraus seine deploybare Output-Konfiguration. Nach dem Workflow wird die temporäre Input-Datei unabhängig vom Erfolg entfernt.

## GitHub-Environment `reference-preview`

### Secrets für Deployment

- `CLOUDFLARE_ACCOUNT_ID`
- `CLOUDFLARE_API_TOKEN`
- `APPBASIS_HYPERDRIVE_ID`

Die Werte werden nicht in das Repository geschrieben. Provider-Identifikatoren werden vor Build/Deploy zusätzlich für Actions-Logs maskiert.

### Variable

- `APPBASIS_PREVIEW_URL` – kanonische HTTPS-Origin des Reference-Previews

Dieselbe Variable ist bereits die Vertrauensgrenze für den manuellen `Reference Preview Smoke`-Workflow.

## Separat benötigte Cloudflare-Runtime-Konfiguration

Vor einem funktionalen Auth-/Tasks-Smoke müssen im Worker-Environment außerhalb des Repositories vorhanden sein:

- Secret `BETTER_AUTH_SECRET`
- Variable `APPBASIS_BASE_URL` mit exakt der kanonischen HTTPS-Origin
- je nach Demo-Identity Variable `APPBASIS_REFERENCE_MEMBER_IDENTITY_IDS` und/oder `APPBASIS_REFERENCE_ADMIN_IDENTITY_IDS`
- die durch diesen Deployment-Pfad gebundene `HYPERDRIVE`-Konfiguration

`keep_vars: true` verhindert, dass das reine Code-Deployment dashboardseitig verwaltete Text-/JSON-Variablen versehentlich entfernt. Secrets werden durch diesen Workflow weder gesetzt noch gelöscht.

## Separat benötigte Neon/PostgreSQL-Schritte

Dieser Deployment-Slice führt bewusst keine Datenbankadministration aus. Vor der vollständigen Demo-Abnahme bleiben getrennt:

1. Neon/PostgreSQL-Preview-Datenbank anlegen.
2. Das gemergte Reference-Migrationsmanifest kontrolliert auf die leere Preview-Datenbank anwenden.
3. Cloudflare Hyperdrive gegen diese Datenbank konfigurieren.
4. Den ersten technischen Better-Auth-Admin über einen separat freizugebenden Root-of-Trust-Schritt herstellen.
5. Den Reference-Demo-User über den gehärteten serverseitigen Bootstrap provisionieren.
6. Die resultierende Demo-Identity-ID als explizite Reference-Business-Permission konfigurieren.

Damit bleiben Schemaänderung, technischer Auth-Root, Business-Permissions und Code-Deployment getrennte und auditierbare Grenzen.

## Workflow-Verhalten

`Reference Preview Deploy` läuft ausschließlich über `workflow_dispatch`.

Ablauf:

1. Repository auschecken, ohne Git-Credentials zu persistieren.
2. Node 24.19.0 und pnpm 11.21.0 einrichten.
3. Frozen install.
4. Repository und erforderliche Environment-Eingaben fail-closed prüfen.
5. Provider-Identifikatoren/Preview-Origin für Logs maskieren.
6. Ephemere Wrangler-Konfiguration mit `HYPERDRIVE`-Binding rendern.
7. Reference-App mit dieser Input-Konfiguration bauen.
8. Den vom Cloudflare-Vite-Plugin erzeugten Build per lokaler Wrangler-Version deployen.
9. Öffentlichen Health-Vertrag gegen die vertrauenswürdige Preview-Origin prüfen.
10. Ephemere Input-Konfiguration immer entfernen.

Ein authentifizierter oder mutierender Demo-Smoke bleibt ein separater expliziter Schritt im Workflow `Reference Preview Smoke`.

## Harte Grenzen

- kein automatischer Deploy auf PR oder `main`
- keine Erstellung von Neon-, Hyperdrive- oder Worker-Ressourcen
- keine Migration gegen eine externe Datenbank
- keine Erstellung technischer Admins oder Demo-User
- keine Runtime-Secrets im Repository
- keine Cloudflare-/Hyperdrive-IDs im Repository
- kein Passwort, Session-Cookie oder Datenbank-Zugang in Workflow-Logs
- keine Änderung der Identity-, Permission-, Task- oder HTTP-Semantik
- keine neue Dependency und keine Lockfile-Änderung
- kein automatischer mutierender Smoke

## Abnahmekriterien dieses Slices

- Repository-Wrangler-Konfiguration enthält keine reale Hyperdrive-ID
- `keep_vars` ist explizit aktiv
- Renderer akzeptiert eine gültige Laufzeit-ID und bindet sie exakt als `HYPERDRIVE`
- Renderer verweigert fehlende/unsichere IDs, persistierte Hyperdrive-Bindings und deaktiviertes `keep_vars`
- Renderer-Tests laufen als Bestandteil von `verify:repo`
- generierte Deployment-Datei ist gitignored
- Deployment-Workflow ist ausschließlich manuell
- Deployment-Credentials kommen ausschließlich aus `reference-preview`
- Build verwendet die ephemere Input-Konfiguration
- Health wird nach Deployment geprüft
- normale CI bleibt vollständig grün

Nicht mergen, bevor Exact-Head-CI und finaler Codex-Review sauber sind.
