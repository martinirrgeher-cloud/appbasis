# Phase 2E5 – Reference Demo User Bootstrap

## Ziel

Die Reference-App erhält eine kleine, ausschließlich serverseitige Bootstrap-Composition, mit der ein bereits migriertes PostgreSQL-Demo-Environment genau über die produktive AppBasis-Identity-Runtime mit einem initialen Benutzer vorbereitet werden kann.

Der Slice stellt bewusst noch keinen öffentlichen HTTP-Endpunkt und keinen Deployment-Executor bereit. Er beweist zuerst den sicheren, idempotenten Serverpfad, den ein späterer kontrollierter Preview-Deployment-/Admin-Schritt aufrufen kann. Die bereits vorhandene Better-Auth-Admin-Grenze bleibt dabei zwingend erhalten und wird vor jeder Provisionierungs-/Reconciliation-Operation aktiv verifiziert.

## Scope

- ausschließlich `apps/reference` plus dieses Scope-Dokument
- kleine serverseitige Funktion `bootstrapReferenceDemoUser(...)`
- Composition ausschließlich über bestehende produktive AppBasis-Bausteine:
  - `createPostgresDatabase`
  - `createBetterAuthRuntime`
  - `createIdentityRuntime`
  - `IdentityService.createInitialUser`
- Eingaben: direkte PostgreSQL-Verbindung, Better-Auth-Secret, Base-URL, bereits authentifizierte technische Better-Auth-Admin-Session, Benutzername, Anzeigename, temporäres Passwort und optionale Kontaktadresse
- strikte strukturelle Konfigurationsvalidierung vor dem ersten Datenbankzugriff, einschließlich einer echten `postgres://`-/`postgresql://`-URL mit Authority und Host sowie der aktuell konfigurierten Better-Auth-Passwortgrenzen 8–128 Zeichen
- nach Verbindungsaufbau wird die angegebene Session über Better Auth validiert und der zugehörige technische Benutzer serverseitig als aktiver Better-Auth-Admin geprüft, bevor `createInitialUser` aufgerufen wird
- kein Better-Auth-Account mit technischer Adminrolle darf Ziel des AppBasis-Bootstrap werden, unabhängig davon, welcher technische Admin den Bootstrap ausführt
- Ergebnis enthält nur sichere Bootstrap-Metadaten wie Identity-ID, Username, Account-Status und Pflichtpasswortwechsel-Status
- Passwort, technische Better-Auth-E-Mail, Admin-Session, Benutzer-Session und Datenbank-Zugangsdaten werden nie im Ergebnis modelliert oder geloggt
- idempotentes Wiederholen für denselben Username nutzt die bereits vorhandene Identity-Reconciliation und erzeugt keinen zweiten Benutzer
- realer PostgreSQL-E2E gegen eine isolierte temporäre Datenbank, deren Schema nach dem gemergten Reference-Migrationsmanifest aufgebaut wird

## Harte Grenzen

- kein öffentlicher oder interner HTTP-Bootstrap-Endpunkt
- kein CLI-/Task-Runner und keine neue Toolchain-Dependency in diesem Slice
- keine Zugangsdaten oder Default-Passwörter im Repository
- kein Root-/Bootstrap-Bypass der Better-Auth-Admin-Grenze
- der Bootstrap erzeugt selbst keinen technischen Better-Auth-Admin; dessen authentifizierte Session muss vom kontrollierten aufrufenden Admin-Prozess stammen
- keine Übernahme irgendeines technischen Better-Auth-Admins in `appbasis_identity_security_state`
- kein Passwort-Reset und keine Recovery-Funktion
- keine Benutzerverwaltung
- keine neue Identity- oder Auth-Abstraktion
- keine Änderung an Better-Auth-, Identity- oder Permission-Semantik
- keine neue Datenbankmigration und keine Änderung bestehender Migrationen
- keine automatische Rollen-/Capability-Zuweisung; Better-Auth-Admin bleibt technische Auth-Administration und ist keine AppBasis-Businessrolle
- kein Deployment, keine Secrets-Konfiguration und keine externe Cloud-Ressource
- keine Runtime-Dependency- oder Lockfile-Änderung

## Sicherheitsverhalten

- fehlen erforderliche Werte, ist das temporäre Passwort außerhalb 8–128 Zeichen oder sind Secret/Base-URL/Connection-String strukturell ungültig, wird vor dem Datenbankzugriff abgebrochen
- opaque oder hostlose PostgreSQL-URLs wie `postgres:foo`, `postgres:/foo` oder `postgres:///db` werden vor Erstellung der Datenbankverbindung abgewiesen
- eine nicht vorhandene, abgelaufene, gefälschte, deaktivierte oder nicht-administrative Better-Auth-Session wird vor jeder Provisionierungs-/Reconciliation-Operation abgewiesen
- die technische Admin-Session wird ausschließlich für diese Verifikation und anschließend an die bestehende produktive Identity-Runtime weitergereicht
- besitzt der Ziel-Username bereits einen Better-Auth-Account mit technischer Adminrolle, wird der Bootstrap unabhängig vom aufrufenden Admin abgewiesen
- das temporäre Passwort wird unverändert nur an `IdentityService.createInitialUser` weitergereicht und nie zurückgegeben
- Wiederholung eines bereits abgeschlossenen Bootstrap setzt kein neues temporäres Passwort und umgeht keinen bereits erfolgten Pflichtpasswortwechsel
- die Connection wird auch bei Fehlern geschlossen
- Business-Permissions bleiben getrennt; aus einer erfolgreichen Benutzeranlage entsteht nicht automatisch Admin- oder Member-Zugriff

## Abnahmekriterien

- serverseitige Reference-Composition kann mit gültiger technischer Admin-Session einen initialen Benutzer real gegen PostgreSQL anlegen
- gefälschte oder nicht-administrative Sessions können auch einen bereits vorhandenen Better-Auth-User nicht in AppBasis-Identity-State übernehmen
- weder der aufrufende technische Better-Auth-Admin noch ein anderer Better-Auth-Account mit technischer Adminrolle kann als AppBasis-Bootstrap-Identity übernommen werden
- Anmeldung mit dem temporären Passwort liefert anschließend `password-change-required`
- ein zweiter Bootstrap desselben Usernames liefert dieselbe Identity-ID und erzeugt keinen zweiten AppBasis-Benutzer bzw. ersetzt das temporäre Passwort nicht
- sichere Rückgabe enthält weder Passwort noch technische E-Mail noch Admin-/Benutzer-Session
- strukturell ungültige Bootstrap-Konfiguration einschließlich opaque oder hostloser PostgreSQL-URLs wird vor Erstellung der PostgreSQL-Verbindung abgewiesen
- technische Better-Auth-Admins erhalten durch diesen Slice keine AppBasis-Identity-State- oder Business-Permission-Zuordnung
- bestehende Reference-/Identity-/Tasks-Funktionen bleiben unverändert
- frozen install, Repo-Verify, Typecheck, Unit-Tests, reale PostgreSQL-E2Es, Build und `git diff --check` bleiben grün

Nicht mergen, bevor Exact-Head-CI und finaler Codex-Review sauber sind.
