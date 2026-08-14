# Phase 2E7 – Reference Preview Deployment Contract

## Ziel

Die Reference-App erhält einen reproduzierbaren, ausschließlich manuell ausgelösten Deployment-Pfad für den ersten nicht-produktiven Cloud-Vertical-Slice auf Cloudflare mit Neon/PostgreSQL und Hyperdrive.

Dieser Slice erstellt weiterhin keine neuen externen Cloud-Ressourcen. Als eng begrenzte, freigegebene Ausnahme darf der Deployment-Pfad die Query-Cache-Policy der bereits vorhandenen Reference-Hyperdrive-Konfiguration idempotent auf **Caching disabled** setzen. Andere Hyperdrive-Eigenschaften, Provider-Ressourcen oder Datenbankzustände werden dadurch nicht verändert.

## Scope

- manueller GitHub-Actions-Workflow `Reference Preview Deploy`
- GitHub-Environment `reference-preview` als Deployment-Grenze
- gepinnte Node-/pnpm-/GitHub-Action-Versionen entsprechend der normalen CI
- frozen install und vollständiges `verify:repo` vor jedem Deployment
- ephemere Wrangler-Input-Konfiguration für die echte `HYPERDRIVE`-Binding
- Hyperdrive-ID ausschließlich aus dem geschützten GitHub-Environment und nur in den lokalen Validierungs-/Renderer-Schritten sowie im eng begrenzten Cache-Policy-Schritt
- Cloudflare-Account-ID und API-Token ausschließlich aus dem geschützten GitHub-Environment und nur in den Remote-Guard-, Hyperdrive-Cache-Policy- und Deploy-Schritten
- Query-Caching der bereits vorhandenen Reference-Hyperdrive-Konfiguration wird vor Build/Deploy idempotent deaktiviert
- kanonische Preview-Origin ausschließlich als credential-freie HTTPS-Origin
- `keep_vars: true`, damit bereits kontrolliert im Cloudflare-Environment gesetzte Runtime-Variablen beim Code-Deployment erhalten bleiben
- explizite Read-only-Prüfung, dass der erwartete Worker `appbasis-reference` bereits existiert
- `wrangler deploy --strict` zum Abbruch bei konkurrierender/abweichender Remote-Konfiguration
- explizit deaktiviertes Wrangler Auto-Provisioning/Auto-Create beim Deployment
- Build über den vorhandenen Cloudflare-Vite-Plugin-Pfad
- Deployment über die bereits gepinnte lokale Wrangler-Version
- Health-Smoke unmittelbar nach erfolgreichem Deployment
- Repo-Verify testet die ephemere Deployment-Konfiguration und die Reihenfolge der Hyperdrive-Freshness-Policy

## Warum eine ephemere Wrangler-Konfiguration

Die `HYPERDRIVE`-Binding benötigt eine reale Cloudflare-Hyperdrive-ID. Diese ID ist Environment-spezifisch und gehört nicht in die wiederverwendbare Repository-Konfiguration.

Darum bleibt `apps/reference/wrangler.jsonc` provider-ID-frei. Vor dem Build erzeugt `tooling/reference-preview-deploy-config.mjs` eine ignorierte temporäre Datei `apps/reference/wrangler.preview.generated.json`, die ausschließlich die bestehende Wrangler-Konfiguration plus die Laufzeit-Binding enthält.

Der Cloudflare-Vite-Plugin verwendet diese temporäre Input-Konfiguration beim Build und erzeugt daraus seine deploybare Output-Konfiguration. Nach dem Workflow wird die temporäre Input-Datei unabhängig vom Erfolg entfernt.

## GitHub-Environment `reference-preview`

### Secrets für Deployment

- `CLOUDFLARE_ACCOUNT_ID`
- `CLOUDFLARE_API_TOKEN`
- `APPBASIS_HYPERDRIVE_ID`

Die Werte werden nicht in das Repository geschrieben. Sie werden außerdem nicht als Job-weite Environment-Variablen gesetzt:

