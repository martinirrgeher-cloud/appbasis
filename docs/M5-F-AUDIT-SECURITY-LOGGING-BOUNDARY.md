# M5-F – ULC Audit-/Security-Logging Boundary

Stand: 2026-09-01

## Zweck

Dieser Slice definiert die M5-F-Grenze für ULC Linz ohne eine zweite Audit-Datenbank, eine generische Logging-Plattform oder zusätzliche Providerdienste zu erfinden.

M5 bleibt fail-closed. `auditSecurityLogging=true` darf nur aus real gebundener Production-Evidence entstehen.

## Persistente Audit-Owner

### Permissions-Owner

Rollen-, Principal-Rollen- und Principal-Permission-Mutationen bleiben auf dem bestehenden Permissions-Owner:

- `appbasis_permission_administration_audit`
- Audit Actor + Reason sind verpflichtend
- Mutation und Audit laufen transaktional
- Eventtyp, Zieltyp, Ziel-ID, Vorher-/Nachherwert und DB-Zeitpunkt werden persistent erfasst
- die bestätigte Retention beträgt exakt 12 Kalendermonate
- Cleanup läuft über `PostgresPermissionAdministrationAuditRetention`

### ULC-Lifecycle-Owner

Der app-eigene ULC-Lifecycle-Audit umfasst:

- `ulc_linz_lifecycle_audit`
- `identity.delete.completed` und `retention.exception.set`
- Actor, Reason, Ziel-Identity und autoritative Organisation werden persistent erfasst
- Write + fachliche Lifecycle-Mutation bleiben atomar
- die bestätigte Retention beträgt exakt 12 Kalendermonate
- `lifecycle-audit.postgres.e2e.test.ts` beweist Write, Audit-Shape und die exakte Retention-Grenze gegen reales PostgreSQL

Die Shared-Permissions-Audit-Tabelle wird deshalb nicht für ULC-spezifische Lifecycle-Ereignisse erweitert. Owner-Grenzen bleiben getrennt.

## Reale Organisationsgrenze

Es existieren reale persistente ULC-Membership- und Subject-Scope-Owner. Authorization-Denials dürfen den Organisationskontext nur dann übernehmen, wenn die aktive Same-Organization-Membership erfolgreich autoritativ aufgelöst wurde. Ein bloß vom Client angefragter Fremdverein wird nicht als bestätigter Organisationskontext geloggt.

## ULC Security Events

Die öffentliche ULC-Runtime erzeugt einen kleinen strukturierten Eventvertrag für heute reale Security-Fälle.

### Identity-Denials

- `identity.request.denied`
- Operation: `sign-in`, `session` oder `change-required-password`
- HTTP-Status
- sanitizierter Fehlercode
- serverseitiger Zeitpunkt
- kein Username
- kein Passwort
- kein Session-Token
- keine Backend-Fehlermeldung

### Authorization-Denials

- `authorization.denied`
- Actor/Principal, soweit sicher vorhanden
- Organisation nur nach erfolgreicher aktiver Same-Organization-Membership-Prüfung
- Aktion `view` / `edit`
- Modul als fachlich notwendiges Ziel
- fester Denial-Reason-Code
- serverseitiger Zeitpunkt
- keine Subject-ID
- keine Cookies/Session-Tokens
- keine Request-Bodies
- keine Credentials/Secrets

Control Characters, überlange oder nicht normalisierbare Identifier werden nicht ungeprüft in das Event übernommen.

## Sink-Grenze

`UlcLinzSecurityEventLogger` ist der schmale Runtime-Port. Die Produktionsruntime verwendet den dedizierten Security-Log-Sink; ein Logger-/Sink-Fehler darf niemals einen Zugriff eröffnen oder eine bereits verweigerte Identity-/Authorization-Antwort verändern.

## Zugriffsschutz

Die normale öffentliche ULC-App besitzt keinen Audit-/Security-Log-Read-Endpunkt. Insbesondere werden keine `/api/security-events`- oder `/api/admin/audit`-Routen eingeführt.

Persistente Audit-Daten und Production-Security-Logs dürfen nur über die geschützte Betreiber-/Control-Plane-Grenze zugänglich gemacht werden.

## 12-Monats-Retention

Für M5-F ist die Anforderung erfüllt, wenn die konkrete Produktionskonfiguration fail-closed belegt:

1. exakte ULC-Production-Bindung des Security-Log-Sinks,
2. reale Post-Deployment-Sink-Aktivität,
3. exakte serverseitige 12-Kalendermonats-Grenze,
4. vorhandene kanonische Cleanup-Funktion ohne clientseitig überschreibbaren Cutoff,
5. Least-Privilege-Cleanup-Prinzipal ohne direkten Tabellen-DELETE-/UPDATE-/TRUNCATE-Pfad,
6. Bindung an den aktuellen geprüften Retention-Implementierungsdigest.

Ein **bereits erfolgreich ausgeführter destruktiver Produktions-Purge ist kein M5-Pflichtnachweis**. Der manuelle Workflow `M5 ULC Security Log Retention` bleibt als kontrollierter Betriebs-/Runbook-Pfad bestehen. Er bleibt main-only, explizit freizugebend und fail-closed. Sein Erfolg darf als zusätzliche operative Evidence verwendet werden, ist aber keine Voraussetzung für `auditSecurityLogging=true`.

Der frühere Evidence-Modus `controlled-calendar-enforcement`, der einen frischen erfolgreichen Purge konsumiert, bleibt aus Kompatibilitätsgründen verifizierbar. Die aktuelle Production-Evidence-Komposition verwendet `controlled-calendar-contract`.

## Fail-closed bleibt verbindlich

M5-F bleibt `open`, wenn insbesondere eine der folgenden Bedingungen fehlt oder driftet:

- reale Production-Runtime-/Resource-Bindung,
- dedizierter Security-Log-Hyperdrive,
- frische Post-Deployment-Sink-Aktivität,
- Least-Privilege-/ACL-Nachweis,
- serverseitiger Kalender-Retention-Vertrag,
- exakter Implementierungsdigest,
- vollständige oder aktuelle Provider-Evidence.

## Nicht enthalten

- keine neue DB-Tabelle
- keine neue Migration
- keine neue Logging-Abstraktion
- keine öffentliche Log-API
- keine Providerwrites durch diesen Slice
- kein Deployment
- keine Secret-Änderung
- kein automatischer/destruktiver Retention-Run
- keine Produktionsfreigabe
