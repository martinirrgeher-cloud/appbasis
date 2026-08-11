# AppBasis Architektur

AppBasis ist keine einzelne Standard-App, sondern eine App-Fabrik.

## Ebenen

1. Plattform-Core
2. optionale Plattformdienste
3. wiederverwendbare Standardmodule
4. app-spezifische Fachmodule
5. konkrete App-Konfiguration

Der Core bleibt fachneutral und updatefähig.

## Geplante Hauptstruktur

- `apps/` – ausführbare Referenz- und Test-Apps
- `packages/` – fachneutrale AppBasis-Core-Pakete
- `modules/` – wiederverwendbare Fach-/Standardmodule
- `tooling/` – Generatoren, Prüfungen und Entwicklungswerkzeuge
- `docs/` – technische und fachliche Projektdokumentation

## Leitprinzip

Eine kleine App darf technisch und fachlich klein bleiben.
Nicht benötigte Fähigkeiten werden nicht nur im Menü versteckt, sondern
möglichst gar nicht aktiviert.