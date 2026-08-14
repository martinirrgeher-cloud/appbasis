# Phase 3R – Generated Preview Database Binding

## Ziel

Phase 3R bindet den bereits generierten Worker `appbasis-tasks-minimal` erstmals eindeutig an die in Phase 3Q separat migrierte Generated-Preview-Datenbank.

Der Slice ändert weder das App-Manifest noch `appbasis.database.json` und provisioniert keine Benutzer, App-Rollen, Permission-Grants oder fachlichen Initialdaten.

## Verbindlicher Target-Vertrag

Für den ersten Consumer gilt weiterhin:

- App-ID: `tasks-minimal`
- GitHub Environment: `generated-tasks-preview`
- PostgreSQL-Datenbank: `appbasis_tasks_preview`
- Cloudflare-Hyperdrive-Name: `appbasis-tasks-minimal-preview`
- Worker: `appbasis-tasks-minimal`

Provider-IDs, Datenbankadressen und Zugangsdaten bleiben ausschließlich Deployment-/Environment-Konfiguration.

Die bisherigen Generated-Worker-Workflows dürfen `reference-preview` und dessen Hyperdrive nicht mehr als Runtime-Target verwenden.

## Hyperdrive als getrennte Infrastrukturaktion

Die erstmalige Hyperdrive-Erstellung erfolgt ausschließlich über den manuellen Workflow `Generated Tasks Preview Hyperdrive Bootstrap`.

Der Workflow:

- läuft im geschützten Environment `generated-tasks-preview`,
- benötigt eine explizite `apply`-Bestätigung, wenn die Konfiguration noch fehlt,
- verwendet einen deterministischen Namen statt einer im Repository gespeicherten Provider-ID,
- validiert bei bereits vorhandener Konfiguration Name, Origin, Port, Datenbank, Benutzer und Cache-Policy,
- ist idempotent, wenn exakt der erwartete Target bereits existiert,
- schlägt bei Duplikaten oder abweichendem Target fail-closed fehl,
- deployt keinen Worker und führt keine Migration aus.

Normale Worker-Bootstrap- und Deploy-Workflows dürfen Hyperdrive nur auflösen und validieren, niemals erstellen oder verändern.

## Direkter Neon-Origin

`APPBASIS_DATABASE_URL` bleibt das geschützte Deployment-Secret für Migration und Hyperdrive-Provisioning. Für Hyperdrive muss es den direkten Neon-PostgreSQL-Origin verwenden und exakt `appbasis_tasks_preview` auswählen.

Ein Neon-`-pooler`-Endpoint wird vor jedem Cloudflare-Aufruf abgewiesen. Damit bleibt Neon-Pooling außerhalb von Hyperdrive und Hyperdrive übernimmt selbst den Runtime-Verbindungspool.

## Cache-Policy

Die aktuelle Generated-App verwendet dieselbe Datenbankverbindung für Session-/Identity-Zustand, Permission-Entscheidungen und Tasks. Deshalb muss die dedizierte Hyperdrive-Konfiguration Query-Caching deaktiviert haben.

Der Hyperdrive-Bootstrap erstellt ausschließlich `caching.disabled = true`; ein vorhandener Target mit aktivem Cache wird nicht stillschweigend korrigiert, sondern abgewiesen.

## Runtime-Beweis ohne Seed-Daten

Der bestehende Phase-3O-Smoke bleibt erhalten. Zusätzlich führt der Deploy-Workflow einen Database-Binding-Smoke aus:

