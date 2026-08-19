# M5/M6 – Codex- und Merge-Runbook

Stand der Vorbereitung: 2026-08-19, 12:57 Europe/Vienna

## Status

**Nur Ablaufvorbereitung. Kein Codex-Review, kein Merge und keine Provider-/Produktionsaktion wird durch dieses Dokument ausgelöst.**

Dieses Runbook konkretisiert den bestehenden AppBasis-Merge- und Codex-Vertrag für die aktuelle M5→M6-Kette. Dauerhaft verbindlich bleiben insbesondere:

- tatsächlichen PR-Head vor jedem Review/Merge live lesen,
- vollständige CI exakt auf diesem Head = PASS,
- ChatGPT Diff-/Architektur-/Security-Prüfung abgeschlossen,
- genau ein finaler Codex-Review auf dem tatsächlichen finalen Head,
- bei echtem Codex-Finding: Fix → Exact-Head-CI → genau ein Re-Review,
- keine offenen relevanten Review-Threads,
- PR mergebar,
- Merge möglichst mit Expected-Head-SHA schützen,
- danach neuen `main`-SHA lesen und Post-Merge-CI prüfen,
- kein Merge aufgrund eines alten Handoffs oder einer alten CI.

Alle SHA-/CI-Angaben in diesem Dokument sind **nur der heutige Vorbereitungssnapshot**. Am Ausführungstag werden `main`, alle offenen PRs, tatsächliche Heads, CI, Reviews, Threads und Mergeability erneut live geprüft.

## 1. Heutiger Vorbereitungssnapshot

Live verifiziert am 2026-08-19, 12:57 Europe/Vienna:

- `main`: `e7fb8dbd5e76041109e2f045eabc50fc803c13a0`
- offene PRs: 28
- #163 `fix: harden final M5 evidence and exact-head CI`
  - Base: `main`
  - Head: `ab0e2c609c96463ddc015a4227589d22f5a7f2b1`
  - Exact-Head-CI #1173: PASS
  - Reviews: keine
  - Review-Threads: keine
  - mergeable: ja
  - Draft: ja
- #165 `feat: prepare guarded ULC M6 production path`
  - Base-Branch: `agent/m5-pre-codex-hardening` / #163
  - Base-SHA: `ab0e2c609c96463ddc015a4227589d22f5a7f2b1`
  - Head: `dc82bf4e4e89f7bc2261670f90a6bdc85743a727`
  - isolierter Diff gegen #163: 12 Dateien
  - Exact-Head-CI #1200: PASS
  - Reviews: keine
  - Review-Threads: keine
  - mergeable: ja
  - Draft: ja
- Repository erlaubt Squash-Merge; `delete_branch_on_merge=false`.

Dieser Snapshot autorisiert morgen nichts automatisch.

## 2. Codex-Trigger – genau einmal

Der aktuell im Repository beobachtete Codex-Hinweis nennt drei mögliche Review-Trigger:

1. PR zur Review öffnen,
2. Draft als **Ready for review** markieren,
3. `@codex review` kommentieren.

Daraus folgt für die Credit-sparsame Arbeitsweise:

**Nie gleichzeitig `Ready for review` und `@codex review` als zwei parallele Trigger verwenden.**

Für einen noch als Draft geführten finalen PR ist der bevorzugte erste Trigger:

- genau einmal **Mark ready for review**,
- danach keinen zusätzlichen `@codex review`-Kommentar senden,
- erst das tatsächliche Codex-Ergebnis abwarten und gegen den gepinnten Head verifizieren.

Wenn ein Codex-Review tatsächlich ein Finding meldet und nach dem Fix ein neuer Head entsteht, ist der PR bereits Ready. Der genau einmal zulässige Re-Review wird dann über **einen einzigen** expliziten `@codex review`-Kommentar ausgelöst, der den neuen finalen SHA nennt.

### Quota-/Toolfehler

Wird der Codex-Review nachweislich **nicht ausgeführt**, z. B. wegen ausgeschöpftem Kontingent:

- kein Merge,
- kein wiederholtes Triggern solange die Ursache fortbesteht,
- Head unverändert lassen,
- nach bestätigter Verfügbarkeit genau einen neuen expliziten Review-Trigger verwenden.

Tritt derselbe Review-/Toolfehler zweimal ohne echten Fortschritt auf: **STOP gemäß Loop-Regel.**

## 3. Phase A – #163 M5 final reviewen

### A0 – Live-Start-Gate

Unmittelbar vor Codex:

1. aktuelle Prüfzeit Europe/Vienna erfassen,
2. `main` neu lesen,
3. **alle** offenen PRs neu lesen,
4. #163 tatsächlichen Head neu lesen,
5. #163 Exact-Head-CI neu verifizieren,
6. Reviews und Review-Threads neu lesen,
7. Mergeability neu lesen.

### A1 – Drift-Regel

Nur wenn weiterhin sicher gilt:

- #163 Head ist der tatsächlich geprüfte finale Head,
- vollständige CI exakt auf diesem Head PASS,
- ChatGPT-Review deckt exakt diesen Head ab,
- keine neuen Blocking Findings/Threads,
- PR mergeable,

darf Codex ausgelöst werden.

Wenn `main` seit der letzten vollständigen Integrationsprüfung geändert wurde, wird #163 **nicht blind auf dem alten Head reviewed**. Zuerst den neuen Base-Zustand gegen #163 prüfen; nötigenfalls #163 auf den aktuellen `main`-Stand ziehen, vollständige Exact-Head-CI und ChatGPT-Review erneut durchführen. Erst der danach unveränderte Head ist Codex-fähig.

### A2 – Erster und einziger normaler Codex-Trigger

Wenn #163 weiterhin Draft ist:

- #163 **genau einmal Ready for review markieren**,
- **kein** zusätzlicher `@codex review`-Kommentar.

Vor dem Trigger den aktuellen SHA protokollieren. Nach dem Codex-Ergebnis erneut prüfen, dass der PR-Head seit dem Trigger nicht verändert wurde.

### A3 – Codex-Ergebnis: kein Finding

Wenn Codex keine relevanten Findings meldet:

1. sicherstellen, dass der Review/positive Codex-Abschluss nach dem Trigger erfolgte,
2. tatsächlichen #163-Head erneut lesen,
3. bestätigen, dass er exakt dem vor Codex gepinnten SHA entspricht,
4. CI exakt auf diesem Head weiterhin PASS,
5. keine offenen relevanten Review-Threads,
6. PR mergeable.

Erst dann weiter zu Phase B.

### A4 – Codex-Ergebnis: echtes Finding

Bei einem echten Finding:

1. **nicht mergen**,
2. Finding fachlich prüfen,
3. alle daraus erkannten zusammengehörigen Korrekturen gebündelt implementieren,
4. neuen tatsächlichen Head erfassen,
5. vollständige Exact-Head-CI,
6. vollständiger ChatGPT Diff-/Architektur-/Security-Review,
7. wenn grün: genau **ein** Re-Review mit einem einzigen `@codex review` auf dem neuen SHA.

Wenn dieser einmalige Re-Review ein weiteres echtes Finding meldet:

- Finding beheben und CI/ChatGPT-Prüfung durchführen,
- **keinen dritten Codex-Review automatisch auslösen**,
- Merge bleibt blockiert, bis der Nutzer eine ausdrückliche Ausnahme vom normalen Review-Limit entscheidet.

## 4. Phase B – #163 mergen

### B0 – Finales Merge-Gate

Direkt vor dem Merge erneut live bestätigen:

- finaler #163-Head bekannt,
- vollständige CI exakt auf diesem Head PASS,
- Codex hat exakt den finalen unveränderten Head abgeschlossen,
- keine offenen relevanten Review-Threads/Blocker,
- mergeable.

### B1 – Merge-Methode

Bevorzugt wird der etablierte Repository-Pfad:

- **Squash merge**,
- mit `expected_head_sha=<finaler #163 Head>`.

Kein ungeschützter Merge, wenn der Head zwischen Prüfung und Merge wechseln könnte.

### B2 – Post-Merge-Gate

