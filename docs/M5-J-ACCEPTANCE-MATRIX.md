# M5-J – Gate Consumer Acceptance Matrix

Stand: 2026-08-18

## Zweck

Diese Matrix definiert die später verpflichtenden M5-J-Acceptance-Fälle. Sie ist bewusst implementierungsneutral und darf erst nach Stabilisierung des gemeinsamen ULC-Integrationsheads in ausführbare Tests überführt werden.

## Basisannahmen

- Die zwölf Kriteriums-IDs stammen ausschließlich aus `REQUIRED_PRODUCTION_READINESS_CRITERIA`.
- `evaluateProductionReadiness()` bleibt die einzige finale M5-Auswertung.
- Jeder Kriteriums-ID ist genau ein Evidence-Owner zugeordnet.
- Nur primitive `true`-Werte verifizieren ein Kriterium.
- App-/Environment-/Freshness-/Runtime-/Workflow-Drift bleibt fail-closed.

## Gate-Komposition

| Fall | Erwartung |
|---|---|
| alle zwölf autoritativen Evidence-Owner liefern gültig `true` | `productionReady=true`, 12/12 `verified` |
| genau ein Kriterium fehlt | `productionReady=false`, genau dieses Kriterium `open` |
| genau ein Owner liefert `false` statt `true` | `productionReady=false` |
| ein Owner liefert einen truthy String/Number/Object statt `true` | Kriterium `open`, Gate blockiert |
| ein Owner liefert eine nicht zugewiesene Kriteriums-ID | fail-closed; keine stille Übernahme |
| zwei Owner beanspruchen dieselbe Kriteriums-ID | fail-closed; keine Last-write-wins-Semantik |
| Evidence-Objekt besitzt Accessor/Symbol/inherited values | nicht als positive Evidence akzeptieren |
| Evidence-Consumer wirft oder liefert malformed Daten | betroffene Evidence bleibt `open`; kein positives Gate |
| unbekanntes zukünftiges M5-Kriterium wird kanonisch ergänzt | M5-J muss bis zur expliziten Owner-Zuordnung blockieren |

## App- und Environment-Bindung

| Fall | Erwartung |
|---|---|
| Evidence gehört exakt zu `ulc-linz` + `production` | darf weiter geprüft werden |
| Evidence gehört zu `reference` | für ULC nicht verwerten |
| Evidence gehört zu Preview/Test | für Production nicht verwerten |
| App-ID fehlt/ist malformed | fail-closed |
| Environment fehlt/ist malformed | fail-closed |
| Runtime-/Contract-Digest driftet | betroffene Evidence `open` |

## M5-B – Rollen & Rechte

| Fall | Erwartung |
|---|---|
| kanonische ULC-Rollen-/Scope-/Permission-/DB-/Acceptance-Evidence vollständig | `rolesAndPermissions=true` |
| Role-/Scope-Policy driftet | `rolesAndPermissions` offen |
| Permission-Runtime-/DB-Contract driftet | offen |
| app-spezifische Acceptance-Evidence fehlt | offen |

## M5-C/D – Löschung & Aufbewahrung

| Fall | Erwartung |
|---|---|
| aktueller materialisierter Scope, Retention, Delete, Audit und Restore-Reconciliation vollständig belegt | `deletionConcept=true`, `retention=true` |
| neuer persistenter Owner/Tabelle/Module/Object Storage ohne Lifecycle-Entscheidung | beide betroffenen Kriterien fail-closed |
| Restore-Reconciliation fehlt | `deletionConcept` offen |
| Retention-/Audit-Vertrag driftet | `retention` offen |

## M5-E – Export

| Fall | Erwartung |
|---|---|
| kanonischer Exportvertrag plus aktuelle Membership-/Subject-Scope-/Audit-Abhängigkeiten vollständig belegt | `dataExport=true` |
| neuer persistenter personenbezogener Datensatz ist weder exportiert noch explizit ausgeschlossen | offen |
| Membership-/Subject-Scope-Persistenz driftet | offen |
| erfolgreicher Export könnte ohne erfolgreichen Audit-Abschluss zurückgegeben werden | offen |
| nur technische Exportfunktion vorhanden, aber integrierte Evidence fehlt | offen |

## M5-F – Audit & Security Logging

| Fall | Erwartung |
|---|---|
| reale Production-Sink-Bindung, geschützter Zugriff und bestätigte Retention vollständig belegt | `auditSecurityLogging=true` |
| nur Logger-Schnittstelle/`console.warn` vorhanden | offen |
| Sink-Retention fehlt/ist stale | offen |
| öffentlicher Log-Read-Pfad vorhanden | offen |
| Logs enthalten Secrets oder unnötige personenbezogene Inhalte | offen |

## M5-G – Provider & Compliance

