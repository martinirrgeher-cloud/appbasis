# AppFactory – Lifecycle Acceptance Matrix

Stand: 2026-08-18

## Zweck

Diese Matrix beschreibt die benutzerverständliche Lifecycle-Semantik, die AppFactory für den wiederholbaren Self-Service-Pfad sichtbar machen soll. Sie ist eine **Acceptance-Spezifikation für die Oberfläche**, kein neuer Readiness-Evaluator und keine zusätzliche Plattformschicht.

Verbindliche Grenzen:

- Preview und Produktion bleiben getrennte Lebenszyklen.
- Bestehende Preview-, M5- und M6-Verträge bleiben die fachlichen Wahrheitsquellen.
- Ein fehlender, widersprüchlicher oder nicht vertrauenswürdig gebundener Nachweis führt fail-closed zu `offen`/`gesperrt`.
- Eine technische Readiness darf keine Produktionsfreigabe automatisch autorisieren.
- Eine Produktionsfreigabe erfordert weiterhin eine separate ausdrückliche Nutzerfreigabe.
- Provider-IDs, Datenbankadressen, Connection Strings und Secretwerte gehören nicht in die normale Factory-UI.
- Diese Matrix erzeugt weder Providerwrites noch Deployment-, Migrations- oder Release-Aktionen.

## Ziel-Lifecycle aus FC1

Der vollständige FC1-Zielzustand unterscheidet mindestens:

1. Repository erzeugt
2. Preview vorbereitet
3. Preview deployed
4. Preview geprüft
5. Production Ready
6. Produktion freigegeben

Der aktuelle UI-Slice aus #166 fasst die Preview-Phase noch kompakter zusammen. Das ist als Zwischenschritt zulässig; für FC1 muss die Oberfläche die drei Preview-Zustände später unterscheidbar machen, ohne einen zweiten Lifecycle-Vertrag zu erfinden.

## Wichtiger Terminologie-/Gate-Befund

Die aktuellen Projektquellen verwenden **`Production Ready` in zwei unterschiedlich breiten Bedeutungen**:

1. Der Meilenstein **M5 – Production Security & Privacy Ready v0.1** setzt sein internes Gate auf `Production Ready = false`, sobald eines seiner zwölf Security-/Privacy-Kriterien fehlt. Der aktuelle Repository-Pfad verwendet dafür ebenfalls das Feld `productionReady`.
2. Die spätere Roadmap-Definition **„Production Ready v0.1“** ist breiter: zusätzlich zu Factory Ready verlangt sie Backup/DR, realen Restore, M5 Security/Privacy, getrennte Produktionsdatenbank und Produktions-Worker, kontrollierte Domain und Migrationen, ausdrückliche Freigabe sowie grünen Post-Deploy-Smoke.
3. FC1 führt gleichzeitig **Production Ready** und **Produktion freigegeben** als zwei getrennte Lifecycle-Zustände.

Damit ist die derzeitige #166-Bezeichnung `Production Ready` für den engeren M5-Status **noch keine belastbare finale FC1-Semantik**. Diese Datei entscheidet den Widerspruch nicht still.

### Sichere Empfehlung für die spätere Sol-Entscheidung

Bis die Terminologie verbindlich geklärt ist:

- den engeren M5-Zustand fachlich als **Security & Privacy Ready** behandeln,
- `Production Ready` im Lifecycle für den vollständigen, kanonisch definierten Pre-Release-Zustand reservieren,
- `Produktion freigegeben` erst nach dem separaten Release-Gate darstellen,
- ausdrücklich klären, welche der in der Roadmap genannten „ausdrücklichen Freigaben“ Voraussetzung für Production Ready ist und welche die eigentliche Release-Autorisierung darstellt.

Wenn diese Grundsatzsemantik geändert oder präzisiert wird, muss zuerst das Entscheidungsregister und danach die Betriebsakte/Roadmap konsistent aktualisiert werden. Erst danach darf die UI sie als endgültigen Vertrag festschreiben.

## Acceptance-Matrix