Nach erfolgreichem Merge:

1. neuen `main`-SHA sofort live lesen,
2. bestätigen, dass #163 tatsächlich merged ist,
3. **Post-Merge-CI auf dem neuen `main` abwarten und vollständig PASS prüfen**,
4. PR-CI von #163 darf nicht als Ersatz für Post-Merge-CI verwendet werden.

Post-Merge-CI FAIL oder unbekannt: **STOP. #165 noch nicht finalisieren.**

## 5. Historische M5-PRs nach #163

Erst nachdem #163 gemerged **und** die Post-Merge-CI auf `main` PASS ist, können die durch #163 vollständig ersetzten historischen M5-PRs geschlossen werden.

Aktuelle Closure-Liste:

- #139
- #142
- #143
- #144
- #146
- #147
- #148
- #149
- #150
- #151
- #152
- #153
- #154
- #155
- #156
- #157
- #158
- #159
- #160
- #161
- #162

Für diese 21 PRs:

- kein eigener Codex-Review,
- kein Einzelmerge,
- als `superseded by #163` schließen,
- Traceability erhalten.

Closure erst nach erfolgreichem #163-Post-Merge-Gate, damit bei einem vorherigen Codex-/Mergeproblem kein Rückweg unnötig zerstört wird.

## 6. Phase C – #165 sauber auf neuen `main` bringen

#165 ist aktuell bewusst auf #163 gestapelt. Das Repository hat `delete_branch_on_merge=false`; der Base-Branch verschwindet daher beim #163-Merge nicht automatisch.

Trotzdem darf #165 nach einem **Squash-Merge von #163** nicht einfach nur blind auf `main` umgestellt werden: Squash erzeugt eine neue Commit-Abstammung. Ein reines Retarget kann deshalb die alte #163-Historie in den Drei-Punkt-PR-Diff ziehen, obwohl der Inhalt bereits in `main` steckt.

### C1 – Kanonischer Stack-Transfer

Nach #163-Post-Merge-CI PASS:

1. neuen `main`-SHA pinnen,
2. finalen #163-Head vor dem Squash als alten Stack-Anker pinnen,
3. die **#165-spezifischen Commits/Änderungen nach diesem #163-Anker** auf den neuen `main` übertragen,
4. bevorzugte Git-Semantik: `rebase --onto <new-main> <finaler-#163-head> <#165-branch>` oder ein äquivalenter frischer Branch/Cherry-pick ausschließlich der #165-spezifischen Commits,
5. #165 anschließend auf `main` retargeten,
6. tatsächlichen neuen #165-Head erfassen.

Wenn #163 aufgrund eines Codex-Findings vor dem Merge noch geändert wurde, bleibt der alte #165-Base-Anker für die Abgrenzung der #165-spezifischen Commits maßgeblich. Konflikte mit dem finalen #163-Fix müssen semantisch aufgelöst und vollständig neu geprüft werden.

### C2 – Diff-Gate

Der heutige #165-spezifische Ausgangsdiff gegen #163 umfasst 12 Dateien. Nach dem Stack-Transfer:

- prüfen, dass der Diff gegen den neuen `main` weiterhin nur den beabsichtigten M6-Slice enthält,
- zusätzliche Dateien nur akzeptieren, wenn sie durch einen notwendigen Konflikt-/Integrationsfix klar erklärt sind,
- kein stilles Wiederaufnehmen bereits durch #163 gemergter M5-Dateien,
- kein zweiter Generator-/Provider-/Security-Vertrag.

Unerwartet großer oder historienbedingter Diff: **STOP und Stack bereinigen, bevor CI/Codex verbraucht wird.**

### C3 – #165 neu validieren

Der heutige CI #1200 ist nach dem Stack-Transfer **nicht** das finale Merge-Gate, auch wenn der fachliche 12-Dateien-Slice unverändert erscheint.

Erforderlich auf dem neuen tatsächlichen #165-Head:

1. vollständige literal Exact-Head-CI,
2. vollständiger ChatGPT Diff-/Architektur-/Security-/Operations-Review,
3. alle Findings gebündelt korrigieren,
4. erneute Exact-Head-CI falls sich der Head geändert hat,
5. keine offenen relevanten Review-Threads,
6. mergeable.

Erst dann Codex.

## 7. Phase D – #165 Codex und Merge

#165 bleibt bis zum finalen neuen Head Draft.

### D1 – Codex

Wenn der neue #165-Head final, CI-grün und ChatGPT-geprüft ist:

- genau einmal **Ready for review** als normaler Codex-Trigger,
- kein paralleler `@codex review`-Kommentar,
- bei echtem Finding dieselbe Ein-Re-Review-Regel wie für #163.

### D2 – Merge

Nur bei vollständigem Merge-Gate:

- Squash merge bevorzugt,
- `expected_head_sha=<finaler #165 Head>`,
- danach neuen `main`-SHA lesen,
- Post-Merge-CI auf dem neuen `main` vollständig PASS prüfen.

Ein Merge von #165 autorisiert **keinen** Provider-Write, kein Deployment und keine Produktionsfreigabe.

## 8. Was morgen ausdrücklich nicht parallelisiert wird

Während #163 durch Codex-/Merge-/Post-Merge-Gate läuft:

- #165 wird nicht gleichzeitig final-Codex-reviewed,
- kein paralleler Security-/Runtime-Fundament-PR wird gemerged,
- #164/#134 erhalten nicht vorsorglich ebenfalls Codex-Reviews,
- #135 bleibt Vorbereitungsstrang.

Nach #163-Post-Merge PASS wird #165 der aktive abhängige M6-Strang.

Damit bleiben maximal:

- **Strang A:** #163 → danach #165 seriell auf derselben M5/M6-Grenze,
- **Strang B:** nur ein klar unabhängiger Strang, falls tatsächlich sinnvoll,
- **Vorbereitung:** #135.

Credit-Priorität bleibt #163, danach #165.

## 9. Verbleibende andere PRs

Nicht Teil des unmittelbaren M5→M6-Codex-Pfads:

- #164: eigenständiger M4-Acceptance-Dokument-PR; nach geändertem `main` neu auf aktuellen Stand ziehen, Exact-Head-CI + ChatGPT-Review, dann genau ein finaler Codex.
- #136 + #166: später zu einem finalen UI-Slice auf aktuellem `main` konsolidieren; nicht zwei Codex-Reviews verbrauchen.
- #134: Reference-Control-Plane-Pfad; später auf aktuellen `main` bringen und final reviewen, nicht vor der ULC-kritischen Kette priorisieren.
- #135: Vorbereitungs-/Evidence-Dokumentation; kein Codex solange der Prep-Strang noch bewusst erweitert wird.

## 10. Harte Stop-Regeln

Sofort stoppen und **keinen weiteren Codex-Credit verbrauchen**, wenn mindestens eines gilt:

- tatsächlicher Head ist nicht der erwartete final geprüfte Head,
- CI ist nicht vollständig PASS exakt auf diesem Head,
- `main`-Drift wurde nicht bewertet,
- Review-/Mergeability-Zustand ist unklar,
- Codex-Review bezieht sich auf einen älteren Commit,
- derselbe Codex-/Toolfehler tritt zweimal ohne Fortschritt auf,
- einmaliger Re-Review hat ein weiteres Finding erzeugt und ein dritter Review wäre nötig,
- #165-Diff nach dem Squash-Stack-Transfer enthält unerwartet die alte M5-Historie,
- Post-Merge-CI auf `main` ist nicht PASS.

## 11. Produktionsgrenze

Dieses Runbook endet bei Repository-Merge und Post-Merge-CI.

Es autorisiert insbesondere **nicht**:

- Neon-/Cloudflare-Ressourcen,
- Logging-Sink-/Tail-Worker-Erstellung,
- Secrets,
- produktive Migrationen,
- Produktionsdeployments,
- DNS/Public Ingress,
- reale Restore-/Smoke-Writes,
- Production Release.

Jede solche Aktion bleibt hinter einer eigenen ausdrücklichen Nutzerfreigabe.