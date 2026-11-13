# ULC Linz P02 – Owner-Lifecycle- und PostgreSQL-Beweismatrix

**Status:** technische Vorbereitung, **nicht** Produktionsfreigabe. Baseline: Produktions-Sprint [#607](https://github.com/martinirrgeher-cloud/appbasis/issues/607) und [P00-Inventur](./PRODUCTION-READINESS-P00.md). Die Verträge `modules/exercise-catalog/appbasis.production.json` und `modules/training-blocks/appbasis.production.json` bleiben absichtlich `blocked`.

## P02-A: Übungskatalog – belegte und fehlende Garantien

| Schutzbehauptung | Eigentümer / Code | Test-/Belegstatus | Urteil |
| --- | --- | --- | --- |
| Daten anderer Organisationen und Principals bei Favoriten nicht vermischen | `modules/exercise-catalog/src/postgres-repository.ts`: `setFavorite`, `listItemsWithFavorites` | Neuer Real-Postgres-E2E in `apps/exercise-catalog-minimal/test/app.postgres.e2e.ts`, identische Exercise-ID in zwei Organisationen | **Prüfung vorhanden**, keine Full-Lifecycle-Freigabe |
| Nutzungsereignisse, Quellreferenzen und Notizen mandantenspezifisch lesen | `recordUsage`, `listUsageEvents`, `listUsageSummaries` | Neuer Real-Postgres-E2E zu identischen Item-IDs und privaten Notes | **Prüfung vorhanden**; Datensubjekt-Attribution/Erasure unbewiesen |
| Private Media: zuerst Delete-Anforderung, dann bestätigter Metadata-Delete | `requestPrivateMediaDeletion` / `completePrivateMediaDeletion`, Migration `0003_appbasis_exercise_catalog_private_media_delete_state.sql` | Die vorhandene isolierte Standardmodul-E2E-Suite installiert nun auch Migration `0003` und prüft getrennte Organisationen, falsche Items, Verbergen aus Listen, erforderliche Vorbestätigung und Wiederholbarkeit | **Nur Metadata**: der Test und die beiden Methoden löschen **keine Datei** aus einem tatsächlichen Storage-Provider |
| Personal/Favorite/Usage Deletion, No-Resurrection und Restore | Owner-Repository bietet `setFavorite`, `recordUsage`, `registerPrivateMedia`; keine autorisierte vollständige Deletion-/Retention-Komposition erkennbar | Weder ein freigegebener personenbezogener Tombstone-Writer-Guard noch vollständige Subject-/Principal-Restore-Replay-Evidence im Modulvertrag | **BLOCKED** |

**Wesentliche Konsequenz:** Ein auf Requested gesetztes Medium ist aus der Standardliste ausgeblendet, aber die Datenbankzeile mitsamt `storage_key` besteht bis zum expliziten Complete weiter. Complete entfernt die **Datenbank-Metadaten**; die externe Datei muss zuvor durch einen separat autorisierten, nachweisbaren Provider-Vorgang tatsächlich gelöscht werden. Das ist eine ausstehende Produktiv- und Datenschutzgrenze, keine automatisch zu überspringende Nebenbedingung.

### P02-A Folgeimplementierung (erst nach fachlicher Retention-/Security-Freigabe)

- **Owner-Entscheidung:** Ist Favorite eine `principal_id`-bezogene Identitätspräferenz, Usage eine übungsspezifische anonyme Vereinsstatistik oder eine personenbezogene Subject-Historie (einschließlich Freitext)? Für jede Form den nachweisbaren Lösch-/Aufbewahrungs- und Re-Attributionsvertrag definieren.
- **Medien:** Storage-Provider und Objekt-Ownership nachweisen, zweimal wiederholbare autorisierte Delete-Request/Confirm-Abfolge mit Fehlerpfad/Bestätigung und Retry ohne blindes Lost-Delete. Keine synthetische Behauptung „physisch gelöscht“ durch bloße SQL-Zeilenentfernung.
- **No-Resurrection:** Unter konkurrierender Favoriten-/Usage-/Media-Erstellung nach berechtigter Personenlöschung müssen datenbankseitige oder äquivalent atomare, dauerhafte Deny-Guards greifen; Restore-Preflight muss altes personenbezogenes Material erkennen.
- **Freigabe:** isolierte PostgreSQL-E2E mit zwei Verbindungen, Tenant-/Principal-/Subject-Negativfällen, idempotentem Replay, Object-Storage-Fake/echtem Providervertrag und abgesichertem Backup/Restore. `lifecycle=blocked` erst nach tatsächlichem Nachweis plus separater Gate-Freigabe lösen.

## P02-B: Trainingsblöcke – vorhandene Beweise sinnvoll wiederverwenden

`modules/training-blocks/test/postgres-repository.postgres.e2e.ts` prüft bereits unter anderem:

- Verifizierte subject-gebundene Usage und Abgrenzung mehrdeutiger Legacy-Events.
- Atomare Subject-Usage-Deletion, Verhinderung des Wiederauflebens und konkurrierende Writers auf getrennten Verbindungen.
- Favorite-Tombstones, idempotente Wiederherstellung älterer Datenstände sowie Principal-/Org-Isolation.
- Unveränderliche Revisionen, blockierte Änderungen nach Deaktivierung, Schutz genutzter Blöcke und konkurrierende Updates.

**Nicht doppelt bauen.** Vor echter Produktivfreigabe fehlen insbesondere die App-Owner-Verknüpfung zu Trainingsplan-/Athletenlöschung, eine belastbare Strategie für **nicht eindeutig einer Person zuordenbare Legacy-Usage**, exakte Retention-, Backup-/Restore- und Crash-/Replay-Grenzen sowie ein dokumentierter Umgang mit dauerhaft erhaltenen nichtpersonenbezogenen Revisionen.

## Release-Gates für P02-A/B

1. `Quality gate` und `Identity PostgreSQL E2E` auf derselben exakten PR-HEAD-SHA grün (für diesen rein testenden Slice).
2. **Keine** Änderungen an bestehenden Schreib- und Berechtigungsrouten, Produktionsmigrationen, Rollen, App-JSON `blocked` oder Deployments durch diese Vorbereitung.
3. Für produktive Owner-Lifecycle-Änderungen ein separates Security-/Privacy-Draft mit ursprünglicher P01-Entscheidung, konkurrierenden PostgreSQL-Races, Cross-Owner-Tests und ausdrücklicher Betreiberfreigabe.
4. Erst nach P02-A/B + P03 Gesamtkomposition und aktuell gültige Evidence über den kanonischen `production-contract --require-ready` nachweisen.

**Offene Erstentscheidung:** Datenkategorien und Fristen für persönliche Favoriten, alte Usage-Notizen/Quellreferenzen, historische Trainingsblöcke und private Mediendateien. Diese technische Bestandsaufnahme nimmt dem Vereinsverantwortlichen keine Datenschutzentscheidung ab.
