# AppBasis – verbindliche Entwicklungsregeln

Diese Regeln gelten für menschliche Entwickler, ChatGPT und Codex.

## Architektur

- Der Core bleibt fachneutral und bewusst klein.
- Kundenspezifische Geschäftslogik gehört niemals direkt in Core-Pakete.
- Fachmodule greifen nur über definierte öffentliche Verträge auf Core und andere Module zu.
- Eine konkrete App aktiviert nur die Fähigkeiten und Module, die sie tatsächlich benötigt.
- Definitionen/Vorlagen und laufende Prozessinstanzen werden strikt getrennt.
- Core-Updates dürfen bestehende fachliche Funktionen nicht stillschweigend verändern.
- Neue Provider-Abstraktionen entstehen nur bei belegtem Bedarf; ein zweiter realer Provider oder konkreter Wechselbedarf muss die zusätzliche Abstraktion rechtfertigen.
- Neue allgemeine Plattformfähigkeiten werden bevorzugt zuerst in vollständigen Vertical Slices bewiesen, bevor sie in Core oder Standardmodule verallgemeinert werden.
- Realtime, Workflow, Reporting, Search, Files, Notifications und ähnliche Fähigkeiten sind nicht automatisch Core-Bestandteil.

## Daten und Migrationen

- Core, jedes Modul und die konkrete Fachapp besitzen jeweils nur ihr eigenes Schema bzw. ihre eigenen Migrationen.
- Ein Modul verändert Tabellen eines anderen Moduls nicht direkt.
- Produktionsdatenbankänderungen erfolgen ausschließlich über versionierte Migrationen.
- Destruktive Schemaänderungen werden bevorzugt über Expand-Migrate-Contract durchgeführt.
- Core-/Modul-/Schema-Kompatibilität muss vor späteren Update- und Distributionsmechanismen maschinenlesbar beschrieben werden.

## Sicherheit

- Berechtigungen werden serverseitig erzwungen.
- UI-Sichtbarkeit ist niemals eine Sicherheitsgrenze.
- Permissions V1 bleibt bei Capability-IDs, Rollenbundles, individuellen Grants/Revokes und klaren Data Scopes; keine allgemeine Policy-DSL oder ABAC-Engine ohne belegten Bedarf.
- Administrative Account-Recovery benötigt eigene starke Berechtigung, Audit, Reason, Session-Revoke, kurzlebige temporäre Credentials und erzwungenen Passwortwechsel.
- Secrets und Zugangsdaten gehören niemals ins Repository.
- Kritische Änderungen brauchen Auditierbarkeit und gegebenenfalls Freigabe.

## Qualität

- Mobile First ist verbindlich.
- TypeScript wird strikt verwendet.
- Neue Funktionen erhalten risikobasierte automatisierte Tests.
- Architektur- und Qualitätsregeln sollen möglichst ausführbar geprüft werden.
- Fehlgeschlagene Pflichtprüfungen blockieren Releases.

## Technische Source of Truth und Handoff

- GitHub ist die technische Source of Truth für laufende Arbeit.
- Agentenmeldungen, lokale Commits oder lokal erfolgreiche Tests gelten nicht als Abschlussnachweis.
- Vor einem technischen Abschluss müssen Remote-SHA, PR-Zustand, CI/Required Checks, Review-SHA und blockierende Review-Findings unabhängig verifiziert werden.
- Repository-Dateien enthalten strukturellen Projektzustand und Architekturentscheidungen; volatile PR-/CI-/Review-Zustände werden nicht als dauerhafter Projektzustand repliziert.
- Routineprüfungen sollen ChatGPT/Codex/GitHub selbst übernehmen; Nutzerinteraktion bleibt echten fachlichen, sicherheitsrelevanten, kostenrelevanten oder irreversiblen Entscheidungen vorbehalten.

## Änderungen

Vor größeren Änderungen müssen Auswirkungen auf bestehende Module, Daten,
Berechtigungen, Migrationen und dokumentierte fachliche Entscheidungen geprüft
werden.

Wenn eine Änderung bestehendes Verhalten verändert oder einer vorhandenen
Entscheidung widerspricht, muss dies vor der Umsetzung ausdrücklich angezeigt
werden.
