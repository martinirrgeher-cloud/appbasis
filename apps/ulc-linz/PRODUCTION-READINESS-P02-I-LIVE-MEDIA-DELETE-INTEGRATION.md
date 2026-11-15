# P02-I – Sicherheitsschutz im realen ULC-HTTP-Löschpfad für private Übungsvideos

**14.11.2026. Status: realer Worker-Code im Draft, isoliert getestet, noch nicht gemergt oder deployed.** Google-Drive-Backup bleibt auf ausdrücklichen Betreiberwunsch pausiert.

## Der bisher aktive Fehler

In `apps/ulc-linz/worker/index.ts` führte der HTTP-Pfad `DELETE /api/modules/exercise-catalog/:exerciseId/private-media/:mediaId` zunächst `requestPrivateMediaDeletion` aus. Das markiert Metadaten als pending und blendet den Clip aus der Liste aus. Anschließend folgten `store.delete(media.storageKey)` und **ohne unabhängige Kontrolle des Anbieterbestands** `completePrivateMediaDeletion`; selbst dessen Rückgabe `false` wurde ignoriert und HTTP `{deleted:true}` gesendet. Das ist keine belastbare Zusage einer tatsächlichen Löschung. Der schon vorhandene P02-D-Negativtest in Draft #620 und P02-E-Entwurf in Draft #622 zeigen das grundsätzliche Risiko.

## P02-I: Integration im echten Worker, ohne SQL- oder Release-Vertragsänderung

Neue Methode `deleteUlcPrivateExerciseMediaWithConfirmation` in `worker/exercise-catalog-media-delete-confirmed.ts`, aus dem echten DELETE-Handler in `worker/index.ts` aufgerufen. Der HTTP-Handler behält seine bisherige Authentifizierung und Bearbeitungsberechtigung; kein neuer öffentlich ansprechbarer Endpunkt wird eingeführt.

1. Exakter Mandant-/Übung-/Medien-Scope wird vor einem Datenbankaufruf geprüft. Der Metadatensatz stammt aus `requestPrivateMediaDeletion`. Seine `organizationId`, `exerciseId`, `id` und `storageKey` müssen dem ursprünglich angefragten Objekt entsprechen. Der Speicherpfad muss mit `privateExerciseVideoStorageKey(organizationId, exerciseId, mediaId)` **exakt** dem vom ULC-Upload verwendeten Schema entsprechen. Bei fehlerhafter/aus einem alten unbekannten Namensschema stammender Datei: **kein Anbieter-Delete**, kein SQL-Finalize; gesonderte fachliche Behandlung erforderlich.
2. Nach `await store.delete(exactKey)` wird ein **neuer unabhängiger Provider-GET mit Range `bytes=0-0`** ausgeführt. Eine Datei wird erst dann als nicht mehr vorhanden behandelt, wenn der Provider selbst `null` zurückmeldet. Der Inhalt wird nicht verarbeitet; bei einer bestehenden Datei wird der Stream abgebrochen.
3. Provider-Delete-Fehler, GET-Fehler, noch vorhandene Datei, unpassender Metadatensatz oder ein `completePrivateMediaDeletion` mit `false` bzw. Exception führen **ausnahmslos zu `unconfirmed`**. Der SQL-Pending-Eintrag bleibt erhalten; der nächste DELETE-Versuch kann erneut prüfen und abschließen. Keine vertraulichen Providerfehlermeldungen in der API.
4. Erst die Kombination **Anbieterabwesenheit bestätigt + SQL-Finalisierung gibt tatsächlich `true` zurück** ergibt `{deleted:true}`. Der echte HTTP-Pfad liefert sonst **503** mit `EXERCISE_CATALOG_MEDIA_DELETE_UNCONFIRMED`, `retry-after:60`, `cache-control: private, no-store`. Fehlende Metadaten geben weiterhin 404 zurück.
5. Der übrige Worker, die berechtigten Uploads und die historischen Preview-Prozesse sind unverändert; keine Migrationsregistrierung, kein Tabellen-/Index-/Retentionwechsel, kein Backend-/GitHub-Secret-/Produktionsschreibzugriff.

