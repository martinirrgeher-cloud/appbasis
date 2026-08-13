# Phase 2E6 – Reference Preview Preparation

## Ziel

Die Reference-App besitzt einen reproduzierbaren Abnahmeweg gegen die echte Demo-v0.1-Preview. Nach erfolgreicher manueller Erstabnahme wird der bereits bewährte Health-/Auth-/Session-/Task-Persistenz-/Toggle-Smoke kontrolliert automatisiert.

Diese Entscheidung ersetzt die frühere Phase-2E6-Annahme, dass noch keine echte Preview existiert und der Smoke deshalb ausschließlich manuell ausgeführt wird.

## Scope

- `tooling/reference-preview-smoke.mjs` als Node-24-Smoke-Runner gegen die deployte Reference-URL
- Health-only-Modus ohne Benutzer-Secrets; hierfür bleibt lokales HTTP zulässig
- authentifizierter Modus ausschließlich über HTTPS und nur gegen eine separat konfigurierte, vertrauenswürdige Preview-Origin
- Identitätskorrelation über Username und Identity-ID vor und nach einem Pflichtpasswortwechsel
- Mutationsmodus für echte Task-Neuanlage, Persistenz über getrennte Requests und Statuswechsel
- mutierender Modus scheitert fail-closed, wenn Auth-Konfiguration fehlt
- Netzwerk- und HTTP-Fehler werden in Actions nur mit festen, nicht vom Ziel kontrollierten Meldungen ausgegeben
- manueller GitHub-Actions-Workflow `Reference Preview Smoke` bleibt für gezielte Read-only- und Mutationsprüfungen verfügbar
- automatischer Demo-v0.1-Smoke auf `main` nur bei Änderungen am Smoke-/Deploy-Vertrag oder Smoke-Runner
- vollständiger Demo-v0.1-Akzeptanz-Smoke innerhalb des serialisierten `Reference Preview Deploy`-Workflows nach dem Deployment
- GitHub-Environment `reference-preview` als Grenze für die vertrauenswürdige Preview-Origin und die Secrets
- Repo-Tests prüfen den Workflow-Vertrag

## Harte Grenzen

- kein automatisches Deployment
- kein automatischer Secret-tragender Smoke auf Pull Requests
- keine Cloudflare-Account-ID, Hyperdrive-ID, Datenbank-URL, Passwörter, Session-Cookies oder Tokens im Repository bzw. in Smoke-Logs
- keine Änderung an Permission-, Task- oder Datenbank-Semantik durch die Smoke-Automatisierung
- keine Migration oder Schemaänderung
- keine neue Dependency und keine Lockfile-Änderung
- der manuell gestartete mutierende Smoke bleibt opt-in
- der automatische Demo-v0.1-Akzeptanz-Smoke ist bewusst mutierend und darf nur mit der geschützten Demo-Identity `demo.user` laufen
- ein automatischer Lauf scheitert, wenn die konfigurierte Smoke-Identity nicht `demo.user` ist
- ein authentifizierter Smoke darf niemals Zugangsdaten über unverschlüsseltes HTTP oder an eine frei gewählte Ziel-Origin senden
- Deploy und zugehöriger Akzeptanz-Smoke bleiben in derselben serialisierten Deploy-Kette
- der unabhängige Standalone-Smoke teilt bewusst keinen GitHub-Concurrency-Lock mit Preview-Deployments, weil GitHub pro Concurrency-Gruppe nur einen wartenden Lauf erhält und sonst ein wartender Deployment-Auftrag verdrängt werden könnte
- ein Standalone-Smoke ist daher eine unabhängige Live-Prüfung und niemals der Beleg für die Revision eines gleichzeitig laufenden Deployments; die revisionsgebundene Deployment-Abnahme erfolgt ausschließlich innerhalb von `Reference Preview Deploy`

## Externe Preview-Konfiguration

Für Demo v0.1 werden außerhalb des Repositories benötigt:

1. eine PostgreSQL-Datenbank mit dem gemergten Reference-Migrationsmanifest
2. eine Cloudflare-Hyperdrive-Verbindung auf diese Datenbank
3. Worker-Binding `HYPERDRIVE`
4. Secret `BETTER_AUTH_SECRET` mit mindestens 32 Zeichen
5. Variable `APPBASIS_BASE_URL` auf die tatsächlich deployte HTTPS-Origin
6. die provisionierte Demo-Identity `demo.user` mit den benötigten Demo-Berechtigungen
7. im GitHub-Environment `reference-preview`:
   - Environment-Variable `APPBASIS_PREVIEW_URL` mit der vertrauenswürdigen HTTPS-Origin
   - Secret `APPBASIS_SMOKE_USERNAME`; für automatische Demo-v0.1-Läufe muss dessen Wert `demo.user` sein
   - Secret `APPBASIS_SMOKE_PASSWORD` passend zu derselben Identity
   - Secret `APPBASIS_SMOKE_NEW_PASSWORD` nur solange diese Identity noch einen Pflichtpasswortwechsel benötigt

Business-Permissions bleiben eine getrennte, explizite Konfiguration und werden durch den Smoke nicht erzeugt.

## Abnahmeablauf

### 1. Health-only

Für einen lokalen bzw. bewusst unauthentifizierten Aufruf genügt:

```text
APPBASIS_PREVIEW_URL=https://<preview-origin> pnpm reference:smoke
```

