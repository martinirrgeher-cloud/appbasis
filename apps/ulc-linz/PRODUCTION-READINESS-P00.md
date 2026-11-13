# ULC Linz – P00: Produktionsreife-Inventur und Umsetzungsgates

**Stand der Bestandsaufnahme:** 13.11.2026. **Ziel:** die *bereits vorhandene* App mit allen ausgewählten Standard- und ULC-eigenen Funktionen kontrolliert in einen geschützten Echtbetrieb bringen. Grundlage: [Sprint #607](https://github.com/martinirrgeher-cloud/appbasis/issues/607), [Produktionssperren #483](https://github.com/martinirrgeher-cloud/appbasis/issues/483), [Übergabe #530](https://github.com/martinirrgeher-cloud/appbasis/issues/530). Dies ist ein **read-only Audit**, keine Betriebs-, Sicherheits- oder Datenschutzfreigabe.

## Reproduzierbarer Vertragssnapshot

Ausgangspunkt: `main=e0ed17856e05a013ff50484762510fea8490c271`. Die vollständige GitHub-Git-Tree-Liste (`/git/trees/main?recursive=1`, `truncated=false`) wurde gegen **alle** `path/gitBlobSha`-Einträge der sieben ausgewählten Production-Contracts verglichen. **36 von 36 Evidence-Einträgen stimmen exakt überein** (33 unterschiedliche Dateipfade). Fehlende Pfade: **0**. Alte Hinweise in #483 auf 9 stale Evidence-Einträge sind auf diesem Snapshot **nicht** mehr aktuell.

Nach jedem neuen Head erneut auswerten, nicht die hier genannten SHAs als dauerhaft gültig behaupten. Der kanonische Prüfer ist `node tooling/production-contract.mjs ulc-linz` (berichtend) und – **erst nachdem alle echten Produktionssperren beseitigt sind** – `node tooling/production-contract.mjs ulc-linz --require-ready`. Prüfsummenkonsistenz allein beweist **keine** vollständige Lifecycle-/Privacy-Eignung.

| Besitzer / Contract | Status auf dem Snapshot | Noch nicht abgenommener Produktionsumfang |
| --- | --- | --- |
| `modules/countdown/appbasis.production.json` | `ready` | App-/Identity-/Release-Integration erforderlich; kein modulspezifischer DB-Lifecycle |
| `modules/athletes/appbasis.production.json` | `ready` | Appweite Löschabhängigkeiten mit Attendance, Training und Restore |
| `modules/training-plans/appbasis.production.json` | `ready` | Appweite Block-Usage- und Subject-Delete-Integration |
| `modules/exercise-catalog/appbasis.production.json` | `blocked` | Favorites, Usage und Private Media; `lifecycle=blocked`, 0 Lifecycle-Evidence-Einträge |
| `modules/training-blocks/appbasis.production.json` | `blocked` | Revisionen, Favorites, Usage/Subject-Attribution; `lifecycle=blocked`, 0 Lifecycle-Evidence-Einträge |
| `modules/training-documentation/appbasis.production.json` | `blocked` | `authorization/database/lifecycle=blocked`, jeweils 0 verifizierte Evidence-Einträge |
| `apps/ulc-linz/appbasis.production.json` | `blocked` | `applicationLifecycle/privacy=blocked`, beide 0 Evidence-Einträge; `dataExport=verified` |

Die App definiert in `apps/ulc-linz/appbasis.app.json` genau diese **sechs** Standardmodule sowie `identity` und `permissions`; ULC-eigene Anmeldung, Anwesenheit, Trainer- und Trainingshistorien werden nicht dadurch zu einem separaten freigegebenen Standardmodul. Auch sie gehören in den App-Lifecycle-Nachweis. **Nicht durch Menüsichtbarkeit oder einen auf `ready` geänderten JSON-Status umgehen.**

## Fachlicher Daten- und Schreibpfad-Audit

| Datenowner / betroffene Daten | Bestehende Implementierung / Tests | Konkrete offene Lücke für produktive Freigabe |
| --- | --- | --- |
| ULC Training, Anwesenheit, Selbstanmeldung, Änderungsverlauf | `worker/training-session-postgres.ts` (`saveSession`, `saveRegistration`); `worker/training-subject-privacy-postgres.ts`; `test/training-session-postgres.test.ts`, `test/training-subject-history-deletion.postgres.e2e.test.ts` | Kein durchgehend aktivierter Write-Guard gegen nachträgliche Re-Entstehung gelöschter Athletenbezüge; Trainer/Audit/Freitext und alle Writer/Restores integrieren |
| ULC eingefrorene Löschung | `worker/training-subject-history-deletion-postgres.ts`: `eraseSubjectHistoryOnFrozenStore` mit transaktionalen Schritten | Datei verbietet ausdrücklich Verdrahtung an Live-HTTP/Retention/Scheduler; nur **frozen isolated store**, kein Live-Subject-Tombstone |
| ULC Koordination/Athleten-Löschentscheidungen | `worker/lifecycle-service.ts`; `worker/athlete-subject-deletion-recovery.ts`; `privacy/athlete-deletion-recovery-policy.json` | 35-Tage-Originalmarker als Autorität; aufbewahrbarer Folgeentscheid nicht genehmigt/atomar belegt; Crash-/Restore-/Cross-Owner-Replay unvollständig |
| Übungskatalog | `modules/exercise-catalog/src/postgres-repository.ts` implementiert Favorites, `recordUsage`, Private-Media-Register/Request/Complete; `apps/ulc-linz/test/exercise-catalog.postgres.e2e.test.ts` | Ownership pro Datentyp, Löschsperren gegen Writer, private Medienbereinigung/Fehlversuche, Aufbewahrungs- und Restore-Vertrag nachweisen |
| Trainingsblöcke | `modules/training-blocks/src/lifecycle.ts`, `src/postgres-repository.ts`, `src/favorite-restore-reconciliation.ts`, `src/subject-usage-restore-reconciliation.ts`; `test/postgres-repository.postgres.e2e.ts` | Favorite-/Usage-Primitive existieren; nicht alle Legacy-Usage-Daten eindeutig zurechenbar. Integrative Writer-/Revision-/Retention-/Restore-Sperre und App-Orchestrierung fehlen |
| Trainingsdokumentation | `modules/training-documentation/src/postgres-repository.ts` (`removeSubjectDataAfterVerifiedDeletion`), `src/subject-restore-reconciliation.ts`; `test/postgres-repository.postgres.e2e.ts` | Historische Drittteilnehmer-Referenzen auch in Dokumentationen anderer Athleten; per Modul vorbereitete Redaktions-/Löschmechanik ist nicht appweit freigegeben. Produktions-Autorisierung/Persistenz-/Restore-Evidence fehlen |
| Datenschutz/Provider | `privacy/m5-data-inventory.json`, `privacy/m5-high-privacy-assessment.json`, `privacy/m5-provider-compliance-inventory.json` | Kinder-/Jugenddaten als `high-privacy-required` eingestuft; offene Provider-/Verarbeitungsnachweise und finale fachliche Privacy-/Retention-Entscheidung |

Die vorhandenen isolierten PostgreSQL-Tests sind **Bausteinnachweise**. Sie ersetzen keine End-to-End-Verifikation, bei der ein Athlet gelöscht wird, während Sessions/Anmeldungen/Pläne/Dokus und andere Benutzer parallel schreiben, oder eine ältere Datenbanksicherung wiederhergestellt wird.

## Priorisierte größere Umsetzungspakete

### P01 – Verbindliche Datenschutz-/Retention-Entscheidung (kritischer Pfad; separat freigeben)
1. Datenkategorien und Zwecke: Athleten/Stammdaten, Minderjährige/Kontakte, Anwesenheit, Anmeldeänderungen, Trainer- und Sicherheits-Audits, Plan/Block/Übung, Mediendateien, Dokumentationsrevisionen und Freitext.
2. Je Kategorie Aufbewahrungsgrund und Frist festlegen; bei Austritt/Deletion zwischen Deaktivierung, Auskunft/Export, Erasure, berechtigten Audit-Nachweisen und Backup-Retention unterscheiden.
3. 35-Tage-Originalmarker und mögliche post-expiry Follow-up-Entscheidung (z. B. minimierter dauerhafter Auftrag) **nicht ohne genehmigte persönliche Datenaufbewahrung und atomaren Herkunftsnachweis** verlängern. Keine neue Ledger-Tabelle ohne diese Entscheidung.
4. Verantwortliche Vereinsrolle, Auskunft-/Löschprozess, Auftragsverarbeiter- und Region-/Zugriffsprüfung sowie Pilot-Zugang festlegen.

**Akzeptanz:** schriftlich entschiedene, überprüfbare Daten-/Lifecycle-Policy mit Kennzeichnung noch offener juristischer Fragen; bis dahin `privacy=blocked`.

### P02 – Katalog + Blöcke (zwei Owner, gemeinsame Datensicht; Implementierung zunächst nur als Security-Draft)
- **P02-A:** Übungskatalog: Besitzer- und Organisationsgrenzen für Favorite/Usage/Private Media; sichere Sperr-/Lösch- und Retry-/Restore-Semantik. Negative Isolations-/Berechtigungs-E2E.
- **P02-B:** Trainingsblöcke: vorhandene Favoriten-/Nutzungs-Tombstone-Primitive auf Schreibpfade und Legacy-Usage-Restfälle prüfen; Revision-/Restore- und Dependent-Plan-Attribution nachweisen.
- **P02-C:** beide Owner separat in realen isolierten PostgreSQL-Tests beweisen; Produktionsvertrag und Evidence erst nach gesonderter Freigabe ändern.

**Akzeptanz:** reproduzierbare DB-E2E für aktive Writer, Lösch-/Idempotenz-/Restores, Mandantengrenzen sowie dokumentierte und abgefangene nicht zuordenbare Alt-Daten. Keine unprüfbaren `verified`-Claims.

### P03 – Dokumentation + app-owned Attendance/Registration/Trainer-Audit (integrativer Security-Slice; Draft)
- **P03-A:** vorhandene Modul-Doku-Redaktion historischer Fremdteilnehmer und Restore-Grenze verifizieren; Produktiv-Autorisierung/DB-Vertrag separat vervollständigen.
- **P03-B:** ULC-Training-Writer, Anmeldehistorie und Attendance gegen Löschmarkierung absichern; alle Schreibwege und parallel entzogene Rollen/Gruppen berücksichtigen. Gefrorenen Cleanup nicht direkt in Live-Writes übernehmen.
- **P03-C:** Cross-Owner-Deletion/Privacy-Inspektion, Resume nach Crash und Restore-Replay mit echten PostgreSQL-Races testen; Audit-/Notiz-/Freitext-Ausnahmen explizit dokumentieren.

**Akzeptanz:** nachweislich kein Resurrection, keine Cross-Tenant-Leaks, sichere Fehler-/Replay-Behandlung und autorisierte Löschausführung; keine unbeabsichtigte Freischaltung von N16-Trainer-/Admin-Proxy-POST.

### P04 – Release-Gates und Betrieb
- App-/Module-Lifecycle und Privacy nur nach P01–P03 vollständig nachweisen und separat freigeben; exakte Evidence-Bindings neu prüfen.
- Isolierter Export-/Restore-/Migration-/Backup-Drill; vollständige Identity/Permissions/Role-/Session-Negativtests, Rollback-Plan, verantwortliche Personen, Monitoring, Datenintegrität.
- Das kanonische Releaseverfahren `.github/workflows/m6-ulc-production-refresh-chain.yml` hat die Schritte `runtime_refresh`, `private_deploy`, `security_smoke`, `lifecycle_preflight`, `composition_gate`, `pilot_ingress`, `smoke_principal`, `post_deploy_smoke`. Jeder Schritt verlangt eigene frische Betreiberfreigabe und exakt übereinstimmende SHA-/Evidence-Grenzen.

### P05 – Geschlossener Echtbetrieb
- Alle vorgesehenen Module im geschützten Pilot nutzbar, zuerst wenige ausdrücklich autorisierte echte Vereinsnutzer; anschließend erst breite Vereinsfreigabe.
- Keine Preview-Daten blind als echte Vereinsdaten übernehmen; getrennte Produktionsdaten und nachweisbares Restore/Rollback.
- Vor jeder Produktionsmutation/Migration, Rollen-/Policy-Aktivierung, Ingress-/Deployment-Änderung und vor Go-live **eigene Betreiberfreigabe** einholen.

## Freigabe- und Stoppbedingungen

- **Autonom zulässig:** Iststand und Code read-only prüfen, isolierte Tests, fachlich begrenzte Draft-PRs und Dokumentation erstellen; normale nicht sicherheitskritische PRs erst nach vollem CI/Review.
- **Gesperrt ohne separate Freigabe:** Änderungen an Auth-/Berechtigungs-/Retention-/Deletion-Writepfaden, Policy-Genehmigung, Produktionsstatus-Pinning, DB-/Provider-Writes, produktive Backups/Restores, öffentliche Zugänge, Go-live. N16 #602 sowie #573–#578 nicht blind mergen.
- **Erneute Prüfung:** Aufgrund neuer PRs/Schema-/Runtime-Änderungen sind Evidence-SHAs und CI-/Release-Belege stets auf den **tatsächlich freigegebenen HEAD** zu prüfen. Kein „CI grün = produktionsreif“.

## Schätzgrenzen

Die frühere Schätzung von **20–40 Personentagen** bleibt vorläufig, nicht als durch Tests validierter Termin. P01-Entscheidungszeit, ungelöste Legacy-Usage und Cross-Owner-Transaktionen können den Aufwand wesentlich verändern. Nach einem durch isolierte E2E belegten P02-/P03-Design erneut anhand tatsächlicher Lücken kalibrieren.
