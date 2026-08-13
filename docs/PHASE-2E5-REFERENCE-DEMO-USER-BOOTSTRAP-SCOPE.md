# Phase 2E5 – Reference Demo User Bootstrap

## Ziel

Die Reference-App erhält eine kleine, ausschließlich serverseitige Bootstrap-Composition, mit der ein bereits migriertes PostgreSQL-Demo-Environment genau über die produktive AppBasis-Identity-Runtime mit einem initialen Benutzer vorbereitet werden kann.

Der Slice stellt bewusst noch keinen öffentlichen HTTP-Endpunkt und keinen Deployment-Executor bereit. Er beweist zuerst den sicheren, idempotenten Serverpfad, den ein späterer kontrollierter Preview-Deployment-/Admin-Schritt aufrufen kann.

## Scope

- ausschließlich `apps/reference` plus dieses Scope-Dokument
- kleine serverseitige Funktion `bootstrapReferenceDemoUser(...)`
- Composition ausschließlich über bestehende produktive AppBasis-Bausteine:
  - `createPostgresDatabase`
  - `createBetterAuthRuntime`
  - `createIdentityRuntime`
  - `IdentityService.createInitialUser`
- Eingaben: direkte PostgreSQL-Verbindung, Better-Auth-Secret, Base-URL, Benutzername, Anzeigename, temporäres Passwort und optionale Kontaktadresse
- strikte Konfigurationsvalidierung vor dem ersten Datenbankzugriff
- Ergebnis enthält nur sichere Bootstrap-Metadaten wie Identity-ID, Username, Account-Status und Pflichtpasswortwechsel-Status
- Passwort, technische Better-Auth-E-Mail, Session-Token und Datenbank-Zugangsdaten werden nie im Ergebnis modelliert oder geloggt
- idempotentes Wiederholen für denselben Username nutzt die bereits vorhandene Identity-Reconciliation und erzeugt keinen zweiten Benutzer
- realer PostgreSQL-E2E gegen eine isolierte temporäre Datenbank, deren Schema nach dem gemergten Reference-Migrationsmanifest aufgebaut wird

## Harte Grenzen

- kein öffentlicher oder interner HTTP-Bootstrap-Endpunkt
- kein CLI-/Task-Runner und keine neue Toolchain-Dependency in diesem Slice
- keine Zugangsdaten oder Default-Passwörter im Repository
- kein Passwort-Reset und keine Recovery-Funktion
- keine Benutzerverwaltung
- keine neue Identity- oder Auth-Abstraktion
- keine Änderung an Better-Auth-, Identity- oder Permission-Semantik
- keine neue Datenbankmigration und keine Änderung bestehender Migrationen
- keine automatische Rollen-/Capability-Zuweisung; die Identity-ID bleibt nur die bestehende Permission-Principal-Grenze
- kein Deployment, keine Secrets-Konfiguration und keine externe Cloud-Ressource
- keine Runtime-Dependency- oder Lockfile-Änderung

## Sicherheitsverhalten

- fehlen erforderliche Werte oder sind Secret/Base-URL/Connection-String strukturell ungültig, wird vor dem Datenbankzugriff abgebrochen
- das temporäre Passwort wird unverändert nur an `IdentityService.createInitialUser` weitergereicht und nie zurückgegeben
- Wiederholung eines bereits abgeschlossenen Bootstrap setzt kein neues temporäres Passwort und umgeht keinen bereits erfolgten Pflichtpasswortwechsel
- die Connection wird auch bei Fehlern geschlossen
- Business-Permissions bleiben getrennt; aus einer erfolgreichen Benutzeranlage entsteht nicht automatisch Admin- oder Member-Zugriff

## Abnahmekriterien

- serverseitige Reference-Composition kann einen initialen Benutzer real gegen PostgreSQL anlegen
- Anmeldung mit dem temporären Passwort liefert anschließend `password-change-required`
- ein zweiter Bootstrap desselben Usernames liefert dieselbe Identity-ID und erzeugt keinen zweiten Auth-Benutzer
- sichere Rückgabe enthält weder Passwort noch technische E-Mail noch Session-Token
- ungültige Bootstrap-Konfiguration wird vor Erstellung der PostgreSQL-Verbindung abgewiesen
- bestehende Reference-/Identity-/Tasks-Funktionen bleiben unverändert
- frozen install, Repo-Verify, Typecheck, Unit-Tests, reale PostgreSQL-E2Es, Build und `git diff --check` bleiben grün

Nicht mergen, bevor Exact-Head-CI und finaler Codex-Review sauber sind.
