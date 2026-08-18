# AppFactory – Integrationsplan UI / M5 / M6

Stand der Planung: 2026-08-18, 21:09 Europe/Vienna

## Zweck

Dieser Plan beschreibt, wie der Factory-Lifecycle-Slice aus #166 später sicher auf den tatsächlichen finalen M5/M6-Integrationsstand gebracht wird. Er führt **jetzt keine Integration und keinen Merge** aus.

Die hier genannten SHAs sind ein dokumentierter Ausgangspunkt, keine dauerhafte Wahrheit. **Vor jedem Rebase, Merge, Codex-Review oder weiteren Änderungsschritt muss der Live-State erneut geprüft werden.**

## Live-Ausgangspunkt bei Erstellung

| Element | Stand | CI |
|---|---|---|
| `main` | `e7fb8dbd5e76041109e2f045eabc50fc803c13a0` | letzter aktueller Main-Stand beim Check |
| #163 – M5 Final Hardening | `ab0e2c609c96463ddc015a4227589d22f5a7f2b1` | #1173 PASS, literal Exact-Head |
| #165 – ULC M6 Production Preflight | `47a69c5891c1bc2a365a240f1f31fbd3539ffa4f` | #1187 PASS, Exact-Head |
| #136 – read-only M6 UI | `5a61d2b486903d61de0dc81ccb73611f942ccff3` | #993 PASS |
| #166 – Lifecycle UI | `b7d45a4f258cdf99e40cf0578f2198add1262fec` | #1180 PASS auf byte-identischem Source-Tree; vor Finalreview literal Exact-Head erneut erforderlich |

Zum Zeitpunkt dieses Plans: keine eingereichten Reviews und keine offenen Review-Threads auf #136, #163, #165 oder #166.

## Integrationsgrundsatz

Der UI-Stack darf nicht vor den kanonischen M5/M6-Verträgen zur neuen Wahrheit werden. Deshalb:

1. zuerst den **tatsächlich akzeptierten** M5/M6-Unterbau konsolidieren,
2. danach die read-only M6-UI-Semantik aus #136 auf diesen Stand bringen,
3. anschließend ausschließlich den spezifischen Lifecycle-UI-Diff aus #166 darauf anwenden,
4. erst auf diesem tatsächlichen finalen Head das finale Review-/Merge-Gate durchlaufen.

Keine Blind-Cherry-Picks anhand dieser Datei. Die konkrete Integrationsreihenfolge wird beim späteren Live-Check aus dem dann aktuellen Main und den noch offenen PR-Abhängigkeiten abgeleitet.

## Empfohlene Zielreihenfolge

### Phase 1 – M5-Vertragsbasis festziehen

#163 ist aktuell der breite M5-Härtungsstand und enthält zusätzlich den korrigierten literal Exact-Head-CI-Vertrag.

Vor einer UI-Finalisierung muss geklärt sein:

- ob #163 unverändert final ist,
- ob sein einmaliger finaler Codex-Review erfolgreich abgeschlossen wurde,
- ob er gemäß Merge-Gate auf den dann aktuellen `main` integriert wurde,
- ob Post-Merge-CI auf `main` grün ist.

### Phase 2 – M6-Vertragsbasis festziehen

#165 ist aktuell auf #163 gestapelt und definiert den konkreten ULC-M6-Pfad bis unmittelbar vor Providerwrites.

Für #166 ist entscheidend, dass nach der finalen M6-Integration weiterhin gilt:

- M5 und M6 bleiben getrennte Gates,
- M6 kann Production Release nicht selbst autorisieren,
- Preview-Akzeptanz bleibt ein eigener M6-Nachweis,
- vollständige technische Evidence ersetzt keine ausdrückliche Release-Freigabe,
- Provider-/Resource-Evidence bleibt sanitisiert und fail-closed.

#165 verändert derzeit keine #166-UI-Datei. Trotzdem muss #166 nach der finalen M6-Vertragsintegration semantisch erneut getestet werden, weil sein UI aus den Readiness-/Snapshot-Verträgen liest.

### Phase 3 – #136 auf finale Basis integrieren

#136 ist die direkte fachliche UI-Basis von #166 und macht die zehn M6-Kriterien read-only sichtbar.

Nach dem Upstream-M5/M6-Stand:

- #136-Diff neu gegen den aktuellen Main prüfen,
- keine alte Gate-/Snapshot-Semantik zurückbringen,
- bei Konflikten die aktuelle kanonische M5/M6-Semantik behalten und nur die read-only Darstellung neu anwenden,
- vollständige CI auf dem tatsächlichen neuen Head.

### Phase 4 – #166 spezifisch integrieren

Erst danach den spezifischen #166-Slice übernehmen:

- Lifecycle-Orientierung,
- `Nächster sicherer Schritt`,
- klare Trennung `Production Ready` / `Produktion freigeben`,
- fail-closed Cross-Gate-Darstellung,
- kein Produktionsbutton / keine Release-Aktion.

Nicht blind den alten #166-Head mergen, wenn seine Basis nicht mehr dem finalen Main entspricht.

## Bekannte Konflikt-/Review-Zonen

### Textuell wahrscheinlich

`tooling/factory-ui/production-readiness-status.test.mjs`

- wird von #163 verändert,
- wird auch von #166 erweitert,
- Konfliktauflösung muss **beide** Ziele erhalten: finalen M5-Vertrag plus Lifecycle-/Fail-closed-UI-Acceptance.

### Stack-lokal #136/#166

- `tooling/factory-ui/app.js`
- `tooling/factory-ui/production-readiness-status.js`

#166 baut hier direkt auf #136 auf. Bei Rebase/Replay darf die #136-Darstellung der zehn M6-Kriterien nicht verloren gehen.

### Semantisch kritisch, auch ohne Textkonflikt

`tooling/factory-ui/model.mjs`

- wird vom M5-Integrationsstand beeinflusst,
- liefert Snapshot-/Readiness-Daten, die #166 darstellt,
- nach Integration muss geprüft werden, ob #166 alle neuen/verschärften Fail-closed-Zustände korrekt abbildet.

Außerdem alle kanonischen M5-/M6-Evaluator-/Evidence-Verträge, soweit sie den Snapshot formen. UI darf keine veraltete Kriterienzahl oder implizite Freigabelogik festschreiben.

## Finales Validierungs- und Codex-Gate für #166

Auf dem **tatsächlichen finalen Integrationshead**:

1. Live-State prüfen: `main`, alle offenen PRs, reale Heads, CI, Reviews, Threads, Mergeability.
2. Finalen #166-Integrationshead eindeutig festhalten.
3. Vollständige CI mit literal Checkout von `pull_request.head.sha` exakt auf diesem Head ausführen.
4. ChatGPT-Diff-/Architektur-/Security-/Lifecycle-Review gegen den dann aktuellen Main.
5. Findings, falls vorhanden, **gebündelt** beheben.
6. Vollständige literal Exact-Head-CI erneut grün.
7. **Genau einen** finalen Codex-Review auf dem unveränderten finalen Head anfordern.
8. Nur bei einem echten Codex-Finding: einmal gebündelt beheben → Exact-Head-CI → genau ein Re-Review.
9. Prüfen: keine offenen relevanten Review-Threads/Blocker; PR mergeable.
10. Merge mit Expected-Head-SHA schützen.
11. Post-Merge-CI auf `main` prüfen.

## Acceptance nach Integration

Mindestens nachweisen:

- zehn M6-Kriterien bleiben read-only sichtbar und kanonisch,
- M5 `Production Ready` bleibt all-required/fail-closed,
- Preview und Production Ready werden nicht gleichgesetzt,
- Production Ready und Produktion freigeben bleiben getrennt,
- „Was fehlt?“ basiert auf kanonischer Evidence,
- inkonsistente Preview-/M5-/M6-Zustände fallen fail-closed zurück,
- vollständige M6-Evidence führt nur zur Aufforderung nach ausdrücklicher Freigabe,
- `releaseProduction` bleibt ohne separat implementierten und freigegebenen späteren Slice deaktiviert,
- keine Provider-IDs, Datenbankadressen, Connection Strings oder Secretwerte werden sichtbar,
- keine neue Generator-, Gate-, Provider- oder Lifecycle-Plattform entsteht.

## Was dieser Plan ausdrücklich nicht tut

- kein Merge,
- kein Rebase,
- kein Codex-Aufruf,
- kein Providerwrite,
- kein Deployment,
- keine Produktionsdatenbankänderung,
- keine Secretänderung,
- keine Produktionsfreigabe.
