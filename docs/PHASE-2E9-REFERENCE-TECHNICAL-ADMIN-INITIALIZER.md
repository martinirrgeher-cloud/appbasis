# Phase 2E9 – Reference Technical Administrator Initializer

## Ziel

Für eine frisch migrierte Reference-Preview-Datenbank wird ein einmaliger, serverseitiger Root-of-Trust-Pfad vorbereitet, der exakt einen technischen Better-Auth-Administrator erzeugen kann.

Dieser PR erstellt noch keinen echten Administrator, verändert keine externe Datenbank und legt keine Cloud-Ressource an. Er stellt ausschließlich den kontrollierten Repository-seitigen Mechanismus bereit.

## Scope

- ausschließlich serverseitige/operative Ausführung, kein öffentlicher HTTP-Endpunkt
- nur für das Ziel `reference-preview`
- nur bei expliziter manueller Bestätigung
- nur wenn noch kein Better-Auth-Benutzer existiert und kein AppBasis-Identity-State vorhanden ist
- exakt ein technischer Better-Auth-Administrator mit Rolle `admin`
- kein AppBasis-Business-User, keine AppBasis-Rolle und keine Business-Permission für diesen technischen Administrator
- zweiter oder konkurrierender Initialisierungsversuch muss fehlschlagen
- parallele Initialisierungsversuche müssen durch eine datenbankseitige Sperre serialisiert werden
- Benutzername, Anzeigename, technische E-Mail und Passwort werden ausschließlich als Laufzeitkonfiguration übergeben
- Datenbank-URL, Better-Auth-Secret, technische E-Mail und Passwort werden niemals im Repository gespeichert oder ausgegeben
- Ergebnis darf nur nicht-sensitive Felder enthalten, z. B. technische Identity-ID, Benutzername und technische Rolle
- Laufzeit-/Providerfehler werden am CLI-Rand auf feste, nicht-sensitive Fehlermeldungen reduziert

## Better-Auth-Grenze

Der Initializer verwendet dieselbe Better-Auth-Konfiguration wie die Reference-App. Die serverseitige Better-Auth-API darf für diesen einmaligen Root-of-Trust-Pfad verwendet werden, damit Passwort-Hashing, Hooks und das bestehende Auth-Schema unverändert bleiben.

Öffentliche Registrierung bleibt deaktiviert. Der Initializer ist kein Ersatz für die normale technische Admin-Autorisierung nach der Erstinitialisierung.

## Sicherheitsgrenzen

- vollständige Konfigurationsvalidierung vor dem Verbindungsaufbau
- PostgreSQL-Verbindungsstring nur als absolute `postgres://`/`postgresql://` URL mit Host
- Better-Auth-Secret mindestens 32 Zeichen
- Preview-Origin HTTPS; unsicheres HTTP nur für localhost in Tests
- Better-Auth-Passwort innerhalb der bestehenden 8–128-Zeichen-Grenze
- technische E-Mail syntaktisch validiert
- datenbankseitige Advisory-Lock-Grenze verhindert zwei erfolgreiche parallele Erstinitialisierungen
- nach Erzeugung wird verifiziert, dass exakt ein aktiver Better-Auth-User existiert, dessen Rolle `admin` enthält
- nach Erzeugung muss `appbasis_identity_security_state` weiterhin leer sein
- bei bereits vorhandenem Better-Auth-User oder AppBasis-Identity-State: FAIL vor Erstellung

## GitHub-Actions-Vertrag

Ein manueller Workflow darf später den vorbereiteten Initializer ausführen, aber ausschließlich:

- über `workflow_dispatch`
- im geschützten Environment `reference-preview`
- mit explizitem booleschen `initialize=true`
- nach Frozen Install und vollständigem `verify:repo`
- nachdem der Initializer ohne Secrets gebaut/gebündelt wurde
- mit Datenbank-URL, Better-Auth-Secret, technischer E-Mail und Passwort ausschließlich im finalen Node-Ausführungsschritt
- ohne Secrets bei Checkout, Toolchain-Setup, Install, Repo-Verify oder Build
- mit Cleanup aller temporären Build-Artefakte in jedem Fall

Der Workflow wird in diesem PR nicht ausgelöst.

## Tests

### Unit

- valide Konfiguration wird normalisiert
- ungültiges Ziel/fehlende Bestätigung wird vor DB-Zugriff abgewiesen
- ungültige PostgreSQL-URL, zu kurzes Secret, unsicherer externer HTTP-Origin, ungültiger Benutzername, E-Mail und Passwort werden abgewiesen

### Reale PostgreSQL-E2E

Auf einer frisch aus dem Reference-Migrationsmanifest aufgebauten Testdatenbank wird bewiesen:

1. zwei parallele Initialisierungsversuche führen zu exakt einem technischen Administrator und genau einem Fehler
2. der erzeugte Account kann sich mit Benutzername/Passwort anmelden
3. die Rolle enthält `admin`
4. `appbasis_identity_security_state` bleibt leer
5. jeder weitere Initialisierungsversuch wird abgewiesen
6. eine zweite Testdatenbank mit einem beliebigen vorhandenen Better-Auth-User wird vollständig abgewiesen und nicht verändert
7. serialisierte/geloggte Ergebnisse enthalten weder Passwort, Secret, Datenbank-URL noch technische E-Mail

## Harte Grenzen

- keine echte externe Admin-Erstellung in diesem PR
- keine Änderung einer externen Datenbank
- keine Cloud-Ressourcenerstellung
- keine neue Migration oder Schemaänderung
- keine Änderung an Signup-/Login-/Session-Semantik
- keine AppBasis-Business-Permission oder Business-Rolle für den technischen Admin
- kein öffentlicher Bootstrap-/Admin-Endpunkt
- keine neue Dependency oder Lockfile-Änderung
- kein automatischer Lauf auf PR oder `main`

## Abnahmekriterien

- Exact-Head-CI grün
- realer PostgreSQL-E2E grün
- Build des operativen Initializers im CI geprüft
- keine Secrets oder externe IDs im Repository
- keine externe Ressource verändert
- finaler Codex-Review ohne major/actionable Finding

Nicht mergen, bevor diese Kriterien erfüllt sind.
