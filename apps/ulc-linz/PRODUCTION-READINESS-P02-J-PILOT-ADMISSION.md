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
