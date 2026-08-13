# Phase 2E3 – Tasks PostgreSQL Persistence

## Ziel

Die Reference-App ersetzt den temporären In-Memory-Task-Speicher im konfigurierten Server-Runtime-Pfad durch echte PostgreSQL-Persistenz. Der bestehende HTTP-/UI-Vertrag bleibt dabei unverändert; nur die Storage-Grenze hinter `TaskRepository` wird asynchron und dauerhaft.

## Scope

- ausschließlich `modules/tasks`, notwendige Anpassungen in `apps/reference`, fokussierte Tests, CI und dieses Scope-Dokument
- `TaskRepository` wird Promise-basiert, damit reale Persistenz ohne synchrone Scheinabstraktion möglich ist
- der bestehende `InMemoryTaskRepository` bleibt als schneller Testadapter erhalten
- `modules/tasks` erhält einen PostgreSQL-Repository-Adapter für Listen, Erstellen, Finden und atomaren Statuswechsel
- `modules/tasks` besitzt seine eigene versionierte Migration für die Task-Tabelle
- der konfigurierte Reference-Worker verwendet dieselbe PostgreSQL-Verbindung wie Identity, aber ausschließlich über die modul-eigene Task-Tabelle
- fokussierter PostgreSQL-E2E-Test gegen den bereits in CI vorhandenen ephemeren PostgreSQL-Service
- bestehende Identity- und Permission-Enforcement-Grenzen vor den Tasks-Routen bleiben unverändert

## Harte Grenzen

- keine Änderung an Identity-Schema, Identity-Migrationen oder Better-Auth-Semantik
- keine Persistenz der Permissions in diesem Slice
- keine Benutzerverwaltung
- kein Deployment, keine Secrets, keine Hyperdrive-ID und keine externe Cloud-Ressource
- keine neue allgemeine Repository-, ORM-, Migration- oder Provider-Abstraktionsplattform
- keine Änderung des sichtbaren Task-HTTP-Vertrags oder der React-UI
- keine Task-Tabellen in `packages/database`; das Fachmodul besitzt sein Schema selbst
- keine Lockfile- oder Runtime-Dependency-Änderung

## Datenmodell

Die erste Task-Tabelle bleibt bewusst klein:

- stabile Text-ID, im Server als UUID v4 erzeugt
- Titel, Beschreibung und Status `open`/`completed`
- technische `created_at`-/`updated_at`-Zeitstempel für deterministische Reihenfolge und spätere Migrationen
- Datenbank-Constraints sichern nichtleeren Titel und erlaubte Statuswerte zusätzlich zur Domainvalidierung ab

## Fehler- und Nebenläufigkeitsverhalten

- Task-Erstellung normalisiert weiterhin über das bestehende Domainmodell
- Statuswechsel erfolgt atomar in genau einem SQL-Update; kein Read-Modify-Write-Rennen
- unbekannte IDs bleiben beim Statuswechsel `404`
- Persistenzfehler werden nicht als erfolgreiche Mutation dargestellt
- Berechtigungs- und Passwortwechsel-Sperren werden weiterhin vor jedem Storage-Zugriff erzwungen

## Abnahmekriterien

- konfigurierter Reference-Worker verwendet keinen globalen In-Memory-Task-Speicher mehr
- ein neu erzeugter Task ist über eine neue Repository-Instanz derselben Datenbank wieder lesbar
- Create/List/Find/Toggle funktionieren real gegen PostgreSQL
- der In-Memory-Adapter erfüllt denselben asynchronen `TaskRepository`-Vertrag
- Task-Migration liegt versioniert ausschließlich unter `modules/tasks`
- bestehende Reference-API-Tests bleiben grün
- PostgreSQL-Task-E2E läuft in GitHub Actions gegen den vorhandenen ephemeren PostgreSQL-Service
- frozen install, Repo-Verify, Typecheck, Unit-Tests, PostgreSQL-E2E, Build und `git diff --check` sind grün

Draft: nicht mergen, bevor Exact-Head-CI und finaler Review sauber sind.
