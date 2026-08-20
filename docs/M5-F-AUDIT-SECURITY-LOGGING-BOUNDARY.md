# M5-F – ULC Audit-/Security-Logging Boundary

Stand: 2026-08-18

## Zweck

Dieser Slice schließt die technisch heute umsetzbare M5-F-Grenze für ULC Linz auf dem finalen C/D-Persistenzstand aus #158, ohne eine zweite Audit-Datenbank, eine generische Logging-Plattform oder einen nicht vorhandenen Production-Sink zu erfinden.

M5 bleibt fail-closed. Diese Implementierung allein setzt `auditSecurityLogging` **nicht** auf `verified`.

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

#158 materialisiert zusätzlich den app-eigenen ULC-Lifecycle-Audit:

- `ulc_linz_lifecycle_audit`
- `identity.delete.completed` und `retention.exception.set`
- Actor, Reason, Ziel-Identity und autoritative Organisation werden persistent erfasst
- Write + fachliche Lifecycle-Mutation bleiben atomar
- die bestätigte Retention beträgt exakt 12 Kalendermonate
- `lifecycle-audit.postgres.e2e.test.ts` beweist Write, Audit-Shape und die exakte Retention-Grenze gegen reales PostgreSQL

Die Shared-Permissions-Audit-Tabelle wird deshalb nicht für ULC-spezifische Lifecycle-Ereignisse erweitert. Owner-Grenzen bleiben getrennt.

## Reale Organisationsgrenze

Mit #158 existieren reale persistente ULC-Membership- und Subject-Scope-Owner. Die Authorization-Denials können deshalb den Organisationskontext nur dann übernehmen, wenn die aktive Same-Organization-Membership erfolgreich autoritativ aufgelöst wurde. Ein bloß vom Client angefragter Fremdverein wird weiterhin nicht als bestätigter Organisationskontext geloggt.

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

`UlcLinzSecurityEventLogger` ist der schmale Runtime-Port. Der aktuelle Fallback schreibt ausschließlich den normalisierten strukturierten Eventvertrag über `console.warn`.

Ein Fehler eines injizierten/Provider-Sinks:

- eröffnet niemals einen Zugriff,
- ersetzt niemals die ursprüngliche Authorization-Denial-Semantik,
- ersetzt niemals eine bereits verweigerte Identity-HTTP-Antwort,
- wird nur mit einer festen secrets-freien Fallback-Meldung diagnostiziert,
- bleibt auch dann ohne Einfluss auf die Denial-Semantik, wenn selbst die Fallback-Konsole fehlschlägt.

## Zugriffsschutz

Die normale öffentliche ULC-App besitzt keinen Audit-/Security-Log-Read-Endpunkt. Insbesondere werden keine `/api/security-events`- oder `/api/admin/audit`-Routen eingeführt.

Persistente Audit-Daten und spätere Production-Security-Logs dürfen nur über eine geschützte Betreiber-/Control-Plane-Grenze zugänglich gemacht werden.

## 12-Monats-Retention

Für die beiden heute realen persistenten Audit-Owner ist die 12-Monats-Retention ausführbar belegt:

1. Permissions-Administration über `PostgresPermissionAdministrationAuditRetention` und dessen PostgreSQL-E2E.
2. ULC-Lifecycle-Audit über `PostgresUlcLinzScopePersistence.purgeExpiredLifecycleAuditEvents()` und `lifecycle-audit.postgres.e2e.test.ts`.

Für die strukturierten ULC-Security-Events darf die 12-Monats-Anforderung **nicht** aus `console.warn` oder einer bloßen Logger-Schnittstelle abgeleitet werden. Vor `auditSecurityLogging=true` muss die konkrete Produktions-Sink-Konfiguration belegen:

1. exakte ULC-Production-Bindung,
2. Zugriff nur über die vorgesehene geschützte Betreiber-/Control-Plane-Grenze,
3. Retention von 12 Monaten für die erforderlichen Security-Ereignisse,
4. keine Secrets oder unklassifizierten personenbezogenen Payloads,
5. fail-closed bei fehlender, fremder oder veralteter Evidenz.

## Bewusste globale Restgrenzen

Die M5-F-Repository-Implementierung ist technisch fertig. Die Production-Readiness-Evidenz bleibt korrekt `open`, solange mindestens folgende reale Bindungen fehlen:

- konkrete Production-Sink-/Access-/Retention-Evidenz für ULC-Security-Events,
- gemeinsamer finaler ULC-Integrationshead mit dem deploybaren Runtime-Vertrag aus #153 bzw. dessen Nachfolger,
- spätere Factory-Evidence, die nur bei vollständiger End-to-End-Acceptance `auditSecurityLogging=true` liefert.

Die zuvor offene Membership-/Organisationspersistenz ist durch #158 für den aktuellen Scope geschlossen und wird nicht mehr als M5-F-Restgrenze geführt.

## Nicht enthalten

- keine neue DB-Tabelle in M5-F
- keine neue Migration in M5-F
- keine neue `packages/audit`-Abstraktion
- keine öffentliche Log-API
- keine Providerwrites
- kein Deployment
- keine Secret-Änderung
- keine Produktionsfreigabe