- `APPBASIS_HYPERDRIVE_ID` ist nur für lokale Validierung/Maskierung, das Rendern der ephemeren Wrangler-Konfiguration und das gezielte Deaktivieren des Query-Caches sichtbar.
- `CLOUDFLARE_ACCOUNT_ID` und `CLOUDFLARE_API_TOKEN` sind ausschließlich für den read-only Worker-Existenzcheck, den Hyperdrive-Cache-Policy-Schritt und den tatsächlichen Deploy-Schritt sichtbar.
- Der Cloudflare-API-Token muss für die Cache-Policy-Anpassung `Hyperdrive Write` besitzen. Fehlt diese Berechtigung, bricht der Workflow vor Build/Deploy ab.
- Checkout, Toolchain-Setup, `pnpm install`, `verify:repo`, Build und Health-Smoke erhalten keine Cloudflare-Remote-Credentials.

Provider-Identifikatoren werden unmittelbar im ersten Schritt, der sie benötigt, zusätzlich für nachfolgende Actions-Logs maskiert. Die Ausgabe des Hyperdrive-Update-Befehls wird verworfen, damit keine Provider-Metadaten in Actions-Logs gelangen.

### Variable

- `APPBASIS_PREVIEW_URL` – kanonische, credential-freie HTTPS-Origin des Reference-Previews; Pfad, Query und Fragment sind nicht zulässig

Dieselbe Variable ist bereits die Vertrauensgrenze für den manuellen `Reference Preview Smoke`-Workflow. Der Deployment-Renderer validiert sie **vor** jeder externen Änderung.

## Pre-existing Worker und Hyperdrive als harte Voraussetzung

Der Deployment-Workflow darf weder den Worker noch die Hyperdrive-Konfiguration selbst anlegen. Vor Build/Upload wird deshalb mit dem read-only Wrangler-Befehl `deployments list` geprüft, dass `appbasis-reference` im ausgewählten Cloudflare-Account bereits existiert und lesbar ist. Die Hyperdrive-ID muss bereits als geschütztes Environment-Secret vorhanden sein.

Fehlt der Worker oder kann er mit den bereitgestellten Credentials nicht gelesen werden, endet der Workflow vor jeder Cache-Policy-Änderung und vor `wrangler deploy` mit einer festen Fehlermeldung. Die erstmalige Worker- oder Hyperdrive-Erstellung bleibt damit eine getrennte, explizit freizugebende externe Ressourcenaktion.

Zusätzlich laufen Deployments mit:

- `--strict`, damit widersprüchliche Remote-Konfiguration den Upload blockiert
- `--experimental-provision=false`
- `--experimental-auto-create=false`

Damit kann der Code-Deployment-Pfad keine fehlenden Plattformressourcen stillschweigend provisionieren und überschreibt keine erkannte konkurrierende Remote-Konfiguration.

## Hyperdrive-Freshness-Policy

Die Reference-App verwendet dieselbe PostgreSQL-Verbindung für Authentifizierung, Sessions, Identity-State, Berechtigungsentscheidungen und den Demo-Tasks-Vertical-Slice. Diese Reads müssen entweder sicherheitsbedingt frisch sein oder unmittelbar nach Writes den neuen Zustand sehen.

Cloudflare Hyperdrive invalidiert gecachte `SELECT`-Ergebnisse nicht automatisch nach einem Write. Deshalb ist Query-Caching für die aktuelle Reference-App nicht Teil des zulässigen Laufzeitvertrags. Die bestehende Hyperdrive-Konfiguration wird vor jedem manuellen Deployment mit Wrangler idempotent auf `--caching-disabled` gesetzt. Hyperdrive bleibt dabei als Connection-Pool und schneller Verbindungsaufbau erhalten.

Diese Ausnahme ist bewusst eng:

- erlaubt ist ausschließlich das Deaktivieren des Query-Caches auf der bereits gebundenen Hyperdrive-ID
- nicht erlaubt sind Änderungen an Name, Origin, Zugangsdaten, Verbindungslimit, TLS/mTLS oder anderen Hyperdrive-Eigenschaften
- nicht erlaubt sind Erstellung, Austausch oder Löschung einer Hyperdrive-Konfiguration
- schlägt die Cache-Policy-Anpassung fehl, darf weder Build/Deploy noch der mutierende Acceptance-Smoke fortgesetzt werden

