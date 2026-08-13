# Phase 2E1 – Reference API: Identity, Permissions und Tasks

## Ziel

Die bestehende Reference-App erhält erstmals eine echte serverseitige HTTP-Grenze für Anmeldung, aktuelle Identity, verpflichtenden Erst-Passwortwechsel und Tasks. Die Worker-Routen verwenden die bereits vorhandenen AppBasis-Bausteine `IdentityService`, `PermissionStore` und `TaskRepository`; React darf Auth-/Permission-Regeln und Task-Fachlogik nicht selbst nachbilden.

Dieser Slice schafft die getestete Server-Grenze. Die React-Oberfläche wird erst im direkt folgenden Slice auf diese API umgestellt, damit Auth-/Security-Verhalten und UI-Änderungen getrennt reviewbar bleiben.

## Scope

- ausschließlich `apps/reference` plus notwendige Workspace-Abhängigkeiten/Lockfile und dieses Scope-Dokument
- `createReferenceApp(...)` als kleine Hono-Composition für bestehende AppBasis-Dienste; keine neue generische Framework-Schicht
- HTTP-Endpunkte für:
  - Username/Passwort-Anmeldung
  - aktuelle Identity/Access-Status
  - verpflichtenden Erst-Passwortwechsel mit Session-Rotation
  - Tasks auflisten
  - Task anlegen
  - Task-Status umschalten
- Session-Token ausschließlich als HttpOnly-Cookie; nicht als JSON-Feld an React ausgeben
- jede fachliche Tasks-Route prüft zuerst die Identity-/Passwortwechsel-Sperre und anschließend die passende AppBasis-Capability
- Identity-ID ist der Permission-Principal; Better-Auth-Technikrollen werden nicht als Business-Permissions verwendet
- vorhandener `TaskRepository` bleibt für diesen Slice die fachliche Storage-Grenze; PostgreSQL-Tasks-Persistenz folgt separat
- fokussierte Worker-Tests für Authentifizierung, Passwortwechsel-Sperre, Permission-Deny-by-default und Tasks-Verhalten
- `/api/health` bleibt unverändert verfügbar

## Harte Grenzen

- keine neue Identity-, Auth-Provider-, Permission- oder Task-Abstraktionsplattform
- keine Änderung der gemergten Identity-/Permissions-Sicherheitssemantik
- keine neue Datenbankmigration und keine PostgreSQL-Tasks-Persistenz
- keine Benutzerverwaltungs-Endpunkte in diesem Slice
- keine React-/CSS-Umstellung auf die neue API in diesem Slice
- keine Deployment-, Cloudflare-, Vercel-, Secret- oder externe Ressourcen-Konfiguration
- keine dauerhafte Demo-Session oder hart codierte Zugangsdaten
- keine Session-Tokens in Response-JSON, Logs oder AppBasis-eigenen Operationstabellen
- kein Saga-/Outbox-/Workflow-Framework

## HTTP-Verhalten

- `POST /api/auth/sign-in`: Username + Passwort; setzt bei Erfolg das HttpOnly-Session-Cookie und liefert nur Identity-/Access-Metadaten
- `GET /api/auth/session`: 401 ohne gültige Session; sonst Identity-/Access-Metadaten
- `POST /api/auth/change-required-password`: verlangt gültige Session, aktuellen/neuen Passwortwert und UUID-v4-Idempotency-Key; setzt bei Erfolg das rotierte Session-Cookie
- `GET /api/tasks`: nur bei voller Application-Freigabe + `tasks:manage`
- `POST /api/tasks`: wie oben; Eingabevalidierung bleibt zusätzlich im Tasks-Domainmodell
- `POST /api/tasks/:id/toggle`: wie oben; 404 bei unbekannter Task

## Abnahmekriterien

- Reference Worker enthält nicht mehr nur `/api/health`, sondern eine getestete serverseitige Identity/Permissions/Tasks-HTTP-Grenze
- React muss später weder Better Auth noch `IdentityService` noch `PermissionStore` direkt importieren
- `password-change-required` kann keine Tasks lesen oder verändern
- unbekannter Principal, unbekannte Capability oder expliziter Revoke bleiben deny-by-default
- Session-Cookie ist HttpOnly und wird bei erfolgreichem Pflicht-Passwortwechsel rotiert
- Session-Token erscheint nie im JSON-Body
- Tasks-Routen verwenden den vorhandenen `TaskRepository` und dessen Domainvalidierung
- bestehender Health-Check bleibt grün
- Typecheck, Tests, Build, Repo-Verify, frozen install und `git diff --check` sind grün
- Diff bleibt im beschriebenen Scope

Draft: nicht mergen, bevor Exact-Head-CI und finaler Codex-Review sauber sind.
