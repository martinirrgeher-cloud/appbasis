# M5/M6 – Codex- und Merge-Runbook

Stand der Vorbereitung: 2026-08-19, 12:57 Europe/Vienna

## Status

**Nur Ablaufvorbereitung. Kein Codex-Review, kein Merge und keine Provider-/Produktionsaktion wird durch dieses Dokument ausgelöst.**

Dieses Runbook konkretisiert den bestehenden AppBasis-Merge- und Codex-Vertrag für die aktuelle M5→M6-Kette. Verbindlich bleiben:

- tatsächlichen PR-Head vor Review und Merge live lesen,
- vollständige CI exakt auf diesem Head = PASS,
- ChatGPT Diff-/Architektur-/Security-Prüfung abgeschlossen,
- genau ein finaler Codex-Review auf dem tatsächlichen finalen Head,
- bei echtem Codex-Finding: Fix → Exact-Head-CI → genau ein Re-Review,
- keine offenen relevanten Review-Threads,
- PR mergebar,
- Merge möglichst mit Expected-Head-SHA schützen,
- danach neuen `main`-SHA lesen und Post-Merge-CI prüfen,
- kein Merge aufgrund eines alten Handoffs oder einer alten CI.

Alle SHA-/CI-Angaben hier sind nur ein Vorbereitungssnapshot. Am Ausführungstag werden `main`, alle offenen PRs, tatsächliche Heads, CI, Reviews, Threads und Mergeability erneut live geprüft.

## 1. Vorbereitungssnapshot

Live verifiziert am 2026-08-19, 12:57 Europe/Vienna:

- `main`: `e7fb8dbd5e76041109e2f045eabc50fc803c13a0`
- offene PRs: 28
- #163
  - Base: `main`
  - Head: `ab0e2c609c96463ddc015a4227589d22f5a7f2b1`
  - Exact-Head-CI #1173: PASS
  - Reviews: keine
  - Review-Threads: keine
  - mergeable: ja
  - Draft: ja
- #165
  - Base-Branch: `agent/m5-pre-codex-hardening` / #163
  - Base-SHA: `ab0e2c609c96463ddc015a4227589d22f5a7f2b1`
  - Head: `dc82bf4e4e89f7bc2261670f90a6bdc85743a727`
  - isolierter Diff gegen seine aktuelle #163-Basis: 12 Dateien
  - Exact-Head-CI #1200: PASS
  - Reviews: keine
  - Review-Threads: keine
  - mergeable: ja
  - Draft: ja
- Repository erlaubt Squash-Merge.
- `delete_branch_on_merge=false`; der #163-Head-Branch wird durch den Merge nicht automatisch gelöscht.

Dieser Snapshot autorisiert am Ausführungstag nichts automatisch.

## 2. Codex-Trigger – keine Doppeltrigger

Der aktuell im Repository beobachtete Codex-Hinweis nennt drei mögliche Review-Trigger:

1. PR zur Review öffnen,
2. Draft als **Ready for review** markieren,
3. `@codex review` kommentieren.

Daraus folgt:

**Nie gleichzeitig `Ready for review` und `@codex review` als zwei parallele Trigger verwenden.**

Für einen finalen Draft-PR ist der bevorzugte erste Trigger:

- genau einmal **Mark ready for review**,
- danach keinen zusätzlichen `@codex review`-Kommentar senden,
- das tatsächliche Codex-Ergebnis gegen den vorher gepinnten Head verifizieren.

Wenn der Ready-Event zusätzlich eine neue CI auf demselben Head startet, ist vor Merge **auch dieser neueste CI-Lauf vollständig PASS abzuwarten**. Ein älterer PASS-Lauf genügt dann nicht als aktuelles Merge-Gate.

Wenn Codex ein echtes Finding meldet und nach dem Fix ein neuer Head entsteht, ist der PR bereits Ready. Der einmal zulässige Re-Review wird dann über **einen einzigen** expliziten `@codex review`-Kommentar ausgelöst, der den neuen finalen SHA nennt.

