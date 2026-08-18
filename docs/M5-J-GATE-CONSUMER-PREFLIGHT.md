# M5-J – Gate Consumer Preflight

Stand: 2026-08-18

## Zweck

M5-J ist der finale **Gate Consumer** für `Production Security & Privacy Ready v0.1`. Er führt die zwölf kanonischen M5-Kriterien app-spezifisch im bestehenden Factory-Snapshot zusammen. M5-J erzeugt keine neue Security-/Privacy-Policy und verifiziert kein Kriterium allein dadurch, dass ein technischer Vertrag oder eine Betreiberentscheidung existiert.

Der bestehende `evaluateProductionReadiness()`-Vertrag bleibt die einzige finale All-required-Auswertung. Fehlt auch nur ein belastbarer Nachweis, bleibt `productionReady=false`.

## Sicherheits- und Architekturgrenze

M5-J darf:

- ausschließlich bestehende app-spezifische M5-Evidence-Owner konsumieren,
- die zwölf kanonischen Kriterien fail-closed zusammenführen,
- den bestehenden Factory-Snapshot mit dem Ergebnis versorgen,
- fehlende, stale, widersprüchliche oder malformed Evidenz auf `open` halten,
- Drift der Evidenzquellen ausführbar erkennen.

M5-J darf nicht:

- eine zweite M5-Policy oder zweite Readiness-Berechnung einführen,
- Providerzustand selbst schreibend verändern,
- Produktionsressourcen erzeugen,
- Secrets oder Provider-IDs in normale App-Manifeste oder den Factory-Snapshot übernehmen,
- fehlende Evidence aus App-Namen, Ressourcennamen, Hostnamen oder früheren erfolgreichen Runs ableiten,
- Reference-/Preview-Evidence auf ULC Linz übertragen,
- `releaseProduction` allein durch `productionReady=true` aktivieren,
- M5-I durch eine zirkuläre Abhängigkeit von `productionReady=true` beweisen.

## Kanonische zwölf Kriterien und Evidence-Owner

Die IDs stammen aus `tooling/factory-ui/production-readiness.mjs` und dürfen in M5-J nicht dupliziert umgedeutet werden.

| Kriterium | Primärer Owner | M5-Paket | Kompositionsregel |
|---|---|---|---|
| `dataRegion` | ULC Provider-/Compliance-Evidence | M5-G | nur frische, app-/production-gebundene Provider-Evidence |
| `dpa` | ULC Provider-/Compliance-Evidence | M5-G | Cloudflare + Neon/Databricks Vertragskette vollständig |
| `encryption` | ULC Provider-/Compliance-Evidence | M5-G | reale Runtime-/DB-Evidence plus aktuelle Security-Baseline |
| `rolesAndPermissions` | ULC Rollen-/Permission-Evidence | M5-B | nur kanonische ULC-Rollen-/Scope-/DB-/Acceptance-Verträge |
| `deletionConcept` | ULC Lifecycle-Evidence | M5-C | nur aktueller materialisierter Scope inklusive Restore-Reconciliation |
| `retention` | ULC Lifecycle-Evidence | M5-D | nur aktueller materialisierter Scope inklusive Retention-/Audit-Verträge |
| `dataExport` | ULC Export-Evidence | M5-E | nur kanonischer Exportpfad plus aktuelle Scope-/Audit-Abhängigkeiten |
| `auditSecurityLogging` | ULC Audit-/Security-Logging-Evidence | M5-F | nur reale Production-Sink-/Access-/Retention-Evidence |
| `subprocessors` | ULC Provider-/Compliance-Evidence | M5-G | aktuelle vollständige Subprozessor-/Transfer-Evidence |
| `highPrivacyProfile` | ULC High-Privacy-Evidence | M5-I | erst aus unabhängigen Teilnachweisen B–H plus erforderlicher Backup-/Operator-Evidence |
| `secretsOutsideAppManifests` | Repository-Evidence | bestehender M5-Baselinevertrag | nur bestehender Repository-/Manifestvertrag |
| `privilegedControlPlaneIsolation` | ULC Control-Plane-Evidence | M5-H | nur aktuelle ULC-Production-Evidence; Reference ist lediglich Muster |

