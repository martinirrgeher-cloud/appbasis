# AppFactory – Integrationsplan UI / M5 / M6

Stand der Planung: 2026-08-19, 06:57 Europe/Vienna

## Zweck

Dieser Plan beschreibt, wie der Factory-Lifecycle-Slice aus #166 später sicher auf den tatsächlich finalen M5/M6-Unterbau gebracht wird. Er führt **keinen Merge, keinen Providerwrite und keine Produktionsfreigabe** aus.

SHAs und CI-Angaben in dieser Datei sind nur der bei der Planung verifizierte Ausgangspunkt. Vor jedem weiteren Änderungsschritt ist der Live-State erneut maßgeblich.

## Live-Ausgangspunkt dieser Synchronisierung

| Element | verifizierter Stand | CI |
|---|---|---|
| `main` | `e7fb8dbd5e76041109e2f045eabc50fc803c13a0` | aktueller Main-Head |
| #163 – M5 Final Hardening | `ab0e2c609c96463ddc015a4227589d22f5a7f2b1` | #1173 PASS, literal Exact-Head |
| #165 – ULC M6 Production Preflight | `63cf29c6978204d68de1584da3273b2218be75d2` | #1192 PASS, Exact-Head |
| #136 – read-only M6 UI | `5a61d2b486903d61de0dc81ccb73611f942ccff3` | #993 PASS |
| #166 – Lifecycle UI | `b7d45a4f258cdf99e40cf0578f2198add1262fec` | #1180 PASS auf byte-identischem Source-Tree; vor Finalreview literal Exact-Head erforderlich |

Alle genannten PRs sind weiterhin Zwischenstände; kein alter PR-Text ersetzt den späteren Live-Check.

## Seit der Erstfassung geschlossen: Production Security Logging

Die frühere Vorbereitung hatte korrekt erkannt, dass #165 reale M5-F-Logging-Evidence verlangte, ohne einen eigenen mutierenden Logging-Sink-Schritt zu besitzen.

Der aktuelle #165-Head hat diese Lücke geschlossen:

- 14 statt 13 gepinnte M6-Schritte,
- eigener Schritt **Production Security Logging einrichten**,
- Schrittklasse `provider-write`,
- ausdrückliche Nutzerfreigabe erforderlich,
- strukturierte Event-Erfassung,
- geschützter operativer Zugriff,
- exakt 12 Monate Retention,
- vollständiges Sink-Inventar,
- keine öffentliche Read-API,
- Logging-/Delivery-Konfiguration liegt vor Worker-Deploy und vor M5-Production-Evidence,
- bestehender M5-F-Evidence-Owner bleibt maßgeblich.

Damit ist dieser frühere Repository-/Planungsblocker im aktuellen #165-Vertrag **geschlossen**. Vor einem realen Providerwrite muss der dann aktuelle Head trotzdem erneut live geprüft werden.

## Noch offen: kanonische Readiness-Terminologie

Die Projektquellen unterscheiden nicht überall sauber genug zwischen drei Begriffen:

1. **M5 – Production Security & Privacy Ready v0.1**
   - zwölf Security-/Privacy-Pflichtkriterien,
   - Repository-Feld heute `productionReady`,
   - fehlendes Kriterium hält dieses Gate fail-closed offen.
2. **Production Ready v0.1** in der späteren Roadmap-Definition
   - zusätzlich Backup/DR + realer Restore,
   - getrennte Produktionsdatenbank und Produktions-Worker,
   - kontrollierte Domain/Migrationen,
   - Security/Privacy,
   - Post-Deploy-Smoke,
   - ausdrücklich genannte Freigabe.
3. **FC1-Lifecycle**
   - führt `Production Ready` und `Produktion freigegeben` ausdrücklich als getrennte Zustände.

Deshalb darf #166 das interne M5-Feld `productionReady` nicht allein aufgrund seines Namens als endgültigen FC1-Zustand `Production Ready` darstellen.

### Sichere Zwischenrichtung

Bis zur formalen Sol-Entscheidung:

- M5 in der UI als **Security & Privacy Ready** behandeln,
- `Production Ready` für den später kanonisch definierten vollständigen Pre-Release-Gesamtzustand reservieren,
- `Produktion freigegeben` ausschließlich nach separatem Release-Gate,
- keine bestehende Backend-Feldbenennung als UI-/Architekturentscheidung interpretieren.

Vor der finalen #166-Integration muss geklärt werden, welche in der Roadmap genannte „ausdrückliche Freigabe“ Voraussetzung für Production Ready ist und welche Freigabe das separate Release-Gate autorisiert. Eine Grundsatzpräzisierung wird zuerst im Entscheidungsregister und danach konsistent in Betriebsakte/Roadmap/Runbook nachgezogen.

## Integrationsgrundsatz

Der UI-Stack darf nie vor den kanonischen M5/M6-Verträgen zur neuen Wahrheit werden.

Reihenfolge:

1. tatsächlichen M5-Unterbau finalisieren,
2. tatsächlichen M6-Unterbau darauf finalisieren,
3. #136 read-only M6-Darstellung auf diesen Stand bringen,
4. #166-spezifischen Lifecycle-Diff darauf anwenden,
5. vollständige literal Exact-Head-CI,
6. ChatGPT-Diff-/Architektur-/Security-/Lifecycle-Review,
7. Findings gebündelt beheben,
8. erneut vollständige Exact-Head-CI,
9. genau ein finaler Codex-Review auf dem unveränderten finalen Head,
10. Merge-Gate und Post-Merge-CI.

