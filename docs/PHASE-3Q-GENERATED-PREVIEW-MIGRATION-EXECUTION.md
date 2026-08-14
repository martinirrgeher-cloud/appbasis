# Phase 3Q – Generated Preview Migration Execution

## Ziel

Phase 3Q beweist erstmals, dass das von einer generierten App erzeugte `appbasis.database.json` außerhalb der Worker-Runtime als ausführbarer Migrationsvertrag verwendet werden kann.

Der erste Consumer ist `tasks-minimal`.

## Verbindlicher Target-Vertrag

Für diesen Slice gilt:

- App-ID: `tasks-minimal`
- Migration-Target: `generated-tasks-preview`
- GitHub Environment: `generated-tasks-preview`
- logischer PostgreSQL-Datenbankname: `appbasis_tasks_preview`
- Connection String: ausschließlich Deployment-/Environment-Konfiguration über `APPBASIS_DATABASE_URL`

Die bestehende Reference-Preview-Datenbank ist ausdrücklich kein gültiges Generated-App-Migrationsziel. Der URL-Pfad muss `appbasis_tasks_preview` auswählen; zusätzlich prüft der Executor innerhalb der Transaktion mit `current_database()` die vom PostgreSQL-Treiber tatsächlich ausgewählte Datenbank, bevor Schema-Prüfung oder DDL ausgeführt werden.

## Source of Truth und Reihenfolge

`apps/tasks-minimal/appbasis.database.json` ist die einzige Quelle für:

- Owner-Reihenfolge,
- Migrationsreihenfolge innerhalb eines Owners,
- die konkret auszuführenden SQL-Migrationsdateien.

Der Executor sortiert, ergänzt oder errät keine Migrationen.

Eine separate Target-Allowlist validiert ausschließlich, dass die im Manifest genannten Owner und deren Root-Verzeichnisse für diesen konkreten Consumer zulässig und vollständig sind. Sie darf die Manifest-Reihenfolge nicht verändern.

## Fail-closed-Grenzen

Die Ausführung schlägt vor jeder Mutation fehl bei:

- falscher App-ID,
- falschem Migration-Target,
- fehlender expliziter Apply-Bestätigung,
- falschem logischen Datenbanknamen im URL-Pfad,
- Abweichung zwischen vereinbartem Datenbanknamen und `current_database()`, auch bei treiberseitiger Query-Parameter-Übersteuerung,
- unbekanntem, doppeltem oder fehlendem Owner,
- abweichendem Owner-Root,
- fehlender oder leerer Migration,
- nicht kanonischem oder aus dem Owner-/Repository-Baum ausbrechendem Pfad,
- Symlinks im konsumierten Manifest-, Owner- oder Migrationspfad,
- nicht leerem `public`-Schema.

Alle Manifest-Migrationen werden in einer PostgreSQL-Transaktion ausgeführt. Ein Fehler rollt den gesamten Lauf zurück.

## Wiederverwendung

Die bisherige Reference-Migrationsmechanik wurde in einen gemeinsamen Repository-Migrationskern extrahiert. Reference und Generated Preview behalten getrennte Entry-Points, Target-Verträge und Fehlertypen.

Damit wird keine Reference-spezifische Deploymentlogik in den Generator verschoben und keine generische Deployment-Control-Plane eingeführt.

## Bewusst nicht Teil von Phase 3Q

- Migrationen oder Provisionierung innerhalb der Worker-Runtime
- Benutzer-, Rollen-, Principal- oder fachliche Initialdaten
- Permission-Administration durch die normale App-Runtime
- Secrets, Providerdaten, Cloud-Ressourcen-IDs oder Datenbankadressen in App- oder Database-Manifesten
- automatische Provider-Provisionierung aus dem Manifest
- Änderung des bestehenden Generated-Worker-Hyperdrive-Bindings
- allgemeine Multi-App-/Multi-Environment-Control-Plane

Der Generated-Worker und das neue Generated-Migration-Target bleiben in diesem Slice bewusst getrennt. Die spätere Bindung eines generierten Workers an seine dedizierte Datenbank ist ein eigener, nachgelagerter Architektur-Slice.

## Beweisführung

Phase 3Q gilt technisch als bewiesen, wenn:

1. der generische Planner alle Target- und Pfadgrenzen fail-closed testet,
2. der bestehende Reference-Executor über denselben Kern ohne Verhaltensbruch funktioniert,
3. ein realer PostgreSQL-E2E-Lauf eine leere Datenbank `appbasis_tasks_preview` erstellt, exakt die vier Migrationen des Generated-Manifests anwendet und die erwarteten Identity-/Permissions-/Tasks-Tabellen nachweist,
4. ein zweiter Lauf auf derselben bereits migrierten Datenbank abgewiesen wird,
5. ein realer PostgreSQL-E2E-Lauf beweist, dass ein treiberseitiges `?database=...`-Override vor jeder Migration erkannt wird und das falsche Ziel unverändert bleibt,
6. der dedizierte GitHub-Workflow ausschließlich das geschützte Generated-Preview-Environment und `APPBASIS_DATABASE_URL` konsumiert,
7. CI und Review auf demselben exakten Head vollständig grün sind.
