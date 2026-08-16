# M4 Restore Operation Recheck

Dieser Slice schließt das nach PR #101 identifizierte Restore-Rehearsal-Finding.

## Problem

Ein bereits vorhandener, exakt dem gewählten Snapshot zugeordneter Restore-Branch wurde bisher ohne erneute Abfrage der Neon-Operations wiederverwendet. Wenn die ursprüngliche Restore-Antwort noch `running` oder `scheduling` meldete, konnte ein späterer rein lesender Lauf deshalb nie auf `verificationReady=true` wechseln.

## Vertrag

Beim Wiederverwenden oder Reconciliieren eines exakten Restore-Branches:

- kein zweiter Restore-POST,
- read-only Abfrage von `GET /projects/{project_id}/operations`,
- paginierte Suche nach Operations des exakten Restore-Branches,
- nur `finished` und `skipped` gelten als erfolgreiche Evidenz,
- fehlende oder nicht erfolgreiche Evidenz bleibt fail-closed,
- Provider-Lesefehler liefern keine erfundene Completion-Evidenz,
- `finalize_restore` bleibt weiterhin `false`.

## Live-Recheck nach PR #116

Der read-only Restore-Rehearsal-Lauf #7 auf dem damaligen aktuellen `main` identifizierte die zuvor bewusst nur diagnostizierte Neon-Paginationvariante eindeutig: Nach einer fortgesetzten Operations-Abfrage lieferte Neon auf einer **kurzen Seite** denselben Cursor wie für diese Abfrage erneut. Der Lauf brach deshalb mit der sicheren Klasse `non-advancing cursor on a short page` ab.

Der Vertrag wird nur für genau diese live beobachtete Kombination erweitert:

- ist der zurückgegebene Cursor auf einer **kurzen** Seite exakt unverändert gegenüber dem für diese Seite verwendeten Cursor, gilt diese Kombination als terminal; die bis dahin gelesene Operationsevidenz wird klassifiziert,
- ein unveränderter Cursor auf einer **vollen** Seite bleibt fail-closed,
- ein Zyklus zu einem älteren, aber nicht unmittelbar verwendeten Cursor bleibt auch auf einer kurzen Seite fail-closed,
- non-string, oversized und non-canonical Cursor bleiben unabhängig von der Seitengröße fail-closed,
- die Änderung erzeugt keinen Provider-Write und führt insbesondere keinen weiteren Restore-POST aus.

Damit wird weder pauschal „jede kurze Seite“ noch „jeder bereits gesehene Cursor“ als Terminalfall akzeptiert. Der bestehende Vertrag für explizit fehlende/leere Cursor auf kurzen Seiten bleibt bestehen; zusätzlich wird nur die empirisch beobachtete Kombination aus kurzer Seite und unmittelbar nicht fortschreitendem Cursor als terminal anerkannt.

Der Slice führt selbst keinen realen Restore aus und verändert keine Providerressource.
