# AppBasis – finale Codex-Review-Konsolidierung

Stand: 2026-08-19, 17:04 Europe/Vienna

## Status

Diese Datei optimiert ausschließlich die noch offenen Review-/Merge-Pakete. Sie verändert weder #163 noch #165, löst keinen Codex-Review aus und führt keine produktive/externe Aktion aus.

Live verifizierter Ausgangsstand:

- `main`: `e7fb8dbd5e76041109e2f045eabc50fc803c13a0`
- 28 offene PRs: #134, #135, #136, #139, #142–#144, #146–#166
- #163: `ab0e2c609c96463ddc015a4227589d22f5a7f2b1`, Draft, mergeable, CI #1173 PASS, keine Reviews/Threads
- #165: `dc82bf4e4e89f7bc2261670f90a6bdc85743a727`, Base #163 `ab0e2c...`, Draft, mergeable, CI #1200 PASS, keine Reviews/Threads
- #164: `6cb9fcccb064bb5434d3ac79e5f109eff9fc83d6`, exakt eine geänderte Datei, CI #1174 PASS, keine Reviews/Threads
- #134: `e7782a20702fd1fe054ebbef10001e42b9afb1f5`, CI #983 PASS; drei frühere Codex-Findings auf älteren Heads sind aufgelöst, aber es existiert kein Codex-Review auf dem finalen Head
- #136: `5a61d2b486903d61de0dc81ccb73611f942ccff3`, CI #993 PASS, keine Reviews
- #166: `b7d45a4f258cdf99e40cf0578f2198add1262fec`, CI #1180 PASS, keine Reviews
- #135: `c70e8d926f03e96c09512d0ea5608e39cdc9db22`, CI #1222 PASS, keine Reviews; bleibt Vorbereitungsstrang ohne Codex

Alle SHAs/CI-Zustände müssen vor späteren Aktionen erneut live geprüft werden.

---

## Ergebnis: fünf geplante Reviews auf drei sichere finale Codex-Reviews reduzieren

### Review 1 – #163 unverändert

**PR:** #163 / finaler M5-Integrationshead  
**Modell:** Sol / max

Keine weitere Konsolidierung auf #163.

Grund:

- #163 umfasst bereits die 21 ersetzten M5-PRs #139, #142–#144 und #146–#162.
- Eine zusätzliche Änderung würde den bewusst eingefrorenen finalen Head, die Exact-Head-CI und den morgigen ersten Review-Gate unnötig invalidieren.
- #163 und #165 werden nicht zu einem einzigen Mega-Review zusammengezogen: M5 ist das eigenständige Security-/Privacy-Gate und M6 konsumiert diesen Stand als separate Voraussetzung. Der gemeinsame Diff wäre zu groß und würde die Review-Grenze verschlechtern.

Nach erfolgreichem Codex, Expected-Head-Squash-Merge und Post-Merge-CI werden die 21 ersetzten M5-PRs ohne eigene Codex-Reviews geschlossen.

---

### Review 2 – finaler #165-Integrationshead inklusive #164-Acceptance-Record

**Basis:** neuer `main` nach #163-Merge  
**Modell:** Sol / max

Der bisher geplante separate Codex-Review für #164 kann entfallen.

#164 ändert exakt eine Datei:

- `docs/M4-RECOVERY-ACCEPTANCE-2026-08-17.md`

Diese Datei dokumentiert M4 DONE für `m3-preview` und ist fachlich eine direkte Voraussetzung des M6-Pfads. Sie verändert keine Runtime, kein Schema, keine Migration, keine Security Boundary und keinen Providerzustand.

Deshalb wird nach erfolgreichem #163-Post-Merge-Gate beim ohnehin notwendigen #165-Restack zusätzlich exakt dieser #164-Commit/Inhalt auf den neuen #165-Finalhead übernommen.

Die heutige #165-Restack-Allowlist erweitert sich damit kontrolliert von 12 auf maximal 13 Pfade:

- die bisherigen exakt 12 #165-Pfade,
- plus ausschließlich `docs/M4-RECOVERY-ACCEPTANCE-2026-08-17.md`.

Jeder andere Zusatzpfad bleibt STOP.

Danach:

1. Diff gegen neuen `main` prüfen: exakt die 12 M6-Pfade + der eine M4-Acceptance-Record.
2. vollständige neue literal Exact-Head-CI.
3. ChatGPT Diff-/Architektur-/Security-/Operations-Review inklusive der M4→M6-Voraussetzungsbindung.
4. genau ein finaler Codex-Review auf diesem finalen #165-Integrationshead.
5. Expected-Head-Squash-Merge und Post-Merge-CI.
6. #164 als `superseded/integrated by final #165` schließen; kein eigener Codex, kein eigener Merge.

Damit wird ein separater Terra-Review und ein separater Merge-/Post-Merge-Zyklus eingespart, ohne Security- oder Runtime-Grenzen zu vermischen.

---

### Review 3 – ein finaler Factory-Readiness-Integrations-PR aus #134 + #136 + #166

**Basis:** neuer `main` nach erfolgreichem #165-Merge  
**Modell:** Sol / max

#134 und der UI-Stack #136/#166 sollen nicht mehr separat final reviewed werden. Sie werden seriell in genau einen neuen finalen Factory-Readiness-Integrations-PR auf aktuellem `main` übertragen.

