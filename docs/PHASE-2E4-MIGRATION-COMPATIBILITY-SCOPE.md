# Phase 2E4 – Migration Compatibility Contract

## Ziel

Nach der Einführung der modul-eigenen Tasks-Migration braucht die Reference-App einen kleinen, maschinenlesbaren Vertrag darüber, welche Schema-Eigentümer zu ihrer Datenbank gehören und in welcher Reihenfolge deren Migrationen auf eine leere PostgreSQL-Datenbank angewendet werden.

Dieser Slice führt noch keinen produktiven Deployment-Migrationsrunner ein. Er schafft zuerst die reproduzierbare Kompositions- und Kompatibilitätsgrenze, die ein späterer Preview-Deployment-Schritt sicher konsumieren kann.

## Scope

- ausschließlich ein Reference-App-Datenbankmanifest, ein kleiner Repo-Verifier, fokussierter PostgreSQL-E2E und dieses Scope-Dokument
- maschinenlesbarer PostgreSQL-Vertrag für die Reference-App mit expliziten Schema-Eigentümern
- derzeitige deterministische Reihenfolge: Identity vor Tasks
- jeder Eintrag verweist ausschließlich auf Migrationen innerhalb des eigenen Owner-Roots
- explizite Schema-Version je Owner
- Repo-Verifier prüft Struktur, eindeutige Owner/Migrationspfade, sortierte Migrationen, Dateiexistenz und dass keine SQL-Migration im referenzierten Migrationsverzeichnis versehentlich im Manifest fehlt
- realer PostgreSQL-E2E baut eine leere `public`-Schemafläche ausschließlich nach dem Manifest auf und prüft die erwarteten Identity- und Tasks-Tabellen
- vorhandener PostgreSQL-CI-Service wird wiederverwendet

## Harte Grenzen

- keine Änderung an bestehenden Identity- oder Tasks-Migrationsdateien
- keine neue Datenbankmigration in diesem Slice
- keine allgemeine plattformweite Migration Engine
- kein produktiver Migrationsrunner und kein automatisches Anwenden auf externe Datenbanken
- keine Benutzer-Provisionierung
- keine Änderung an Identity-, Permission-, Task- oder UI-Semantik
- kein Deployment, keine Secrets und keine externe Cloud-Ressource
- keine neue Runtime-Dependency und keine Lockfile-Änderung

## Manifest-Vertrag

Die Reference-App besitzt ihren konkreten Kompositionsplan. Die Schema-Dateien bleiben bei ihren jeweiligen Eigentümern.

Für jeden Owner werden mindestens festgehalten:

- stabile Owner-ID
- Repository-Root des Owners
- positive Schema-Version
- geordnete Liste der zugehörigen SQL-Migrationen

Die Reihenfolge der Owner im Manifest ist zugleich die globale Migrationsreihenfolge dieser konkreten App.

## Abnahmekriterien

- `apps/reference/appbasis.database.json` beschreibt Identity und Tasks mit eindeutiger Reihenfolge und Schema-Version
- keine Migration wird aus dem Verzeichnis eines anderen Owners referenziert
- alle referenzierten SQL-Dateien existieren
- zusätzliche SQL-Migrationen in den bereits referenzierten Migrationsverzeichnissen lassen `verify:repo` fehlschlagen, bis der Kompositionsvertrag bewusst aktualisiert wurde
- realer PostgreSQL-E2E kann ein leeres Schema ausschließlich aus dem Manifest vollständig aufbauen
- der E2E weist danach mindestens Better-Auth-/Identity- und `appbasis_task`-Tabellen nach
- bestehende Identity-/Tasks-E2Es bleiben grün
- frozen install, Repo-Verify, Typecheck, Unit-Tests, PostgreSQL-E2E, Build und `git diff --check` bleiben grün

Nicht mergen, bevor Exact-Head-CI und finaler Codex-Review sauber sind.
