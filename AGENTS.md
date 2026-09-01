# AppBasis – verbindliche Entwicklungsregeln

Diese Regeln gelten für menschliche Entwickler, ChatGPT und Codex.

## Operativer Arbeitsstart

- Vor jeder Änderung, Weiterentwicklung oder Merge-Entscheidung muss zuerst `CURRENT-GATE.md` gelesen werden.
- Danach wird `AGENTS.md` als verbindliche Entwicklungsregel gelesen.
- Anschließend wird der GitHub-Live-State vollständig geprüft; volatile PR-, CI-, Review-, Branch- und Freeze-Zustände werden ausschließlich live aus GitHub abgeleitet und nicht dauerhaft in Projektdateien repliziert.
- Arbeit ist auf den in `CURRENT-GATE.md` definierten Gate-Scope und den unmittelbar folgenden Produkt-Vertical-Slice begrenzt.

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

### Folgeprüfung und Schleifenvermeidung

- Jede Änderung wird vor einer finalen Review-Anforderung nicht nur auf den unmittelbar behobenen Fehler, sondern auf ihre Folgekonsequenzen entlang des tatsächlichen Ausführungspfads geprüft.
- Geänderte Werte und Verträge werden mindestens durch angrenzende Parser, Validatoren, Auth-/Permission-Verträge, Datenbank-Constraints, Runtime-Grenzen und nachgelagerte Workflow-Gates verfolgt, soweit sie vom geänderten Pfad erreicht werden können.
- Vor Codex muss die ChatGPT-Prüfung ausdrücklich beantworten: Ist der aktuelle Fehler behoben? Welche nachgelagerten Schritte werden dadurch erstmals erreichbar? Welche offensichtlichen Folgefehler oder Vertragsverletzungen können dort entstehen? Welche davon lassen sich bereits read-only oder automatisiert prüfen?
- Nach einem fehlgeschlagenen Workflow wird nicht nur die erste rote Stelle analysiert. Soweit sicher möglich, werden auch die nachfolgenden Workflow-Schritte und angrenzenden Verträge auf wahrscheinliche nächste Blocker geprüft, bevor ein neuer Lauf gestartet wird.
- Ein „ein Fehler → ein Minimalfix → sofort nächster Lauf“-Vorgehen ist zu vermeiden, wenn eine breitere sichere Folgeprüfung möglich ist.
- Wiederholt auftretende vermeidbare Fehler derselben Art gelten als Prozessfinding. Dann muss zuerst die Prüfcheckliste oder die ausführbare Absicherung verbessert werden, bevor derselbe Arbeitsmodus fortgesetzt wird.
- Diese Folgeprüfung ist dauerhafter Bestandteil des AppBasis-Arbeitsmodus und gilt auch nach Chatwechseln oder Übergaben.

### Senior-Engineering- und Delivery-Modus

- ChatGPT arbeitet in AppBasis gleichzeitig als Senior-Programmierer und Senior-Projektleiter: technische Korrektheit und messbarer Fortschritt sind gleichrangige Ziele.
- Vor jeder Implementierung wird das kleinste sinnvolle Arbeitspaket mit klarem Ziel, betroffenen Verträgen, Abnahmekriterien und dem nächsten Gate festgelegt; unnötige Nebenbaustellen werden nicht eröffnet.
- Änderungen werden nicht nur syntaktisch oder lokal geprüft. Erwartete Eingaben, erlaubte Wertebereiche, Fehlerpfade, Seiteneffekte, Persistenz, Berechtigungen und nachgelagerte Verbraucher werden vor dem nächsten externen Lauf mitgedacht.
- Naheliegende Folgefehler, die sich ohne riskante externe Aktion erkennen lassen, werden gebündelt vor dem nächsten CI-/Evidence-/Codex-Lauf gesucht und behoben.
- CI, Evidence und Codex sind Bestätigungs-Gates und keine primären Debugger. Ein externer Lauf wird erst gestartet, wenn die interne statische, vertragliche und Folgepfad-Prüfung ausgeschöpft ist.
- Ein roter Lauf führt zu einer Root-Cause-Analyse plus Folgepfad-Analyse. Vor einem Re-Run wird geprüft, ob derselbe Fix weitere erstmals erreichbare Fehlerstellen freilegt.
- Projektleitung bedeutet aktives Durchsatzmanagement: blockierte Stränge werden nicht passiv beobachtet, wenn ein klar getrennter zweiter Strang oder Vorbereitungsstrang sicher weiterarbeiten kann.
- Fortschritt wird an abgeschlossenen Gates und nutzbaren Vertical Slices gemessen, nicht an Anzahl von Commits, PRs oder Reviews. Mikro-PRs ohne eigenständigen Nutzen werden vermieden.
- Wenn eine vermeidbare Schleife auf einen unzureichenden Prüfprozess zurückgeht, wird nicht nur der Codefehler behoben, sondern auch die Prüfabsicherung so angepasst, dass derselbe Fehlertyp künftig früher auffällt.
- Diese Arbeitsweise gilt dauerhaft und ausdrücklich auch nach Chatwechseln, Handoffs und längeren Unterbrechungen.

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
