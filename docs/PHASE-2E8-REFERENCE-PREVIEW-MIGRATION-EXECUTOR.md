# Phase 2E8 – Reference Preview Migration Executor

## Ziel

Die gemergte, maschinenlesbare Reference-Migrationsreihenfolge erhält einen kleinen, reproduzierbaren Executor für die **erstmalige Einrichtung einer leeren Preview-PostgreSQL-Datenbank**.

Dieser Slice verändert noch keine externe Datenbank. Er stellt ausschließlich den Repository-seitigen, manuell ausgelösten Ausführungspfad bereit. Der zuvor gemergte Phase-2E7-Deployment-Vertrag bleibt eine getrennte Grenze; die Migration läuft vor dem späteren Worker-Deployment.

## Scope

- `apps/reference/tooling/apply-reference-migrations.mjs` liest ausschließlich `apps/reference/appbasis.database.json`
- die im Manifest definierte Reihenfolge bleibt die einzige Reihenfolge: Identity vor Tasks
- jede SQL-Datei wird anhand des bestehenden `--> statement-breakpoint`-Vertrags in Statements zerlegt
- alle Manifest-Migrationen laufen in **einer PostgreSQL-Transaktion**
- vor dem ersten DDL-Statement muss das `public`-Schema vollständig frei von benutzerdefinierten Schemaobjekten sein, nicht nur von Basistabellen
- Relationen/Views/Sequenzen, Funktionen/Prozeduren, Typen sowie weitere schema-gebundene PostgreSQL-Objektklassen werden in der Leerschema-Prüfung berücksichtigt
- bei jedem Ausführungsfehler wird die gesamte Transaktion zurückgerollt und nur eine feste, nicht-sensitive Fehlermeldung ausgegeben
- die PostgreSQL-Verbindungs-URL wird strukturell validiert und nie ausgegeben
- manueller GitHub-Actions-Workflow `Reference Preview Migrate` nutzt ausschließlich das geschützte Environment `reference-preview`
- die echte Verbindungs-URL kommt ausschließlich aus dem Environment-Secret `APPBASIS_DATABASE_URL` und ist nur im finalen Migrationsschritt sichtbar
- Checkout, Toolchain-Setup, Dependency-Install und `verify:repo` erhalten keine Datenbank-Zugangsdaten
- Workflow erfordert zusätzlich eine explizite boolesche `apply=true`-Bestätigung
- reale PostgreSQL-E2E-Prüfung des Executors in der bestehenden CI

## Warum nur für eine leere Preview-Datenbank

AppBasis besitzt bereits einen deterministischen Compatibility-/Migration-Vertrag, aber noch kein allgemeines Migrationsjournal für beliebige Upgrades bestehender Installationen. Für Demo v0.1 benötigen wir zunächst nur den ersten kontrollierten Aufbau einer neuen Preview-Datenbank.

Deshalb ist dieser Slice bewusst enger:

- vollständig objektleeres `public`-Schema: erlaubt
- bereits initialisierte oder fremd belegte Datenbank – auch wenn sie nur View, Sequence, Funktion oder Typ enthält: verweigert
- Upgrade einer bestehenden AppBasis-Datenbank: **nicht** Aufgabe dieses Slices

Damit wird aus einem einmaligen Demo-Bedarf nicht vorzeitig eine generische Deployment-/Migration-Plattform.

## Transaktionsgrenze

Der Executor öffnet genau eine direkte PostgreSQL-Verbindung über den expliziten Node-24-Runtime-Einstieg von `@appbasis/database` und führt vor dem Anwenden der Migrationen die Leerschema-Prüfung innerhalb derselben Transaktion aus.

Die Prüfung betrachtet die PostgreSQL-Kataloge für schema-gebundene benutzerdefinierte Objekte in `public`, darunter Relationen, Routinen, Typen, Collations, Conversions, Operatoren/Operator-Klassen/-Familien, Extended Statistics und Text-Search-Objekte. Bereits ein vorhandenes Objekt blockiert die Migration.

Anschließend werden sämtliche Statements aller im Manifest gelisteten Migrationen innerhalb dieser Transaktion ausgeführt. PostgreSQL-DDL ist transaktional; ein Fehler führt daher zum Rollback des gesamten initialen Schemaaufbaus.

