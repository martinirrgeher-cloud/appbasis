# Phase 2E6 – Reference Preview Preparation

## Ziel

Die Reference-App erhält vor dem ersten echten Cloud-Deployment einen reproduzierbaren, provider-unabhängigen Abnahmeweg. Dieser Slice erzeugt noch keine Cloud-Ressource und enthält keine Zugangsdaten; er verkürzt ausschließlich den späteren Deployment-/Abnahmeweg.

## Scope

- `tooling/reference-preview-smoke.mjs` als Node-24-Smoke-Runner gegen eine bereits deployte Reference-URL
- Health-only-Modus ohne Benutzer-Secrets; hierfür bleibt lokales HTTP zulässig
- authentifizierter Modus ausschließlich über HTTPS für Login, erforderlichen Erstpasswortwechsel, Session und Task-Lesen
- Identitätskorrelation über Username und Identity-ID vor und nach einem Pflichtpasswortwechsel
- explizit aktivierbarer Mutationsmodus für echte Task-Neuanlage, Persistenz über getrennte Requests und Statuswechsel
- mutierender Modus scheitert fail-closed, wenn Auth-Konfiguration fehlt
- Netzwerk- und HTTP-Fehler werden in Actions nur mit festen, nicht vom Ziel kontrollierten Meldungen ausgegeben
- manueller GitHub-Actions-Workflow `Reference Preview Smoke`
- GitHub-Environment `reference-preview` als spätere Secret-Grenze
- Repo-Verify prüft mindestens die Syntax des Smoke-Runners

## Harte Grenzen

- kein automatisches Deployment
- keine Cloudflare-Account-ID, Hyperdrive-ID, Datenbank-URL, Passwörter, Session-Cookies oder Tokens im Repository bzw. in Smoke-Logs
- keine Änderung an Identity-, Permission-, Task- oder HTTP-Semantik
- keine Migration oder Schemaänderung
- keine neue Dependency und keine Lockfile-Änderung
- kein automatischer Smoke auf PRs oder `main`, solange keine echte Preview-Umgebung existiert
- der mutierende Smoke ist nur nach expliziter Auswahl aktiv
- ein authentifizierter Smoke darf niemals Zugangsdaten über unverschlüsseltes HTTP senden

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

- `APPBASIS_PREVIEW_URL` als HTTPS-Origin
- `APPBASIS_SMOKE_USERNAME`
- `APPBASIS_SMOKE_PASSWORD`
- optional `APPBASIS_SMOKE_NEW_PASSWORD`, falls der Benutzer noch im Pflichtpasswortwechsel steht

Dann `pnpm reference:smoke` ausführen.

Erwartet: Login liefert exakt die erwartete Identity, gegebenenfalls Pflichtpasswortwechsel bleibt auf derselben Identity-ID, erneute Sessionauflösung und Task-Lesen funktionieren.

### 3. Einmalige Demo-v0.1-Abnahme mit Persistenz

Zusätzlich `APPBASIS_SMOKE_MUTATE=1` setzen oder den manuellen GitHub-Workflow mit `mutate=true` starten.

Erwartet:

- vor der Mutation wird die vorhandene Task-ID-Menge erfasst
- Task wird mit eindeutiger Smoke-Markierung erstellt und besitzt eine neue ID
- Titel, Beschreibung und Status entsprechen exakt dem angeforderten Smoke-Task
- ein neuer HTTP-Request sieht denselben Task als `open`
- Toggle liefert exakt denselben Task als `completed`
- ein weiterer HTTP-Request sieht den Status weiterhin als `completed`

Hinweis: Die aktuelle Demo-API besitzt bewusst keinen Delete-Endpunkt. Ein mutierender Smoke hinterlässt daher eine klar mit `Preview smoke <uuid>` bezeichnete Task in der Preview-Datenbank.

## GitHub-Workflow

Der Workflow `Reference Preview Smoke` ist ausschließlich `workflow_dispatch`.

- Eingabe `target_url`: Preview-Origin; für Auth-Smokes zwingend HTTPS
- Eingabe `mutate=false`: Read-only-Abnahme
- Eingabe `mutate=true`: einmalige Persistenz-/Toggle-Abnahme; fehlende Auth-Secrets führen zu FAIL statt Health-only-PASS
- Secrets kommen ausschließlich aus dem GitHub-Environment `reference-preview`

## Abnahmekriterien dieses Slices

- Smoke-Runner enthält keine hart codierten Secrets oder Preview-Adressen
- Health-only funktioniert ohne Auth-Secrets
- authentifizierte Requests werden ausschließlich über HTTPS gesendet
- Sign-in, Passwortwechsel und Sessionauflösung werden auf denselben User und dieselbe Identity-ID korreliert
- Auth-/Mutationspfade geben keine Passwörter, Session-Cookies, Zieladressen oder response-kontrollierten Fehlercodes aus
- Netzwerkfehler werden durch feste, nicht-sensitive Meldungen ersetzt
- mutierende Prüfung ist opt-in und kann bei fehlenden Credentials nicht still auf Health-only zurückfallen
- mutierender Smoke beweist eine tatsächlich neue Task und deren Persistenz/Toggle
- Workflow startet nie automatisch
- Repo-Verify prüft Smoke-Syntax
- bestehende CI bleibt grün
