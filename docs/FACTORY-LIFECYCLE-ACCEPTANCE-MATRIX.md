# AppFactory – Lifecycle Acceptance Matrix

Fassung: 2026-08-25

## Zweck

Diese Matrix beschreibt die benutzerverständliche Lifecycle-Semantik der AppFactory. Sie ist eine Acceptance-Spezifikation für die Oberfläche, kein neuer Readiness-Evaluator und keine zusätzliche Plattformschicht.

Verbindliche Grenzen:

- Preview und Produktion bleiben getrennte Lebenszyklen.
- Bestehende Preview-, M5-, M6-, Recovery- und Factory-Lifecycle-Verträge bleiben die fachlichen Wahrheitsquellen.
- Fehlende, widersprüchliche oder nicht vertrauenswürdig gebundene Evidence führt fail-closed zu `offen`/`gesperrt`.
- Technische Readiness autorisiert keine Produktionsfreigabe automatisch.
- Produktive Writes benötigen weiterhin ihre jeweilige ausdrückliche Schrittfreigabe.
- Der finale Release benötigt zusätzlich eine separate ausdrückliche Release-Freigabe.
- Provider-IDs, Datenbankadressen, Connection Strings und Secretwerte gehören nicht in die normale Factory-UI.

## Verbindliche Terminologie gemäß ADR-023

- **Security & Privacy Ready** = exakt M5, alle zwölf Pflichtkriterien auf gültiger Evidence.
- **Production Ready** = vollständiger technischer Pre-Release-Zustand der konkreten App; breiter als M5.
- **Produktion freigegeben** = Production Ready plus separate ausdrückliche finale Release-Freigabe und erfolgreiches Release-Gate.
- **Kontrollierte Produktionsvorbereitung** = vorgelagerte, nicht öffentliche Phase für reale Production-/Recovery-/M5-Evidence; sie ist weder Security & Privacy Ready noch Production Ready noch Release-Autorisierung.

Das interne M5-Feld `productionReady` bleibt aus Kompatibilitätsgründen zulässig, ist fachlich aber nur das M5-/Security-&-Privacy-Gate. Die UI darf daraus allein kein umfassendes Production Ready ableiten.

## Sichtbare Lifecycle-Semantik

Die Oberfläche muss die folgenden fachlichen Zustände unterscheiden können, ohne daraus eine zweite technische Reihenfolge abzuleiten:

- Entwurf / Repository erzeugt
- Preview vorbereitet / deployed / geprüft
- kontrollierte Produktionsvorbereitung, solange noch nicht öffentlich
- Security & Privacy Ready als eigenes M5-Gate
- Production Ready als vollständigen technischen Pre-Release-Zustand
- Produktion freigegeben als separat autorisierten Release-Zustand

Die genaue operative Reihenfolge und die Abhängigkeiten zwischen Evidence-Kriterien werden ausschließlich aus den kanonischen Lifecycle-/Readiness-Verträgen konsumiert. Insbesondere darf die Darstellung Security & Privacy Ready nicht künstlich vor Produktionsvorbereitung und Recovery ziehen, wenn reale M5-Evidence diese Schritte voraussetzt.

## Acceptance-Matrix

| Zustand | Darf als erreicht erscheinen, wenn | „Was fehlt noch?“ | Nächster sicherer Schritt | Nicht zulässig |
|---|---|---|---|---|
| **Repository erzeugt** | kanonischer Generator-/Repositoryvertrag erfolgreich vorliegt | fehlende/ungültige Repository- oder Manifestbestandteile | Repository-/Generatorstatus klären | aus Repository-Erfolg Preview oder Produktion ableiten |
| **Preview vorbereitet** | Preview-Voraussetzungen, Runtime-/Package-/DB-Manifest-Verträge und notwendige Preview-Konfiguration vollständig vorbereitet sind | konkrete fehlende Preview-Voraussetzungen | Preview-Deployment vorbereiten bzw. freigeben | `deployed` ohne reale Deployment-Evidence anzeigen |
| **Preview deployed** | Preview real bereitgestellt und an getrennte Preview-/Test-Infrastruktur gebunden ist | fehlende Deployment-/Binding-/Health-Evidence | Preview prüfen | Preview als Production-Deployment umetikettieren |
| **Preview geprüft** | reale Preview mit vorgesehenen Tests/Smokes geprüft und akzeptiert ist | fehlende oder fehlgeschlagene Preview-Prüfungen | kanonischen nächsten Lifecycle-Schritt anzeigen | aus Preview automatisch spätere Gates ableiten |
| **Kontrollierte Produktionsvorbereitung** | der kanonische Lifecycle sie nach bestätigter Preview zulässt und die dafür erforderliche Evidence konsistent ist | die vom kanonischen Vertrag gemeldeten fehlenden Vorbereitungskriterien | ausschließlich den kanonischen nächsten, einzeln freizugebenden Schritt anzeigen | aus Teilvorbereitung M5, Production Ready oder Release ableiten; Public Ingress vor den erforderlichen Gates öffnen |
| **Security & Privacy Ready** | alle zwölf kanonischen M5-Kriterien auf realer, gültiger und gemeinsam vertrauenswürdig gebundener Evidence erfüllt sind | vom kanonischen M5-Gate gemeldete offene Punkte | kanonischen nächsten Production-Ready-Schritt anzeigen | M5 allein als umfassendes Production Ready ausgeben |
| **Production Ready** | der kanonische Gesamtvertrag vollständige technische Evidence bestätigt; insbesondere Preview, M4/Recovery, M5, dedizierte Produktionsressourcen, kontrollierte Migrationen/Deployment, Benutzer/Rechte, Domain und Post-Deploy-Smokes sind erfüllt | alle vom kanonischen Gesamtvertrag noch offenen Voraussetzungen | separate finale Release-Freigabe einholen | aus M5 allein oder Teil-M6-Evidence ableiten; Release automatisch autorisieren |
| **Produktion freigegeben** | Production Ready erfüllt ist und das separate Release-Gate eine ausdrückliche finale Release-Freigabe besitzt | fehlende technische Evidence oder fehlende finale Release-Autorisierung | bei vollständiger Readiness ausdrückliche Release-Freigabe; sonst offenen Nachweis schließen | aus technischer Evidence automatisch freigeben |