### Quota-/Toolfehler

Wird der Codex-Review nachweislich nicht ausgeführt, z. B. wegen Kontingent:

- kein Merge,
- nicht blind erneut triggern,
- Head unverändert lassen,
- erst nach bestätigter Verfügbarkeit genau einen neuen expliziten Review-Trigger verwenden.

Tritt derselbe Review-/Toolfehler zweimal ohne Fortschritt auf: **STOP gemäß Loop-Regel.**

## 3. Phase A – #163 final reviewen

### A0 – Live-Start-Gate

Unmittelbar vor Codex:

1. Prüfzeit Europe/Vienna erfassen,
2. `main` neu lesen,
3. alle offenen PRs neu lesen,
4. #163 tatsächlichen Head neu lesen,
5. vollständige Exact-Head-CI verifizieren,
6. Reviews und Review-Threads lesen,
7. Mergeability lesen.

### A1 – Drift-Regel

Codex nur auslösen, wenn:

- #163 Head tatsächlich final ist,
- vollständige CI exakt auf diesem Head PASS ist,
- ChatGPT-Review exakt diesen Head abdeckt,
- keine neuen Blocking Findings/Threads bestehen,
- PR mergeable ist.

Wenn `main` seit der letzten Integrationsprüfung geändert wurde, #163 nicht blind auf dem alten Base-Zustand reviewen. Zuerst die neue Base gegen #163 prüfen. Nur wenn notwendig den PR auf den aktuellen `main`-Stand ziehen; danach vollständige Exact-Head-CI und ChatGPT-Review erneut durchführen.

### A2 – Erster Codex-Trigger

Wenn #163 weiterhin Draft ist:

- aktuellen Head pinnen,
- #163 genau einmal **Ready for review** markieren,
- keinen zusätzlichen `@codex review`-Kommentar senden.

Danach prüfen:

- wurde durch Ready eine neue CI gestartet? Dann muss deren vollständiger Lauf PASS sein,
- welcher Codex-Abschluss gehört zum Trigger,
- ist der PR-Head seit dem Trigger unverändert?

### A3 – Kein Finding

Bei positivem Codex-Abschluss ohne relevantes Finding:

1. Head erneut lesen,
2. Head muss exakt dem vor Codex gepinnten SHA entsprechen,
3. alle CI-Läufe, die für diesen finalen Head durch den Ready-/Review-Vorgang entstanden sind, müssen vollständig PASS sein,
4. keine offenen relevanten Threads,
5. mergeable.

Erst dann Phase B.

### A4 – Echtes Finding

Bei einem echten Finding:

1. nicht mergen,
2. Finding fachlich prüfen,
3. zusammengehörige Korrekturen gebündelt implementieren,
4. neuen Head erfassen,
5. vollständige Exact-Head-CI,
6. vollständiger ChatGPT Diff-/Architektur-/Security-Review,
7. wenn grün: genau ein Re-Review mit einem einzigen `@codex review` auf dem neuen SHA.

Wenn dieser einmalige Re-Review ein weiteres echtes Finding meldet:

- Finding beheben und CI/ChatGPT-Prüfung durchführen,
- **keinen dritten Codex-Review automatisch auslösen**,
- Merge bleibt blockiert, bis der Nutzer ausdrücklich über eine Ausnahme entscheidet.

## 4. Phase B – #163 mergen

### B0 – Finales Merge-Gate

Direkt vor Merge erneut live bestätigen:

- finaler #163-Head bekannt,
- vollständige aktuelle CI exakt auf diesem Head PASS,
- Codex hat exakt diesen unveränderten Head abgeschlossen,
- keine offenen relevanten Review-Threads/Blocker,
- mergeable.

### B1 – Merge

Bevorzugter Repository-Pfad:

