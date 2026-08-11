# AppBasis – verbindliche Entwicklungsregeln

Diese Regeln gelten für menschliche Entwickler, ChatGPT und Codex.

## Architektur

- Der Core bleibt fachneutral.
- Kundenspezifische Geschäftslogik gehört niemals direkt in Core-Pakete.
- Fachmodule greifen nur über definierte öffentliche Verträge auf Core und andere Module zu.
- Eine konkrete App aktiviert nur die Fähigkeiten und Module, die sie tatsächlich benötigt.
- Definitionen/Vorlagen und laufende Prozessinstanzen werden strikt getrennt.
- Core-Updates dürfen bestehende fachliche Funktionen nicht stillschweigend verändern.

## Sicherheit

- Berechtigungen werden serverseitig erzwungen.
- UI-Sichtbarkeit ist niemals eine Sicherheitsgrenze.
- Produktionsdatenbankänderungen erfolgen ausschließlich über versionierte Migrationen.
- Secrets und Zugangsdaten gehören niemals ins Repository.
- Kritische Änderungen brauchen Auditierbarkeit und gegebenenfalls Freigabe.

## Qualität

- Mobile First ist verbindlich.
- TypeScript wird strikt verwendet.
- Neue Funktionen erhalten risikobasierte automatisierte Tests.
- Architektur- und Qualitätsregeln sollen möglichst ausführbar geprüft werden.
- Fehlgeschlagene Pflichtprüfungen blockieren Releases.

## Änderungen

Vor größeren Änderungen müssen Auswirkungen auf bestehende Module, Daten,
Berechtigungen, Migrationen und dokumentierte fachliche Entscheidungen geprüft
werden.

Wenn eine Änderung bestehendes Verhalten verändert oder einer vorhandenen
Entscheidung widerspricht, muss dies vor der Umsetzung ausdrücklich angezeigt
werden.