Soll später ein belastbarer Anwendungsfall für cachebare Read-Modelle entstehen, wird dafür bevorzugt eine getrennte gecachte Binding eingeführt; sicherheitskritische und Read-after-write-Pfade bleiben auf einer cache-disabled Verbindung.

## Separat benötigte Cloudflare-Runtime-Konfiguration

Vor einem funktionalen Auth-/Tasks-Smoke müssen im Worker-Environment außerhalb des Repositories vorhanden sein:

- Secret `BETTER_AUTH_SECRET`
- Variable `APPBASIS_BASE_URL` mit exakt der kanonischen HTTPS-Origin
- je nach Demo-Identity Variable `APPBASIS_REFERENCE_MEMBER_IDENTITY_IDS` und/oder `APPBASIS_REFERENCE_ADMIN_IDENTITY_IDS`
- die durch diesen Deployment-Pfad gebundene `HYPERDRIVE`-Konfiguration

`keep_vars: true` verhindert, dass das reine Code-Deployment dashboardseitig verwaltete Text-/JSON-Variablen versehentlich entfernt. Secrets werden durch diesen Workflow weder gesetzt noch gelöscht. Andere Remote-Konfiguration wird zusätzlich durch `--strict` gegen unbeabsichtigtes Überschreiben geschützt.

## Separat benötigte Neon/PostgreSQL-Schritte

Dieser Deployment-Slice führt bewusst keine Datenbankadministration aus. Vor der vollständigen Demo-Abnahme bleiben getrennt:

1. Neon/PostgreSQL-Preview-Datenbank anlegen.
2. Das gemergte Reference-Migrationsmanifest kontrolliert auf die leere Preview-Datenbank anwenden.
3. Cloudflare Hyperdrive gegen diese Datenbank konfigurieren.
4. den leeren Reference Worker explizit als externe Ressource anlegen.
5. Den ersten technischen Better-Auth-Admin über einen separat freizugebenden Root-of-Trust-Schritt herstellen.
6. Den Reference-Demo-User über den gehärteten serverseitigen Bootstrap provisionieren.
7. Die resultierende Demo-Identity-ID als explizite Reference-Business-Permission konfigurieren.

Damit bleiben Schemaänderung, technischer Auth-Root, Business-Permissions, Ressourcenanlage und Code-Deployment getrennte und auditierbare Grenzen. Die freigegebene Hyperdrive-Cache-Policy ist eine dokumentierte Laufzeitvoraussetzung und keine Datenbankadministration.

## Workflow-Verhalten

`Reference Preview Deploy` läuft ausschließlich über `workflow_dispatch`.

Ablauf:

1. Repository auschecken, ohne Git-Credentials zu persistieren.
2. Node 24.19.0 und pnpm 11.21.0 einrichten.
3. Frozen install ohne Cloudflare-Remote-Credentials.
4. `verify:repo` ohne Cloudflare-Remote-Credentials ausführen.
5. Hyperdrive-ID und Preview-Origin lokal fail-closed prüfen und maskieren.
6. kanonische HTTPS-Origin validieren und ephemere Wrangler-Konfiguration mit `HYPERDRIVE`-Binding rendern.
7. Cloudflare-Account-ID/API-Token erst jetzt in den read-only Schritt einblenden und bestätigen, dass `appbasis-reference` bereits existiert.
8. Mit denselben eng gescopten Cloudflare-Credentials ausschließlich auf der vorhandenen `APPBASIS_HYPERDRIVE_ID` Query-Caching deaktivieren; Fehler blockieren alle folgenden Schritte.
9. Reference-App ohne Cloudflare-Remote-Credentials mit der ephemeren Input-Konfiguration bauen.
10. Cloudflare-Account-ID/API-Token nur für den lokalen Wrangler-Deploy erneut einblenden und den Build mit Strict-/No-Provisioning-Grenzen deployen.
11. Öffentlichen Health-Vertrag ausschließlich mit der vertrauenswürdigen Preview-Origin prüfen.
12. Geschützte Demo-Smoke-Credentials prüfen und unmittelbar danach den authentifizierten, mutierenden Demo-v0.1-Acceptance-Smoke ausführen.
13. Ephemere Input-Konfiguration immer entfernen.

