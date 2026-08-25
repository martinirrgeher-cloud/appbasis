# AppFactory – Lifecycle Acceptance Matrix

Stand: 2026-08-25

## Zweck

Diese Matrix beschreibt die benutzerverständliche Lifecycle-Semantik der AppFactory. Sie ist eine Acceptance-Spezifikation für die Oberfläche, kein neuer Readiness-Evaluator und keine zusätzliche Plattformschicht.

Verbindliche Grenzen:

- Preview und Produktion bleiben getrennte Lebenszyklen.
- Bestehende Preview-, M5-, M6- und Recovery-Verträge bleiben die fachlichen Wahrheitsquellen.
- Fehlende, widersprüchliche oder nicht vertrauenswürdig gebundene Evidence führt fail-closed zu `offen`/`gesperrt`.
- Technische Readiness autorisiert keine Produktionsfreigabe automatisch.
- Produktive Writes benötigen weiterhin ihre jeweilige ausdrückliche Schrittfreigabe.
- Der finale Release benötigt zusätzlich eine separate ausdrückliche Release-Freigabe.
- Provider-IDs, Datenbankadressen, Connection Strings und Secretwerte gehören nicht in die normale Factory-UI.

## Verbindliche Terminologie gemäß ADR-023

1. **Security & Privacy Ready** = exakt M5, alle zwölf Pflichtkriterien auf gültiger Evidence.
2. **Production Ready** = vollständiger technischer Pre-Release-Zustand der konkreten App.
3. **Produktion freigegeben** = Production Ready plus separate ausdrückliche finale Release-Freigabe und erfolgreiches Release-Gate.

Das interne M5-Feld `productionReady` bleibt aus Kompatibilitätsgründen zulässig, ist fachlich aber nur das M5-/Security-&-Privacy-Gate. Die UI darf daraus allein kein umfassendes Production Ready ableiten.

## Ziel-Lifecycle

1. Entwurf
2. Repository erzeugt
3. Preview vorbereitet
4. Preview deployed
5. Preview geprüft
6. Security & Privacy Ready
7. Production Ready
8. Produktion freigegeben

## Acceptance-Matrix

| Zustand | Darf als erreicht erscheinen, wenn | „Was fehlt noch?“ | Nächster sicherer Schritt | Nicht zulässig |
|---|---|---|---|---|
| **Repository erzeugt** | kanonischer Generator-/Repositoryvertrag erfolgreich vorliegt | fehlende/ungültige Repository- oder Manifestbestandteile | Repository-/Generatorstatus klären | aus Repository-Erfolg Preview oder Produktion ableiten |
| **Preview vorbereitet** | Preview-Voraussetzungen, Runtime-/Package-/DB-Manifest-Verträge und notwendige Preview-Konfiguration vollständig vorbereitet sind | konkrete fehlende Preview-Voraussetzungen | Preview-Deployment vorbereiten bzw. freigeben | „deployed“ ohne reale Deployment-Evidence anzeigen |
| **Preview deployed** | Preview real bereitgestellt und an getrennte Preview-/Test-Infrastruktur gebunden ist | fehlende Deployment-/Binding-/Health-Evidence | Preview prüfen | Preview als Production-Deployment umetikettieren |
| **Preview geprüft** | reale Preview mit vorgesehenen Tests/Smokes geprüft und akzeptiert ist | fehlende oder fehlgeschlagene Preview-Prüfungen | kontrollierte Produktionsvorbereitung beginnen; jeder mutierende Schritt bleibt einzeln freigabepflichtig | aus Preview automatisch spätere Gates ableiten |
| **Security & Privacy Ready** | alle zwölf kanonischen M5-Kriterien auf realer, gültiger und gemeinsam vertrauenswürdig gebundener Evidence erfüllt sind | vom kanonischen M5-Gate gemeldete offene Punkte | verbleibende Production-Readiness-Voraussetzungen bearbeiten | M5 allein als umfassendes Production Ready ausgeben |
| **Production Ready** | Preview geprüft, Security & Privacy Ready, Backup/Recovery inkl. realem Restore, dedizierte Produktionsressourcen, kontrollierte Migrationen und Deployment, produktive Benutzer/Rechte, grüne Post-Deploy-Smokes sowie alle weiteren kanonischen technischen Pre-Release-Gates erfüllt sind; keine relevanten Blocker offen | alle vom kanonischen Gesamtvertrag noch offenen Voraussetzungen | bei vollständiger technischer Readiness finale Release-Freigabe einholen | aus M5 allein oder Teil-M6-Evidence ableiten; Release automatisch autorisieren |
| **Produktion freigegeben** | Production Ready erfüllt ist und das separate Release-Gate eine ausdrückliche finale Release-Freigabe besitzt | fehlende technische Evidence oder fehlende finale Release-Autorisierung | bei vollständiger Readiness ausdrückliche Release-Freigabe; sonst offenen Nachweis schließen | aus technischer Evidence automatisch freigeben |

