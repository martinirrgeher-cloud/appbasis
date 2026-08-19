# AppFactory – Integrationsplan UI / M5 / M6

Stand der Planung: 2026-08-19, 17:43 Europe/Vienna

## Zweck

Dieser Plan beschreibt die spätere sichere Integration der Factory-Readiness-Oberfläche auf dem tatsächlichen finalen M5/M6-Unterbau. Er führt **keinen Merge, keinen Providerwrite und keine Produktionsfreigabe** aus.

SHAs und CI-Angaben sind nur Planungssnapshot; vor jeder Aktion gilt der Live-State.

## Live-Ausgangspunkt

| Element | verifizierter Stand | CI |
|---|---|---|
| `main` | `e7fb8dbd5e76041109e2f045eabc50fc803c13a0` | aktueller Main-Head |
| #163 – M5 Final Hardening | `ab0e2c609c96463ddc015a4227589d22f5a7f2b1` | #1173 PASS, literal Exact-Head |
| #165 – ULC M6 Production Preflight | `dc82bf4e4e89f7bc2261670f90a6bdc85743a727` | #1200 PASS, literal Exact-Head |
| #134 – Reference Evidence | `e7782a20702fd1fe054ebbef10001e42b9afb1f5` | #983 PASS; vor finaler Integration neu auf aktuellem main validieren |
| #136 – read-only M6 UI | `5a61d2b486903d61de0dc81ccb73611f942ccff3` | #993 PASS |
| #166 – Lifecycle UI | `b7d45a4f258cdf99e40cf0578f2198add1262fec` | #1180 PASS auf damaligem Source-Tree; vor Finalreview literal Exact-Head erforderlich |

## Verbindlich entschieden: Readiness-Terminologie

Gemäß ADR-023 gilt:

1. **Security & Privacy Ready** = exakt M5, zwölf Pflichtkriterien, all-required/fail-closed.
2. **Production Ready** = vollständiger technischer Pre-Release-Zustand aus den kanonischen Preview-/M5-/M6-/Recovery-/Ressourcen-/Migrations-/Deployment-/Smoke-Verträgen.
3. **Produktion freigegeben** = Production Ready plus separate ausdrückliche finale Release-Freigabe und separates Release-Gate.

Das bestehende interne M5-Feld `productionReady` darf vorerst technisch bestehen bleiben, darf aber nicht als umfassender UI-Lifecycle-Zustand interpretiert werden.

Mutierende Produktionsvorbereitungsschritte benötigen weiterhin ihre jeweilige ausdrückliche Schrittfreigabe. Diese ersetzt die finale Release-Freigabe nicht.

## Integrationsgrundsatz

Der UI-Stack darf nie vor den kanonischen M5/M6-Verträgen zur neuen Wahrheit werden.

Reihenfolge:

1. #163 final reviewen und nach vollständigem Gate mergen.
2. #165 auf neuen `main` sauber restacken, #164-Acceptance kontrolliert integrieren, vollständig neu prüfen, final reviewen und mergen.
3. Erst danach einen **neuen gemeinsamen Factory-Readiness-Integrations-PR** auf aktuellem `main` bilden.
4. #134-spezifische Reference-Evidence seriell integrieren.
5. #136 read-only M6-Darstellung integrieren.
6. #166 Lifecycle-Diff integrieren und gemäß ADR-023 terminologisch korrigieren.
7. vollständige literal Exact-Head-CI.
8. ChatGPT Diff-/Architektur-/Security-/Lifecycle-Review.
9. Findings gebündelt beheben und Exact-Head-CI erneut vollständig grün.
10. genau ein finaler Codex-Review Sol/max auf dem unveränderten finalen Head.
11. Expected-Head-Squash-Merge und Post-Merge-CI.

Keine Blind-Cherry-Picks nach alten SHAs.

## Phase 1 – M5-Vertragsbasis

#163 bleibt bis zu seinem finalen Codex eingefroren. Vor Merge: tatsächlicher Head, Exact-Head-CI, Codex-Commit, Threads und Mergeability erneut live prüfen. Nach Merge muss Post-Merge-CI auf `main` PASS sein.

## Phase 2 – M6-Vertragsbasis

#165 ist auf #163 gestapelt. Nach #163-Squash darf er nicht blind nur retargetet werden. Die vorbereitete Restack-Grenze wird verwendet; zusätzlich darf exakt der docs-only M4-Acceptance-Record aus #164 integriert werden.

Für die spätere UI maßgeblich:

- M5 und M6 bleiben getrennte technische Gates,
- Production Security Logging ist eigener freigabepflichtiger M6-Schritt,
- Restore und Post-Deploy-Smokes sind kontrollierte, mutierende Schritte,
- technische Evidence autorisiert Release niemals selbst,
- Preview-Akzeptanz bleibt eigener Nachweis,
- Provider-/Resource-Evidence bleibt sanitisiert und fail-closed.

