# AppBasis – verbindliche Entwicklungsregeln

Diese Regeln gelten für menschliche Entwickler, ChatGPT und Codex.

## Operativer Arbeitsstart

- Vor jeder Änderung, Weiterentwicklung oder Merge-Entscheidung zuerst die **aktive Priorität am Anfang** von `CURRENT-GATE.md` lesen. Historische Abschnitte der langen Datei nur bei tatsächlicher Relevanz gezielt öffnen; nicht pauschal die gesamte Historie in den Agentenkontext laden.
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

## Ressourcenschonende Plus-Entwicklung (ULC Linz)

- Verbindlicher Ablauf: **ein nutzbarer Vertical Slice pro Paket** mit konkreter Definition of Done; Umsetzung in einem Arbeitsauftrag, zielgerichtete lokale Tests, maximal ein gebündelter PR, CI und risikobasiertes finales Review. Keine Mikro-PRs oder Wiederholung bereits dokumentierter PASS-Gates ohne Änderung am betroffenen Pfad.
- **Vor Agentenlauf**: aktive Priorität aus `CURRENT-GATE.md`, betroffene Verträge und exakte Dateien/Tests angeben; Logs und große Dateien nur bedarfsweise ausschnittsweise lesen. Keine parallelen Codex-/Work-Aufträge zum selben Problem.
- Für Routinearbeit ein verfügbares ressourcenschonendes Codex-Modell wählen; stärkste Reasoning-Modelle nur für Architektur, schwierige Root-Causes oder sicherheitskritische Entscheidungen. Kein erzwungenes Modell-Upgrade.
- **Codex-Code-Review einmal pro fachlichem PR im finalen Stand**, wenn Code, Berechtigungen, Migrationen, Persistenz, Datenschutz oder Provider-Verbindungen geändert werden. Re-Review nur bei wesentlichen Korrekturen; reine Dokumentationsänderungen benötigen keinen Codex-Review. Mechanische Stilfragen bleiben in CI.
- **Zwei verbindliche Review-Fragen für ULC**: (1) Kann die Änderung bestehende mobile Anmeldung/Anwesenheit, Autosave, Rechte oder gespeicherte Trainingsdaten unbemerkt verändern? (2) Prüfen Backup-, Restore-, Datenbank- und Deploypfade den konkreten Quell-Branch, Datenbanknamen, Ziel-Endpunkt und den Freigabe-Scope vor einer mutierenden Aktion? Nur belegte Finding-Linien, keine Spekulationen.
- **Work nur für einen konkreten UI-/Provider-Mehrschritt**, wenn GitHub-API, Codex oder bestehende Actions diesen nicht bereits leisten. Work ersetzt keinen CI-Nachweis; kein dauerhafter Parallelagent, keine stündlichen KI-Schleifen.
- **Budgetbremse**: vor größeren Codex-/Work-Aufträgen Restbudget in `Settings → Usage` prüfen. Bei niedrigem 5-Stunden- oder Wochenkontingent zuerst lokale/offline Prüfungen und vorhandene GitHub-CI nutzen; keine kostenpflichtigen Credits, API-Abrechnung, Modell-/Plan-Upgrades oder zusätzlichen Dienstleister ohne gesonderte Zustimmung.
- **Re-Run-Regel**: pro FAIL zuerst vollständige Fehlerursache und voraussehbare Folgefehler bündeln, dann gezielte lokale Prüfung. Keine blinden Wiederholungen. Wenn ein zweiter externer Lauf aus derselben Fehlerklasse scheitert, stoppen und Ursache/Prüfstrategie überarbeiten.
- Keine autonomen Merges, produktiven Deployments, Datenbankmutationen, Löschungen, Secret-Änderungen, Retention-Löschungen oder kostenpflichtigen Provideraktionen ohne spezifische Betreiberfreigabe.
- Fortschritt und Abnahme: **ein** kompakter Bericht pro Paket mit PR-/SHA, CI-/Review-PASS/FAIL, veränderten Funktionen, Restrisiko und maximal einer echten Freigabeentscheidung. Weitere Details stehen im [ULC-Linz-Plus-Delivery-Plan](docs/ULC-LINZ-PLUS-DELIVERY.md).