## Bereits vorhandene technische Evidence-Owner

Stand der aktuell vorhandenen technischen Verträge:

- Repository: `deriveRepositoryProductionReadinessEvidence()` liefert ausschließlich `secretsOutsideAppManifests`.
- M5-B: `deriveUlcLinzRolesAndPermissionsEvidence()` ist der app-spezifische Rollen-/Rechte-Owner.
- M5-C/D: `deriveUlcLinzLifecycleEvidence()` ist der app-spezifische Lifecycle-Owner für `deletionConcept` und `retention` im aktuell materialisierten Scope.
- M5-G: `deriveUlcLinzM5ProviderProductionEvidence()` existiert als fail-closed Evaluator für `dataRegion`, `dpa`, `encryption` und `subprocessors`; reale Production-Evidence bleibt separat zustimmungspflichtig.
- M5-I: `deriveUlcLinzHighPrivacyProductionEvidence()` existiert als fail-closed Evaluator des kanonischen High-Privacy-Profils.
- M5-H: der Reference-Control-Plane-Consumer ist nur ein ausführbares Muster. Er darf nicht als ULC-Evidence wiederverwendet werden.
- M5-E und M5-F besitzen technische Runtime-/Boundary-Verträge, aber noch keinen abschließenden Factory-Evidence-Owner, der die späteren realen Abhängigkeiten vollständig belegt.

## Explizite Ownership statt blindem Object-Spread

M5-J soll die Kriterien nicht durch beliebige `...evidence`-Spreads aus mehreren Quellen zusammensetzen. Jeder der zwölf IDs besitzt genau einen autoritativen Owner.

Die spätere Implementierung muss deshalb mindestens folgende Eigenschaften erzwingen:

1. Ein Owner darf nur die ihm zugewiesenen Kriteriums-IDs liefern.
2. Ein Kriterium darf nicht von zwei Quellen geliefert werden.
3. Unerwartete Kriteriums-IDs aus einem app-spezifischen Evidence-Owner werden nicht still akzeptiert.
4. Fehlende Evidence bleibt fehlend; es gibt keinen positiven Default.
5. Nur der primitive Wert `true` zählt als verifiziert.
6. Fehler eines volatilen/read-only Evidence-Consumers dürfen die Factory nicht in einen positiven Zustand bringen; das betroffene Kriterium bleibt `open`.
7. App-/Environment-/Runtime-/Workflow-/Freshness-Drift invalidiert nur die betroffene Evidence und niemals das fail-closed Gate.

Der finale Status wird weiterhin ausschließlich durch `evaluateProductionReadiness()` berechnet.

## M5-I ohne Zirkelschluss

Das kanonische High-Privacy-Profil enthält unter anderem `securityPrivacyGate: all-required`. Dieser Teilnachweis darf in M5-J **nicht** als `productionReady=true` interpretiert werden, weil `highPrivacyProfile` selbst eines der zwölf M5-Kriterien ist.

Für M5-I ist daher zu unterscheiden:

- `securityPrivacyGate`: Nachweis, dass der kanonische all-required/fail-closed Gate-Vertrag unverändert gilt,
- `accessControl`: M5-B-/Runtime-Evidence für deny-by-default,
- `privilegeModel`: M5-B-/Admin-Evidence für Least Privilege,
- `secretsInNormalAppManifest`: bestehende Repository-Evidence,
- `privilegedControlPlanePublicIngress`: M5-H-Evidence,
- `backupRestoreBeforeProduction`: app-spezifisch belastbarer Backup-/Restore-Nachweis; keine automatische Übernahme fremder App-Evidence,
- `operatorUseCaseAssessment`: explizite ULC-/Betreiber-Evidence.

Erst wenn alle kanonischen High-Privacy-Teilnachweise unabhängig vorliegen, darf M5-I `highPrivacyProfile=true` liefern. Danach kann M5-J das Ergebnis als eines der zwölf Kriterien konsumieren.

## Volatile Evidence

M5-G, M5-H und die produktive M5-F-Sink-Evidence sind veränderlich. Für diese Quellen gilt:

- exakte Bindung an `ulc-linz` + `production`,
- keine Wiederverwendung von Reference/Preview/anderer App,
- Freshness/Review-Zeitpunkt verpflichtend,
- kein Fallback auf ältere erfolgreiche Evidence, wenn der aktuelle relevante Zustand fehlschlägt oder unklar ist,
- keine Secrets, Connection Strings, Tokens, Hostdetails oder Provider-IDs im normalen Snapshot,
- read-only Prüfung; Providerwrites sind nicht Aufgabe von M5-J.

## Aktuelle Integrationsgrenze

Der derzeit aktive C/D-Integrationsstrang verändert bereits `tooling/factory-ui/model.mjs`, die Production-Readiness-Tests und `package.json`. M5-J darf diese Dateien deshalb nicht parallel ändern.

Der sichere aktuelle Schritt ist ausschließlich dieser Preflight. Die technische M5-J-Verdrahtung beginnt erst auf dem dann tatsächlich stabilen gemeinsamen Integrationshead nach erneutem Live-State-Check.

## Geplante minimale technische Integration

Sobald die kollidierende Factory-/Lifecycle-Grenze stabil ist:

1. Live `main`, alle offenen PRs, tatsächliche Heads, CI, Reviews und Mergeability erneut prüfen.
2. Den tatsächlich gemeinsamen ULC-Head bestimmen; keine frühere Übergabe-SHA übernehmen.
3. M5-E-Evidence-Owner für den dann real integrierten Exportvertrag ableiten; Membership-/Subject-Scope-/Audit-Abhängigkeiten explizit einbeziehen.
4. M5-F-Evidence-Owner nur für reale Production-Sink-/Access-/Retention-Evidence definieren; technische Logger-Schnittstelle allein genügt nicht.
5. M5-H als ULC-spezifischen read-only Consumer auf der realen Production-Control-Plane-Evidence implementieren; Reference nur als Muster verwenden.
6. M5-G-Evidence-Output in den Factory-Pfad injizieren, ohne Providerzugriff in die öffentliche App-Runtime zu verlagern.
7. M5-I aus unabhängigen High-Privacy-Teilnachweisen ableiten.
8. Die zwölf Evidence-Owner über eine explizite Ownership-Matrix komponieren und das Ergebnis an den bestehenden `evaluateProductionReadiness()`-Pfad übergeben.
9. M6 erhält weiterhin nur `securityPrivacyReady = productionReadiness.productionReady === true`; `releaseProduction` bleibt ein separates M6-Gate.
10. Vollständige Exact-Head-CI, danach ausführlicher ChatGPT-Diff-/Architektur-/Security-Review. Codex erst genau einmal auf dem tatsächlichen finalen gemeinsamen Head.

## Noch nicht vorziehbar

Folgende Punkte können ohne reale Production-Evidence bzw. ohne stabilen gemeinsamen Head nicht seriös abgeschlossen werden:

- `dataRegion`, `dpa`, `encryption`, `subprocessors` auf `verified` setzen,
- reale M5-F-Sink-/Access-/Retention-Evidence,
- ULC-M5-H-Control-Plane-Evidence,
- app-spezifische High-Privacy-Teilnachweise, die auf realem M5-H/Backup-/Operatorzustand beruhen,
- die finale Factory-Verdrahtung in den aktuell von C/D parallel geänderten Dateien,
- `productionReady=true`,
- irgendeine Produktionsfreigabe.

## Definition DONE für M5-J

M5-J ist technisch DONE, wenn:

- jeder der zwölf kanonischen Kriterien-IDs genau einem autoritativen Evidence-Owner zugeordnet ist,
- alle Owner app-/environment-spezifisch und fail-closed konsumiert werden,
- fehlende, falsche, stale oder widersprüchliche Evidence das Gate blockiert,
- `evaluateProductionReadiness()` die einzige finale M5-Auswertung bleibt,
- der Factory-Snapshot alle zwölf Kriterien nachvollziehbar zeigt,
- `productionReady=true` ausschließlich bei zwölf explizit verifizierten Kriterien entsteht,
- M6/`releaseProduction` dadurch nicht automatisch freigeschaltet wird,
- vollständige Exact-Head-CI und finaler Review auf dem tatsächlichen Integrationshead ohne Blocker abgeschlossen sind.
