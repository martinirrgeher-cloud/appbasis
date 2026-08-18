# AppFactory – Lifecycle Acceptance Matrix

Stand: 2026-08-18

## Zweck

Diese Matrix beschreibt die benutzerverständliche Lifecycle-Semantik, die AppFactory für den wiederholbaren Self-Service-Pfad sichtbar machen soll. Sie ist eine **Acceptance-Spezifikation für die Oberfläche**, kein neuer Readiness-Evaluator und keine zusätzliche Plattformschicht.

Verbindliche Grenzen:

- Preview und Produktion bleiben getrennte Lebenszyklen.
- Bestehende Preview-, M5- und M6-Verträge bleiben die einzigen fachlichen Wahrheitsquellen.
- Ein fehlender, widersprüchlicher oder nicht vertrauenswürdig gebundener Nachweis führt fail-closed zu `offen`/`gesperrt`.
- `Production Ready` autorisiert **keine** Produktionsfreigabe.
- Eine Produktionsfreigabe erfordert weiterhin eine separate ausdrückliche Nutzerfreigabe.
- Provider-IDs, Datenbankadressen, Connection Strings und Secretwerte gehören nicht in die normale Factory-UI.
- Diese Matrix erzeugt weder Providerwrites noch Deployment-, Migrations- oder Release-Aktionen.

## Ziel-Lifecycle

Der vollständige FC1-Zielzustand unterscheidet mindestens:

1. Repository erzeugt
2. Preview vorbereitet
3. Preview deployed
4. Preview geprüft
5. Production Ready
6. Produktion freigegeben

Der aktuelle UI-Slice aus #166 fasst die Preview-Phase noch kompakter zusammen. Das ist als Zwischenschritt zulässig; für FC1 muss die Oberfläche die drei Preview-Zustände später unterscheidbar machen, ohne einen zweiten Lifecycle-Vertrag zu erfinden.

## Acceptance-Matrix

| Zustand | Darf als erreicht erscheinen, wenn | „Was fehlt noch?“ | Nächster sicherer Schritt | Nicht zulässig |
|---|---|---|---|---|
| **Repository erzeugt** | kanonischer Generator-/Repositoryvertrag für die App erfolgreich vorliegt | fehlende/ungültige Repository- oder Manifestbestandteile | Repository-/Generatorstatus klären bzw. fehlende zulässige Konfiguration vervollständigen | aus Repository-Erfolg ein Preview- oder Production-Ergebnis ableiten |
| **Preview vorbereitet** | Preview-Voraussetzungen, erwartete Runtime-/Package-/DB-Manifest-Verträge und notwendige Preview-Konfiguration vollständig vorbereitet sind | konkrete fehlende Preview-Voraussetzungen in benutzerverständlicher Form | Preview-Deployment vorbereiten bzw. freigeben | „deployed“ anzeigen, solange keine echte Deployment-Evidence vorliegt |
| **Preview deployed** | die vorgesehene Preview tatsächlich bereitgestellt und an die getrennte Preview-/Test-Infrastruktur gebunden ist | fehlende Deployment-/Binding-/Health-Evidence | Preview prüfen | Preview-Deployment als Production-Deployment umetikettieren |
| **Preview geprüft** | die reale Preview mit den vorgesehenen Tests/Smokes geprüft und ausdrücklich akzeptiert ist | fehlende oder fehlgeschlagene Preview-Prüfungen | offene Production-Ready-Kriterien bearbeiten | aus erfolgreicher Preview automatisch `Production Ready` ableiten |
| **Production Ready** | **alle** kanonisch erforderlichen M5-Kriterien auf realer, gültiger Evidence erfüllt sind | ausschließlich die vom kanonischen M5-Gate als offen gemeldeten Punkte | M6-Produktionsnachweise vorbereiten/erheben | einzelne offene M5-Kriterien verschweigen; Production Release automatisch autorisieren |
| **Produktion freigegeben** | M6-Voraussetzungen und reale Produktionsnachweise vollständig sind **und** eine separate ausdrückliche Produktionsfreigabe erteilt wurde | offene M6-Nachweise bzw. fehlende ausdrückliche Freigabe | bei fehlender Evidence: Nachweis klären; bei vollständiger Evidence: ausdrückliche Freigabe einholen | aus vollständiger technischer Evidence automatisch freigeben oder einen ungesicherten Produktionsbutton aktivieren |

