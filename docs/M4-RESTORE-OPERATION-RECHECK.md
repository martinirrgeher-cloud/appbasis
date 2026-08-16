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

Der Slice führt selbst keinen realen Restore aus und verändert keine Providerressource.
