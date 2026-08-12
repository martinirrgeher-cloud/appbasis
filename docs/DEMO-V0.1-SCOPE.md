# AppBasis Demo v0.1 – Parallel Slice

## Ziel

Diese Arbeitsbranch bereitet den sichtbaren Teil des ersten AppBasis-Prototyps parallel zu Phase 2A/2B vor. Sie darf das Identity-/Persistenz-Fundament nicht duplizieren oder verändern.

## In Scope

- mobile-first App-Shell für `apps/reference`
- Dashboard-Grundlayout und Navigation
- kleines neutrales Tasks-Vertical-Slice unter `modules/tasks`
- Aufgabenliste, Aufgabe anlegen, Status offen/erledigt, einfache Detailansicht
- klare Modulgrenze zwischen UI und Task-Domain
- lokale/in-memory Demo-Daten nur als temporärer Adapter, damit UI und Modul unabhängig von Phase 2B entwickelt und getestet werden können
- fokussierte Unit-/UI-Tests mit vorhandener Toolchain

## Out of Scope

- keine Änderungen an `packages/identity`
- keine Änderungen an `packages/database`
- keine Änderungen an `packages/permissions`
- keine neuen Auth-/DB-/Provider-Abstraktionen
- keine neue Persistenzschicht und keine Migrationen
- keine neuen Runtime-Abhängigkeiten, wenn mit vorhandener React/TypeScript/CSS-Toolchain lösbar
- keine Änderungen an Lockfile oder Root-Toolchain nur für diese Slice
- kein Deployment, keine Secrets, keine produktiven Ressourcen

## Integrationsregel

Nach Abschluss von Phase 2A/2B wird der temporäre Task-Adapter durch reale Persistenz und die minimalen Berechtigungen ersetzt. Die UI-/Domain-Grenze soll dafür bereits sauber vorbereitet sein.

## Qualitätsziel

Der Slice muss mobil gut bedienbar, fachneutral und klein bleiben. Er ist kein allgemeines Workflow-System. CI/typecheck/tests/build müssen auf dem finalen Remote-SHA grün sein.
