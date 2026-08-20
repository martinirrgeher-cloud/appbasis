# M5-J – Current Integration Map

Stand der Vorbereitung: 2026-08-18

## Zweck

Diese Datei hält ausschließlich den **aktuellen technischen Integrationsbedarf** für M5-J fest. Sie ist keine dauerhafte Architekturentscheidung und ersetzt keinen Live-State-Check vor der späteren Implementierung.

## Aktuell technisch vorhanden

| Bereich | Technischer Stand | M5-J-Verwendung |
|---|---|---|
| generisches M5-Gate | `evaluateProductionReadiness()` mit zwölf kanonischen Kriterien vorhanden | bleibt finale All-required-Auswertung |
| Repository-Evidence | `deriveRepositoryProductionReadinessEvidence()` | liefert `secretsOutsideAppManifests` |
| M5-B | ULC Rollen-/Permission-Evidence vorhanden | liefert `rolesAndPermissions` |
| M5-C/D | ULC Lifecycle-Evidence im aktiven Integrationsstrang vorhanden | soll `deletionConcept` + `retention` liefern, sobald der Head stabil/grün ist |
| M5-E | Export-Runtime-/Boundary-Vertrag vorhanden | Factory-Evidence-Owner noch zu integrieren |
| M5-F | Audit-/Security-Logging-Boundary vorhanden | Production-Sink-/Access-/Retention-Evidence fehlt noch |
| M5-G | Provider-Evaluator vorhanden | kann später vier Provider-Kriterien liefern, sobald reale Production-Evidence existiert |
| M5-H | ULC-spezifischer Consumer noch nicht vorhanden | Reference-Consumer ist nur Muster |
| M5-I | High-Privacy-Evaluator vorhanden | benötigt unabhängige Teilnachweise; noch nicht in Snapshot verdrahtet |
| M5-J | noch keine finale Komposition | dieser Vorbereitungsstrang definiert Ownership und Acceptance |

## Aktueller Factory-Snapshot auf dem aktiven C/D-Head

Der aktive C/D-Integrationsstand komponiert derzeit Repository-, M5-B- und M5-C/D-Evidence. Dadurch sind für ULC im dortigen Snapshot technisch vier Kriterien vorgesehen:

- `secretsOutsideAppManifests`
- `rolesAndPermissions`
- `deletionConcept`
- `retention`

Alle übrigen Kriterien bleiben dort bewusst offen. Dieser Stand ist **noch keine stabile M5-J-Basis**, solange der aktive C/D-Head nicht vollständig grün und final geprüft ist.

## Spätere Integrationsreihenfolge

Nach Stabilisierung des kollidierenden C/D-Strangs:

1. M5-E Factory-Evidence an den real integrierten Export-/Membership-/Subject-Scope-/Audit-Stand binden.
2. M5-F Factory-Evidence nur aus realer Production-Sink-/Access-/Retention-Evidence ableiten.
3. M5-G Provider-Evidence über eine geschützte Control-Plane-/CI-Grenze in den Factory-Consumer einspeisen.
4. M5-H ULC-spezifisch implementieren; keine Reference-Evidence übernehmen.
5. M5-I aus unabhängigen High-Privacy-Teilnachweisen ableiten.
6. Erst dann M5-J in `model.mjs`/Snapshot explizit über die Ownership-Matrix verdrahten.
7. Alle zwölf Kriterien one-by-one fail-closed testen.
8. M6-Grenze separat beibehalten.

## Re-Live-Check zwingend

Vor Schritt 1 müssen erneut geprüft werden:

- aktueller `main`-SHA,
- alle offenen PRs und tatsächlichen Heads,
- CI-/Review-/Mergeability-Status,
- tatsächlicher finaler C/D-/ULC-Integrationshead,
- ob M5-E/F/G/H/I zwischenzeitlich neue oder geänderte Evidence-Owner besitzen.

Frühere SHAs in Übergaben oder PR-Beschreibungen dürfen nicht als aktuelle Wahrheit verwendet werden.
