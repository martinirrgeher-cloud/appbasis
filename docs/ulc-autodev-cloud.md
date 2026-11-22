# ULC Linz – Handy-First-Entwicklung mit Codex Cloud (ohne PC)

**Standardweg ab 11.11.2026.** Der bisherige Windows-Runner ist nur eine optionale Alternative. Für den regulären Betrieb ist kein eigener Rechner erforderlich.

## Tatsächlicher Leistungsumfang

- Codex Cloud kann mit einem bestehenden ChatGPT-Abo auf OpenAI-Rechnern entwickeln. Es nutzt das für das Konto verfügbare Codex-Kontingent; keine OpenAI-API-Schlüssel oder Windows-Skripte erforderlich.
- GitHub übernimmt Aufgabenarchiv, Branch-/Draft-PR-Verwaltung und die im Repository vorhandenen automatischen CI-Prüfungen.
- Neue Codex-Cloud-Aufträge **müssen aktuell bewusst angestoßen werden** (Handy oder Web). Ein GitHub-Issue bzw. Label startet nicht automatisch eine neue Cloud-Aufgabe. Weder ein unbeaufsichtigter 24/7-Folgeagent noch ein automatischer Codex-Start über GitHub Actions ist in dieser kostenlosen Variante eingerichtet.
- GitHub Actions mit der offiziellen Codex Action verwendet normalerweise einen separat abgerechneten API-Schlüssel. **Keine** persönliche ChatGPT-/Codex-Login-Datei oder Zugangstoken als GitHub-Secret hinterlegen; ein Plus-Abo ersetzt diese API-Abrechnung nicht.
- Kein Merge, Preview-/Produktionsdeployment, Datenbank-/Schema-Write oder Echtdatenzugriff ohne getrennte Betreiberfreigabe.

## Einmalige Einrichtung – auch über das Handy möglich

