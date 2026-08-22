# AppFactory – Lifecycle Acceptance Matrix

Stand: 2026-08-19

## Zweck

Diese Matrix beschreibt die benutzerverständliche Lifecycle-Semantik, die AppFactory für den wiederholbaren Self-Service-Pfad sichtbar machen soll. Sie ist eine **Acceptance-Spezifikation für die Oberfläche**, kein neuer Readiness-Evaluator und keine zusätzliche Plattformschicht.

Verbindliche Grenzen:

- Preview und Produktion bleiben getrennte Lebenszyklen.
- Bestehende Preview-, M5-, M6- und Recovery-Verträge bleiben die fachlichen Wahrheitsquellen.
- Ein fehlender, widersprüchlicher oder nicht vertrauenswürdig gebundener Nachweis führt fail-closed zu `offen`/`gesperrt`.
- Technische Readiness autorisiert keine Produktionsfreigabe automatisch.
- Produktive Writes benötigen weiterhin ihre jeweilige ausdrückliche Schrittfreigabe.
- Der finale Release benötigt zusätzlich eine separate ausdrückliche Release-Freigabe.
- Provider-IDs, Datenbankadressen, Connection Strings und Secretwerte gehören nicht in die normale Factory-UI.
- Diese Matrix erzeugt weder Providerwrites noch Deployment-, Migrations- oder Release-Aktionen.

## Verbindliche Terminologie gemäß ADR-023

1. **Security & Privacy Ready** = exakt M5, alle zwölf Pflichtkriterien auf gültiger Evidence.
2. **Production Ready** = vollständiger technischer Pre-Release-Zustand der konkreten App.
3. **Produktion freigegeben** = Production Ready plus separate ausdrückliche finale Release-Freigabe und erfolgreiches Release-Gate.

Das bestehende interne M5-Feld `productionReady` darf aus Kompatibilitätsgründen zunächst bestehen bleiben, ist aber fachlich nur das M5-/Security-&-Privacy-Gate. Die UI darf daraus nicht allein den umfassenden Zustand Production Ready ableiten.

## Ziel-Lifecycle

1. Entwurf
2. Repository erzeugt
3. Preview vorbereitet
4. Preview deployed
5. Preview geprüft
6. Security & Privacy Ready
7. Production Ready
8. Produktion freigegeben

Der aktuelle UI-Zwischenslice darf Preview noch kompakter darstellen. Für FC1 müssen die drei Preview-Zustände später unterscheidbar sein, ohne einen zweiten Lifecycle-Vertrag zu erfinden.

## Acceptance-Matrix

| Zustand | Darf als erreicht erscheinen, wenn | „Was fehlt noch?“ | Nächster sicherer Schritt | Nicht zulässig |
|---|---|---|---|---|
| **Repository erzeugt** | kanonischer Generator-/Repositoryvertrag erfolgreich vorliegt | fehlende/ungültige Repository- oder Manifestbestandteile | Repository-/Generatorstatus klären | aus Repository-Erfolg Preview oder Produktion ableiten |
| **Preview vorbereitet** | Preview-Voraussetzungen, Runtime-/Package-/DB-Manifest-Verträge und notwendige Preview-Konfiguration vollständig vorbereitet sind | konkrete fehlende Preview-Voraussetzungen | Preview-Deployment vorbereiten bzw. freigeben | „deployed“ ohne reale Deployment-Evidence anzeigen |
| **Preview deployed** | Preview real bereitgestellt und an getrennte Preview-/Test-Infrastruktur gebunden ist | fehlende Deployment-/Binding-/Health-Evidence | Preview prüfen | Preview als Production-Deployment umetikettieren |
| **Preview geprüft** | reale Preview mit vorgesehenen Tests/Smokes geprüft und akzeptiert ist | fehlende oder fehlgeschlagene Preview-Prüfungen | offene Readiness-Gates bearbeiten | aus Preview automatisch spätere Gates ableiten |
| **Security & Privacy Ready** | alle zwölf kanonischen M5-Kriterien auf realer, gültiger und gemeinsam vertrauenswürdig gebundener Evidence erfüllt sind | vom kanonischen M5-Gate gemeldete offene Punkte | verbleibende Production-Readiness-Voraussetzungen bearbeiten | M5 allein als umfassendes Production Ready ausgeben |
| **Production Ready** | Preview geprüft, Security & Privacy Ready, Backup/Recovery inkl. realem Restore, dedizierte Produktionsressourcen, kontrollierte Migrationen und Deployment, produktive Benutzer/Rechte, grüne Post-Deploy-Smokes sowie alle weiteren kanonischen technischen Pre-Release-Gates erfüllt sind; keine relevanten Blocker offen | alle vom kanonischen Gesamtvertrag noch offenen Voraussetzungen | bei vollständiger technischer Readiness finale Release-Freigabe einholen | aus M5 allein oder Teil-M6-Evidence ableiten; Release automatisch autorisieren |
| **Produktion freigegeben** | Production Ready erfüllt ist und das separate Release-Gate eine ausdrückliche finale Release-Freigabe besitzt | fehlende technische Evidence oder fehlende finale Release-Autorisierung | bei vollständiger Readiness: ausdrückliche Release-Freigabe; sonst offenen Nachweis schließen | aus technischer Evidence automatisch freigeben |

