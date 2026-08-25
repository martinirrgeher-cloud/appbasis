# ADR-023 – Readiness-Lifecycle trennt Security & Privacy, technische Produktionsbereitschaft und Release

Stand: 2026-08-25
Status: angenommen

## Autoritative Entscheidung

Diese Repository-Notiz spiegelt ADR-023 aus dem AppBasis-Entscheidungsregister. Bei Widerspruch bleibt das Entscheidungsregister die maßgebliche Quelle.

Der kanonische Lifecycle unterscheidet verbindlich drei Zustände:

1. **Security & Privacy Ready**
   - entspricht exakt dem M5-Gate,
   - alle zwölf kanonischen M5-Kriterien müssen auf gültiger, vertrauenswürdig gebundener Evidence erfüllt sein,
   - ein fehlender oder widersprüchlicher Nachweis hält das Gate fail-closed offen.

2. **Production Ready**
   - bezeichnet den vollständigen technischen Pre-Release-Zustand einer konkreten App,
   - setzt mindestens geprüfte Preview, Security & Privacy Ready, Backup/Recovery inklusive realem Restore, dedizierte Produktionsressourcen, kontrollierte Migrationen und Deployment, grüne Post-Deploy-Smokes sowie das Fehlen relevanter Security-/Privacy-/Recovery-/Review-Blocker voraus,
   - alle bis dahin notwendigen mutierenden Produktionsvorbereitungsschritte benötigen jeweils ihre eigene ausdrückliche Freigabe,
   - setzt **nicht** `releaseAuthorized=true`.

3. **Produktion freigegeben**
   - setzt Production Ready voraus,
   - benötigt zusätzlich eine davon getrennte ausdrückliche finale Release-Freigabe,
   - darf niemals automatisch aus technischer Evidence entstehen.

## Kompatibilitätsregel

Das bestehende interne M5-Feld `productionReady` darf vorerst aus Kompatibilitätsgründen bestehen bleiben. Fachlich repräsentiert es ausschließlich das M5-/Security-&-Privacy-Gate und darf in der UI nicht allein aufgrund seines Namens als umfassender Lifecycle-Zustand `Production Ready` dargestellt werden.

Eine spätere technische Umbenennung ist nur als eigener, bewusst geprüfter Integrationsschritt zulässig; unmittelbar vor M6 wird keine breite Rename-/Evidence-Pin-Kaskade erzeugt.

## Freigabearten

### Schrittfreigaben

Jeder mutierende Provider-/Produktionsschritt benötigt eine eigene ausdrückliche Freigabe. Eine Schrittfreigabe autorisiert ausschließlich den konkret benannten Schritt.

### Finale Release-Freigabe

Die finale Release-Freigabe ist davon getrennt. Sie autorisiert erst den Übergang von Production Ready zu **Produktion freigegeben**.

Schrittfreigaben ersetzen die finale Release-Freigabe nicht.

## UI-/Factory-Folge

Die Factory muss:

- M5 als **Security & Privacy Ready** behandeln,
- Production Ready aus den kanonischen Preview-/M5-/M6-/Recovery-/Deployment-/Smoke-Verträgen ableiten und nicht aus dem internen M5-Feld allein,
- Produktion freigegeben ausschließlich aus dem separaten Release-Gate ableiten,
- bei unvollständiger oder widersprüchlicher Evidence fail-closed bleiben,
- keinen Auto-Release und keinen ungesicherten Produktionsbutton einführen,
- Provider-IDs, Datenbankadressen und Secretwerte aus der normalen Nutzeroberfläche heraushalten.

Der Factory-Lifecycle-Adapter konsumiert die bestehenden kanonischen Lifecycle- und Readiness-Verträge; diese ADR erzeugt keinen zweiten Readiness-Evaluator.

## Sicherheitswirkung

Diese Entscheidung lockert kein Gate:

- M5 bleibt all-required/fail-closed,
- Production Ready ist breiter als M5 und benötigt zusätzliche technische Evidence,
- mutierende Produktionsschritte bleiben einzeln freigabepflichtig,
- der finale Release bleibt separat freigabepflichtig.

## Strukturelle Integrationsregel

Diese ADR beschreibt ausschließlich dauerhafte Architektur- und Lifecycle-Verträge. Flüchtige Pull-Request-, Branch-, Commit- oder Integrationsstatus gehören nicht in diese Entscheidung. Bestehende kanonische M5-/M6-/Recovery-/Factory-Verträge werden wiederverwendet; parallele oder historische Evidence- und Lifecycle-Implementierungen dürfen daraus nicht erneut als zweite Wahrheitsquelle abgeleitet werden.
