# Phase 2E6 – Reference Preview Preparation

## Ziel

Die Reference-App erhält vor dem ersten echten Cloud-Deployment einen reproduzierbaren, provider-unabhängigen Abnahmeweg. Dieser Slice erzeugt noch keine Cloud-Ressource und enthält keine Zugangsdaten; er verkürzt ausschließlich den späteren Deployment-/Abnahmeweg.

## Scope

- `tooling/reference-preview-smoke.mjs` als Node-24-Smoke-Runner gegen eine bereits deployte Reference-URL
- Health-only-Modus ohne Benutzer-Secrets
- authentifizierter Read-only-Modus für Login, erforderlichen Erstpasswortwechsel, Session und Task-Lesen
- explizit aktivierbarer Mutationsmodus für Task-Erstellung, Persistenz über getrennte Requests und Statuswechsel
- manueller GitHub-Actions-Workflow `Reference Preview Smoke`
- GitHub-Environment `reference-preview` als spätere Secret-Grenze
- Repo-Verify prüft mindestens die Syntax des Smoke-Runners

## Harte Grenzen

- kein automatisches Deployment
- keine Cloudflare-Account-ID, Hyperdrive-ID, Datenbank-URL, Passwörter oder Tokens im Repository
- keine Änderung an Identity-, Permission-, Task- oder HTTP-Semantik
- keine Migration oder Schemaänderung
- keine neue Dependency und keine Lockfile-Änderung
- kein automatischer Smoke auf PRs oder `main`, solange keine echte Preview-Umgebung existiert
- der mutierende Smoke ist nur nach expliziter Auswahl aktiv

## Später benötigte externe Preview-Konfiguration

Für das echte Demo-v0.1-Preview werden außerhalb des Repositories benötigt:

1. eine PostgreSQL-Datenbank, auf die das gemergte Reference-Migrationsmanifest angewendet wurde
2. eine Cloudflare-Hyperdrive-Verbindung auf diese Datenbank
3. Worker-Binding `HYPERDRIVE`
4. Secret `BETTER_AUTH_SECRET` mit mindestens 32 Zeichen
5. Variable `APPBASIS_BASE_URL` auf die tatsächlich deployte HTTPS-Origin
6. mindestens eine provisionierte AppBasis-Demo-Identity
7. für den Smoke im GitHub-Environment `reference-preview`:
   - `APPBASIS_SMOKE_USERNAME`
   - `APPBASIS_SMOKE_PASSWORD`
   - `APPBASIS_SMOKE_NEW_PASSWORD` nur solange der Smoke-Benutzer noch einen Pflichtpasswortwechsel benötigt

Business-Permissions bleiben eine getrennte, explizite Konfiguration und werden durch den Smoke nicht erzeugt.

## Abnahmeablauf nach erstem Deployment

### 1. Health-only

```text
APPBASIS_PREVIEW_URL=https://<preview-origin> pnpm reference:smoke
```

Erwartet: `/api/health` meldet `appbasis-reference`, API-Version 1 und Status `ok`.

### 2. Authentifizierter Read-only-Smoke

Environment setzen:

- `APPBASIS_PREVIEW_URL`
- `APPBASIS_SMOKE_USERNAME`
- `APPBASIS_SMOKE_PASSWORD`
- optional `APPBASIS_SMOKE_NEW_PASSWORD`, falls der Benutzer noch im Pflichtpasswortwechsel steht

Dann `pnpm reference:smoke` ausführen.

Erwartet: Login, gegebenenfalls Pflichtpasswortwechsel, erneute Sessionauflösung und Task-Lesen funktionieren.

### 3. Einmalige Demo-v0.1-Abnahme mit Persistenz

Zusätzlich `APPBASIS_SMOKE_MUTATE=1` setzen oder den manuellen GitHub-Workflow mit `mutate=true` starten.

Erwartet:

- Task wird erstellt
- ein neuer HTTP-Request sieht denselben Task als `open`
- Toggle liefert `completed`
- ein weiterer HTTP-Request sieht den Status weiterhin als `completed`

Hinweis: Die aktuelle Demo-API besitzt bewusst keinen Delete-Endpunkt. Ein mutierender Smoke hinterlässt daher eine klar mit `Preview smoke <timestamp>` bezeichnete Task in der Preview-Datenbank.

## GitHub-Workflow

Der Workflow `Reference Preview Smoke` ist ausschließlich `workflow_dispatch`.

- Eingabe `target_url`: Preview-Origin
- Eingabe `mutate=false`: Read-only-Abnahme
- Eingabe `mutate=true`: einmalige Persistenz-/Toggle-Abnahme
- Secrets kommen ausschließlich aus dem GitHub-Environment `reference-preview`

## Abnahmekriterien dieses Slices

- Smoke-Runner enthält keine hart codierten Secrets oder Preview-Adressen
- Health-only funktioniert ohne Auth-Secrets
- Auth-/Mutationspfade geben keine Passwörter oder Session-Cookies aus
- mutierende Prüfung ist opt-in
- Workflow startet nie automatisch
- Repo-Verify prüft Smoke-Syntax
- bestehende CI bleibt grün