Keine Blind-Cherry-Picks nach alten SHAs.

## Phase 1 – M5-Vertragsbasis

#163 ist derzeit der breite Vor-Codex-M5-Härtungsstand und besitzt den literal Exact-Head-CI-Vertrag.

Vor Integration prüfen:

- tatsächlicher Head unverändert oder neue Basis,
- vollständige Exact-Head-CI,
- finaler Codex-Review exakt auf dem finalen Head,
- keine offenen relevanten Review-Threads,
- mergebar,
- nach Merge Post-Merge-CI auf `main` grün.

## Phase 2 – M6-Vertragsbasis

#165 ist auf #163 gestapelt und hat jetzt den kontrollierten 14-Schritte-Pfad bis zum expliziten Release-Gate.

Für die spätere UI maßgeblich:

- M5 und M6 bleiben getrennte Gates,
- Logging-Sink-Setup ist eigener freigabepflichtiger Schritt,
- Restore und Post-Deploy-Smokes sind mutierende, freigabepflichtige Schritte,
- technische M6-Evidence kann Release nicht selbst autorisieren,
- Preview-Akzeptanz bleibt eigener Nachweis,
- Provider-/Resource-Evidence bleibt sanitisiert und fail-closed.

Falls #163 nach Codex verändert wird, muss #165 auf die neue Basis gezogen und vollständig neu Exact-Head-CI + ChatGPT-geprüft werden.

## Phase 3 – #136 auf finale Basis bringen

#136 macht die zehn M6-Kriterien read-only sichtbar.

Nach finalem M5/M6-Unterbau:

- isolierten #136-Diff neu prüfen,
- keine alte Snapshot-/Gate-Semantik zurückbringen,
- kanonische M6-Kriterien weiterverwenden,
- keine Provider-/Release-Aktion ergänzen,
- vollständige literal Exact-Head-CI.

## Phase 4 – #166 spezifisch integrieren

Erst danach den Lifecycle-Slice übernehmen:

- verständliche Lifecycle-Orientierung,
- „Was fehlt?“ / nächster sicherer Schritt,
- M5 als **Security & Privacy Ready** darstellen,
- endgültiges `Production Ready` erst nach formaler Terminologieentscheidung,
- `Produktion freigegeben` separat,
- fail-closed bei widersprüchlicher Preview-/M5-/M6-Evidence,
- kein Produktionsbutton und kein `releaseProduction`-Enablement.

## Konflikt-/Review-Zonen

### Textuell wahrscheinlich

`tooling/factory-ui/production-readiness-status.test.mjs`

- #163 verändert M5-/Evidence-Acceptance,
- #166 erweitert Lifecycle-/Fail-closed-Acceptance,
- finale Version muss beide Ziele erhalten.

### Stack-lokal #136/#166

- `tooling/factory-ui/app.js`
- `tooling/factory-ui/production-readiness-status.js`

#166 baut direkt auf #136. Die zehn M6-Kriterien dürfen beim Replay nicht verloren gehen.

### Semantisch kritisch

`tooling/factory-ui/model.mjs`

- liefert die Snapshot-/Readiness-Daten,
- darf keinen veralteten M5/M6-Vertrag zurückbringen,
- UI darf keine Criteria-Zahl, Readiness oder Release-Autorisierung selbst erfinden.

## Finales #166-Validierungs-/Codex-Gate

Auf dem tatsächlichen finalen Integrationshead:

1. `main`, alle offenen PRs, Heads, CI, Reviews, Threads, Mergeability live prüfen.
2. Finalen #166-Head festhalten.
3. Vollständige literal Exact-Head-CI exakt auf diesem Head.
4. ChatGPT-Diff-/Architektur-/Security-/Lifecycle-Review gegen aktuellen `main`.
5. Findings gebündelt beheben.
6. Vollständige literal Exact-Head-CI erneut grün.
7. Genau einen finalen Codex-Review auf dem unveränderten finalen Head.
8. Nur bei echtem Codex-Finding: beheben → Exact-Head-CI → genau ein Re-Review.
9. Keine offenen relevanten Threads/Blocker; PR mergebar.
10. Merge mit Expected-Head-SHA.
11. Post-Merge-CI prüfen.

## Acceptance nach Integration

Mindestens:

- zehn M6-Kriterien read-only und kanonisch sichtbar,
- M5 Security & Privacy all-required/fail-closed,
- Preview vorbereitet/deployed/geprüft später unterscheidbar,
- `Security & Privacy Ready`, `Production Ready`, `Produktion freigegeben` verwenden die verbindlich beschlossene Semantik,
- „Was fehlt?“ stammt aus kanonischer Evidence,
- inkonsistente Zustände fallen fail-closed zurück,
- vollständige technische Evidence führt ohne separates Release-Gate zu keiner Produktionsfreigabe,
- `releaseProduction` bleibt deaktiviert, bis ein eigener späterer freigegebener Slice existiert,
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