## Anzeige „Was fehlt noch?“

Die Oberfläche leitet fehlende Punkte aus den bestehenden kanonischen Verträgen ab und übersetzt sie verständlich. Sie pflegt keine zweite M5-/M6-Kriterienliste, erfindet keine Success-Zustände und zeigt keine internen Provideridentitäten als Ersatz für fachliche Kriterien.

Bei nicht validierbarer Evidence gilt `Status klären` statt Teilerfolg. Security & Privacy Ready und umfassendes Production Ready bleiben getrennt.

## Nächster sicherer Schritt

Die operative Reihenfolge folgt dem bestehenden kanonischen Factory-Lifecycle. Insbesondere können reale Produktionsvorbereitung und Backup/Recovery Voraussetzungen für den finalen M5-Nachweis sein; das M5-Gate wird deshalb nicht künstlich vor diese Evidence gezogen.

Priorität:

1. inkonsistenten/ungültigen Status klären,
2. Repository-Voraussetzungen schließen,
3. Preview vorbereiten,
4. Preview deployen,
5. Preview prüfen,
6. kontrollierte, nicht öffentliche Produktionsvorbereitung nach den jeweiligen Einzelfreigaben durchführen,
7. Backup/Recovery einschließlich realem Restore nachweisen,
8. danach die verbleibenden M5-/Security-&-Privacy-Kriterien auf gemeinsam gebundener Evidence abschließen,
9. verbleibende Domain-/Public-Ingress-/Post-Deploy-Smoke- und sonstige technische Production-Ready-Gates schließen,
10. erst bei vollständigem Production Ready die separate finale Release-Freigabe einholen.

Ein empfohlener nächster Schritt ist keine Ausführungsautorisierung.

## Fail-closed-Szenarien

- Preview-Evidence widersprüchlich → Preview und alle Folgestufen bleiben offen/gesperrt.
- M6 behauptet Security/Privacy bereit, M5 ist offen → Production Ready und Release bleiben gesperrt.
- M5 ist 11/12 → exakt das fehlende Kriterium bleibt offen; Security & Privacy Ready ist false.
- M5 ist 12/12, weitere technische Gates fehlen → Security & Privacy Ready ist erfüllt, Production Ready bleibt offen.
- Alle technischen Pre-Release-Gates sind erfüllt, finale Release-Freigabe fehlt → Production Ready darf erfüllt sein, Produktion freigegeben bleibt false.
- Preview-/Production-Ressourcen sind identisch → Lifecycle darf nicht als korrekt getrennt gelten.
- Unbekannte neue Pflichtkriterien → Vertrag bewusst aktualisieren; nicht still als vollständig weiterlaufen.

## Integrationsregel

Der aktuelle `main` ist maßgeblich. Der bestehende Factory-Lifecycle-Adapter und die kanonischen M5-/M6-/Recovery-Verträge werden wiederverwendet. Veraltete Zwischen-PRs oder historische Evidence-Pfade werden nicht als Architekturgrundlage reaktiviert.
