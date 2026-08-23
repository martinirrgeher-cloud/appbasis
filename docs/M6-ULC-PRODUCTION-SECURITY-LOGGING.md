# M6 – ULC Production Security Logging

Stand: 2026-08-23

Verbindliche Architekturentscheidung: `docs/M6-ADR-ULC-SECURITY-EVENT-PERSISTENCE.md` – Variante 2.

## Ziel

Dieser Slice materialisiert den ersten konkreten persistenten Production-Security-Logging-Sink für `ulc-linz`, ohne eine zweite Logging-Plattform, eine zusätzliche Providerressource oder einen öffentlichen Log-Endpunkt einzuführen.

Der reale Verbraucher ist die bereits vorhandene ULC-Runtime. Deshalb bleibt die Implementierung app-spezifisch und folgt `abstraction on evidence`.

## Sink-Entscheidung

Der erste Sink liegt in der **dedizierten ULC-Produktionsdatenbank**. Das ist für den ersten realen Produktionspfad absichtlich enger als eine neue R2-, Logpush- oder generische Audit-Plattform:

- keine zusätzliche kostenpflichtige oder separat zu provisionierende Ressource,
- dieselbe dedizierte Produktionsdatenbank gehört ausschließlich `ulc-linz`,
- keine zweite Providerabstraktion,
- keine parallele Audit-Datenbank,
- keine öffentliche Read-API.

Die App besitzt weiterhin keinen `/api/security-events`- oder `/api/admin/audit`-Endpunkt. Lesen und Retention-Operationen bleiben Betreiber-/Control-Plane-Aufgaben.

## Generatorvertrag

`createAppSkeleton()` bleibt der kanonische Generator-/Publikationspfad. Die ULC-spezifische Security-Logging-Runtime wird deshalb durch den Generator erzeugt und nicht als driftender Hand-Patch nur in `apps/ulc-linz` gepflegt.

Die Generatorerweiterung ist bewusst auf den realen Verbraucher `appId=ulc-linz` plus die bestehende Identity-/Permissions-Komposition begrenzt. Andere erzeugte Apps werden nicht stillschweigend auf denselben Sink umgestellt. Eine generische Security-Logging-Plattform wird erst bei weiteren realen Verbrauchern abstrahiert.

Für generatorverwaltete ULC-Runtime-Dateien bleibt Byte-Identität zwischen Generatorausgabe und eingechecktem Ziel verpflichtend; Drift blockiert CI.

## Persistenter Vertrag

Migration `0002_ulc_linz_security_event_log.sql` erzeugt `ulc_linz_security_event_log` mit einem bewusst schmalen Schema.

Persistiert werden ausschließlich die bereits normalisierten M5-F-Felder:

- `identity.request.denied`,
- `authorization.denied`,
- Zeitpunkt,
- sicher normalisierter Actor/Organisationskontext soweit zulässig,
- Aktion und Zieltyp/-ID,
- HTTP-Status und sanitizierter Fehlercode nur für Identity-Denials,
- fester Reason-Code nur für Authorization-Denials.

Es existiert **keine** freie JSON-/Payload-Spalte. Request-Bodies, Cookies, Session-Tokens, Passwörter, Datenbankadressen und Secrets haben damit keinen vorgesehenen Persistenzpfad.

## Runtime-Bindung

`createGeneratedPostgresApplicationRuntime()` erzeugt pro Request einen gepufferten PostgreSQL-Security-Logger auf demselben kontrollierten SQL-Client wie die übrige ULC-Runtime.

Die App erhält diesen Logger explizit über `securityEvents`.

Security-Event-Writes werden gepuffert und vor dem Schließen der request-scoped Runtime geflusht. Ein Persistenzfehler:

- eröffnet niemals Zugriff,
- ersetzt niemals die bereits bestimmte Denial-Response,
- wird nur über den festen secrets-freien Worker-Fehlercode `SECURITY_EVENT_FLUSH_ERROR` diagnostiziert,
- verhindert nicht das anschließende Schließen der Runtime.

Damit bleibt die ursprüngliche M5-F-Denial-Semantik erhalten, während der Production-Pfad einen realen persistenten Sink besitzt.

## 12-Monats-Retention

Jeder Datensatz erhält beim Insert serverseitig:

`retained_until = occurred_at + interval '12 months'`

Die Tabelle erzwingt diesen Zusammenhang zusätzlich per Check-Constraint.

`purgeExpiredUlcLinzSecurityEvents()` löscht ausschließlich Datensätze mit `retained_until < now`. Am exakten Zwölf-Monats-Zeitpunkt bleibt der Datensatz daher noch vorhanden; unmittelbar danach ist er löschbar. Der PostgreSQL-E2E-Test beweist diese Grenze gegen eine reale Datenbank.

Die **automatische operative Ausführung** des Purge-Primitives wird in diesem Slice noch nicht aktiviert. Ein zeitgesteuerter produktiver Cleanup wäre ein mutierender Produktionsprozess und benötigt vor seiner erstmaligen Aktivierung die dafür vorgesehene ausdrückliche Freigabe und eine geschützte Control-Plane-Bindung.

## Evidence-Grenze

Dieser Repository-Slice allein setzt `auditSecurityLogging` weiterhin **nicht** auf `verified`.

Für die finale M5/M6-Evidenz müssen zusätzlich real belegt sein:

1. Migration `0002` ist auf der dedizierten ULC-Produktionsdatenbank erfolgreich angewandt.
2. Die tatsächlich konfigurierte ULC-Produktionsruntime verwendet genau diesen Sink.
3. Mindestens ein kontrollierter Security-Denial schreibt den erwarteten normalisierten Datensatz in Production.
4. Es existiert kein öffentlicher Log-Read-Pfad.
5. Der 12-Monats-Purge ist über die geschützte Betreiber-/Control-Plane-Grenze operativ gebunden und erfolgreich nachgewiesen.
6. Die Evidence ist an den tatsächlichen finalen Produktionshead gebunden und bleibt bei Drift fail-closed.

## Nicht enthalten

- kein Providerwrite,
- keine produktive Migration,
- kein Produktionsdeploy,
- keine Secret-Änderung,
- kein öffentlicher Ingress,
- keine neue Logging-/Audit-Plattform,
- keine Produktionsfreigabe.
