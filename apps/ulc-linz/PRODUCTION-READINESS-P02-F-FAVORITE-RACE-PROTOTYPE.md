# P02-F – Katalogfavoriten: atomare Erasure/Writer-Races in PostgreSQL

**14.11.2026 · Status: Test-/Architektur-Entwurf, nicht produktiv aktiviert.** Folgt auf [P02-E PR #622](https://github.com/martinirrgeher-cloud/appbasis/pull/622) und den ursprünglichen P02-D-Negativnachweis [#620](https://github.com/martinirrgeher-cloud/appbasis/pull/620). Google Drive ist auf später vertagt und gehört **nicht** zum Scope.

## Ausgangslage

`PostgresExerciseCatalogRepository.setFavorite(..., true)` macht derzeit ein direktes `INSERT ... SELECT WHERE EXISTS(item)`, ohne nach einer Löschung des Personen-/Principal-Datensatzes einen Tombstone oder einen synchronisierten Write-Fence zu prüfen. Die bisherige P02-D-Regression belegt, dass ein stale Writer dieselbe persönliche Favoritenzeile wiederanlegen kann. Ein explizites `DELETE favorite` allein genügt deshalb **nicht**.

Das Trainingsblock-Modul bietet bereits einen atomaren Favoriten-/Löschschutz mit **demselben Transaktions-Advisory-Lock pro (Organisation, Principal)** und einer **35-Tage-Quelle**. Dieser existierende Code ist Referenz, **nicht** eine automatisch autorisierte Cross-Owner-Löschentscheidung für den Übungskatalog.

## Neue echte PostgreSQL-Probe (5 Fälle)

`test/p02-catalog-favorite-race-prototype.postgres.e2e.test.ts` richtet eine **separate, wegwerfbare Datenbank** aus den vier regulären Katalogmigrationen ein. **Nur in dieser Testdatenbank** wird eine Hilfstabelle `p02_probe_favorite_deletion` angelegt; sie ist **keine Repository-Migration** und kein neuer legitimer Personen-Löschledger.

Sowohl der reine **Kandidaten-Writer** als auch die simulierte Principal-Löschung verwenden vor Markerzugriff und Favorite-Schreiben denselben transaktionalen Advisory-Lock:
`pg_advisory_xact_lock(hashtextextended(jsonb_build_array(org,principal)::text,0))`.

- **Löschung zuerst:** Ein Writer mit bestehendem altem Favoriten-Intent muss warten und darf nach dem Marker-Commit keine neue Zeile erstellen.
- **Writer zuerst:** Er darf vor der Löschentscheidung schreiben; die anschließend serialisierte Löschung entfernt den gerade geschriebenen Favoriten, sodass am Ende keine Zeile für den gelöschten Principal existiert.
- **Mandanten-/Principal-Isolation:** Eine identische Principal-ID in anderer Organisation und ein anderer Principal in derselben Organisation bleiben unberührt.
- **Idempotenz:** Wiederholte Löschentscheidung verändert Markerbestand nicht und lässt keine alte Favoritenzeile wieder aufleben.
- **Negative Referenz:** Der **tatsächlich bestehende Katalogwriter** kann denselben testweise gespeicherten Löschmarker weiterhin ignorieren und einen Favoriten **wieder anlegen**. Ein bestandener negativer Test ist **kein** Produktiv-PASS.

## Warum dieser Test die produktive Lücke noch nicht schließt

1. Es fehlt eine **gemeinsame kanonisch berechtigte Löschquelle**, die Athleten/Identität/Trainer, Übungskatalog, Trainingsplanung, Trainingsblöcke, Dokumentation, Anwesenheit/Registrierung und Security-Audit tatsächlich über alle **acht Owner** atomar zusammenführt. Der neue Testmarker ist ausdrücklich nur eine isolierte Probe.
2. **P01/D2 ist weiterhin offen:** Es gibt eine 35-Tage-Originalquelle (`postExpiryRetry=deny`), aber keine freigegebene langlebige Datenhaltung, keinen voll belegten Backup-/Export-Horizont und keinen sicheren Post-Expiry-Replay. **Kein dauerhaftes Personen-Ledger** darf still eingeführt oder verlängert werden.
3. Das produktive `setFavorite()` ist **nicht** auf den Kandidaten umgestellt. Ohne vollständige Absicherung der SQL-Writer, alten Clients, direkter Verbindungen und echter Löschtransaktionen wäre die Freigabe riskant.
4. Dieser Favoritenbeleg sagt **nichts** über persönliche `exercise_catalog_usage.source_ref/note` und deren nicht beweisbare historische Zuordnung aus. Diese bleiben bis zu einem getrennten D1-/Owner-Gate in der Sperrung.
5. Es werden **keine** Medienobjekte, Echtdaten, Zugriffe, Provider-Backups, Deployments, Migrationen, Runtime- oder Policy-Änderungen vorgenommen.

**Abnahme:** Die fünf E2E-Gruppen müssen in der ohnehin eingerichteten isolierten PostgreSQL-CI laufen; zusammen mit vollständig grünem Quality Gate darf ausschließlich der Entwurf als **TEST PASS** dokumentiert werden. Der Live-Produktionsvertrag `privacy=blocked` bleibt unverändert, Merge und Deployment brauchen separate Freigaben.
