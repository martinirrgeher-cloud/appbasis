# ULC Linz – sparsamer Lieferprozess mit ChatGPT Plus

Stand: 21.11.2026. Gilt zusammen mit `CURRENT-GATE.md` und `AGENTS.md`; diese Datei ersetzt weder Freigaben noch laufende GitHub-Evidence.

## Ziel und belegte Ausgangslage

- Bestehendes Repository `martinirrgeher-cloud/appbasis`; aktueller Fokus bleibt laut `CURRENT-GATE.md` die kontrollierte Produktivnahme der vorhandenen ULC-Module, keine neue Mini-App.
- `AGENTS.md` enthält bereits Architecture/Quality/Security-Regeln; `codex-review-notify.yml` ist bereits vorhanden und meldet Codex-Kommentare, **startet aber selbst keinen Codex-Review**.
- `ci.yml` hat zwei große Jobs (`Identity PostgreSQL E2E`, `Quality gate`) mit umfangreichen Tests. Diese bleiben für sämtliche Code-/Konfigurations-/Workflow-Änderungen Pflicht.
- Plus-/Codex-/Work-Limits werden vom Anbieter dynamisch vergeben. Es gibt **keine garantierte Zahl an Aufgaben**. Vor größeren Aufträgen `Settings → Usage` (5-Stunden- und Wochenkontingent) ansehen. ChatGPT Work und Codex teilen sich die agentische Nutzung; GitHub Actions verbrauchen GitHub-Ressourcen, nicht diese Agentenquote.

## Ein Durchlauf pro nutzbarem Paket

1. **Chat (kurz)** – GitHub `main`, relevante PRs, Issue #607/#483 und `CURRENT-GATE.md`-Kopf prüfen. Einen fachlich nutzbaren Slice mit Akzeptanztests sowie absoluten Nicht-Zielen definieren. Keine komplette historische Kontextdatei laden.
2. **Codex (gebündelt)** – genau ein implementierender Auftrag je Paket mit Dateien, bestehendem Verhalten, benötigten Tests und klaren Stop-Grenzen. Keine parallelen Codex-Aufträge zum selben Slice, keine neue Session nach jedem Fehler.
3. **Lokale/gezielte Tests** – vor dem ersten externen Lauf Fehlerpfad, Auth, Datenbanken, Randfälle und Nachfolger prüfen; nur betroffene Tests ausführen. Keine alte PASS-Abnahme wiederholen, wenn ihr Pfad unverändert blieb.
4. **Ein Draft-PR** – verständliches PR-Template ausfüllen; CI läuft automatisch einmal je finalem Code-Stand. Bei FAIL zunächst Log-Gesamtauswertung, dann gebündelte Korrektur; kein Retry-Spam.
5. **Risikobasiertes Review** – für Code/SQL/Auth/Persistenz/Deploy/Backup einmal `@codex review` auf finalem PR oder die im Codex-Projekt aktivierte Reviewfunktion. Automatische Review-pro-Push **nicht einschalten**, falls dadurch jeder Zwischenschritt erneut begutachtet wird. Bei reinem Markdown kein KI-Review nötig. Externe Codex-Review-Aktivierung muss separat in Codex/GitHub erfolgen; die vorhandene Benachrichtigung beweist noch keine Aktivierung.
6. **Eine Abnahme** – ich prüfe PR-Head-SHA, aktuelle CI/Review-Findings und melde PASS/FAIL sowie den echten Betreiberentscheid. Ohne ausdrückliche Zustimmung: kein Merge, Deploy, Datenbank-/Secret-Write, Restore-Promotion oder Löschung.

## Plus-Budgetregeln (Betriebsregeln, keine Behauptung technisch messbarer Quoten)

| Vorgang | Ressourcensparende Regel |
|---|---|
| Planung/Status | Kurzer Chat, keine zusätzliche Work-/Codex-Session |
| Implementierung | Ein Codex-Auftrag für ein sinnvolles Paket, nicht eine Anfrage pro Datei |
| Modellwahl | Verfügbares sparsameres Codex-Modell für Routine; stärkeres Reasoning nur bei schwieriger Architektur/Sicherheit |
| Codex-Review | Maximal ein finales Review pro fachlichem PR; weitere nur bei wesentlichem Fix |
| Work | Nur bei tatsächlich notwendiger Browser-/UI-Orchestrierung; keine parallele Routine |
| GitHub CI | Automatisch **volle** Qualitätssicherung für Code/Config/Workflows; nur reine Dokumentations-PRs überspringen beide großen Jobs |
| Wiederholungen | Eine gebündelte Korrekturrunde; bei wiederholtem ähnlichem FAIL zuerst Prozess/Root-Cause verbessern |
| Kontingent knapp | Agentenarbeit anhalten, bereits vorhandene Logs/CI und Chat zur Vorbereitung nutzen; kein automatischer Creditkauf |

**Keine stündlichen KI-Aufgaben**: Sie verbrauchen zusätzliche Agentenquote, selbst wenn kein fertiger Nutzen entsteht. Ergebnisse am Ende eines Pakets oder bei einem klaren Blocker abrufen. Der Betreiber arbeitet häufig mobil; die Abnahme muss im GitHub-PR sichtbar sein.

## GitHub-CI-Regel

- Der neue Job `PR scope` liest nur den Dateinamen-Umfang des PR über die GitHub-API; er hat nur PR-Leserechte.
- Nur wenn **alle** PR-Dateien `AGENTS.md`, `CURRENT-GATE.md`, `.github/PULL_REQUEST_TEMPLATE.md` oder Markdown unter `docs/` sind, werden die zwei schweren bestehenden CI-Jobs übersprungen. Für Pushes auf `main` und für **alle** anderen Dateien (Code, SQL, Manifest, Tests, Actions-Workflows, JSON, Paketmanager) gilt unverändert die volle CI.
- API-/Formatfehler lassen die Klassifizierung scheitern (**fail closed**); unbekannte/mehr als 3000 Dateien führen zu Voll-CI. Die zwei bestehenden Jobnamen bleiben stabil, damit Required-Check-Regeln nicht unbemerkt umbenannt werden.
- Dies spart GitHub-Runnerzeit, nicht unmittelbar das gemeinsame Plus-Kontingent. Die eigentliche Agentenersparnis kommt von wenigen klar zugeschnittenen Codex-/Work-Aufträgen.

## Einmalige Einrichtung außerhalb des Repositories

- Codex mit GitHub-Repository verbinden; Code Review bei Bedarf aktivieren. Empfohlen: nur PR-fertige Revisionen prüfen oder ein gezieltes `@codex review` statt Review auf jeden Push.
- Vor einem größeren Entwicklungsfenster in ChatGPT `Settings → Usage` prüfen. Hier sind die tatsächlichen Limits und Reset-Zeiten sichtbar; ohne deren Einsicht keine Kontingentgarantie oder automatische Quotensteuerung behaupten.
- Keine neue OpenAI-API-Key-Abrechnung, kein Plus-Upgrade, keine Credits, keine Work-Parallelagenten einrichten.

## Abnahmematrix für dieses Prozess-PR

- [ ] Die bestehenden Pflichtjobs laufen für Code-/SQL-/Workflow-PRs weiterhin unverändert.
- [ ] Ein rein dokumentarischer PR startet nur die kurze `PR scope`-Klassifikation; die beiden großen Jobs werden übersprungen.
- [ ] Bei Fehler in der PR-Dateiliste keine stille Einstufung als docs-only.
- [ ] Kein Codex-/Work-Auftrag, Merge, Deployment, Provider-Write oder Plan-Upgrade wurde durch diese Dokumentation automatisch gestartet.