## Phase 3 – Reference Evidence auf aktuellen main binden

#134 akzeptiert nur den neuesten erfolgreichen `M5 Reference Control Plane Evidence`-Workflow-Dispatch, dessen `head_sha` exakt dem dann aktuellen `main` entspricht.

Deshalb nach #165-Post-Merge-PASS und **vor** der finalen Factory-Integration:

1. aktuellen `main` pinnen,
2. Workflow `M5 Reference Control Plane Evidence` auf `main` manuell ausführen,
3. erfolgreichen Run und dessen `head_sha` prüfen,
4. erst dann #134-spezifischen Diff in den gemeinsamen Factory-PR übernehmen.

Ein vorheriger Run wird durch Main-Drift absichtlich ungültig.

## Phase 4 – #136 und #166 konsolidieren

#136 macht die zehn bestehenden M6-Kriterien read-only sichtbar. #166 ergänzt Lifecycle-Orientierung und nächsten sicheren Schritt.

Beim Replay müssen erhalten bleiben:

- zehn kanonische M6-Kriterien,
- keine zweite Gate-Berechnung,
- keine Provider-/Release-Aktion,
- keine Provider-IDs, DB-Adressen oder Secrets,
- fail-closed bei inkonsistenter Evidence.

Gemäß ADR-023 muss der finale UI-Lifecycle:

- M5 als **Security & Privacy Ready** darstellen,
- umfassendes **Production Ready** nur aus dem vollständigen technischen Gesamtvertrag ableiten,
- **Produktion freigegeben** nur nach separatem Release-Gate darstellen,
- keinen Auto-Release und keinen ungesicherten Produktionsbutton einführen.

## Kritische Integrationszonen

### `tooling/factory-ui/production-readiness-status.test.mjs`

#134 und #166 berühren dieselbe Acceptance-Foundation. Die finale Version muss Reference-Fail-closed-Verhalten, M5/M6-Trennung und ADR-023-Lifecycle gemeinsam beweisen.

### `tooling/factory-ui/app.js`

Die UI darf ausschließlich sanitizierte, kanonische Readiness-Daten darstellen und keine Provider-/Release-Aktion erfinden.

### `tooling/factory-ui/production-readiness-status.js`

Text-/Lifecycle-Ableitung muss ADR-023 folgen; M5-internes `productionReady` darf nicht mit umfassendem Production Ready gleichgesetzt werden.

### `tooling/factory-ui/model.mjs`

Der Snapshot bleibt Datenquelle; kein veralteter M5/M6-Vertrag, kein zirkuläres Readiness-Gate und keine automatische Release-Autorisierung.

## Finales Validierungs-/Codex-Gate

Auf dem tatsächlichen gemeinsamen Factory-Integrationshead:

1. `main`, alle offenen PRs, finalen Head, CI, Reviews, Threads und Mergeability live prüfen.
2. vollständige literal Exact-Head-CI exakt auf diesem Head.
3. vollständiger ChatGPT Security-/Architecture-/UI-/Lifecycle-Review.
4. Findings gebündelt beheben.
5. vollständige Exact-Head-CI erneut grün.
6. genau ein finaler Codex-Review **Sol/max**.
7. bei echtem Codex-Finding: einmal beheben → Exact-Head-CI → genau ein Re-Review.
8. keine offenen relevanten Threads/Blocker.
9. Expected-Head-Squash-Merge.
10. Post-Merge-CI prüfen.
11. #134, #136 und #166 als integriert/superseded schließen.

## Acceptance nach Integration

Mindestens:

- zehn M6-Kriterien read-only und kanonisch sichtbar,
- M5 als Security & Privacy Ready all-required/fail-closed,
- Preview vorbereitet/deployed/geprüft später unterscheidbar,
- Production Ready bleibt umfassender technischer Pre-Release-Zustand,
- Produktion freigegeben bleibt separate finale Release-Stufe,
- „Was fehlt?“ stammt aus kanonischer Evidence,
- inkonsistente Zustände fallen fail-closed zurück,
- technische Evidence allein führt nie zur Produktionsfreigabe,
- `releaseProduction` bleibt deaktiviert, bis ein eigener kontrollierter Release-Slice existiert,
- keine Provider-IDs, DB-Adressen, Connection Strings oder Secretwerte sichtbar,
- keine zweite Generator-, Readiness-, Provider- oder Lifecycle-Plattform.

## Nicht enthalten

- kein Merge,
- kein Codex-Aufruf,
- kein Providerwrite,
- kein Deployment,
- keine produktive Migration,
- keine Secretänderung,
- keine Produktionsfreigabe.