1. Im Browser des Telefons https://chatgpt.com/ öffnen und **Codex / Work in > Cloud** wählen. Wenn die mobile Ansicht den Menüpunkt für die Einrichtung nicht zeigt, im mobilen Browser die Desktopwebsite aufrufen. Gegebenenfalls Konto/Workspace auf die verfügbare Codex-Cloud-Berechtigung prüfen.
2. **Cloud-Umgebung erstellen** und GitHub-Konto verbinden. Repository `martinirrgeher-cloud/appbasis` auswählen. Eine veröffentlichte Umgebung kann danach über die ChatGPT-App am Handy genutzt werden. Alternativ im Standard-Cloud-Environment während einer Aufgabe das verbundene Repository auschecken lassen, sofern verfügbar.
3. Für das Repository Node.js **24.19.0** und pnpm **11.21.0** bereitstellen, `pnpm install --frozen-lockfile` als Setup ausführen, ohne Produktions-Zugangsdaten oder externe Provider-Secrets einzutragen.
4. Bei jeder Aufgabe zuerst `CURRENT-GATE.md`, `AGENTS.md`, den **aktuellen GitHub-Live-Stand** und [Issue #530](https://github.com/martinirrgeher-cloud/appbasis/issues/530) lesen. Bestehende PRs und erledigte Tests nicht nochmals implementieren.
5. Berechtigungen zum Öffnen von Draft-PRs in Codex Cloud kontrollieren. Bei fehlender Berechtigung sind die Änderungen im Codex-Workspace zu prüfen; keine GitHub-Freigaben umgehen.

Offizielle Hinweise: https://learn.chatgpt.com/docs/environments/cloud-environments und https://help.openai.com/en/articles/11369540-using-codex-with-your-chatgpt-plan

## Täglicher Ablauf komplett am Handy

1. In GitHub ein ULC-Arbeitspaket mit der Vorlage **ULC Cloud – Entwicklungspaket** anlegen. Ein größeres, zusammenhängendes vertikales Paket mit genau beschriebenem Ergebnis und Tests bevorzugen. Kein unbeschränktes Backlog auf einmal.
2. In ChatGPT **Codex → Cloud → veröffentlichte AppBasis-Umgebung** öffnen und folgenden Startauftrag ausgeben (Issue-Nummer einsetzen):

```text
Bearbeite für ULC Linz das GitHub-Issue #<NUMMER> aus
martinirrgeher-cloud/appbasis als zusammenhängendes Entwicklungspaket.

Verbindliche Reihenfolge:
1. CURRENT-GATE.md, AGENTS.md, Issue #530 sowie aktuellen PR-/CI-/Branchstand
   live prüfen; keine bereits abgeschlossenen Funktionen nochmals entwickeln.
2. Scope, Abnahmekriterien und betroffene Abhängigkeiten prüfen.
   Sicherheits-, Datenbank-, Schema-, Core- oder Berechtigungsänderungen nur
   nach expliziter gesonderter Freigabe; sonst BLOCKED melden.
3. Auf einem eigenen Branch implementieren, risikobasiert testen, Fehler und
   nachgelagerte Vertragsverletzungen vor einem neuen CI-Lauf korrigieren.
4. Nur einen zusammenhängenden Draft-PR erstellen; keine Merges, Deployments,
   Provider-Writes, produktiven Migrationen, Datenlöschungen oder Geheimnisse.
5. Im Draft-PR und in Issue #530 Ergebnis, Tests, PR/Head-SHA,
   CI-Status, Risiken und konkrete mobile Abnahmeschritte dokumentieren.
Bei fehlendem Zugriff oder Nutzungslimit stoppen und den Blocker berichten.
```

3. Codex den vollständigen Auftrag ausarbeiten lassen; du kannst die App schließen. Danach Änderungen, Testnachweise und Draft-PR auf dem Handy prüfen. **Ein neuer Codex-Auftrag startet nicht selbstständig nach Ende dieses Auftrags.**
4. Die bestehende GitHub-CI testet den Draft-PR automatisch. Bei FAIL im **gleichen Cloud-Auftrag** gezielt nachbessern lassen, statt einzelne Mikro-PRs zu erzeugen.
5. Mobile Abnahme: UI/Preview **nur nach gesonderter Freigabe** aktualisieren, Test durchführen und anschließend ausdrücklich Merge oder Korrektur entscheiden.

## Qualitätsregeln und Abnahmekriterien

- App-Scope standardmäßig `apps/ulc-linz/`. Keine stillen Änderungen an AppBasis-Core oder fremden Modulen.
- Mobile First; getestete Funktionen nicht überschreiben. Konflikte mit bestehenden Entscheidungen vor einer Änderung melden.
- Mindestens `pnpm --filter @appbasis/app-ulc-linz typecheck` sowie passende App-Tests durchführen. Bestehende GitHub-PR-CI ist das verbindliche Remote-Gate, kein lokaler Test allein.
- Draft-PR muss klare PASS/FAIL-/BLOCKED-Angaben und eine mobile Testanleitung enthalten. Kein automatischer Merge/Deploy.
- Ein Task gilt nicht wegen CI allein als fachlich abgenommen.
- Dieser Ablauf benötigt keinen API-Key. Die vorhandenen Cloud- und GitHub-Kontingente gelten; Codex-Cloud-Verfügbarkeit hängt vom Konto und Workspace ab.

## Grenzen und Ausbaustufe

Für einen wirklich selbststartenden Nachtlauf ohne PC und ohne API-Billing gibt es hier derzeit **keinen nachgewiesenen, unterstützten Codex-Cloud-Dispatch durch GitHub Actions**. Bis zur gesonderten Prüfung bleibt die Auftragsauslösung manuell auf dem Handy. Geplante ChatGPT-Work-Aufgaben können PRs überwachen oder zusammenfassen, sind aber nicht automatisch ein garantiertes Codex-Cloud-Ausführungssystem.

Der Windows-Runner unter `tooling/ulc-autodev.mjs` bleibt ein optionaler lokaler Pilot; er wird nicht für die Cloud-Version installiert, gestartet oder auf GitHub-Runnern verwendet.
