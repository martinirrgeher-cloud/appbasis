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

## Preview-spezifischer Datenbankbeweis ohne Seed-Daten

Der bestehende Phase-3O-Smoke und `/api/health` bleiben unverändert. Insbesondere bleibt `/api/health` weiterhin ohne Datenbank- oder Secret-Bindings erreichbar.

Für Phase 3R erhält ausschließlich der konkrete Preview-Deployment-Pfad von `tasks-minimal` einen schmalen Adapter `worker/preview.ts`. Der Generated-Worker selbst (`worker/index.ts`) und der Generator bleiben unverändert. Die temporär gerenderte Preview-Wrangler-Konfiguration wählt explizit `./worker/preview.ts` als Entry-Point; alle Requests außer `GET /api/health/database` werden unverändert an den generierten Worker delegiert.

`GET /api/health/database` ist ein bewusst enger Infrastruktur-Smoke:

1. Der Preview-Adapter liest ausschließlich die bereits gebundene `HYPERDRIVE.connectionString`.
2. Er öffnet über den bestehenden PostgreSQL-Runtime-Treiber eine Verbindung und führt exakt eine read-only Abfrage `SELECT 1` aus.
3. Nur bei erfolgreicher Abfrage und sauberem Schließen der Verbindung liefert der Endpoint exakt `200` mit `{ status: "ok", appId: "tasks-minimal", database: "reachable" }`.
4. Fehlende Hyperdrive-Bindings, Verbindungs-, Query- oder Close-Fehler liefern `503` mit generischem Fehlercode und ohne Provider- oder Secret-Daten.
5. Der externe Database-Binding-Smoke akzeptiert ausschließlich diesen exakten Erfolgsvertrag.

Damit ist ein Datenbankausfall strukturell von einer fehlenden Session unterscheidbar. Der Beweis benötigt weder Benutzer noch Rollen, Permission-Grants, Sessions oder Tasks und mutiert keine fachlichen Daten.

Dieser Datenbank-Health-Adapter wird in Phase 3R bewusst **nicht** in den allgemeinen Generator übernommen. Er ist zunächst der kleinste vollständige Preview-Vertical-Slice. Eine spätere Verallgemeinerung ist erst sinnvoll, wenn ein zweiter konkreter Generated-App-/Deployment-Fall denselben Vertrag benötigt.

## Worker-Secret-Synchronisierung

Bootstrap installiert `BETTER_AUTH_SECRET` bei der erstmaligen Worker-Erstellung. Jeder spätere manuelle Generated-Preview-Deploy synchronisiert das Secret erneut aus demselben geschützten `generated-tasks-preview`-Environment, bevor der Worker deployed wird.

Diese Synchronisierung gehört zur reproduzierbaren Deployment-Konfiguration und ist unabhängig vom Datenbank-Health-Probe. Sie unterstützt Secret-Rotation, ohne Secret-Werte auszulesen oder in App-/Database-Manifeste zu schreiben.

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
- fehlendem bestehenden Worker,
- fehlendem/ungültigem `APPBASIS_BETTER_AUTH_SECRET`,
- fehlgeschlagener Worker-Secret-Synchronisierung,
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
- keine allgemeine Generator- oder Core-Erweiterung für Datenbank-Health-Probes

## Abnahmekriterien

Phase 3R gilt als abgeschlossen, wenn:

1. Generated Worker Bootstrap und Deploy ausschließlich `generated-tasks-preview` verwenden,
2. eine getrennte, explizit bestätigte und idempotente Hyperdrive-Erstellung existiert,
3. normale Deployments den dedizierten Hyperdrive ausschließlich read-only auflösen und vollständig gegen den DB-Target-Vertrag validieren,
4. Query-Caching fail-closed deaktiviert sein muss,
5. der manuelle Deploy den Worker-`BETTER_AUTH_SECRET` aus dem geschützten Generated-Environment synchronisiert,
6. der Preview-Adapter alle normalen Requests an den unveränderten Generated-Worker delegiert und ausschließlich `/api/health/database` ergänzt,
7. der Database-Binding-Smoke durch eine echte read-only PostgreSQL-Abfrage Worker→Hyperdrive→PostgreSQL beweist und DB-Fehler eindeutig als Nicht-Erfolg behandelt,
8. PR-CI und realer PostgreSQL-E2E vollständig grün sind,
9. Codex den exakten finalen PR-Head ohne Blocking-Finding freigibt,
10. nach Squash-Merge der Post-Merge-CI auf `main` grün ist,
11. der dedizierte Hyperdrive erstellt und der Worker anschließend erfolgreich gegen diesen Target deployed und gesmoked wurde.