## Tests

- **15 reine Unit-/Fake-Provider-Tests** in `test/p02-live-media-delete-confirmation.test.ts`: korrekte Reihenfolge, tatsächlich noch vorhandene Datei, fehlende/andere/gefälschte Metadaten, fremder Tenant/Übung/Medien-ID, fremder Speicherpfad, Provider-Delete-/GET-Ausfall, SQL `false`/Exception, erneuter Versuch und doppelte Idempotenz, ungültiger Scope.
- **2 zusätzliche reale isolierte PostgreSQL-Tests** in der bereits eingeführten P02-D/E-Testdatei: exakter Coordinator mit echtem `PostgresExerciseCatalogRepository`, SQL-Pending-/Finalzustand und idempotenter Zweit-DELETE; zweiter Test verweigert Abschluss bei Provider-Restdatei, bestätigt SQL-Pending und prüft erfolgreichen Retry ohne Beeinträchtigung desselben Medien-ID im Nachbarverein.
- Diese realen SQL-Tests verwenden ausschließlich eine Wegwerf-Datenbank und einen **simulierten** Objektanbieter. Sie sind keine Beweise für tatsächliche R2-Objekt-/Backup-Löschung. Vollständige Quality-/CI-Abnahme auf exakter PR-HEAD-SHA erforderlich.

## Grenzen / weiterhin BLOCKED

**Dieser Patch verbessert einen realen HTTP-Löschpfad, ist aber keine vollständige DSGVO-konforme Medienlöschung und keine Produktionsfreigabe.**

- Cloudflare R2 oder ein anderer tatsächlicher Anbieter wurde **nicht live getestet**, insbesondere nicht bei concurrent reupload, Versionierung, verzögerter Ausbreitung, Datenexport, Object-Retention oder Provider-/Kopie-/Backup-Löschen. Ein einmaliger GET `null` belegt nur die vom Anbieter im aktuellen Request gemeldete Abwesenheit, keine physische vollständige Löschung aus allen Speicherebenen.
- Der bisherige direkte SQL-Bypass `completePrivateMediaDeletion` im AppBasis-Katalog-Repository ist **weiter erreichbar**; ein exklusiver, durchgehend durchgesetzter DB-/Storage-Writer-Fence und ein autorisierter Owner für die endgültige Löschfreigabe stehen aus. Andere SQL-, Worker- oder Medienpfade können diese Prüfung umgehen. Die neue Prüfung heilt nicht nachträglich alte, bereits ohne Beleg abgeschlossene Löschungen.
- Alte Speicherpfade, für die das ULC-Upload-Schema nicht nachgewiesen ist, müssen gesondert geprüft werden; sie werden sicherheitshalber **nicht gelöscht und nicht als erfolgreich behandelt**.
- `privacy=blocked`, `applicationLifecycle=blocked`, acht-Owner-/Retention-/Backups-/Restore-Freigabe und alle übrigen P01/P02/P03-Blocker bleiben unverändert. P02-G/H-Löschmarkertabellen sind bisher **nur in isolierten Tests vorhanden**; die produktive Datenbank bleibt Schema v4.
- Ein Merge oder Deployment auf die getestete Cloudflare/Neon-Infrastruktur erfolgt **nur nach gesonderter Betreiberfreigabe**. Diese PR darf keine Berechtigung zur Aktivierung/Produktion suggerieren.

## Warum dieses Paket Priorität hat

P02-D/E/F/G/H lieferten wichtige isolierte Security-Belege. **P02-I übernimmt erstmals eine dieser Prüfungen in den tatsächlichen ULC-HTTP-Pfad**, ohne riskante unbekannte Datenbank- oder rechtliche Migrationen zu aktivieren. Bei einer unvollständigen Löschung sieht der Nutzer nun eine ehrliche Fehlermeldung, statt fälschlich `deleted:true`. Die übrigen Module und getesteten Mobilfunktionen bleiben unangetastet.