| Zustand | Darf als erreicht erscheinen, wenn | „Was fehlt noch?“ | Nächster sicherer Schritt | Nicht zulässig |
|---|---|---|---|---|
| **Repository erzeugt** | kanonischer Generator-/Repositoryvertrag für die App erfolgreich vorliegt | fehlende/ungültige Repository- oder Manifestbestandteile | Repository-/Generatorstatus klären bzw. fehlende zulässige Konfiguration vervollständigen | aus Repository-Erfolg ein Preview- oder Production-Ergebnis ableiten |
| **Preview vorbereitet** | Preview-Voraussetzungen, erwartete Runtime-/Package-/DB-Manifest-Verträge und notwendige Preview-Konfiguration vollständig vorbereitet sind | konkrete fehlende Preview-Voraussetzungen in benutzerverständlicher Form | Preview-Deployment vorbereiten bzw. freigeben | „deployed“ anzeigen, solange keine echte Deployment-Evidence vorliegt |
| **Preview deployed** | die vorgesehene Preview tatsächlich bereitgestellt und an die getrennte Preview-/Test-Infrastruktur gebunden ist | fehlende Deployment-/Binding-/Health-Evidence | Preview prüfen | Preview-Deployment als Production-Deployment umetikettieren |
| **Preview geprüft** | die reale Preview mit den vorgesehenen Tests/Smokes geprüft und ausdrücklich akzeptiert ist | fehlende oder fehlgeschlagene Preview-Prüfungen | offene Readiness-Gates bearbeiten | aus erfolgreicher Preview automatisch Security/Privacy Ready, Production Ready oder Release ableiten |
| **Security & Privacy Ready (M5, Detailgate)** | alle kanonischen M5-Kriterien auf realer, gültiger Evidence erfüllt sind | ausschließlich die vom kanonischen M5-Gate als offen gemeldeten Punkte | verbleibende technische Production-Readiness-Voraussetzungen bearbeiten | den M5-Status allein als endgültiges FC1-`Production Ready` ausgeben, solange die Terminologie nicht geklärt ist |
| **Production Ready (FC1-Ziel, Semantik zu finalisieren)** | der künftig verbindlich definierte vollständige Pre-Release-Vertrag erfüllt ist; mindestens dürfen keine noch erforderlichen Preview-, Security/Privacy-, Recovery-, Ressourcen-, Migrations-, Deployment- oder Smoke-Gates offen sein | alle vom kanonischen Gesamtvertrag noch offenen Voraussetzungen | bei vollständiger technischer Readiness nur noch den ausdrücklich definierten Freigabe-/Release-Schritt anbieten | aus M5 allein oder aus Teil-M6-Evidence Production Ready ableiten; Release automatisch autorisieren |
| **Produktion freigegeben** | der vollständige technische Vertrag erfüllt ist **und** das separate Release-Gate die ausdrückliche Produktionsfreigabe erhalten hat | offene technische Nachweise bzw. fehlende Release-Autorisierung | bei fehlender Evidence: Nachweis klären; bei vollständiger Evidence: ausdrückliche Release-Freigabe einholen | aus vollständiger technischer Evidence automatisch freigeben oder einen ungesicherten Produktionsbutton aktivieren |

## Anzeige „Was fehlt noch?“

Die Oberfläche soll fehlende Punkte aus den bestehenden kanonischen Verträgen ableiten und für den Nutzer verständlich übersetzen.

Pflichtverhalten:

- keine parallele zweite M5-/M6-Kriterienliste pflegen,
- keine erfundenen Success-Zustände,
- keine Provideridentitäten oder internen Bindingdaten als Ersatz für verständliche Kriterien anzeigen,
- mehrere offene Punkte vollständig und deterministisch anzeigen,
- bei nicht validierbarer Evidence lieber `Status klären` als einen teilweise erfolgreichen Zustand behaupten,
- M5 und die umfassendere Production-Readiness nicht unter demselben Label zusammenfallen lassen, bevor der Vertragskonflikt geklärt ist.

## Nächster sicherer Schritt

Es darf immer nur ein Schritt empfohlen werden, der aus dem **letzten sicher bestätigten Zustand** folgt.

Priorität:

1. inkonsistenten/ungültigen Status klären,
2. Repository-Voraussetzungen schließen,
3. Preview vorbereiten,
4. Preview deployen,
5. Preview prüfen,
6. offene M5 Security-/Privacy-Kriterien schließen,
7. verbleibende Recovery-/Produktionsressourcen-/Migrations-/Deployment-/Smoke-Gates schließen,
8. erst bei vollständig geklärter technischer Readiness die definierte ausdrückliche Release-Freigabe einholen.