Erwartet: `/api/health` meldet `appbasis-reference`, API-Version 1 und Status `ok`. Ohne Username werden keine Auth-Secrets gesendet und keine Trusted-Origin-Konfiguration benötigt.

### 2. Authentifizierter Read-only-Smoke

Environment setzen:

- `APPBASIS_PREVIEW_URL` als HTTPS-Origin
- `APPBASIS_TRUSTED_PREVIEW_ORIGIN` auf exakt dieselbe vertrauenswürdige HTTPS-Origin
- `APPBASIS_SMOKE_USERNAME`
- `APPBASIS_SMOKE_PASSWORD`
- optional `APPBASIS_SMOKE_NEW_PASSWORD`, falls der Benutzer noch im Pflichtpasswortwechsel steht

Dann `pnpm reference:smoke` ausführen.

Erwartet: Vor dem ersten Credential-Request wird die tatsächliche Origin gegen die Trusted-Origin geprüft. Login liefert exakt die erwartete Identity, gegebenenfalls bleibt ein Pflichtpasswortwechsel auf derselben Identity-ID, erneute Sessionauflösung und Task-Lesen funktionieren.

### 3. Mutierende Demo-v0.1-Abnahme

Für einen manuellen Lauf zusätzlich `APPBASIS_SMOKE_MUTATE=1` setzen oder den GitHub-Workflow mit `mutate=true` starten. Automatische Demo-v0.1-Abnahmeläufe setzen die Mutation bewusst selbst.

Erwartet:

- vor der Mutation wird die vorhandene Task-ID-Menge erfasst
- Task wird mit eindeutiger Smoke-Markierung erstellt und besitzt eine neue ID
- Titel, Beschreibung und Status entsprechen exakt dem angeforderten Smoke-Task
- ein neuer HTTP-Request sieht denselben Task als `open`
- Toggle liefert exakt denselben Task als `completed`
- ein weiterer HTTP-Request sieht den Status weiterhin als `completed`

Hinweis: Die aktuelle Demo-API besitzt keinen Delete-Endpunkt für Tasks. Ein mutierender Smoke hinterlässt daher eine klar mit `Preview smoke <uuid>` bezeichnete, abgeschlossene Task in der Preview-Datenbank. Das ist für die Demo-v0.1-Akzeptanz bewusst und nachvollziehbar.

## GitHub-Workflows

### `Reference Preview Smoke`

- manueller `workflow_dispatch` bleibt erhalten
- manuelle Läufe verwenden weiterhin die konfigurierte Smoke-Identity und `mutate=false|true`
- zusätzlich enger `push`-Trigger auf `main` ausschließlich bei Änderungen an Smoke-/Deploy-Workflow oder Smoke-Runner
- automatische Läufe verlangen fail-closed die konfigurierte Identity `demo.user`
- Preview-Origin und Trusted-Origin stammen ausschließlich aus dem geschützten GitHub-Environment
- Standalone-Smoke verwendet bewusst keinen gemeinsamen Concurrency-Lock mit Preview-Deployments, damit ein Smoke keinen wartenden manuellen Deploy verdrängen kann
- Standalone-Smoke ist eine unabhängige Prüfung der aktuell live erreichbaren Preview und keine revisionsgebundene Deployment-Abnahme

### `Reference Preview Deploy`

- Deployment bleibt ausschließlich manuell ausgelöst
- nach Deployment und Health-Prüfung läuft der vollständige mutierende Demo-v0.1-Akzeptanz-Smoke
- der Akzeptanz-Smoke bleibt bis zum Ende innerhalb derselben `reference-preview-deploy`-Concurrency-Kette
- dadurch kann kein zweites Preview-Deployment die Zielrevision während der laufenden revisionsgebundenen Abnahme ersetzen

## Abnahmekriterien dieses Slices

- Smoke-Runner enthält keine hart codierten Secrets oder Preview-Adressen
- Health-only funktioniert ohne Auth-Secrets
- authentifizierte Requests werden ausschließlich über HTTPS gesendet
- vor jedem authentifizierten Lauf entspricht die Ziel-Origin exakt einer separat konfigurierten Trusted-Origin
- der manuelle Workflow bezieht die Preview-Origin ausschließlich aus dem geschützten GitHub-Environment, nicht aus Dispatcher-Eingaben
- der manuelle Workflow behält die konfigurierbare Smoke-Identity
- automatische Demo-v0.1-Läufe sind auf `demo.user` begrenzt und scheitern bei abweichender Konfiguration
- Sign-in, Passwortwechsel und Sessionauflösung werden auf denselben User und dieselbe Identity-ID korreliert
- Auth-/Mutationspfade geben keine Passwörter, Session-Cookies, Zieladressen oder response-kontrollierten Fehlercodes aus
- Netzwerkfehler werden durch feste, nicht-sensitive Meldungen ersetzt
- manueller mutierender Smoke bleibt opt-in
- automatischer mutierender Smoke läuft nur auf `main` für den definierten Demo-v0.1-Abnahmepfad, niemals auf PRs
- mutierender Smoke beweist eine tatsächlich neue Task und deren Persistenz/Toggle
- Deploy und Akzeptanz-Smoke sind als eine serialisierte revisionsgebundene Kette geschützt
- Standalone-Smoke kann keinen wartenden `Reference Preview Deploy` über eine gemeinsame Concurrency-Gruppe verdrängen
- Repo-Tests prüfen den Workflow-Vertrag
- bestehende CI bleibt grün
