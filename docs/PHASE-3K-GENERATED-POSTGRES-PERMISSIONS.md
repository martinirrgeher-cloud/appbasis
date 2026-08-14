# Phase 3K – Generated PostgreSQL Permission Composition

## Ziel

Dieser Slice verbindet die bereits generierte PostgreSQL-Tasks-Runtime mit dem persistenten read-only `PostgresPermissionStore`. Tasks und Permission-Entscheidungen verwenden dieselbe PostgreSQL-Verbindung der generierten Runtime.

Der schreibende Permission-Bootstrap bleibt davon strikt getrennt: Er läuft vor dem normalen App-Betrieb über `@appbasis/permissions/provisioning` und `@appbasis/database/postgres-provisioning`.

## Runtime-Vertrag

Eine generierte App mit `tasks` sowie den Platform-Services `identity` und `permissions` erhält über `createGeneratedPostgresRuntime`:

- `permissions: PermissionStore` als `PostgresPermissionStore`,
- `tasks: TaskRepository` als `PostgresTaskRepository`,
- `close()` für die gemeinsame PostgreSQL-Verbindung.

Die normale Runtime erhält damit keinen administrativen Permission-Schreibpfad.

## E2E-Beweis

Der generierte PostgreSQL-E2E verwendet eine disposable PostgreSQL-Datenbank und:

1. wendet die bestehenden versionierten Permissions- und Tasks-Migrationen an,
2. provisioniert die für den Test notwendige Capability, Rolle und initiale Principal→Rolle-Zuweisung über den separaten Bootstrap-Vertrag,
3. wiederholt denselben Bootstrap und beweist einen No-op,
4. startet die normale generierte Runtime mit persistenten Tasks und persistenten Permission-Entscheidungen,
5. beweist Task-Erstellung und Statusänderung über mehrere Runtime-Instanzen,
6. beweist deny-by-default für einen authentifizierten, aber nicht provisionierten Principal.

Die konkrete Test-Principal-ID ist ausschließlich Bootstrap-/Testeingabe und kein Bestandteil des App-Manifests.

## Architekturgrenzen

Unverändert bleiben:

- `database` ist reine Infrastruktur und kein Manifest-`platformService`,
- keine Secrets, DB-Adressen, Providerdaten oder konkreten Principal-IDs im App-Manifest,
- keine HTTP-Admin-API für Rechteverwaltung,
- keine Benutzer-/Rechteadministration, kein Audit- oder Recovery-Modell,
- keine schreibende Permission-Administration aus der normalen App-Runtime,
- keine neue Datenbankschemaänderung außerhalb der bereits versionierten Migrationen,
- keine Änderung der Reference-App-Funktion.

## Nächster Schritt

Nach sauberem CI- und Codex-Abschluss dieses Slices ist der nächste sichere Factory-Schritt eine wirklich unabhängig deploybare generierte Worker-Komposition: Deployment-Konfiguration, Migration/Bootstrap vor Runtime-Start und ein isolierter Preview-Smoke müssen dann als zusammenhängender generierter Deployment-Vertrag bewiesen werden, ohne Infrastrukturdetails ins App-Manifest zu verschieben.
