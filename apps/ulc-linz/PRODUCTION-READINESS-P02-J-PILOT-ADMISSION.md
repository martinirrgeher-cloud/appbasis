# P02-J – Gebündelte Pilot-Legacy- und Medien-Risikoanalyse

**Stand:** 19.11.2026. **Status:** technischer Diagnose-Draft, keine Policy-/Produktiv-/Deploy-Freigabe.

## Tatsächlicher, aggregierter Neon-Preview-Befund

| Datenquelle | Anzahl | Konsequenz |
| --- | ---: | --- |
| Katalog Items / Favoriten | 5 / 1 | persönliche Favoriten sind getrennt von Stammübungen zu behandeln |
| Katalog Usage / Private-Media-SQL-Metadaten | 0 / 0 | aktuell kein Legacy-Katalog- oder Medien-SQL-Bestand; R2-Objekte sind separat |
| Trainingsblöcke / Usage | 2 / 3 | alte Usage-Events enthalten ggf. persönliche Quellreferenzen oder Notizen |
| explizit nachweisbar zugeordnetes Blocks-Usage | **0 / 3** | keine Zuordnung anhand von Textmustern oder Source-Ref erfinden |
| Trainingsdokumentation / Revisionen | 1 / 1 | Schutz für Drittpersonen und Revisionen weiterhin nötig |
| Anmeldung / Änderungsverlauf | 9 / 92 | alte Freitexte und Trainer-Referenzen gesondert behandeln |
| Preview-Schema | 66 Tabellen | drei Standardmodule und App weiterhin produktionsgesperrt |

Dies sind aggregierte Zahlen vom 19.11.2026, keine aktuelle Produktionsaufnahme und kein vollständiger Betroffenen-/Speicherinventar-Nachweis. Es wurden keine persönlichen Feldinhalte, Identitäten oder privaten Mediendateien gelesen.

## Neues technisches Gate

- Ein rein lesender Pilot-Inspector unter tooling/ulc-linz-p02-pilot-admission.mjs stellt Datenbankidentität, Migrationsrolle und 66 Tabellen fest. Er liest in **einer** REPEATABLE READ, READ ONLY-Transaktion 20 numerische Aggregate der betroffenen Katalog-, Block-, Doku- und Anmeldetabellen.
- Die Auswertung gibt nur Kategorien und Zähler aus, keine Datensatz-IDs, Namen, Texte oder Storage-Keys. Unklare Legacy-Usage wird niemals automatisch einer Person zugeordnet.
- Auch bei 0 personenbezogenen Zeilen ist der Status **blocked**, solange P01-Privacy, Medienanbieter-Nachweise, P02-Writer/Restore und D2-Löschautorität fehlen.
- Unabhängige Node-Regressionsfälle und ein bewusst ausschließlich manueller GitHub-Preview-Inspect-Workflow. Keine Apply-Option, keine Löschung, kein Restore, keine Rollenänderung, kein Deployment.

## P2-C – verifizierter Plan→Block-Nutzungswriter (implementiert, Preview-Opt-in)

Der vorhandene Owner-Adapter `createUlcTrainingPlanVerifiedUsageBooking` ist jetzt **tatsächlich** an den AppBasis-PostgreSQL-Runtime-Aufbau angeschlossen: die identische kanonische `PostgresTrainingPlanRepository`-Instanz liest den aktuellen Plan und seine Subjektzuordnung; die `PostgresTrainingBlockRepository`-Instanz speichert eine explizite Subject-Usage-Zuordnung und prüft Löschmarker transaktional. Andere Organisationen, falsche Pläne, alte Revisionen und unklare Quellreferenzen dürfen keinen verifizierten Writer erhalten.

**Fail-closed Cutover:** Nur eine programmgesteuerte, ausdrücklich angeforderte `trainingBlockUsageMode: "isolated-preview-verified-subject"`-Option kann den neuen Pfad aktivieren. Vor dem Runtime-Start prüft `training-block-verified-runtime-readiness.ts` in einer **READ ONLY-Transaktion** die exakte Preview-Datenbank/Anwendungsrolle, 66 Tabellen, alle nötigen Objekt-Nachweise und effektive `SELECT`/`INSERT`-Rechte. Im aktivierten Modus lehnt `UlcTrainingBlockService.recordUsageOnce` **alle** alten, nicht personenbezogen attribuierten Einträge ab; es gibt **keinen** Fallback nach einem Markersperrenfehler.