| Fall | Erwartung |
|---|---|
| aktuelle vollständige Cloudflare- + Neon-Evidence erfüllt alle vier Teilkriterien | `dataRegion`, `dpa`, `encryption`, `subprocessors` jeweils `true` |
| Neon nicht autoritativ Frankfurt | `dataRegion` offen |
| Cloudflare wird fälschlich als EU-only behandelt | `dataRegion` offen |
| DPA-/Account-Binding-/Neon-Schedule unvollständig | `dpa` offen |
| Security-/Encryption-Evidence unvollständig | `encryption` offen |
| Subprozessor-/Transfer-Evidence unvollständig | `subprocessors` offen |
| Provider-/Dataflow-Inventar unvollständig oder unerwartete personenbezogene Persistenz | alle betroffenen G-Kriterien offen |
| Evidence stale | alle betroffenen G-Kriterien offen |

## M5-H – Control Plane

| Fall | Erwartung |
|---|---|
| aktuelle ULC-Production-Evidence belegt keine unnötige öffentliche Erreichbarkeit privilegierter Komponenten | `privilegedControlPlaneIsolation=true` |
| `workers.dev` aktiv | offen |
| Preview-URL aktiv | offen |
| Custom Domain an privilegierter Ressource | offen |
| öffentliche Worker Route an privilegierter Ressource | offen |
| erwartetes internes Service Binding fehlt/ist mehrdeutig | offen |
| Reference-Evidence wird statt ULC-Evidence angeboten | offen |
| Provider-/Workflow-/Freshness-Zustand unklar | offen |

## M5-I – High Privacy

Die sieben kanonischen Requirements müssen unabhängig belegt werden. `securityPrivacyGate` beweist den unveränderten all-required/fail-closed Gate-Vertrag und darf **nicht** durch `productionReady=true` belegt werden.

| Requirement | Erwartete Evidence-Grenze |
|---|---|
| `securityPrivacyGate` | kanonischer M5-all-required/fail-closed Vertrag unverändert |
| `backupRestoreBeforeProduction` | app-spezifisch belastbarer Backup-/Restore-Nachweis; keine fremde App-Evidence |
| `accessControl` | deny-by-default aus der realen ULC-Runtime/M5-B |
| `privilegeModel` | Least-Privilege-/Admin-Grenzen aus realer ULC-Evidence |
| `secretsInNormalAppManifest` | Repository-/Manifest-Evidence |
| `privilegedControlPlanePublicIngress` | M5-H-Evidence |
| `operatorUseCaseAssessment` | explizite ULC-/Betreiber-Evidence |

Nur wenn alle sieben Requirements `true` sind, darf `highPrivacyProfile=true` entstehen.

## Secrets außerhalb App-Manifeste

| Fall | Erwartung |
|---|---|
| kanonisches App-Manifest enthält keine Secret-/Credential-Felder | `secretsOutsideAppManifests=true` |
| neues Secret-/Credential-Feld wird im App-Vertrag zugelassen | Evidence invalidieren |
| Credential-shaped Daten werden nur in Provider-/CI-Grenzen gehalten | zulässig, nicht in Snapshot übernehmen |

## Factory-Snapshot und M6-Grenze

| Fall | Erwartung |
|---|---|
| M5 12/12 verified | Snapshot zeigt `productionReady=true` |
| M5 11/12 oder weniger | Snapshot zeigt `productionReady=false` |
| M5 ready, M6 sonst unvollständig | `releaseProduction` bleibt `false` |
| M5 blocked | M6 `securityPrivacyReady=false` |
| Evidence-Ladevorgang eines volatilen Owners scheitert | Factory darf keinen positiven Production-Status daraus ableiten |

## Spätere ausführbare Testgruppen

Nach Stabilisierung des gemeinsamen Heads sollen mindestens folgende Testgruppen entstehen:

1. **Owner-Matrix-Test** – jede der zwölf IDs genau einmal zugeordnet.
2. **Composition-Test** – vollständige Evidence ergibt exakt 12/12.
3. **One-missing-at-a-time-Test** – jede einzelne ID wird separat entfernt und blockiert.
4. **Collision-/Unexpected-Key-Test** – doppelte oder fremde IDs fail-closed.
5. **Malformed-Evidence-Test** – Accessors, Symbols, inherited values, truthy non-booleans.
6. **Cross-App-/Environment-Test** – Reference/Preview/anderer App-Scope wird nicht übernommen.
7. **Freshness-Test** – stale G/H/F-Evidence wird nicht akzeptiert.
8. **High-Privacy-No-Cycle-Test** – `highPrivacyProfile` kann nicht über `productionReady` selbst bewiesen werden.
9. **Snapshot-Test** – Factory zeigt Kriterienstatus nachvollziehbar und M6 bleibt separat.
10. **Drift-Test** – neue kanonische M5-ID oder geänderte Evidence-Owner-Verträge erzwingen bewusste Anpassung statt stiller Freigabe.

## Nicht Teil dieses Preflights

- keine Produktivressource,
- kein Providerwrite,
- keine Secretänderung,
- kein Deployment,
- keine Produktionsmigration,
- keine Produktionsfreigabe,
- kein Codex-Zwischenreview.