## Anzeige „Was fehlt noch?“

Die Oberfläche leitet fehlende Punkte aus den bestehenden kanonischen Verträgen ab und übersetzt sie verständlich. Sie pflegt keine zweite M5-/M6-Kriterienliste und keine eigene Criterion-Ordering-Logik, erfindet keine Success-Zustände und zeigt keine internen Provideridentitäten als Ersatz für fachliche Kriterien.

Bei nicht validierbarer Evidence gilt `Status klären` statt Teilerfolg. Security & Privacy Ready und umfassendes Production Ready bleiben getrennt.

## Nächster sicherer Schritt

Die UI übernimmt den nächsten sicheren Schritt aus dem kanonischen Factory-Lifecycle-Vertrag und darf dessen Reihenfolge nicht in dieser Matrix neu implementieren.

Für die Semantik gelten nur folgende Grenzen:

- inkonsistenter/ungültiger Status wird zuerst geklärt,
- Preview wird vor realer Produktionsvorbereitung geprüft,
- mutierende Produktionsvorbereitungsschritte bleiben einzeln freigabepflichtig und zunächst nicht öffentlich,
- Recovery- und M5-Evidence werden in der vom kanonischen Vertrag geforderten Reihenfolge abgeschlossen,
- Domain/Public Ingress und Smokes bleiben an die kanonischen Recovery-/M5-/M6-Gates gebunden,
- Production Ready autorisiert keinen Release,
- erst die separate finale Release-Freigabe kann zum Zustand Produktion freigegeben führen.

Ein empfohlener nächster Schritt ist keine Ausführungsautorisierung.

## Fail-closed-Szenarien

- Preview-Evidence widersprüchlich → Preview und alle Folgestufen bleiben offen/gesperrt.
- M6 behauptet Security/Privacy bereit, M5 ist offen → Production Ready und Release bleiben gesperrt.
- M5 ist 11/12 → exakt das fehlende Kriterium bleibt offen; Security & Privacy Ready ist false.
- M5 ist 12/12, weitere technische Gates fehlen → Security & Privacy Ready ist erfüllt, Production Ready bleibt offen.
- Teilweise Produktionsvorbereitung → kein M5-/Production-Ready-/Release-Erfolg ableiten.
- Alle technischen Pre-Release-Gates sind erfüllt, finale Release-Freigabe fehlt → Production Ready darf erfüllt sein, Produktion freigegeben bleibt false.
- Preview-/Production-Ressourcen sind identisch → Lifecycle darf nicht als korrekt getrennt gelten.
- Unbekannte neue Pflichtkriterien → Vertrag bewusst aktualisieren; nicht still als vollständig weiterlaufen.

## Integrationsregel

Der bestehende Factory-Lifecycle-Adapter und die kanonischen Preview-/M5-/M6-/Recovery-Verträge bleiben die dauerhaften Wahrheitsquellen. Diese Matrix enthält bewusst keinen Pull-Request-, Branch-, Commit-, CI-, Review- oder sonstigen flüchtigen Integrationsstatus. Historische Zwischenimplementierungen oder Evidence-Pfade dürfen daraus nicht als parallele Architekturgrundlage reaktiviert werden.