Ein empfohlener nächster Schritt ist **keine Ausführungsautorisierung**. Externe oder produktive Writes bleiben separat freigabepflichtig.

## Fail-closed-/Fehlerzustände

### Inkonsistente Preview-Evidence

Beispiele:

- Status behauptet „bereit“, aber erforderlicher Runtime-/Manifestnachweis fehlt.
- Preview wird als deployed gemeldet, obwohl keine bindbare Deployment-Evidence existiert.
- Preview wird als geprüft gemeldet, obwohl die vorgesehenen Prüfungen nicht erfolgreich nachgewiesen sind.

Erwartung:

- betroffener Zustand bleibt offen,
- nachfolgende Zustände bleiben gesperrt,
- UI zeigt `Preview-Status klären` oder gleichwertig,
- keine schreibende Aktion wird dadurch freigeschaltet.

### M5/M6-Widerspruch

Beispiel: M6 behauptet Security/Privacy bereit, während der kanonische M5-Status nicht erfüllt ist.

Erwartung:

- Production Ready/Release bleibt gesperrt,
- UI zeigt `Freigabe-Status klären` oder gleichwertig,
- der Widerspruch darf nicht schöngerechnet werden.

### Vollständige technische Evidence ohne Release-Freigabe

Erwartung:

- technische Readiness kann als vollständig erscheinen, sobald der dafür kanonisch definierte Vertrag erfüllt ist,
- Lifecycle bleibt vor `Produktion freigegeben`, solange das separate Release-Gate keine ausdrückliche Nutzerfreigabe besitzt,
- nächster sicherer Schritt lautet sinngemäß `Ausdrückliche Produktionsfreigabe erforderlich`,
- kein Auto-Release.

## Acceptance-Szenarien für die spätere FC1-Umsetzung

1. Repository vollständig, Preview noch nicht vorbereitet → genau `Preview vorbereiten` ist der nächste sichere Schritt.
2. Preview vorbereitet, aber nicht deployed → `Preview deployen`; spätere Readiness bleibt gesperrt.
3. Preview deployed, aber nicht geprüft → `Preview prüfen`; spätere Readiness bleibt gesperrt.
4. Preview geprüft, M5 11/12 → exakt das fehlende M5-Kriterium bleibt sichtbar; M5 Security & Privacy Ready ist false.
5. M5 12/12, weitere technische Production-Gates offen → M5 ist erfüllt, **volles Production Ready bleibt offen**.
6. Alle kanonischen technischen Pre-Release-Gates erfüllt, keine separate Release-Autorisierung → keine Produktionsfreigabe, kein Auto-Release.
7. Widersprüchliche Preview-/M5-/M6-Evidence → fail-closed `Status klären`.
8. Unbekannte neue Pflichtkriterien → UI darf nicht still als vollständig weiterlaufen; Vertrag muss bewusst aktualisiert werden.
9. Provider-Evidence enthält interne IDs/Adressen → normale UI zeigt ausschließlich semantische, sanitizierte Readiness-Information.
10. Preview-/Production-Ressourcen sind identisch → Lifecycle darf nicht als korrekt getrennt akzeptiert werden.
11. M5-internes `productionReady=true`, aber der umfassende Roadmap-Vertrag ist noch nicht erfüllt → UI darf daraus nicht ungeprüft FC1-`Production Ready` machen.

## Abgrenzung zu #136/#166

- #136 macht die zehn bestehenden M6-Kriterien read-only sichtbar.
- #166 ergänzt als Zwischen-Slice Lifecycle-Orientierung, nächsten sicheren Schritt und eine visuelle Trennung der Gates.
- Vor der finalen #166-/FC1-Integration muss die oben beschriebene `Production Ready`-Terminologie geklärt werden.
- Diese Matrix verlangt nicht, dass #166 auf seinem aktuellen Zwischenhead bereits die komplette Preview-Unterteilung materialisiert.
- Vor jeder späteren Umsetzung ist der dann aktuelle Snapshot-/Readiness-Vertrag live zu prüfen; diese Datei ist keine Ersatzquelle für Codeverträge.
