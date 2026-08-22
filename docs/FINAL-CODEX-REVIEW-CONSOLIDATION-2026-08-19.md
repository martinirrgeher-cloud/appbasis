# AppBasis – finale Codex-Review-Konsolidierung

Stand: 2026-08-19, 17:43 Europe/Vienna

## Status

Diese Datei optimiert ausschließlich die noch offenen Review-/Merge-Pakete. Sie verändert weder #163 noch #165, löst keinen Codex-Review aus und führt keine produktive/externe Aktion aus.

Live verifizierter Ausgangsstand:

- `main`: `e7fb8dbd5e76041109e2f045eabc50fc803c13a0`
- 28 offene PRs: #134, #135, #136, #139, #142–#144, #146–#166
- #163: `ab0e2c609c96463ddc015a4227589d22f5a7f2b1`, Draft, mergeable, CI #1173 PASS
- #165: `dc82bf4e4e89f7bc2261670f90a6bdc85743a727`, Base #163 `ab0e2c...`, Draft, mergeable, CI #1200 PASS
- #164: `6cb9fcccb064bb5434d3ac79e5f109eff9fc83d6`, exakt eine geänderte Datei, CI #1174 PASS, inzwischen Draft
- #134: `e7782a20702fd1fe054ebbef10001e42b9afb1f5`, CI #983 PASS, inzwischen Draft; frühere Codex-Findings auf älteren Heads aufgelöst, aber kein Codex-Review auf finalem Head
- #136: `5a61d2b486903d61de0dc81ccb73611f942ccff3`, CI #993 PASS
- #166: `b7d45a4f258cdf99e40cf0578f2198add1262fec`, CI #1180 PASS auf damaligem Source-Tree
- #135 bleibt Vorbereitungsstrang ohne Codex

Alle SHAs/CI-Zustände müssen vor späteren Aktionen erneut live geprüft werden.

## Ergebnis: nur drei sichere finale Codex-Reviews

### Review 1 – #163 unverändert

**PR:** #163 / finaler M5-Integrationshead  
**Modell:** Sol / max

#163 umfasst bereits die 21 ersetzten M5-PRs #139, #142–#144 und #146–#162. Keine weitere Änderung auf diesem eingefrorenen Head.

Nach erfolgreichem finalen Codex, Expected-Head-Squash-Merge und Post-Merge-CI werden die 21 ersetzten M5-PRs ohne eigene Codex-Reviews geschlossen.

### Review 2 – finaler #165-Integrationshead inklusive #164-Acceptance

**Basis:** neuer `main` nach #163-Merge  
**Modell:** Sol / max

Der separate #164-Codex entfällt. #164 ändert exakt:

- `docs/M4-RECOVERY-ACCEPTANCE-2026-08-17.md`

Beim ohnehin notwendigen #165-Restack wird zusätzlich ausschließlich dieser docs-only Acceptance-Record übernommen.

Erlaubter finaler Diff:

- die bisherigen exakt 12 #165-Pfade,
- plus ausschließlich `docs/M4-RECOVERY-ACCEPTANCE-2026-08-17.md`.

Jeder andere Zusatzpfad = STOP.

Danach: neuer Diff-Check → vollständige literal Exact-Head-CI → ChatGPT Architektur-/Security-/Operations-Review → genau ein finaler Sol/max-Codex → Expected-Head-Squash-Merge → Post-Merge-CI. Anschließend #164 als integriert/superseded schließen.

### Review 3 – gemeinsamer Factory-Readiness-Integrations-PR aus #134 + #136 + #166

**Basis:** neuer `main` nach erfolgreichem #165-Merge  
**Modell:** Sol / max

Die drei Zwischen-PRs teilen dieselbe `tooling/factory-ui`-Foundation und überlappen in Acceptance-/Readiness-Code. Sie werden seriell in genau einen neuen finalen PR auf aktuellem `main` integriert.

Aktuelle Pfad-Union der drei Zwischenstände: zwölf eindeutige Dateien:

1. `docs/M5-PRODUCTION-SECURITY-PRIVACY-SCOPE.md`
2. `docs/M6-RELEASE-READINESS-UI-SLICE.md`
3. `package.json`
4. `tooling/factory-ui/app.js`
5. `tooling/factory-ui/model-production-readiness-evidence.test.mjs`
6. `tooling/factory-ui/model.mjs`
7. `tooling/factory-ui/production-readiness-status.js`
8. `tooling/factory-ui/production-readiness-status.test.mjs`
9. `tooling/factory-ui/production-readiness.test.mjs`
10. `tooling/factory-ui/reference-control-plane-evidence.mjs`
11. `tooling/factory-ui/reference-control-plane-evidence.test.mjs`
12. `tooling/factory-ui/server.mjs`

Keine Runtime-, Schema-, Migration-, Manifest-, Providerwrite- oder Release-Aktion darf dadurch entstehen.

## Verbindliche Terminologie ist jetzt entschieden

ADR-023 wurde am 19.08.2026 bestätigt:

1. **Security & Privacy Ready** = M5 12/12.
2. **Production Ready** = vollständiger technischer Pre-Release-Zustand.
3. **Produktion freigegeben** = Production Ready plus separate ausdrückliche finale Release-Freigabe und separates Release-Gate.

Damit ist der frühere Terminologie-Blocker geschlossen. Die notwendige UI-/Acceptance-Anpassung wird **direkt in Review 3** aufgenommen und durch denselben einmaligen Sol/max-Codex-Review abgedeckt. Es entsteht **kein zusätzlicher Terminologie-Review**.

Das interne M5-Feld `productionReady` darf aus Kompatibilitätsgründen zunächst bestehen bleiben, darf aber im finalen UI nicht als umfassender Production-Ready-Zustand interpretiert werden.

## Reference-Evidence-Freshness vor Review 3

#134 akzeptiert Reference-Control-Plane-Evidence nur aus dem neuesten erfolgreichen Workflow-Dispatch auf `main`, dessen `head_sha` exakt dem dann aktuellen `main` entspricht.

Nach #165-Post-Merge-PASS und vor Review 3 muss deshalb einmal manuell auf dem dann aktuellen `main` gestartet werden:

- Workflow: `M5 Reference Control Plane Evidence`
- Datei: `.github/workflows/m5-reference-control-plane-evidence.yml`
- Event: `workflow_dispatch`
- Branch: `main`

Ein heutiger Lauf wird bewusst nicht gestartet, weil vorgelagerter Main-Drift ihn absichtlich invalidieren würde.

Erst nach erfolgreichem frischem Evidence-Run: #134-Evidence revalidieren → #136/#166 + ADR-023-Terminologie integrieren → Exact-Head-CI → ChatGPT Security-/Architecture-/UI-Review → ein finaler Sol/max-Codex → Merge-Gate → Expected-Head-Squash-Merge → Post-Merge-CI.

Danach #134, #136 und #166 als integriert/superseded schließen.

## #135 – ausdrücklich kein eigener Codex

#135 bleibt Draft-Vorbereitungsstrang. Nach Verbrauch/Übernahme der stabilen Unterlagen wird er entweder geschlossen oder nur gezielt in fachlich passende Integrationsslices übernommen. Kein pauschales Merge der Prep-Historie.

## Nicht weiter reduzieren

- #163 + #165 nicht zusammenziehen: zu große und semantisch unterschiedliche M5-Security-/Privacy- versus M6-Production-Path-Grenze.
- #165 + Factory UI/Reference nicht zusammenziehen: Production-Path und Factory-/Reference-Evidence-Foundation bleiben getrennt.
- keine Codex-Reviews auf superseded M5-Einzel-PRs oder #135.

## Finaler minimaler Codex-Plan

1. **#163 – Sol/max**.
2. **#165 + #164-Acceptance – Sol/max**.
3. **finaler #134 + #136 + #166 + ADR-023-Terminologie-Integrations-PR – Sol/max**.

Damit bleiben exakt **drei** finale Codex-Reviews geplant.
