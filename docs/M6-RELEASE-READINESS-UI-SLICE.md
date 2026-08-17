# M6 – Release-Readiness-UI-Slice

Stand: 2026-08-17

## Zweck

Dieser Slice macht den bereits vorhandenen technischen M6-Readiness-Status in der AppFactory verständlicher sichtbar. Er ist ausschließlich read-only und bereitet keine Produktionsaktion vor.

## Abgrenzung zu M5

Der Slice konsumiert nur den vorhandenen `productionReleaseReadiness`-Snapshot. Er ändert nicht:

- M5-Evidence-Quellen oder deren Freshness-/Trust-Regeln
- `productionReady`-Berechnung
- Security-/Privacy-Gates
- Provider-, Runtime-, Manifest- oder Schema-Verträge
- Produktionsfreigabe oder Deployment

PR #134 bleibt damit der getrennte M5-Control-Plane-/Evidence-Strang. PR #135 bleibt der Privacy-/Provider-Vorbereitungsstrang.

## Zielbild

In der bestehenden App-Detailansicht soll der Nutzer neben der kompakten M5/M6-Zusammenfassung die zehn vorhandenen M6-Nachweise einzeln sehen:

1. Preview geprüft
2. Eigene Produktionsdatenbank
3. Eigener Produktions-Worker
4. Eigene Domain
5. Produktive Benutzer & Rechte
6. Backup & Recovery geprüft
7. Security & Privacy geprüft
8. Kontrollierte Produktionsmigrationen
9. Produktions-Deploy abgeschlossen
10. Post-Deploy-Smoke erfolgreich

Jeder Punkt zeigt ausschließlich `Geprüft` oder `Offen`. Fehlende, unbekannte oder strukturell nicht eindeutige Daten werden visuell als `Offen` behandelt. Die Darstellung darf niemals `releaseAuthorized=true` erzeugen oder eine Freigabeaktion anbieten.

## Vorgesehene Dateigrenze

Technische Umsetzung soll sich auf die vorhandene Factory-Detailansicht beschränken, vorzugsweise:

- `tooling/factory-ui/index.html`
- `tooling/factory-ui/app.js`
- zugehöriger bestehender UI-Test, sofern ohne Konflikt möglich

Nicht anfassen:

- `tooling/factory-ui/model.mjs`
- `tooling/factory-ui/production-readiness.mjs`
- `tooling/factory-ui/production-release-readiness.mjs`
- Reference-/ULC-Evidence-Consumer
- Generator-/Manifest-/Runtime-Verträge

## Acceptance

- Detailansicht zeigt alle zehn M6-Kriterien aus dem Snapshot verständlich an.
- `verified` wird nur als `Geprüft` dargestellt, wenn der Snapshot exakt diesen Status liefert.
- jeder andere/fehlende Status wird als `Offen` dargestellt.
- kein Button oder Endpoint für Production Release entsteht.
- bestehende `capabilities.releaseProduction=false` bleibt unverändert.
- Mobile-First: vorhandene Factory-Komponenten und Touch-/Layout-Verträge wiederverwenden; keine neue UI-Foundation.
- vollständige Exact-Head-CI muss grün sein.
- Codex wird gemäß temporärer Arbeitsweise erst nach technischer Fertigstellung der offenen M5/M6-Slices nachgeholt; bis dahin kein Merge dieses final-review-pflichtigen technischen Slices.

## Produktionsgrenze

Dieser Slice erzeugt keine Produktionsressource, führt keine Migration aus, setzt keine Secrets und deployt nichts. Eine spätere echte Produktionsfreigabe bleibt nach M5/M6-Gates und ausdrücklicher Nutzerfreigabe separat.
