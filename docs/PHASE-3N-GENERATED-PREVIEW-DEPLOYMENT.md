# Phase 3N – Generated Preview Deployment

## Ziel

Der erste unabhängig generierte AppBasis-Worker wird reproduzierbar auf Cloudflare deploybar, ohne Providerdaten, Datenbankadressen oder Secrets in das App-Manifest zu verschieben und ohne Migrationen oder Provisioning in die normale Worker-Runtime einzubauen.

Erster realer Consumer ist bewusst `apps/tasks-minimal`. Eine generische App-Auswahl wird noch nicht vorgezogen.

## Deployment-Grenze

Die Phase verbindet die bereits bewiesenen Bausteine:

1. generierter Worker `apps/tasks-minimal/worker/index.ts`,
2. Generated Preview Deployment Contract,
3. bestehende geschützte Cloudflare-/Hyperdrive-/Better-Auth-Deployment-Eingaben,
4. einen separaten Bootstrap für den erstmaligen Worker-/Secret-Zustand,
5. einen normalen Deploy mit required-secret Contract,
6. einen automatisierten Remote-Health-Smoke.

## Separater Bootstrap

`.github/workflows/generated-tasks-preview-bootstrap.yml` ist der einzige neue Bootstrap-Weg dieses Slices.

Er:

- verwendet nur Deployment-Eingaben aus dem geschützten GitHub Environment,
- ermittelt die bestehende Cloudflare `workers.dev` Account-Subdomain,
- erzeugt den Worker nur dann secretlos, wenn er noch nicht existiert,
- lässt dabei Provider-Autoprovisioning ausdrücklich deaktiviert,
- installiert anschließend `BETTER_AUTH_SECRET` als echten Worker-Secret,
- verifiziert nur das Vorhandensein des Secret-Namens,
- führt keine Migration und kein Permission-Provisioning aus.

Der secretlose Erstzustand ist zulässig, weil der generierte Worker außer `/api/health` ohne vollständige Runtime-Konfiguration bereits fail-closed ist. Der normale Deployment-Vertrag wird dadurch nicht abgeschwächt.

## Normaler Deploy

`.github/workflows/generated-tasks-preview-deploy.yml`:

- akzeptiert keinen ungeboutstrappten Worker,
- verlangt den vorhandenen Secret-Namen `BETTER_AUTH_SECRET`,
- rendert den normalen Generated Preview Deployment Contract,
- führt vor dem echten Deploy einen Wrangler-Dry-Run aus,
- deployt mit deaktiviertem Provider-Provisioning und Auto-Create,
- prüft anschließend `/api/health` gegen die tatsächlich abgeleitete `workers.dev` Origin,
- entfernt die ephemeren Wrangler-Artefakte immer wieder.

## Smoke-Vertrag

`tooling/generated-preview-smoke.mjs` validiert:

- kanonische HTTPS-Origin,
- gültige App-ID,
- ausschließlich `GET /api/health`,
- HTTP 200,
- JSON-Payload mit `status: "ok"` und der erwarteten `appId`,
- begrenzte Request-Laufzeit.

Fehlermeldungen des Smokes geben keine Response-Bodies oder Deployment-Secrets aus.

## Weiterhin ausdrücklich außerhalb dieses Slices

- Neon-/PostgreSQL-Ressourcen anlegen,
- Hyperdrive anlegen oder Providerkonfiguration administrieren,
- Datenbankmigrationen ausführen,
- Permission-Rollen oder Principals provisionieren,
- Demo-Benutzer provisionieren,
- authentifizierten oder mutierenden Remote-Smoke ausführen,
- Providerdaten, Secrets oder DB-Adressen im App-Manifest speichern,
- `database` als `platformService` einführen,
- allgemeine Deployment-Control-Plane oder Provider-Abstraktion bauen.

## Abschlusskriterien

Phase 3N ist erst abgeschlossen, wenn:

1. der exakte PR-Head die vollständige Repository-CI bestanden hat,
2. der finale Codex-Review denselben exakten Head ohne offene Findings geprüft hat,
3. der PR squash-gemerged wurde,
4. die Post-Merge-CI auf `main` vollständig grün ist,
5. der separate Bootstrap auf `main` erfolgreich ist,
6. der normale Generated Tasks Preview Deploy auf `main` erfolgreich ist,
7. der Remote-Health-Smoke dabei `tasks-minimal` bestätigt.

Erst danach wird ein nächster Slice für migrations-/permission-seitig isolierte Deployment-Daten oder einen authentifizierten Generated-App-Smoke bewertet.