## Anzeige „Was fehlt noch?“

Die Oberfläche soll fehlende Punkte aus den bestehenden kanonischen Verträgen ableiten und für den Nutzer verständlich übersetzen.

Pflichtverhalten:

- keine parallele zweite M5-/M6-Kriterienliste pflegen,
- keine erfundenen Success-Zustände,
- keine Provideridentitäten oder internen Bindingdaten als Ersatz für verständliche Kriterien anzeigen,
- mehrere offene Punkte vollständig und deterministisch anzeigen,
- bei nicht validierbarer Evidence lieber „Status klären“ als einen teilweise erfolgreichen Zustand behaupten.

## Nächster sicherer Schritt

Es darf immer nur ein Schritt empfohlen werden, der aus dem **letzten sicher bestätigten Zustand** folgt.

Priorität:

1. inkonsistenten/ungültigen Status klären,
2. Repository-Voraussetzungen schließen,
3. Preview vorbereiten,
4. Preview deployen,
5. Preview prüfen,
6. offene Production-Ready-Kriterien schließen,
7. reale M6-Produktionsnachweise vorbereiten/erheben,
8. ausdrückliche Produktionsfreigabe einholen.

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

Beispiel: M6 behauptet Security/Privacy bereit, während der kanonische M5-Status nicht `Production Ready` ist.

Erwartung:

- Production Release bleibt gesperrt,
- UI zeigt `Freigabe-Status klären` oder gleichwertig,
- M5 bleibt maßgeblich; der Widerspruch darf nicht schöngerechnet werden.

### Vollständige technische M6-Evidence ohne Freigabe

Erwartung:

- technischer Nachweis kann als vollständig erscheinen,
- Lifecycle bleibt vor `Produktion freigegeben`, solange keine ausdrückliche Nutzerfreigabe vorliegt,
- nächster sicherer Schritt lautet sinngemäß `Ausdrückliche Produktionsfreigabe erforderlich`,
- kein Auto-Release.

## Acceptance-Szenarien für die spätere FC1-Umsetzung

1. Repository vollständig, Preview noch nicht vorbereitet → genau `Preview vorbereiten` ist der nächste sichere Schritt.
2. Preview vorbereitet, aber nicht deployed → `Preview deployen`; Production Ready bleibt gesperrt.
3. Preview deployed, aber nicht geprüft → `Preview prüfen`; Production Ready bleibt gesperrt.
4. Preview geprüft, M5 11/12 → exakt das fehlende M5-Kriterium bleibt sichtbar; Production Ready ist false.
5. M5 12/12, M6 noch unvollständig → Production Ready erreicht; Produktion freigeben bleibt gesperrt.
6. M6 technisch vollständig, keine ausdrückliche Freigabe → keine Produktionsfreigabe, kein Auto-Release.
7. Widersprüchliche Preview-/M5-/M6-Evidence → fail-closed `Status klären`.
8. Unbekannte neue Pflichtkriterien → UI darf nicht still als vollständig weiterlaufen; Vertrag muss bewusst aktualisiert werden.
9. Provider-Evidence enthält interne IDs/Adressen → normale UI zeigt ausschließlich semantische, sanitizierte Readiness-Information.
10. Preview-/Production-Ressourcen sind identisch → Lifecycle darf nicht als korrekt getrennt akzeptiert werden.

## Abgrenzung zu #136/#166

- #136 macht die zehn bestehenden M6-Kriterien read-only sichtbar.
- #166 ergänzt als nächsten UI-Slice Lifecycle-Orientierung, „was fehlt?“/nächsten sicheren Schritt und die Trennung `Production Ready` ↔ `Produktion freigeben`.
- Diese Matrix beschreibt den **späteren FC1-Zielzustand** und verlangt nicht, dass #166 vor seiner Integration bereits die komplette Preview-Unterteilung materialisiert.
- Vor jeder späteren Umsetzung ist der dann aktuelle Snapshot-/Readiness-Vertrag live zu prüfen; diese Datei ist keine Ersatzquelle für Codeverträge.