- **Squash merge**,
- `expected_head_sha=<finaler #163 Head>`.

### B2 – Post-Merge

Nach Merge:

1. neuen `main`-SHA sofort lesen,
2. #163 als tatsächlich merged bestätigen,
3. Post-Merge-CI auf dem neuen `main` vollständig PASS prüfen.

PR-CI von #163 ist kein Ersatz für Post-Merge-CI.

Post-Merge-CI FAIL oder unbekannt: **STOP. #165 noch nicht finalisieren.**

## 5. Historische M5-PRs danach schließen

Erst nach #163-Merge **und** erfolgreicher Post-Merge-CI auf `main` dürfen die durch #163 ersetzten historischen M5-PRs geschlossen werden:

#139, #142, #143, #144, #146, #147, #148, #149, #150, #151, #152, #153, #154, #155, #156, #157, #158, #159, #160, #161, #162.

Für diese 21 PRs:

- kein eigener Codex-Review,
- kein Einzelmerge,
- als `superseded by #163` schließen,
- Traceability erhalten.

## 6. Phase C – #165 sauber auf neuen `main` bringen

#165 ist aktuell auf dem #163-Branch gestapelt. Nach einem Squash-Merge von #163 darf #165 **nicht nur blind auf `main` retargetet** werden: Die Squash-Commit-Abstammung kann sonst die alte #163-Historie in den Drei-Punkt-PR-Diff ziehen.

### C1 – Tatsächlichen Stack-Anker verwenden

Unmittelbar vor dem Stack-Transfer live lesen und pinnen:

- neuen `main`-SHA,
- tatsächlichen #165-Head,
- **tatsächlichen #165-Base-SHA**.

Der für den Transfer maßgebliche Trennpunkt ist der **wirkliche Base-SHA von #165**, nicht pauschal der finale #163-Head.

Das ist besonders wichtig, falls #163 durch ein Codex-Finding noch einen neuen Head erhalten hat:

- wenn #165 vorher nicht auf diesen neuen #163-Head gezogen wurde, bleibt sein tatsächlicher alter Base-SHA der Stack-Anker,
- nur wenn der neue #163-Head tatsächlich Base/Ancestor von #165 ist, darf er als Rebase-Trennpunkt verwendet werden.

### C2 – Kanonischer Transfer

Die #165-spezifischen Commits/Änderungen nach seinem tatsächlichen Base-SHA auf den neuen `main` übertragen.

Bevorzugte Git-Semantik:

`git rebase --onto <new-main> <actual-#165-base-sha> <#165-branch>`

oder ein äquivalenter frischer Branch/Cherry-pick ausschließlich der #165-spezifischen Commits.

Danach:

1. #165 auf `main` retargeten,
2. tatsächlichen neuen #165-Head erfassen,
3. Diff gegen neuen `main` prüfen.

Konflikte mit einem späteren #163-Fix müssen semantisch gelöst und vollständig neu geprüft werden.

### C3 – Diff-Gate

Der heutige #165-spezifische Ausgangsdiff gegen seine aktuelle #163-Basis umfasst 12 Dateien.

Nach Stack-Transfer:

- Diff gegen neuen `main` muss nur den beabsichtigten M6-Slice enthalten,
- zusätzliche Dateien nur mit klar erklärtem Integrationsfix,
- keine still wiederaufgenommenen #163-M5-Dateien,
- kein zweiter Generator-/Provider-/Security-Vertrag.

Unerwartet großer/historienbedingter Diff: **STOP und Stack bereinigen, bevor CI oder Codex verbraucht wird.**

### C4 – #165 neu validieren

Der heutige CI #1200 ist nach dem Stack-Transfer nicht mehr das finale Merge-Gate.

Erforderlich auf dem neuen tatsächlichen #165-Head:

1. vollständige literal Exact-Head-CI,
2. vollständiger ChatGPT Diff-/Architektur-/Security-/Operations-Review,
3. Findings gebündelt korrigieren,
4. nach jeder Head-Änderung vollständige Exact-Head-CI erneut,
5. keine offenen relevanten Threads,
6. mergeable.

Erst dann Codex.

## 7. Phase D – #165 Codex und Merge

#165 bleibt bis zum finalen neuen Head Draft.

### D1 – Codex

Wenn #165 final, CI-grün und ChatGPT-geprüft ist:

- Head pinnen,
- genau einmal **Ready for review** als normalen Codex-Trigger,
- kein paralleler `@codex review`-Kommentar,
- falls Ready eine neue CI startet: diesen neuesten Lauf vor Merge vollständig PASS abwarten,
- bei echtem Finding dieselbe Ein-Re-Review-Regel wie bei #163.

### D2 – Merge

Nur bei vollständigem Merge-Gate:

- Squash merge bevorzugt,
- `expected_head_sha=<finaler #165 Head>`,
- danach neuen `main`-SHA lesen,
- Post-Merge-CI vollständig PASS prüfen.

#165-Merge autorisiert keinen Provider-Write, kein Deployment und keine Produktionsfreigabe.

## 8. Parallelisierung und Credit-Priorität

Während #163 durch Codex/Merge/Post-Merge läuft:

- #165 nicht gleichzeitig final-Codex-reviewen,
- keinen parallelen Security-/Runtime-Fundament-PR mergen,
- #164/#134 nicht vorsorglich ebenfalls mit Codex reviewen,
- #135 bleibt Vorbereitungsstrang.

Danach wird #165 der aktive abhängige M6-Strang.

Priorität:

1. #163,
2. #163 Post-Merge-CI,
3. historische M5-PRs schließen,
4. #165 sauber auf neuen `main` übertragen,
5. #165 Exact-Head-CI + ChatGPT-Review,
6. #165 finaler Codex,
7. #165 Merge + Post-Merge-CI.

## 9. Andere PRs nicht vorziehen

- #164: später auf aktuellen `main` ziehen → Exact-Head-CI → ChatGPT-Review → ein finaler Codex.
- #136 + #166: später als ein finaler UI-Slice auf aktuellem `main` konsolidieren; nicht zwei Codex-Reviews verbrauchen.
- #134: Reference-Control-Plane später auf aktuellen `main` bringen; nicht vor der ULC-kritischen Kette priorisieren.
- #135: Vorbereitungs-/Evidence-Dokumentation; kein Codex solange bewusst weiter vorbereitet wird.

## 10. Harte Stop-Regeln

Keinen weiteren Codex-Credit verbrauchen, wenn:

- tatsächlicher Head nicht der erwartete geprüfte Head ist,
- aktuelle vollständige CI nicht PASS exakt auf diesem Head ist,
- `main`-Drift nicht bewertet wurde,
- Review-/Mergeability-Zustand unklar ist,
- Codex sich auf einen älteren Commit bezieht,
- derselbe Codex-/Toolfehler zweimal ohne Fortschritt auftritt,
- der einmalige Re-Review erneut ein Finding erzeugt und ein dritter Review nötig wäre,
- #165-Stack-Anker nicht eindeutig ist,
- #165-Diff nach Squash-Transfer unerwartet alte M5-Historie enthält,
- Post-Merge-CI auf `main` nicht PASS ist.

## 11. Produktionsgrenze

Dieses Runbook endet bei Repository-Merge und Post-Merge-CI.

Es autorisiert nicht:

- Neon-/Cloudflare-Ressourcen,
- Logging-Sink-/Tail-Worker-Erstellung,
- Secrets,
- produktive Migrationen,
- Produktionsdeployments,
- DNS/Public Ingress,
- reale Restore-/Smoke-Writes,
- Production Release.

Jede solche Aktion bleibt hinter einer eigenen ausdrücklichen Nutzerfreigabe.