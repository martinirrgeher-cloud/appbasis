# M5-F – ULC Audit-/Security-Logging Boundary

Stand: 2026-08-18

## Zweck

Dieser Slice schließt die technisch heute umsetzbare M5-F-Grenze für ULC Linz, ohne eine zweite Audit-Datenbank, eine generische Logging-Plattform oder eine nicht vorhandene ULC-Fachpersistenz zu erfinden.

M5 bleibt fail-closed. Diese Implementierung allein setzt `auditSecurityLogging` **nicht** auf `verified`.

## Bestehender persistenter Audit-Owner

Rollen-, Principal-Rollen- und Principal-Permission-Mutationen bleiben auf dem bestehenden Permissions-Owner:

- `appbasis_permission_administration_audit`
- Audit Actor + Reason sind verpflichtend
- Mutation und Audit laufen transaktional
- Eventtyp, Zieltyp, Ziel-ID, Vorher-/Nachherwert und DB-Zeitpunkt werden persistent erfasst
- die bestätigte Retention beträgt exakt 12 Kalendermonate
- Cleanup läuft über `PostgresPermissionAdministrationAuditRetention`
- ULC erzeugt keinen parallelen Audit-Store

Die aktuelle gemeinsame Audit-Tabelle besitzt noch keine eigene `organization_id`-Spalte. Solange die reale Membership-/Organisationspersistenz hinter ULC nicht gebunden ist, wird dieser Shared-Owner-Vertrag nicht nur für M5-F spekulativ erweitert.

## ULC Security Events

Die öffentliche ULC-Runtime erzeugt einen kleinen strukturierten Eventvertrag für heute reale Security-Fälle:

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
- Organisation nur nach erfolgreicher aktiver Same-Organization-Membership-Prüfung; ein bloß vom Client angefragter Fremdverein wird nicht als autoritativer Organisationskontext geloggt
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

Damit kann ein normaler App-Client den Logbestand nicht über die öffentliche Runtime lesen. Ein späterer operativer Zugriff gehört in eine geschützte Provider-/Control-Plane-Grenze und muss dort separat evidenziert werden.

## 12-Monats-Retention

Für den persistenten Rollen-/Permission-/Admin-Audit ist die 12-Monats-Retention bereits als ausführbarer PostgreSQL-Owner-Vertrag vorhanden und durch die bestehende E2E-Suite belegt.

Für die strukturierten ULC-Security-Events darf die 12-Monats-Anforderung **nicht** aus `console.warn` oder einer bloßen Logger-Schnittstelle abgeleitet werden. Vor `auditSecurityLogging=true` muss die konkrete Produktions-Sink-Konfiguration belegen:

1. exakte ULC-Production-Bindung,
2. Zugriff nur über die vorgesehene geschützte Betreiber-/Control-Plane-Grenze,
3. Retention von 12 Monaten für die erforderlichen Security-Ereignisse,
4. keine Secrets oder unklassifizierten personenbezogenen Payloads,
5. fail-closed bei fehlender, fremder oder veralteter Evidenz.

Diese Provider-/Runtime-Evidenz darf erst auf dem späteren gemeinsamen ULC-Integrationshead an das Factory-Gate gebunden werden.

## Bewusste globale Restgrenzen

Die M5-F-Implementierung ist technisch fertig, die Production-Readiness-Evidenz bleibt aber korrekt `open`, solange mindestens folgende reale Bindungen fehlen:

- konkrete Production-Sink-/Access-/Retention-Evidenz für ULC-Security-Events,
- reale Membership-/Organisationspersistenz, falls persistente Admin-Audits organisationsgenau ausgewertet werden sollen,
- gemeinsamer Integrationshead mit dem deploybaren ULC-Runtime-Vertrag aus #153,
- spätere Factory-Evidence, die nur bei vollständiger End-to-End-Acceptance `auditSecurityLogging=true` liefert.

## Nicht enthalten

- keine neue DB-Tabelle
- keine neue Migration
- keine neue `packages/audit`-Abstraktion
- keine App-spezifische Direkt-SQL-Auditlösung
- keine öffentliche Log-API
- keine Providerwrites
- kein Deployment
- keine Secret-Änderung
- keine Produktionsfreigabe