Warum diese Konsolidierung fachlich passt:

- alle drei PRs liegen in derselben `tooling/factory-ui`-Foundation,
- #134 ändert den sicherheitsrelevanten Reference-M5-Evidence-Consumer und Factory-Snapshot,
- #136/#166 visualisieren denselben Production-/Release-Readiness-Zustand read-only,
- #134 und #166 überlappen bereits in `tooling/factory-ui/production-readiness-status.test.mjs`, sodass eine spätere getrennte Integration ohnehin erneut gemeinsam geprüft werden müsste,
- eine serielle gemeinsame Integration vermeidet zwei Restacks, zwei Exact-Head-CI-Zyklen und zwei Codex-Reviews derselben Foundation.

Aktuelle Pfad-Union der drei PRs: exakt 12 eindeutige Dateien:

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

Die gemeinsame Integration darf keine Runtime-, Schema-, Migration-, Manifest-, Providerwrite- oder Release-Aktion hinzufügen.

#### Reference-Evidence-Freshness vor finalem Review

#134 akzeptiert Reference-Control-Plane-Evidence nur aus dem neuesten erfolgreichen Workflow-Dispatch auf `main`, dessen `head_sha` exakt dem zu diesem Zeitpunkt aktuellen `main` entspricht.

Der Workflow ist:

- `M5 Reference Control Plane Evidence`
- `.github/workflows/m5-reference-control-plane-evidence.yml`
- Event: `workflow_dispatch`
- Branch: `main`

Deshalb muss nach dem letzten vorgelagerten Main-Merge (#165) und vor dem finalen gemeinsamen Factory-Review **ein frischer manueller Workflow-Dispatch auf dem dann aktuellen `main`** erfolgreich laufen. Ein heute gestarteter Run wäre nach morgigem Main-Drift absichtlich wertlos.

Erst danach:

1. #134-spezifische Evidence gegen aktuellen `main` revalidieren.
2. #136/#166 semantisch konsolidieren.
3. Terminologie nur gemäß dann verbindlicher Architekturentscheidung integrieren.
4. vollständige Exact-Head-CI.
5. vollständiger ChatGPT Security-/Architecture-/UI-Review.
6. genau ein finaler Codex-Review **Sol/max**, weil der gemeinsame PR den sicherheitsrelevanten Reference-Evidence-Consumer enthält.
7. Merge-Gate + Expected-Head-Squash-Merge + Post-Merge-CI.
8. #134, #136 und #166 als durch den finalen Integrations-PR ersetzt schließen.

Damit entfallen ein separater #134-Sol-Review und ein separater #136/#166-Terra-Review zugunsten eines einzigen, sicherheitsadäquaten Sol-Reviews.

---

## Terminologie-Entscheidung als Review-Sparhebel

Die bestehende Empfehlung bleibt:

1. `Security & Privacy Ready` = M5 12/12,
2. `Production Ready` = vollständiger technischer Pre-Release-Zustand,
3. `Produktion freigegeben` = separates Release-Gate.

Wenn diese Grundsatzentscheidung **vor** dem finalen #134/#136/#166-Integrations-PR ausdrücklich bestätigt wird, kann die notwendige Terminologie-/UI-Anpassung in denselben finalen Head aufgenommen und durch denselben einmaligen Sol-Review abgedeckt werden.

Wenn die Entscheidung erst danach getroffen wird, entsteht voraussichtlich ein zusätzlicher späterer UI-/Terminologie-Review. Deshalb ist eine frühzeitige Betreiberentscheidung sinnvoll; sie wird durch dieses Dokument jedoch nicht vorweggenommen.

---

## #135 – ausdrücklich kein eigener Codex

#135 bleibt bis zur Nutzung seiner Runbooks/Vorbereitungen ein Draft-Vorbereitungsstrang.

Kein eigener finaler Codex-Review wird dafür geplant. Nach Verbrauch/Übernahme der noch relevanten Vorbereitungsunterlagen wird #135 entweder:

- als operationaler Vorbereitungs-PR geschlossen, oder
- nur mit gezielt noch benötigten stabilen Dokumenten in einen späteren fachlich passenden Integrationsslice überführt.

Kein pauschales Merge der gesamten Prep-Historie nur um den PR zu schließen.

---

## Finaler minimaler Codex-Plan

Unter Beibehaltung der Security-/Architekturgrenzen sind ab jetzt nur noch drei finale Codex-Reviews sinnvoll:

1. **#163 – Sol/max** – M5 final.
2. **#165 + #164-Acceptance – Sol/max** – M6-Preflight + M4-Acceptance integriert.
3. **finaler #134 + #136 + #166 Factory-Integrations-PR – Sol/max** – Reference-Evidence + read-only Lifecycle-UI gemeinsam.

Nicht sinnvoll weiter reduzierbar:

- #163 + #165 nicht zusammenziehen: zu große und semantisch unterschiedliche Security-/M6-Grenze.
- #165 + Factory UI/Reference nicht zusammenziehen: Runtime-/Production-Path und UI-/Reference-Evidence-Foundation bewusst getrennt halten.
- keinen Codex auf superseded M5-Einzel-PRs oder #135 verbrauchen.

Damit sinkt der verbleibende geplante Codex-Bedarf gegenüber der bisherigen Queue von fünf auf **drei** finale Reviews.