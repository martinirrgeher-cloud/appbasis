# Phase 3P – Generated Database Manifest

## Ziel

Phase 3P schafft den kleinsten sicheren Daten-Bootstrap-Vertrag für generierte Apps, ohne bereits eine Datenbank zu mutieren.

Der App-Generator erzeugt für jede App mit persistenter AppBasis-Komposition zusätzlich `appbasis.database.json`. Dieses Artefakt beschreibt ausschließlich die versionierten Migration-Owner, die sich aus der deklarierten App-Komposition ergeben.

Für `tasks-minimal` sind das derzeit:

- `identity` aus `packages/identity`,
- `permissions` aus `packages/permissions`,
- `tasks` aus `modules/tasks`.

## Sicherheits- und Architekturgrenzen

Das generierte Database-Manifest enthält ausschließlich repository-interne Vertragsdaten:

- stabile Owner-ID,
- Repository-Root des Owners,
- Schema-Version,
- geordnete, versionierte SQL-Migrationspfade.

Es enthält ausdrücklich nicht:

- PostgreSQL-Verbindungsadressen,
- Provider- oder Cloud-Ressourcen-IDs,
- Secrets, Tokens oder Passwörter,
- konkrete Principal-/Benutzer-IDs,
- Environment-Namen oder Deployment-Credentials.

`database` bleibt Infrastruktur und wird nicht zum `platformService` im App-Manifest.

## Generator-Vertrag

Die Database-Ownership-Zuordnung ist derzeit bewusst klein und explizit. Unterstützt werden nur die bereits real bewiesenen Komponenten:

- Plattformdienst `identity` → Identity-Migrationen,
- Plattformdienst `permissions` → Permission-Migrationen,
- Modul `tasks` → Tasks-Migration.

Der Generator arbeitet fail-closed: Wird künftig ein neuer ausgewählter Plattformdienst oder ein neues Modul nicht ausdrücklich hinsichtlich Migration Ownership klassifiziert, wird kein unvollständiges Database-Manifest erzeugt.

Die Owner-Reihenfolge ist deterministisch: bekannte Plattformdienste in fester Abhängigkeitsreihenfolge, anschließend Module lexikographisch. Damit ist derselbe fachliche App-Vertrag unabhängig von der Eingabereihenfolge reproduzierbar.

## Checked Generated Output

`apps/tasks-minimal/appbasis.database.json` ist eingecheckter generierter Output und muss byte-identisch zum Renderer sein. Die Verifikation prüft zusätzlich, dass alle referenzierten SQL-Migrationen im Repository existieren und das Manifest keine offensichtlichen Infrastruktur- oder Secret-Daten enthält.

## Bewusste Nicht-Ziele dieses Slices

Phase 3P führt noch keine Migration aus und verändert keine Preview-Datenbank.

Insbesondere entstehen noch nicht:

- kein Migrations-Aufruf aus der normalen Worker-Runtime,
- kein automatisches Cloud-/Datenbank-Provisioning,
- kein generischer Deployment-Control-Plane,
- keine Benutzer-Provisionierung,
- keine Permission-Principal-Zuweisung,
- kein authentifizierter Remote-Smoke.

Damit bleibt die in Phase 3N/3O bewiesene Worker-Runtime vollständig frei von Migrations-, Provisioning- und Admin-Verantwortung.

## Akzeptanzkriterien

Phase 3P ist abgeschlossen, wenn:

1. der Generator `appbasis.database.json` deterministisch aus der App-Komposition erzeugt,
2. `tasks-minimal` exakt Identity-, Permissions- und Tasks-Migration Ownership enthält,
3. Apps ohne deklarierte Database-Owner kein leeres Schein-Manifest erhalten,
4. unbekannte Ownership fail-closed behandelt wird,
5. keine Secrets, Providerdaten oder DB-Adressen im generierten Artefakt stehen,
6. checked generated Output und Renderer byte-identisch sind,
7. CI und finaler Codex-Review auf demselben Head-SHA vollständig grün sind.

## Nächster Slice

Nach Phase 3P kann ein separater Generated-Preview-Migrations-Workflow genau dieses Manifest konsumieren. Dieser spätere Workflow muss eine explizit ausgewählte Preview-Datenbank verwenden, Migrationen außerhalb des Workers ausführen und darf nicht stillschweigend die bestehende Reference-Preview-Datenbank als isolierte Generated-App-Datenbank voraussetzen.