Die Connection wird in jedem Fall geschlossen.

## Sicherheitsverhalten

- nur `postgres://` bzw. `postgresql://` mit Authority/Hostname werden akzeptiert
- Connection-String, Passwort, Host und andere Datenbank-Zugangsdaten werden nie aktiv geloggt
- `APPBASIS_DATABASE_URL` wird nicht jobweit gesetzt; sie wird erst dem finalen Migrationsschritt als Secret-Environment übergeben, dort auf Vorhandensein geprüft und unmittelbar für Actions-Logs maskiert
- unerwartete Driver-/SQL-Fehler werden am CLI-Rand auf eine feste Meldung reduziert
- jede erkannte Fremdbelegung des `public`-Schemas beendet den Lauf vor dem ersten AppBasis-DDL-Statement
- Migrationen können über den CLI-Einstieg nur laufen, wenn zugleich gilt:
  - `APPBASIS_MIGRATION_TARGET=reference-preview`
  - `APPBASIS_APPLY_MIGRATIONS=1`
- GitHub-Workflow ist ausschließlich `workflow_dispatch`
- Environment `reference-preview` bleibt die Secret-/Freigabegrenze
- der Workflow führt vor der Migration das vollständige `verify:repo` **ohne Datenbank-Credential** aus

## Tests

### Ohne externe Datenbank

Node-Builtin-Tests prüfen:

- exakte Manifest-Reihenfolge
- nichtleere SQL-Statements
- Statement-Breakpoint-Vertrag
- PostgreSQL-URL-Validierung

### Reale PostgreSQL-CI

Der bestehende `Reference PostgreSQL E2E`-Lauf erstellt isolierte Datenbanken und beweist:

1. Executor akzeptiert eine vollständig leere Datenbank.
2. Alle drei aktuellen Manifest-Migrationen werden angewendet.
3. zentrale Identity- und Tasks-Tabellen existieren danach.
4. ein zweiter Aufruf wird wegen des nichtleeren Schemas abgewiesen.
5. eine fremde Datenbank mit ausschließlich nicht-tabellarischen `public`-Objekten (Funktion + benutzerdefinierter Typ) wird ebenfalls abgewiesen, ohne AppBasis-Tabellen anzulegen oder die Fremdobjekte zu verändern.

## Harte Grenzen

- keine Änderung einer externen Datenbank in diesem PR
- keine neue Migration und keine Änderung bestehender Migrationen
- kein allgemeines Migrationsjournal
- kein Upgrade-/Downgrade-Mechanismus für bestehende AppBasis-Datenbanken
- keine Cloud-Ressourcenerstellung
- keine technische Admin-/Benutzererstellung
- keine job-weite Exposition der Preview-Datenbank-Zugangsdaten
- keine Identity-/Permission-/Task-/HTTP-Semantikänderung
- keine neue Dependency und keine Lockfile-Änderung
- kein automatischer Lauf auf PR oder `main`

## Späterer Preview-Ablauf

Nach Freigabe der echten externen Preview-Ressourcen:

1. neue Neon/PostgreSQL-Preview-Datenbank erstellen
2. Connection als `APPBASIS_DATABASE_URL` im geschützten GitHub-Environment setzen
3. `Reference Preview Migrate` einmalig mit `apply=true` auslösen
4. Hyperdrive an dieselbe Datenbank anbinden
5. technischen Root-of-Trust und Demo-User getrennt provisionieren
6. den bereits getrennt abgesicherten Phase-2E7-Reference-Worker-Deploy auslösen
7. Health- und anschließend authentifizierten/mutierenden Smoke ausführen

## Abnahmekriterien

- CI auf dem aktuellen PR-Head gegen den aktuellen `main` grün
- realer PostgreSQL-E2E des Executors grün, einschließlich Fremdobjekt-Abweisung
- Datenbank-Credential nur im finalen Migrationsschritt sichtbar
- keine Secrets oder externe IDs im Repository
- keine externe Datenbank wurde durch den PR verändert
- finaler Codex-Re-Review ohne major/actionable Finding

Nicht mergen, bevor diese Kriterien erfüllt sind.