1. Der Smoke erzeugt einen neuen, nicht provisionierten Session-Token und signiert ihn mit demselben geschützten `APPBASIS_BETTER_AUTH_SECRET`, das der Worker als `BETTER_AUTH_SECRET` verwendet.
2. Cookie-Name und Signaturformat entsprechen den im Repository gepinnten Better-Auth-/better-call-Versionen: für die HTTPS-Base-URL `__Secure-better-auth.session_token`, HMAC-SHA-256, Standard-Base64-Signatur und URL-Encoding des vollständigen `token.signature`-Werts.
3. Request auf `/api/tasks` mit diesem korrekt signierten, aber nicht vorhandenen Session-Token.
4. Better Auth kann den Token deshalb nicht bereits bei der Cookie-Prüfung verwerfen und muss `internalAdapter.findSession(token)` ausführen. Dadurch wird der Worker→Hyperdrive→PostgreSQL-Pfad tatsächlich benötigt.
5. Erwartet wird exakt `401 SESSION_INVALID` ohne neu aufgebautes Session-Cookie.

Die aktuelle Identity-Konfiguration aktiviert keinen Session-Cookie-Cache. Der Smoke erzeugt daher keine Session-Daten im Cookie, die den DB-Lookup umgehen könnten.

Der Deploy-Workflow verlangt den Better-Auth-Secret zusätzlich als geschütztes Environment-Secret, damit der Smoke exakt denselben Schlüssel verwenden kann. Bootstrap und Deploy validieren denselben Mindestvertrag; Secret-Werte werden weder ausgegeben noch in ein Manifest geschrieben.

Damit wird der Worker→Hyperdrive→PostgreSQL-Pfad geprüft, ohne einen echten Benutzer, eine Rolle, einen Permission-Grant oder einen Task anzulegen.

## Fail-closed-Grenzen

Der Binding-/Deploy-Pfad schlägt fehl bei:

- falschem GitHub Environment,
- fehlender Cloudflare-Konfiguration,
- fehlender direkter PostgreSQL-Verbindung,
- falschem logischem Datenbanknamen,
- einem treiberseitigen `database`-Override im Connection String,
- Neon-Pooler statt direktem Origin,
- fehlendem oder mehrfach vorhandenem deterministischen Hyperdrive-Namen,
- abweichendem Hyperdrive-Origin, Port, Benutzer oder Datenbanknamen,
- aktivem Hyperdrive Query-Cache,
- fehlendem bestehenden Worker oder `BETTER_AUTH_SECRET`,
- fehlendem/ungültigem `APPBASIS_BETTER_AUTH_SECRET` für den signierten DB-Smoke,
- fehlgeschlagenem Health-, Runtime- oder Database-Binding-Smoke.

API-Fehler werden ohne Response-Body weitergegeben, damit Providerdaten oder Zugangsinformationen nicht in Logs gespiegelt werden.

## Bewusst nicht Teil von Phase 3R

- keine Benutzer- oder Demo-Daten-Provisionierung
- keine Permission-Administration
- keine Migration innerhalb der Worker-Runtime
- keine automatische Migration vor einem Deploy
- keine generische Multi-App-Deployment-Control-Plane
- keine Provider-ID in App- oder Database-Manifesten
- keine automatische Übernahme oder Mutation des Reference-Hyperdrive
- keine Änderung an der fachlichen Tasks-/Identity-/Permission-Semantik

## Abnahmekriterien

Phase 3R gilt als abgeschlossen, wenn:

1. Generated Worker Bootstrap und Deploy ausschließlich `generated-tasks-preview` verwenden,
2. eine getrennte, explizit bestätigte und idempotente Hyperdrive-Erstellung existiert,
3. normale Deployments den dedizierten Hyperdrive ausschließlich read-only auflösen und vollständig gegen den DB-Target-Vertrag validieren,
4. Query-Caching fail-closed deaktiviert sein muss,
5. der Database-Binding-Smoke mit einem Better-Auth-kompatibel signierten, nicht vorhandenen Session-Token den echten geschützten Runtime-/DB-Pfad ohne Seed-Daten bestätigt,
6. PR-CI und realer PostgreSQL-E2E vollständig grün sind,
7. Codex den exakten finalen PR-Head ohne Blocking-Finding freigibt,
8. nach Squash-Merge der Post-Merge-CI auf `main` grün ist,
9. der dedizierte Hyperdrive erstellt und der Worker anschließend erfolgreich gegen diesen Target deployed und gesmoked wurde.