**Tatsächlicher Anbieterbefund vom 19.11.2026:** `appbasis_ulc_linz_preview_application` kann aktuell `appbasis_training_block_usage_subject` **nicht INSERT** und `appbasis_training_block_usage_subject_deletion` **nicht SELECT**. Daher würde selbst bei gesondertem Aktivierungswunsch der neue Startcheck bewusst scheitern. **Keine** GRANTs wurden erteilt, keine Anwendung wurde umgeschaltet und es wurde kein Worker neu deployed. Die Berechtigungen müssen künftig nach eigenem Rechte-/SQL-E2E-Review minimal und sicher freigegeben werden; blinde Grants auf Löschmarker (insbesondere UPDATE/DELETE) sind ausgeschlossen.

**Kompatibilität und Tests:** Das bisherige Standardverhalten bleibt unverändert; Quiesced-/Legacy- und CRUD-Pfade der Blöcke erhalten ihre bisherigen Funktionen. Automatisierte Tests prüfen den Legacy-Cutoff, weiterhin funktionierende Blockbearbeitung, Preview-Datenbank-/Rollen-/Rechte-Negativfälle und die explizite Owner-Repository-Verdrahtung.

**Wichtige Restgrenze:** Die bestehende Buchungsroutine speichert den Trainingsplan **vor** der optionalen Usage-Buchung; bei Fehlern wird kein Legacy-Ereignis nachgeschoben, aber eine nicht gebuchte Usage kann zu einem bereits gespeicherten Plan gehören. Die spätere Produktivfreigabe braucht deshalb einen nachweisbaren Retry-/Audit-/Consistency-Gate sowie vollständigen P01-Rechts-/Owner-/Restore-Nachweis. Der jetzige Opt-in ist eine abgesicherte Integrationsvorbereitung, **keine** atomare Cross-Owner-Produktionsgarantie.

## Nächste gebündelte P2-Implementierung

1. **Katalog und Blöcke:** bestehende Guard- und Attribution-Methoden tatsächlich mit authentischen Athleten-/Plan-Owner- und transaktionalen Sperren verknüpfen; den weiterhin aktiven Legacy-Block-Usage-Weg erst nach realen Parallel-/Rollen-/Restore-E2E abstellen. Vorhandene real-PG-Tests wiederverwenden.
2. **Mediendateien:** schon bestehende Provider-Delete/GET-Verifikation beibehalten, jedoch den alternativen direkten SQL-Abschluss ohne gesicherte Provider-Abwesenheit schließen; R2-Inventar und Medienbackup getrennt prüfen.
3. **Dokumentation und App-Historien:** neue und alte Personenreferenzen, Drittteilnehmer/Notizen und Revisionsketten in einem isolierten Cross-Owner-E2E abnehmen. Kein stiller Merge von #602/#656.
4. **Produktivstart:** nach P01-Rechts-/AVV-/D2-Entscheidung und echter P2/P3-Verifizierung alle sechs bestehenden Module gemeinsam über Production-Contract und M6 in einen privaten Pilot bringen.

**Pragmatische Alternative für die aktuellen Testdaten:** Die spätere echte Produktionsdatenbank kann, nach ausdrücklicher Freigabe, **ohne Import alter Preview-Test-Usage/Notizen** initialisiert werden. Die drei ungeklärten Block-Events müssen dann nicht mittels unsicherer Heuristiken historischen Personen zugeschrieben werden. Der Vorschlag autorisiert **weder Löschen der Preview noch Überschreiben/Entsorgen bestehender Backups**; sichere künftige Write-/Erasure-/Restore-Prozesse sind trotzdem Pflicht.

**Grenze:** P02-J ist Diagnose/Entwicklungsvorbereitung, keine produktive Freigabe. Alle alten Handy-PASS bleiben unangetastet. Kein neuer Runtime-Flag und keine Aktivierung von Retention- oder Löschjobs.