Der separate Workflow `Reference Preview Smoke` bleibt für explizite manuelle Checks und die Selbstvalidierung von Smoke-Vertragsänderungen bestehen. Der Deployment-Workflow selbst enthält den mutierenden Acceptance-Smoke bewusst in derselben serialisierten Kette, damit ein Deployment ohne bestandenen Demo-v0.1-End-to-End-Nachweis nicht als erfolgreich gilt.

## Harte Grenzen

- kein automatischer Deploy auf PR oder `main`
- keine Erstellung oder Löschung von Neon-, Hyperdrive- oder Worker-Ressourcen
- keine Änderung der vorhandenen Hyperdrive-Konfiguration außer dem explizit freigegebenen, idempotenten Deaktivieren des Query-Caches
- keine Änderung von Hyperdrive-Origin, Datenbankzugang, Name, Verbindungslimit, TLS/mTLS oder anderen Provider-Eigenschaften
- keine Migration gegen eine externe Datenbank
- keine Erstellung technischer Admins oder Demo-User
- keine Runtime-Secrets im Repository
- keine Cloudflare-/Hyperdrive-IDs im Repository
- keine job-weite Exposition von Cloudflare-Remote-Credentials
- kein Passwort, Session-Cookie, Datenbank-Zugang oder Hyperdrive-Konfigurationsdump in Workflow-Logs
- kein Deploy bei fehlendem Worker
- kein Deploy bei fehlender Berechtigung zur freigegebenen Hyperdrive-Cache-Policy
- kein Deploy bei erkannter konkurrierender Remote-Konfiguration
- kein Wrangler Auto-Provisioning oder Auto-Create
- keine Änderung der Identity-, Permission-, Task- oder HTTP-Semantik
- keine neue Dependency und keine Lockfile-Änderung
- kein automatischer Deploy außerhalb des manuell gestarteten, serialisierten Deployment-Workflows

## Abnahmekriterien dieses Slices

- Repository-Wrangler-Konfiguration enthält keine reale Hyperdrive-ID
- `keep_vars` ist explizit aktiv
- Renderer akzeptiert eine gültige Laufzeit-ID und bindet sie exakt als `HYPERDRIVE`
- Renderer verweigert fehlende/unsichere IDs, persistierte Hyperdrive-Bindings und deaktiviertes `keep_vars`
- Renderer akzeptiert nur eine kanonische credential-freie HTTPS-Preview-Origin
- Renderer-Tests laufen als Bestandteil von `verify:repo`
- generierte Deployment-Datei ist gitignored
- Deployment-Workflow ist ausschließlich manuell
- Deployment-Credentials kommen ausschließlich aus `reference-preview` und sind auf die minimal nötigen Schritte beschränkt
- fehlender/nicht lesbarer Worker beendet den Workflow vor der Hyperdrive-Änderung und vor dem Upload
- Query-Caching wird auf der vorhandenen Hyperdrive-ID vor Build/Deploy explizit mit `--caching-disabled` deaktiviert
- der Cache-Policy-Schritt kann keine neue Hyperdrive-Ressource provisionieren oder automatisch anlegen
- Hyperdrive-Update-Ausgabe wird nicht in Actions-Logs übernommen
- Build verwendet die ephemere Input-Konfiguration
- Health wird nach Deployment geprüft
- der mutierende Demo-v0.1-Acceptance-Smoke bestätigt Auth, Session, frische Task-Persistenz und Status-Toggle über mehrere Requests
- normale CI bleibt vollständig grün

Nicht mergen, bevor Exact-Head-CI und finaler Codex-Re-Review sauber sind.