## Schrittfreigaben versus finale Release-Freigabe

Mutierende Produktionsvorbereitungsschritte wie Provider-Create, Binding, Secret-/Runtime-Konfiguration, Logging-Sink, Migration, Deployment, Access-Bootstrap, Public Ingress, Restore und Production-Smokes benötigen jeweils eine eigene ausdrückliche Freigabe.

Diese Schrittfreigaben sind Teil des kontrollierten Wegs zu Production Ready. Sie ersetzen **nicht** die separate finale Release-Freigabe für `Produktion freigegeben`.

## Anzeige „Was fehlt noch?“

Die Oberfläche soll fehlende Punkte aus den bestehenden kanonischen Verträgen ableiten und für den Nutzer verständlich übersetzen.

Pflichtverhalten:

- keine parallele zweite M5-/M6-Kriterienliste pflegen,
- keine erfundenen Success-Zustände,
- keine Provideridentitäten oder internen Bindingdaten als Ersatz für verständliche Kriterien anzeigen,
- mehrere offene Punkte vollständig und deterministisch anzeigen,
- bei nicht validierbarer Evidence lieber `Status klären` als Teilerfolg behaupten,
- Security & Privacy Ready und umfassendes Production Ready getrennt darstellen.

## Nächster sicherer Schritt

Priorität:

1. inkonsistenten/ungültigen Status klären,
2. Repository-Voraussetzungen schließen,
3. Preview vorbereiten,
4. Preview deployen,
5. Preview prüfen,
6. offene M5-/Security-&-Privacy-Kriterien schließen,
7. verbleibende Recovery-/Produktionsressourcen-/Migrations-/Deployment-/Smoke-Gates schließen,
8. erst bei vollständigem Production Ready die separate finale Release-Freigabe einholen.

Ein empfohlener nächster Schritt ist **keine Ausführungsautorisierung**.

## Fail-closed-/Fehlerzustände

### Inkonsistente Preview-Evidence

Bei widersprüchlicher Preview-Evidence bleibt der betroffene Zustand offen, alle nachfolgenden Zustände gesperrt und die UI zeigt `Preview-Status klären` oder gleichwertig. Keine schreibende Aktion wird dadurch freigeschaltet.

### M5/M6-Widerspruch

Behauptet M6 Security/Privacy bereit, während M5 nicht erfüllt ist, bleiben Production Ready und Release gesperrt. Der Widerspruch wird nicht schöngerechnet.

### Vollständige technische Evidence ohne finale Release-Freigabe

Production Ready darf als vollständig erscheinen. Der Lifecycle bleibt trotzdem vor `Produktion freigegeben`, bis die separate finale Release-Freigabe vorliegt. Nächster sicherer Schritt ist sinngemäß `Ausdrückliche Produktionsfreigabe erforderlich`. Kein Auto-Release.

## Acceptance-Szenarien

1. Repository vollständig, Preview noch nicht vorbereitet → `Preview vorbereiten`.
2. Preview vorbereitet, aber nicht deployed → `Preview deployen`.
3. Preview deployed, aber nicht geprüft → `Preview prüfen`.
4. Preview geprüft, M5 11/12 → exakt das fehlende M5-Kriterium bleibt sichtbar; Security & Privacy Ready ist false.
5. M5 12/12, weitere technische Production-Gates offen → Security & Privacy Ready erfüllt, Production Ready offen.
6. Alle technischen Pre-Release-Gates erfüllt, keine finale Release-Autorisierung → Production Ready erfüllt, Produktion freigegeben bleibt false.
7. Widersprüchliche Preview-/M5-/M6-Evidence → fail-closed `Status klären`.
8. Unbekannte neue Pflichtkriterien → nicht still als vollständig weiterlaufen; Vertrag bewusst aktualisieren.
9. Provider-Evidence enthält interne IDs/Adressen → normale UI zeigt nur semantische, sanitizierte Readiness-Information.
10. Preview-/Production-Ressourcen sind identisch → Lifecycle nicht als korrekt getrennt akzeptieren.
11. internes M5-`productionReady=true`, aber umfassender technischer Vertrag offen → UI darf daraus kein Production Ready machen.
12. alle mutierenden Vorbereitungsschritte waren einzeln freigegeben, aber finale Release-Freigabe fehlt → kein Release.

## Abgrenzung zum finalen Factory-Readiness-Integrationsslice

- #136 macht die zehn bestehenden M6-Kriterien read-only sichtbar.
- #166 ergänzt Lifecycle-Orientierung und nächsten sicheren Schritt.
- #134 bindet sicherheitsrelevante Reference-Evidence in dieselbe Factory-Foundation.
- Diese drei Zwischenstände werden nach #165 in einem finalen Factory-Readiness-Integrations-PR konsolidiert.
- Die Terminologieanpassung gemäß ADR-023 wird in denselben finalen Head aufgenommen und durch denselben einmaligen Sol/max-Codex-Review abgedeckt.
- Vor jeder Umsetzung ist der dann aktuelle Snapshot-/Readiness-Vertrag live zu prüfen; diese Matrix ersetzt keine Codeverträge.