## P2-D – geschützter Katalog, Dokumentationsrollen und Usage-Fertigstellung (gestapelter Draft)

**Nur Code-Vorbereitung; kein Worker-/DB-/Rollen-/Daten-/Lösch-Write.** Aufbauend auf P2-C (#659):

1. Ein neuer ausschließlich programmatisch auswählbarer `standard-module-protected-preview`-Katalogmodus verwendet den **vorhandenen** Standardmodul-Owner mit `favoriteFenceMode=require-catalog-erasure-marker` und `usageWriteMode=require-explicit-subject`. Normale Übungen bleiben über den vorhandenen authentifizierten HTTP-Editpfad bearbeitbar; Favoriten unterliegen dem Löschmarker. Unzugeordnetes `recordUsage` darf weder im Katalog noch durch Freitextreferenzen einen personenbezogenen Legacy-Writer auslösen. Es wird **kein neuer Verified-Usage-HTTP-Writer** erfunden. Bestehender Live-Katalogmodus bleibt unverändert.
2. Vor Start verlangt dieser Modus einen read-only `REPEATABLE READ`-Nachweis der exakten Preview-Datenbank, Anwendungrolle, 66 Tabellen, Katalog-/Favoriten-/Markerobjekte und **aller getrennten nötigen Rechte**. Die Anwendungsrolle darf den Favoritenlöschmarker nicht selbst bearbeiten. Kein pauschaler `GRANT`; fehlende Rechte führen zu `ULC_PROTECTED_CATALOG_UNAVAILABLE` ohne Runtime-Start.
3. Dokumentations-Edit-Rechte setzen jetzt auch voraus, dass SQL-Membership und kanonischer Identity-/Permission-Membership-Resolver **dieselbe aktive Rolle und Organisation** liefern; ein Rollenwechsel/Drift darf keine Organisationstrainerrechte aus einem Athleten- oder Elternkonto herleiten. Lese-, Abschluss- und Wiederöffnungsrechte bleiben getrennt an die vorhandenen Capabilities gebunden.
4. Im **noch nicht aktivierten** geschützten Plan→Block-Modus erzeugen fehlerhafte Nutzungsbuchungen keinen falschen HTTP-Speichererfolg mehr: `ULC_TRAINING_PLAN_USAGE_INCOMPLETE` (409) nennt die bereits gespeicherte Plan-ID, Revision und Anzahl fehlgeschlagener Buchungen. `POST /api/modules/training-plans/:id/finalize-usage` ist **nur** mit bestehendem Trainingsplanung-Editrecht und exakt passender aktiver Planrevision nutzbar. Im Legacy-Modus liefert die Route 404. Sie legt keinen zweiten Plan an, prüft aktuelle Owner-/Subject-Sperren und wiederholt idempotente, unverändert deterministische Usage-IDs. Der Ereigniszeitpunkt stammt aus der **ersten kanonischen Revision** mit diesem Blockitem und bleibt bei späteren Autosaves stabil; historische Fremd-/umgewidmete Blockreferenzen werden abgewiesen.

**Bleibende Gates:** Keine Aktivierung ohne isolierte reale PostgreSQL-Rechte-, Concurrency- und Retry-E2E; weder das Katalog-/Dokumentations-Owner-Erasure inkl. Fremdteilnehmern und R2-Medien noch Preview-/Produktionsgrants, D2-Backup-Retention oder vollständige App-Production-Readiness sind hiermit freigegeben. Ein fehlender Teilbuchungs-Nachweis darf nicht als reparierter Altbestand ausgegeben werden; die drei bisher unzugeordneten historischen Blockevents bleiben unangetastet. Bestands-Handy-PASS und Legacy-Runtime unverändert.

**Neue Abnahmeprüfungen:** negative Preview-Katalog-Rechte-/Rollen-/Markerprüfungen, Dokumentations-Rollenkonsistenz, stabile Retry-Timestamps, Teilbuchungsfehler und manuelle Wiederholung ohne Legacy-Fallback. CI/Typecheck und exakte PostgreSQL-E2E sind als separate Gate-Nachweise erforderlich.

## P2-E – Preview-Live-Rechte- und Schemaabgleich, ohne Mutation (19.11.2026)

**Befund:** Tatsächliche `main`-Preview-Branch `appbasis-ulc-linz-preview`, Datenbank `appbasis_ulc_linz_preview`, Anmeldung **mit der regulären App-Rolle** `appbasis_ulc_linz_preview_application`; ausschließlich `SELECT` auf PostgreSQL-Schemakatalog und `has_table_privilege`, keine persönlichen Datensätze, keine SQL- oder Providerwrites:

- **66 öffentliche Tabellen** wie im alten Schema; beide P02-G/P02-H-**Test-Fixture**-Relationen fehlen tatsächlich: `appbasis_exercise_catalog_favorite_deletion` und `appbasis_exercise_catalog_usage_subject`. Diese Files sind ausdrücklich **nicht** registrierte Neon- oder Modul-Migrationen. Eine Freigabe erfordert einen separat geprüften, versionsgebundenen Migrationsschritt mit Rollback-/Restore-Abnahme; nicht einfach die Fixtures auf der Preview ausführen.
- Die reguläre App-Rolle hat für `appbasis_training_block_usage_subject` **weder INSERT noch SELECT**, und für `appbasis_training_block_usage_subject_deletion` **kein SELECT**. Das sind die **drei gezielt fehlenden** Rechte des verifizierten Plan→Block-Schreibwegs. `appbasis_training_block_usage` INSERT sowie die nötigen Plan-/Revisions-/Item-SELECTs sind vorhanden. Eine mögliche Minimalgrant-Entscheidung muss nach Owner-SQL-Review getrennt genehmigt werden; **kein pauschales GRANT** und keinesfalls DELETE/UPDATE auf Löschmarkern für den Alltags-Worker.
- Die Katalog-Haupt-/Parameter-/Zielgruppen-/Video-/Ähnlichkeitstabellen und Favoriten besitzen bereits die geprüften normalen SELECT/INSERT/UPDATE-/DELETE-Funktionsrechte. Die fehlende Favoritenlöschmarkertabelle kann daher nicht durch bloße Grants repariert werden. Ein späterer geschützter Katalogmodus verlangt **exakt 68 öffentliche Tabellen und beide echten Schutzrelationen**.
- Die Block-Preflight-Prüfung akzeptiert für einen **unabhängigen** geschützten Writer die aktuellen 66 Tabellen oder **68 nur mit beiden** Katalog-Schutzrelationen. Der read-only Pilot-Inspector erkennt ebenfalls diese beiden explizit erlaubten Formen und verweigert bei Teilmigrationen; ein Befund **`blocked`** bleibt auch bei 68 Tabellen zwingend.

**Zusätzlicher technischer Wiederherstellungspfad:** Im weiterhin nicht aktivierten geschützten Modus behandelt der Handy-Editor `ULC_TRAINING_PLAN_USAGE_INCOMPLETE` als **bereits gespeicherten Plan**, vervollständigt die exakt gemeldete Revision via `finalize-usage` und wiederholt bei Netzwerkfehlern **nur den Finish-Request**, niemals ein zweites CREATE/UPDATE. Auch die Mehrfachverteilung kann den bereits erzeugten Empfängerplan fertigstellen, statt ihn erneut zu kopieren. Pending-IDs bleiben nur im Arbeitsspeicher der aktuellen Sitzung, werden beim Identitätswechsel entfernt; Plan-Daten bleiben unverändert im lokalen bewährten Recovery-Mechanismus. Positive/negative UI- und HTTP-Autorisierungstests schützen die Bedienung.

**Freigabereihenfolge (keine Aktion in diesem PR):** (1) exakte Datenschutz-/Lösch-/Providerentscheidung samt Restore-Grenzen, (2) registrierte Guard-Schema-Migration und isolierte Rollbacks, (3) separat genehmigte **minimalen** App-SQL-Rechte samt negativen Role-E2E, (4) programmatischer Opt-in und echte Preview-Checks, (5) Handy-Abnahme, (6) erst dann freigegebener privater Pilot mit ohne unklare Alt-Testnotizen neu aufgebauter Produktionsdatenbank. Nicht als produktive Aktivierung oder vollständige Löschfreigabe auslegen.
