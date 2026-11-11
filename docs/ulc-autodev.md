# ULC Linz – lokaler Entwicklungsagent (Pilot ohne zusätzliche API-Kosten)

## Was tatsächlich automatisiert ist

Ein **Windows-Rechner, der eingeschaltet bleibt**, führt den lokalen Codex CLI mit **ChatGPT-Anmeldung** aus (verbrauchte Codex-Kontingente richten sich nach dem ChatGPT-Abo). Der Runner holt explizit freigegebene GitHub-Issues ab, arbeitet je Issue in einem **frischen, isolierten Git-Clone**, führt lokale Tests durch, erstellt einen **Draft-PR**, wartet auf die bestehende GitHub-CI und versucht höchstens **zwei** gezielte CI-Korrekturen. Im Dauerlauf wird anschließend das nächste freigegebene Issue abgearbeitet. Keine zusätzliche kostenpflichtige API notwendig.

**Wichtige Grenze:** Das ist kein selbstständig in ChatGPT laufender Cloud-Agent. Ist der Windows-Rechner ausgeschaltet, im Standby, nicht angemeldet, ohne Internet oder das Plus-Codex-Limit erreicht, findet keine weitere Entwicklung statt. Strom-/Netzkosten und eventuelle Überschreitungen fremder Freikontingente sind nicht umfasst. GitHub Actions werden für das öffentliche Repository im Rahmen der GitHub-Bedingungen genutzt.

## Installation (einmalig)

1. Auf einem vertrauenswürdigen **eigenen Windows-Rechner** Git, GitHub CLI (`gh`), Node.js **24.19.x**, `pnpm` **11.21.0** und OpenAI Codex CLI installieren. Beispielsweise `npm install -g pnpm@11.21.0 @openai/codex` nach der Node-Installation. Die offiziellen CLI-Dokumente beschreiben die aktuelle Installation.
2. `gh auth login` (dein GitHub-Account mit Schreibberechtigung für `martinirrgeher-cloud/appbasis`). Für `gh auth setup-git` wird eine lokale Git-Credential-Integration eingerichtet. GitHub-Token **nicht** in Repo, GitHub Actions oder ChatGPT-Nachrichten kopieren.
3. `codex login` und **Sign in with ChatGPT** wählen; **keinen API-Key** nutzen. `codex login status` muss ausdrücklich ChatGPT anzeigen. Die lokalen Codex-Anmeldedaten niemals weitergeben oder committen.
4. Diesen PR nach Prüfung freigeben/mergen oder die Pilotdateien lokal in eine bestehende AppBasis-Arbeitskopie legen. Im Repository-Stammverzeichnis:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\ULC-AGENT-EINRICHTEN.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File .\ULC-AGENT-STARTEN.ps1 -DryRun
powershell -NoProfile -ExecutionPolicy Bypass -File .\ULC-AGENT-STARTEN.ps1
```

Optional Autostart **nur bei eigener Windows-Anmeldung**:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\ULC-AGENT-AUTOSTART.ps1
```

Autostart entfernen: `powershell -File .\ULC-AGENT-AUTOSTART.ps1 -Entfernen`. Den laufenden Dauerprozess mit **Strg+C** beenden. Lokaler Status und Diagnoselogs liegen unter `%LOCALAPPDATA%\ULC-Autodev` (nicht im Git-Repository).

## Arbeitspaket in GitHub anlegen

Nur vom Repository-Owner `martinirrgeher-cloud` erstellte, offene Issues mit dem Label **`ulc-agent-ready`** werden verarbeitet. Beispielsweise:

**Titel:** `ULC N16 – konkrete UI-Regression absichern`

**Inhalt:**

```markdown
## Ziel
[Konkretes Nutzerproblem und erwartetes Verhalten]

## Scope
Nur apps/ulc-linz/, keine Datenbank-/Schema-/Berechtigungs-/Deploymentänderungen.

## Abnahme
- Vorhandene Funktion bleibt erhalten.
- Passender Test wird ergänzt.
- Typecheck und Unit-Tests bestehen.
- Draft-PR mit CI-PASS, danach gezielter Handybefund.
```

Du gibst den Auftrag frei, indem du **`ulc-agent-ready`** setzt. Nur dann arbeitet der lokale Runner. Mehrere vorbereitete Issues werden nacheinander abgearbeitet. Es gibt absichtlich **keine** generelle automatische Übernahme aller offenen Issues.

## Kontrollierbarer Ablauf

1. `ready` → `running`: Runner reserviert das nächste freigegebene Issue. Nur ein lokaler Prozess zur Zeit.
2. Frischer Branch aus `main`; Codex arbeitet nur lokal. Feste Scope- und Secret-Grenzen. Veränderungen außerhalb `apps/ulc-linz/` oder an Konfiguration/Schema/Deploy-Dateien werden vor Push **abgebrochen**.
3. `pnpm install --frozen-lockfile`, ULC-Typecheck, Unit-Tests; danach **nur** Code-Push und Draft-PR.
4. Die bestehende GitHub-PR-CI startet. Der Runner wartet auf Ergebnis und führt bei nachgewiesenem CI-Fehler höchstens zwei Korrekturschleifen aus.
5. CI PASS → `ulc-agent-review`, du prüfst mobil und gibst ggf. separat Merge und Preview-Deployment frei. FAIL/unklare Situationen → `ulc-agent-blocked`.

Es gibt **keine** automatischen Merges, Deployments, Datenbankänderungen, Live-Tests oder Permission-Änderungen. Die laufende ULC-Preview unter `appbasis-ulc-linz.martin-irrgeher.workers.dev` wird nicht verändert. Bei blockierten Sicherheits-/Schema-Abhängigkeiten stoppt der Agent. Bestehende GitHub-Vorgaben `AGENTS.md` und `CURRENT-GATE.md` bleiben verbindlich.

## Sicherheit und Einschränkungen

- `codex exec --sandbox workspace-write --ask-for-approval never`; niemals `--yolo` oder `danger-full-access`.
- Der Codex-Prozess bekommt keine GitHub-/Provider-Token aus Umgebungsvariablen. **Die GitHub-Anmeldung liegt jedoch auf demselben Rechner**; die Dateisystem- und Netzwerkisolation von Codex kann je nach Windows-/Sandbox-Konfiguration Grenzen haben. Daher nur auf einem **vertrauenswürdigen Entwicklungsrechner**, möglichst mit separatem eingeschränkten Benutzerkonto und ohne Provider-/Produktionsgeheimnisse ausführen. Kein Zugriff auf produktive Daten.
- Repo-/Issue-Texte sind untrusted input. Der Runner akzeptiert nur vom Repo-Owner explizit markierte Issues und Änderungen im festgelegten App-Pfad. Das ersetzt **kein Code-Review**.
- Keine garantierte unbegrenzte Codex-Nutzung: Abolimits können einen Lauf blockieren. Der Runner stoppt dann den Auftrag anstatt auf einen zahlungspflichtigen API-Key auszuweichen.
- CI-Tests laufen im bestehenden Repo und können viel Zeit benötigen; bei technischen Blockaden erhältst du einen Issue-Kommentar mit dem Grund.
- **Noch nicht live aktiviert:** Dieses Pilotpaket ist erst nach Review, Installation und einem kontrollierten Test einsatzbereit.
