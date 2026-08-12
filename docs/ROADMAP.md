# AppBasis – technische Roadmap

Stand: 2026-08-12

Diese Roadmap folgt dem Grundsatz **weniger Plattform auf Vorrat, mehr vollständige Vertical Slices**. Fähigkeiten aus dem langfristigen Gesamtkonzept bleiben möglich, werden aber erst dann verallgemeinert, wenn reale Apps ihren gemeinsamen Bedarf belegen.

## 1. Phase 2A sauber abschließen

- Identity-Konsistenzproblem technisch entscheiden und korrigieren.
- Zuerst prüfen, ob Better Auth und AppBasis-State sauber in einer gemeinsam kontrollierten PostgreSQL-Transaktion laufen können.
- Wenn nicht praktikabel: kleine Identity-spezifische durable Reconciliation/Idempotenz; keine allgemeine Saga-Engine.
- Username-Vertrag gegen die tatsächlich gepinnte Better-Auth-Version reproduzierbar prüfen.
- Remote-SHA, CI und Review-SHA müssen den finalen PR-Stand unabhängig bestätigen.

## 2. Phase 2B – echte PostgreSQL-/Better-Auth-E2E

- freigegebene Neon/PostgreSQL-Testumgebung
- echte Better-Auth-Adapterintegration
- Admin-Provisioning
- Username + temporäres Passwort
- Pflichtpasswortwechsel
- Session-Revoke
- Deaktivierung
- Person/Historie bleibt erhalten
- Failure Injection und Retry-Szenarien

## 3. Identity Security Hardening

- Admin-Recovery
- starke Recovery-Capability
- Audit + Reason
- Rate Limiting / Enumeration-Schutz
- kurzlebige temporäre Credentials
- Session-Regeln
- privilegierte Accounts optional mit zusätzlicher Freigabepolicy

## 4. Minimaler Permission-Vertical-Slice

Version 1 beweist bewusst nur:

- stabile Capability-IDs
- eine Rolle als Capability-Bundle
- individuelle Grants/Revokes
- einen klaren Data Scope
- serverseitige Enforcement-Grenze
- positive und negative Authorization-Tests

Keine Policy-DSL und keine allgemeine ABAC-/Rules-Engine.

## 5. Migration Ownership + Compatibility Contract

Vor mehreren echten Standardmodulen:

- Core/Modul/App besitzen jeweils nur ihr Schema.
- globale, deterministische Migrationreihenfolge
- Expand-Migrate-Contract für destruktive Änderungen
- maschinenlesbares Compatibility Manifest für Core-, Modul-, Schema- und Projektformatversionen

## 6. Minimal Audit + Observability

- Security-/Adminaktionen
- kritische fachliche Änderungen
- Correlation-/Error-IDs
- Health
- Migrations-/Releaseversion
- technische Fehler- und Jobzustände nur dort, wo bereits vorhanden

## 7. Preview Deployment + Environment Governance

Erster vollständiger, nicht-produktiver Cloud-Vertical-Slice:

- Cloudflare
- Neon
- Secrets außerhalb des Repositories
- Environment-Vertrag
- Health/Smoke Tests
- kontrollierte Migration
- Rollback-/Recovery-Verfahren

## 8. Erster kleiner fachneutraler Business-Vertical-Slice

Ein bewusst kleines Standardmodul, z. B. Tasks, soll erstmals den ganzen Pfad beweisen:

Identity → Permission → DB → Audit → API → UI → Tests → Deployment → Failure → Upgrade/Restore.

Erst reale Wiederholung entscheidet, welche Teile dauerhaft Standardmodul oder Core werden.

## 9. Minimaler Generator/Scaffolder

Früh wird nur die Reproduzierbarkeit bewiesen:

- Projektmanifest
- Core-Version
- aktive Module
- Grundstruktur
- CI
- Environment-Schema
- deterministische Verify-Schritte

Noch kein vollständiger Provisioner für alle Cloud-Ressourcen.

## 10. Zweite deutlich unterschiedliche Pilot-App

Eine zweite reale App mit anderem Fachprofil prüft, welche Muster tatsächlich wiederverwendbar sind. Erst danach werden weitere Bereiche wie Workflow, Assets, Reporting, Custom Fields, Search oder hierarchische Konfiguration verallgemeinert.

## Bewusst nicht vorziehen

Ohne konkreten Bedarf werden vorerst nicht als allgemeine Plattform gebaut:

- universelle Provider-Abstraktionen für DB/Hosting/Queue/Cron/Realtime/Deployment
- generische Saga Engine
- allgemeine Offline-Synchronisationsengine
- allgemeine Policy-/ABAC-DSL
- Realtime/Presence als Default
- universelle Workflow Engine
- SLA Engine
- globale Suche
- generisches Reporting
- umfassende Control Plane
- komplexe Licensing Engine
- Modul-Marktplatz
- universelle Custom-Fields-/No-Code-Plattform

## Arbeitsregel

Ein Meilenstein ist technisch erst abgeschlossen, wenn sein Zustand auf GitHub verifizierbar ist. Lokale Agentenmeldungen oder lokale Commits reichen nicht aus.
