# Phase 2E5 – Reference Demo User Bootstrap

## Ziel

Die Reference-App erhält eine kleine, ausschließlich serverseitige Bootstrap-Composition, mit der ein bereits migriertes PostgreSQL-Demo-Environment über die produktive AppBasis-Identity-Runtime mit einem initialen Benutzer vorbereitet werden kann.

Der Slice stellt bewusst keinen öffentlichen HTTP-Endpunkt und keinen Deployment-Executor bereit. Die sicherheitskritischen Provisionierungs-Invarianten bleiben zentral in `packages/identity`: eine echte technische Better-Auth-Admin-Session ist zwingend, technische Admin-Accounts können nicht in AppBasis-Identity-State übernommen werden, und der tatsächliche Better-Auth-Accountstatus ist maßgeblich.

## Scope

- ausschließlich `apps/reference` plus dieses Scope-Dokument
- serverseitige Funktion `bootstrapReferenceDemoUser(...)`
- Composition ausschließlich über bestehende produktive AppBasis-Bausteine:
  - `createPostgresDatabase`
  - `createBetterAuthRuntime`
  - `createIdentityRuntime`
  - `IdentityService.createInitialUser`
- Eingaben: direkte PostgreSQL-Verbindung, Better-Auth-Secret, Base-URL, bereits authentifizierte technische Better-Auth-Admin-Session, Benutzername, Anzeigename, temporäres Passwort und optionale Kontaktadresse
- strikte strukturelle Konfigurationsvalidierung vor dem ersten Datenbankzugriff, einschließlich echter `postgres://`-/`postgresql://`-URL mit Authority und Host sowie Better-Auth-Passwortgrenzen 8–128 Zeichen
- Ergebnis enthält ausschließlich Identity-ID, Username, tatsächlichen Account-Status und Pflichtpasswortwechsel-Status
- Passwort, technische Better-Auth-E-Mail, Admin-Session, Benutzer-Session und Datenbank-Zugangsdaten werden nie im Ergebnis modelliert oder geloggt
- idempotentes Wiederholen für denselben Username nutzt ausschließlich die zentrale Identity-Reconciliation und erzeugt keinen zweiten Benutzer
- realer PostgreSQL-E2E gegen eine isolierte temporäre Datenbank, deren Schema nach dem gemergten Reference-Migrationsmanifest aufgebaut wird

## Zentrale Identity-Garantien

Der Reference-Bootstrap dupliziert keine sicherheitskritischen Better-Auth-Abfragen. Die gemergte Identity-Basis ist dafür die einzige maßgebliche Schicht:

- administrative Session wird vor Existing-/Create-Reconciliation authentifiziert und als aktiver technischer Admin verifiziert
- der Ziel-Better-Auth-User wird beim Persistieren im selben PostgreSQL-Transaktionskontext gesperrt und erneut auf technische Adminrolle geprüft
- weder der aufrufende noch ein anderer technische Better-Auth-Admin kann dadurch AppBasis-Identity-State erhalten
- `IdentityService.createInitialUser` liefert bei neuer Provisionierung und abgeschlossenem Retry den tatsächlichen Better-Auth-Accountstatus

Diese Invarianten werden zusätzlich in `packages/identity` real gegen PostgreSQL getestet; der Reference-E2E beweist nur die korrekte Composition dieser zentralen Garantien.

## Harte Grenzen

- kein öffentlicher oder interner HTTP-Bootstrap-Endpunkt
- kein CLI-/Task-Runner und keine neue Toolchain-Dependency
- keine Zugangsdaten oder Default-Passwörter im Repository
- kein Root-/Bootstrap-Bypass der Better-Auth-Admin-Grenze
- der Bootstrap erzeugt selbst keinen technischen Better-Auth-Admin
- keine lokale zweite Admin-/Race-Protection in `apps/reference`; diese gehört ausschließlich Identity
- kein Passwort-Reset und keine Recovery-Funktion
- keine Benutzerverwaltung
- keine neue Identity- oder Auth-Abstraktion
- keine Änderung an Better-Auth-, Identity- oder Permission-Semantik
- keine neue Datenbankmigration und keine Änderung bestehender Migrationen
- keine automatische Rollen-/Capability-Zuweisung
- kein Deployment, keine Secrets-Konfiguration und keine externe Cloud-Ressource
- keine Runtime-Dependency- oder Lockfile-Änderung

## Sicherheitsverhalten

- fehlen erforderliche Werte, ist das temporäre Passwort außerhalb 8–128 Zeichen oder sind Secret/Base-URL/Connection-String strukturell ungültig, wird vor Erstellung der Datenbankverbindung abgebrochen
- opaque oder hostlose PostgreSQL-URLs wie `postgres:foo`, `postgres:/foo` oder `postgres:///db` werden vor Erstellung der Datenbankverbindung abgewiesen
- ungültige, abgelaufene, deaktivierte oder nicht-administrative technische Sessions scheitern in der zentralen Identity-Runtime vor einer zulässigen Reconciliation
- technische Better-Auth-Admin-Zielaccounts scheitern zentral vor AppBasis-State-Persistenz, einschließlich konkurrierender Rollenänderungen
- das temporäre Passwort wird unverändert nur an `IdentityService.createInitialUser` weitergereicht und nie zurückgegeben
- Wiederholung eines bereits abgeschlossenen Bootstrap setzt kein neues temporäres Passwort
- ein bestehender deaktivierter Better-Auth-User wird nicht fälschlich als `active` gemeldet
- die Connection wird auch bei Fehlern geschlossen
- Business-Permissions bleiben vollständig getrennt

## Abnahmekriterien

- serverseitige Reference-Composition kann mit gültiger technischer Admin-Session einen initialen Benutzer real gegen PostgreSQL anlegen
- gefälschte oder nicht-administrative Sessions können einen bereits vorhandenen Better-Auth-User nicht in AppBasis-Identity-State übernehmen
- technische Better-Auth-Admins können nicht als AppBasis-Bootstrap-Identity übernommen werden
- ein bestehender deaktivierter Better-Auth-Account wird als `disabled` zurückgegeben
- Anmeldung mit dem temporären Passwort liefert nach einer neuen aktiven Provisionierung `password-change-required`
- ein zweiter Bootstrap desselben Usernames liefert dieselbe Identity-ID und ersetzt das temporäre Passwort nicht
- sichere Rückgabe enthält weder Passwort noch technische E-Mail noch Admin-/Benutzer-Session
- strukturell ungültige Bootstrap-Konfiguration wird vor Erstellung der PostgreSQL-Verbindung abgewiesen
- bestehende Reference-/Identity-/Tasks-Funktionen bleiben unverändert
- frozen install, Repo-Verify, Typecheck, Unit-Tests, reale PostgreSQL-E2Es, Build und `git diff --check` bleiben grün

Nicht mergen, bevor Exact-Head-CI und finaler Codex-Review sauber sind.
