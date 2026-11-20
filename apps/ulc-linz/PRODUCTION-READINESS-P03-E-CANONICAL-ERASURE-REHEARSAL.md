# P03-E – Kanonisch belegte Trainingsdaten-Löschung, isolierte Integrationsprobe

**Stand: 20.11.2026. DRAFT / nur PostgreSQL-18-Testdatenbank; keine Aktivierung.**

## Zweck und Einordnung

P03-C hatte nachgewiesen, dass ein veralteter Trainer-Speichervorgang bereits gelöschte Anwesenheit und Anmeldungsdaten **wieder anlegen** kann. P03-D führte einen **unregistrierten** SQL-Entwurf für die notwendigen Schreibsperren ein. P03-E schließt auf einer **isolierten PostgreSQL-Kopie** die nächste tatsächliche Lücke: Marker-Erstellung und Löschen der drei App-Datengruppen müssen dieselbe Transaktion und denselben pro Athlet serialisierten Lock benutzen wie P03-D.

**Diese Implementierung ist keine Freigabe für personenbezogene Löschung.** Es gibt keinen HTTP-Endpunkt, keinen Cronjob, keine Workerverkabelung und kein Produktiv-/Preview-Migrations-Apply.

## Umsetzung

Neues bewusst **nicht** aus dem Worker-Entrypoint exportiertes Modul:
`apps/ulc-linz/worker/training-subject-marked-history-rehearsal.ts`

`markAndEraseOnIsolatedStore(organizationId, athleteId)`:

1. Verweigert ungültige Organisations- und Athletenkennungen und startet `READ COMMITTED` innerhalb einer echten PostgreSQL-Transaktion.
2. Sperrt `organization_id + chr(31) + athlete_id` mit **identischem** `pg_advisory_xact_lock(hashtextextended(...,0))` wie die drei SQL-Trigger aus P03-D.
3. Prüft die tatsächlich vorhandene kanonische `appbasis_athletes_deletion`-Zeile mit `entity_type='athlete'`, exakt richtiger Organisation und `FOR SHARE`. Ohne diese Authority **kein** App-Marker und **keine** Löschung. Ein bloßer App-Parameter ist kein Löschbeleg.
4. Übernimmt `completed_at` und `purge_after` aus dem **kanonischen** Athleten-Owner in `ulc_linz_training_subject_deletion`; keine neu errechneten Fristen. Ein vorhandener Marker wird ausschließlich beim **exakten** Zeitstempel-/Fristenmatch für einen idempotenten Retry akzeptiert.
5. Entfernt `ulc_linz_training_registration_change`, `ulc_linz_training_registration` und `ulc_linz_training_attendance` unter dem Marker- und Subject-Lock und verifiziert innerhalb derselben Transaktion, dass exakt diese Personenreferenzen vollständig verschwunden sind.
6. Liefert getrennte Löschanzahlen und `markerInserted` zurück. Das ist **kein** App-übergreifendes Löschzertifikat. Bei jedem Fehler rollt PostgreSQL Marker und Deletes zurück.

## Echte Regression auf lokaler PostgreSQL-18-Wegwerf-Datenbank

`apps/ulc-linz/test/p03-e-marked-training-history.postgres.e2e.test.ts` wird über das bestehende verpflichtende `test:postgres` der ULC-App ausgeführt. Der Test verwendet nur synthetische Organisations- und Athletenkennungen und die **Originaldateien** der bisherigen Schemaowner sowie das unregistrierte P03-D-Trigger-Fixture.

Abnahmepunkte:

- Fehlende oder fremdorganisationsbezogene kanonische Athleten-Löschentscheidung → keine App-Marker oder Deletes.
- Gültige kanonische Authority → exakt drei app-owned Datenowner entfernt, andere Organisation/Nachbarathlet und gemeinsames Session-Root behalten.
- Erneuter Aufruf → `markerInserted=false`, Löschanzahlen 0; abgelaufener Marker bleibt No-Resurrection-Sperre.
- Absichtlich erzwungener DB-Fehler nach Teil-Deletes → **gesamter** Rollback, einschließlich Marker; sauberer Retry möglich.
- Bereits existierender Marker mit falscher canonical `completed_at/purge_after`-Kombination → verweigert statt blindem Replay.
- Überlappender alter SQL-Writer → P03-D-Trigger verweigert den neuen Write nach der gesicherten Löschung.

## Offene Sicherheits- und Betreiberentscheidung

- Die neue Methode ist explizit eine **privilegierte, isolierte Repository-Primitive** und **kein** autorisierter Produktivdienst. Vor einer echten Operation muss die Identität des ausführenden Administrators, die kanonische Athleten-Löschentscheidung, Organisationsrechte, Sperren und Audit separat durch einen freigegebenen Coordinator bewiesen sein. Eine App-Rolle darf weder Athleten- noch App-Löschmarker schreiben oder ändern.
- Der testseitige Marker ist absichtlich unabhängig vom Kalender-v17 und Katalog-v5. Das vollständige Schema hat aktuell Preview **66**, zusätzlich Katalog **+2 = 68**, zukünftig App-Trainingsmarker **+1 = 69** Tabellen. Diese Zahlen sind kein automatisches Nachweis eines zulässigen Updates von Production **51** Tabellen.
- Restliche Personenreferenzen: Traineranwesenheit/-Audit, Anmeldungs-Akteurkennungen, Dokumentationsrevisionen mit Teilnehmern, Freitext, private R2-Medien und anderer Datenowner. Keiner dieser Fremdowner ist mit dieser Primitive gelöscht oder rechtswirksam freigegeben.
- Wiederherstellung: Die Marker müssen **nach einem Restore** aus einer aktuellen autoritativen Quelle erneut abgeglichen und alle Eigentümer-Löschungen bestätigt werden; vor Freigabe des wiederhergestellten Standes sind Prüfungen bei Abweichung geschlossen zu halten. Der bisherige P2-E-Restore-Test beweist nur synthetische Katalogmarker.
- Für den Produktionsstart fehlen weiterhin: P01/D2-Datenschutz-/Aufbewahrungsentscheidung, isolierte Kopie **echter** aktueller Production-Backups mit vollständigem Upgrade, SQL-Rollen-/Grantabnahme, komplette Recovery-/Re-Deletion-/Medienabnahme, fokussierte Handyprüfung, Betreiber-Go-live.

**Freigabefolge:** technische CI → Sicherheitsreview → isolierter realer Production-Backup-Migrationstest (separat autorisiert) → Datenschutz-/Restore-Richtlinien → minimale privilegierte Laufzeitverkabelung und Abnahme → erst danach Produktiv-Go-live. Keine Merges/Deployments ohne eigene Freigabe.

Bezug: #530, #607, Drafts #659–#663.
