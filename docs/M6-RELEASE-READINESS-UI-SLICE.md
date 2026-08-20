# M6 – Factory-Lifecycle- und Readiness-UI-Slice

Stand: 2026-08-20

## Zweck

Dieser Slice integriert die früher getrennt vorbereiteten UI-Stände aus #136 und #166 auf dem aktuellen `main`. Er bleibt ausschließlich read-only und setzt ADR-024 in der AppFactory-Darstellung um.

## Kanonische Lifecycle-Semantik

Die UI unterscheidet sichtbar:

1. Repository
2. Preview
3. kontrollierte Produktionsvorbereitung
4. Production Ready
5. Produktion freigeben

`Security & Privacy Ready` ist das M5-Gate und nicht mehr gleichbedeutend mit dem gesamten Zustand `Production Ready`.

`Production Ready` wird in der UI erst aus der vollständig konsistenten technischen M6-Evidenz dargestellt. Auch dann bleibt die Produktionsfreigabe ein separater ausdrücklicher Schritt; `releaseAuthorized=false` und `capabilities.releaseProduction=false` werden durch diesen Slice nicht verändert.

## ADR-024-Grenze

Nach real belegter Preview-Acceptance dürfen notwendige nicht öffentliche Produktionsressourcen nur nach autoritativem Provider-Preflight und ausdrücklicher Einzelfreigabe des konkreten mutierenden Schritts vorbereitet werden.

Vor M4 DONE + M5 DONE gilt weiterhin:

- keine öffentliche Produktionsdomain
- kein Public Ingress
- kein Production Ready
- keine Produktionsfreigabe

Backup/Recovery liegt vor dem finalen M5-12/12-Gate. Erst danach dürfen die verbleibenden Production-Ready-Nachweise einschließlich kontrollierter Domain-Aktivierung und Post-Deploy-Smoke abgeschlossen werden.

## Darstellung der zehn M6-Nachweise

Die App-Detailansicht zeigt weiterhin die zehn bestehenden Kriterien aus `productionReleaseReadiness` einzeln als `Geprüft` oder `Offen`:

1. Preview geprüft
2. Eigene Produktionsdatenbank
3. Eigener Produktions-Worker
4. Eigene Domain
5. Produktive Benutzer & Rechte
6. Backup & Recovery geprüft
7. Security & Privacy geprüft
8. Kontrollierte Produktionsmigrationen
9. Produktions-Deploy abgeschlossen
10. Post-Deploy-Smoke erfolgreich

Fehlende, unbekannte oder strukturell widersprüchliche Daten fallen fail-closed auf `Offen` beziehungsweise einen gesperrten Lifecycle-Schritt zurück.

## Nächster sicherer Schritt

Die UI leitet ausschließlich aus dem vorhandenen Factory-Snapshot einen verständlichen nächsten Schritt ab. Sie führt keinen Provider-Request und keinen Write aus.

Insbesondere darf die Anzeige niemals:

- einen Provider-Write autorisieren
- M4/M5 umgehen
- eine Domain vorzeitig freigeben
- `releaseAuthorized=true` erzeugen
- einen Produktionsbutton oder Release-Endpoint hinzufügen

## Dateigrenze

Der Slice verändert nur die vorhandene Factory-UI-Darstellung, deren fokussierte Tests und diese Dokumentation. Keine Änderung an:

- `tooling/factory-ui/model.mjs`
- M5-/M6-Gate-Evaluatoren
- Provider-/Evidence-Readern
- Generator-/Manifest-/Runtime-/Schema-Verträgen
- Secrets, Deployments oder Produktionsressourcen

## Acceptance

- alle fünf Lifecycle-Phasen werden eindeutig unterschieden
- M5 heißt sichtbar `Security & Privacy Ready`
- die zehn M6-Kriterien bleiben read-only sichtbar
- `Production Ready` wird nicht mit M5 allein gleichgesetzt
- M5↔M6-Widersprüche sperren alle späteren Schritte fail-closed
- Produktionsvorbereitung wird als nicht öffentliche, einzeln freizugebende Phase dargestellt
- keine `releaseProduction(...)`-Aktion entsteht
- vollständige Exact-Head-CI muss grün sein
- Codex wird erst auf dem tatsächlichen finalen unveränderten Head angefordert
