# P03 – Trainingsdokumentation, Anwesenheit und Anmeldung: Produktionsbeweise

**Stand:** 13.11.2026. **Status: technischer Test-Slice, NICHT PRODUKTIONSFREIGEGEBEN.** Referenzen: [P00](./PRODUCTION-READINESS-P00.md), [P01-Datenschutzentscheidungen (Entwurf)](./PRODUCTION-PRIVACY-DECISIONS-P01-DRAFT.md), [Sprint #607](https://github.com/martinirrgeher-cloud/appbasis/issues/607) und [Produktionsblocker #483](https://github.com/martinirrgeher-cloud/appbasis/issues/483).

## Tatsächliche Implementierungen, keine Parallelentwicklung

| Datenowner / Zugriff | Relevante vorhandene Technik | Echte nachgewiesene Eigenschaft / Restproblem |
| --- | --- | --- |
| `training-documentation` PostgreSQL-Modul | `modules/training-documentation/src/postgres-repository.ts`, Migrationen 0000 und 0001, vorhandene `test/postgres-repository.postgres.e2e.ts` | Atomare Entfernung eigener Dokumente und Redaktion strukturierter fremder Teilnehmer in **allen Revisionen**. SQL-Triggerschutz gegen Wiederanlegen und unautorisierte Direktupdates. Ein Validierungs-/Berechtigungsaufruf muss zuvor das Löschmandat prüfen; die Methode autorisiert sich nicht selbst |
| ULC Session-/Anwesenheits-/Anmeldeschreiber | `apps/ulc-linz/worker/training-session-postgres.ts`: `saveSession`, `saveRegistration`; Migrationen 0004, 0008 | Bisher **kein persistenter DB-Tombstone** für gelöschte Athleten und daher **keine No-Resurrection-Garantie** für Live-Writer |
| ULC Trainingshistorie / isolierte Löschung | `worker/training-subject-history-deletion-postgres.ts`: `eraseSubjectHistoryOnFrozenStore`; `test/training-subject-history-deletion.postgres.e2e.test.ts` | Transaktional für Attendance, Registration und Registration-Change innerhalb eines **belegbar eingefrorenen** Datenbestandes; **nicht** an Live-HTTP/Timer/Retention anbinden |
| ULC Read-only Privacy-Bestandsaufnahme | `worker/training-subject-privacy-postgres.ts`; `test/training-privacy-exposure.postgres.e2e.test.ts` | Strukturierte Datensätze pro Org/Subject lesbar; Freitext, Traineridentitäten und weitere Notizen werden **nicht** vollständig von diesen Zählern erfasst |
| App-weite Koordination | `worker/lifecycle-service.ts`: `inspectUlcLinzAthleteTrainingPrivacyExposure`, `eraseUlcLinzAthleteTrainingHistoryOnFrozenStore` | Admin-/Quellprüfung vorbereitet, aber kein **abgenommener End-to-End-Vertrag** für markergesicherte Live-Writer, vollständige Cross-Owner-Löschung und Restore |

## P03-A – Neues kombiniertes Real-PostgreSQL-Rehearsal

Der neue, eigenständige `test/p03-cross-owner-frozen-deletion.postgres.e2e.test.ts` installiert in einer **neuen isolierten, nach Testende gelöschten Datenbank** beide Dokumentationsmigrationen und beide ULC-Training-Schemata. Er ändert keine zuvor in Production-Contracts gepinnte Testdatei.

1. Ein Zielathlet besitzt ein eigenes Dokument; seine Teilnahme steht zudem in **zwei alten Revisionen eines fremden Dokumentations-Owners**, und in Attendance, Registration und zweifacher Registration-Change-Historie. Ein Nachbarathlet und dieselbe Subject-ID in einer anderen Organisation dienen als Scope-Gegenbeweis.
2. Der Dokumentations-Owner löscht/revidiert erfolgreich; danach wird **ein Fehler im zweiten Datenowner** beim Registrierungs-Cleanup gezielt simuliert. Die App-Owner-Transaktion rollt vollständig zurück – die bereits committete Dokumentationslöschung bleibt bestehen. **Eine appweite Fertigmeldung wäre falsch.**
3. Auf einem nachweislich **eingefrorenen** Test-Datenbestand wird der fehlgeschlagene App-Owner-Schritt wiederholt; er entfernt nur zielbezogene strukturierte Historie, lässt Nachbarn, fremde Organisationen und gemeinsame Session-Roots unberührt und ist bei zweiter Ausführung idempotent.
4. Der Dokumentations-Owner verweigert nachträglich das Wiederanlegen des gelöschten Subjects über seinen Datenbankmarker. **Dagegen kann ein alter Attendance-Writer aktuell nach der reinen Offline-Löschung erneut ein Target-Subject schreiben.** Dies ist ein absichtlich sichtbarer Beweis des P03-Live-Sperrgrunds.
5. Eine unverknüpfte Trainer-Freitextnotiz in einer Revision kann weiterhin den Namen des Zielathleten enthalten. Die strukturierte Teilnehmerredaktion ersetzt **keinen** normierten Umgang mit Freitext, Traineridentitäten oder personenbezogenen historischen Kommentaren.

**Keine Aussage:** Das erfolgreiche isolierte Nachholen zweier Owner-Schritte macht die gesamte App **nicht** production-ready; eine vollständige globale Delete-Commit-/Checkpoint-/Privacy-Replay-Kette muss erst entworfen und genehmigt werden.

## P03-B – Folgearbeiten mit eigener Security-/Privacy-Freigabe

- **Writer-Katalog:** alle `saveSession`-/`saveRegistration`-/Proxy-/Trainer-/Anwesenheits-/History-Schreibpfade inklusive parallelem Rollen-/Gruppenentzug und manuellen SQL-Writes inventarisieren; unveränderliche Org-/Subject-Schreibsperre und transaktionale Synchronisation mit Löschentscheidung nachweisen.
- **Betreiber-Privacy-Richtlinie P01:** Fristen für historische Attendance, Registration-Change, Trainer-Audit und Freitext sowie die minimale rechtmäßige Löschbeleg-Autorität nach 35 Tagen schriftlich festlegen. Keine automatische Verlängerung, keine implizite Anonymisierung.
- **App-Lifecycle:** nur nach validierter kanonischer Athleten-Löschquelle, aktiver Berechtigung und sicherem Replay über Trainingsplanung, Nutzungsdaten, Dokumentationsrevisionen, ULC-Historie und Medien eine einheitliche Fertigmeldung zulassen. Isolierte Rollback- und DB-Race-E2E mit verweigerten Schreibvorgängen aufbauen.
- **Restore/Backup:** nur eingefrorene, getrennte Datenbank; nachweislich vollständige **neuere** Löschautorität je Datenowner vor Promotion, Verbot offener Schreibzugriffe, Kontrolle aller Marker und historischer Freitext-/Drittperson-Bezüge. Eine leere Markerquelle oder eine grüne Teilprüfung ist kein Vollständigkeitsnachweis.
- **Security:** N16 [PR #602](https://github.com/martinirrgeher-cloud/appbasis/pull/602) und gestapelte Staff-Guards bleiben bis zu gesonderter Freigabe inaktiv. P03 darf diese nicht beiläufig freischalten.
- **Produktionscontract:** `modules/training-documentation/appbasis.production.json` behält `authorization/database/lifecycle=blocked`; `apps/ulc-linz/appbasis.production.json` behält `applicationLifecycle/privacy=blocked` bis zum vollständigen, auf exakte SHA gebundenen Gate.

## Abnahme dieses Test-Slices

- Neue Datei integriert in die bestehende isolierte PostgreSQL-E2E-Suite, plus unveränderte bisherige Produktions-Evidence-Dateien.
- CI Quality Gate und Identity PostgreSQL E2E **auf derselben PR-HEAD-SHA** erfolgreich; danach dürfen ausschließlich die neuen Test-/Dokumentationsänderungen gemergt werden.
- **Keine Änderung** an HTTP/Runtime, Auth, Migrationen, tatsächlichen DB-/Providerdaten, Production-Status, Retention-Policy, Preview oder Produktivdeployment. Keine Handy-Abnahme nötig für unveränderte Oberfläche.

**Nächster Meilenstein:** P01 Privacy-Entscheidung vor produktiven Writer-Guard-/Erasure-/Replay-Änderungen; darauf aufbauend P03-Security-Draft und integrative Restnachweise P04.
