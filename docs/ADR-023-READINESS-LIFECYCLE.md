# ADR-023 – Readiness-Lifecycle trennt Security & Privacy, technische Produktionsbereitschaft und Release

Entscheidungsdatum: 2026-08-25
Status: angenommen

## Autoritative Entscheidung

Diese Repository-Notiz spiegelt ADR-023 aus dem AppBasis-Entscheidungsregister. Bei Widerspruch bleibt das Entscheidungsregister die maßgebliche Quelle.

ADR-023 trennt drei fachliche Readiness-/Release-Begriffe verbindlich voneinander. Sie sind keine vollständige lineare Aufzählung aller operativen Lifecycle-Phasen:

1. **Security & Privacy Ready**
   - entspricht exakt dem M5-Gate,
   - alle zwölf kanonischen M5-Kriterien müssen auf gültiger, vertrauenswürdig gebundener Evidence erfüllt sein,
   - ein fehlender oder widersprüchlicher Nachweis hält das Gate fail-closed offen.

2. **Production Ready**
   - bezeichnet den vollständigen technischen Pre-Release-Zustand einer konkreten App,
   - setzt mindestens geprüfte Preview, Security & Privacy Ready, Backup/Recovery inklusive realem Restore, dedizierte Produktionsressourcen, kontrollierte Migrationen und Deployment, grüne Post-Deploy-Smokes sowie das Fehlen relevanter Security-/Privacy-/Recovery-/Review-Blocker voraus,
   - setzt **nicht** `releaseAuthorized=true`.

3. **Produktion freigegeben**
   - setzt Production Ready voraus,
   - benötigt zusätzlich eine davon getrennte ausdrückliche finale Release-Freigabe,
   - darf niemals automatisch aus technischer Evidence entstehen.

## Kontrollierte Produktionsvorbereitung

Die kontrollierte, nicht öffentliche Produktionsvorbereitung ist eine eigene vorgelagerte Lifecycle-Phase und kein Synonym für einen der drei Readiness-/Release-Begriffe oben.

Sie darf nach bestätigter Preview und den jeweils erforderlichen Einzelfreigaben notwendige dedizierte Produktionsressourcen, Bindings, Secrets, Migrationen, Deployment, Benutzer-/Rechte-Bootstrap und Logging-Evidence vorbereiten, wenn diese für reale M4-/M5-Evidence benötigt werden. Dabei gilt:

- jeder mutierende Provider-/Produktionsschritt benötigt eine eigene ausdrückliche Freigabe,
- öffentliches Production-Ingress bleibt bis zu den dafür erforderlichen Recovery- und Security-/Privacy-Gates geschlossen,
- die Produktionsvorbereitung allein setzt weder `Security & Privacy Ready` noch `Production Ready` noch eine Release-Autorisierung.

Die konkrete Reihenfolge der Evidence-Gates wird nicht in dieser ADR dupliziert, sondern durch die kanonischen Preview-/M5-/M6-/Recovery-Verträge und den Factory-Lifecycle-Adapter bestimmt.

## Kompatibilitätsregel

Das bestehende interne M5-Feld `productionReady` darf vorerst aus Kompatibilitätsgründen bestehen bleiben. Fachlich repräsentiert es ausschließlich das M5-/Security-&-Privacy-Gate und darf in der UI nicht allein aufgrund seines Namens als umfassender Lifecycle-Zustand `Production Ready` dargestellt werden.

Eine spätere technische Umbenennung ist nur als eigener, bewusst geprüfter Integrationsschritt zulässig; keine breite Rename-/Evidence-Pin-Kaskade wird allein wegen der Terminologie erzeugt.

## Freigabearten

### Schrittfreigaben

Jeder mutierende Provider-/Produktionsschritt benötigt eine eigene ausdrückliche Freigabe. Eine Schrittfreigabe autorisiert ausschließlich den konkret benannten Schritt.

### Finale Release-Freigabe

Die finale Release-Freigabe ist davon getrennt. Sie autorisiert erst den Übergang von Production Ready zu **Produktion freigegeben**.

Schrittfreigaben ersetzen die finale Release-Freigabe nicht.

## UI-/Factory-Folge

Die Factory muss:

- M5 als **Security & Privacy Ready** behandeln,
- die kontrollierte Produktionsvorbereitung als von M5 und Production Ready getrennte Phase behandeln,
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
- öffentliches Production-Ingress bleibt an die kanonischen Recovery-/Security-/Privacy-Gates gebunden,
- der finale Release bleibt separat freigabepflichtig.

## Strukturelle Integrationsregel

Diese ADR beschreibt ausschließlich dauerhafte Architektur- und Lifecycle-Verträge. Flüchtige Pull-Request-, Branch-, Commit-, CI-, Review- oder Integrationsstatus gehören nicht in diese Entscheidung. Bestehende kanonische Preview-/M5-/M6-/Recovery-/Factory-Verträge werden wiederverwendet; parallele oder historische Evidence- und Lifecycle-Implementierungen dürfen daraus nicht erneut als zweite Wahrheitsquelle abgeleitet werden.
