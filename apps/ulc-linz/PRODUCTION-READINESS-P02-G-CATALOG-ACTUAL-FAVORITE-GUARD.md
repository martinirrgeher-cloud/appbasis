# P02-G – Echter (opt-in) PostgreSQL-Writer-Fence für Katalogfavoriten

**14.11.2026 · Status: isolierter Produktionscode-Entwurf und reale PostgreSQL-E2E, NICHT freigegeben oder aktiviert.** Folge von [P02-F PR #623](https://github.com/martinirrgeher-cloud/appbasis/pull/623) auf P02-E #622 und P02-D #620. Google Drive ist pausiert; dieser Slice verwendet keinen externen Provider.

## Warum dies mehr als die bisherige Test-Probe ist

Im Unterschied zur P02-F-Demo implementiert P02-G den Writer-Fence **im echten** `modules/exercise-catalog/src/postgres-repository.ts`:

- `new PostgresExerciseCatalogRepository(client, {favoriteFenceMode: "require-catalog-erasure-marker"})` aktiviert den optionalen atomaren Schutz. Standard bleibt bewusst `"legacy-unprotected"`, um unveränderte Preview-/Echtinstallationen und andere AppBasis-Modulnutzer nicht heimlich zu blockieren. **Dieser Standard ist nicht für den Produktiv-Lifecycle freigegeben.**
- `setFavorite` beginnt im aktivierten Modus eine PostgreSQL-Transaktion und nimmt mit `pg_advisory_xact_lock(hashtextextended(jsonb_build_array(organizationId,principalId)::text,0))` **denselben Paar-Lock wie der Trainingsblock-Owner**. Beim Favoriten-Setzen kontrolliert er dann die eigene SQL-Löschmarkertabelle; auf vorhandenen Marker folgt `ExerciseCatalogFavoriteDeletedError` statt einer neuen Favoritenzeile. Beim Entfernen nimmt er denselben Lock.
- `markPrincipalDeletedAndDeleteFavorites(org, principal, completedAt)` darf später **nur durch eine kanonisch autorisierte Löschentscheidung des App-/Identity-Owners** aufgerufen werden. Sie legt unter demselben Lock in **einer einzigen Transaktion** den Marker an und entfernt alle persönlichen Katalogfavoriten im exakten Organisation-/Principal-Scope. Wiederholtes Ausführen verlängert die Frist nicht.
- Fehlt die neue Marker-Tabelle, schlägt der **opt-in Writer fail-closed** wegen PostgreSQL-Tabellenfehler fehl und darf nicht automatisch auf Legacy zurückfallen. Die neue Tabelle wird durch die Kandidatenmigration `modules/exercise-catalog/migrations/0004_appbasis_exercise_catalog_favorite_deletion.sql` angelegt. Sie speichert `completed_at`, `purge_after=completed_at+840 hours` und die bestehende `organization_id/principal_id`-Zuordnung – **keine** Veränderung der bisherigen fachlichen 35-Tage-Grenze. **Eine Retention-Purge-Automatik ist nicht enthalten.**
- Beide Pfade sind für realen PostgreSQL-SQL-Code implementiert; der neue Schutz wird **nicht** von `apps/ulc-linz/worker/exercise-catalog-runtime.ts` aktiviert. Die Bestandsapp wird weder migriert noch deployed.

## Sieben unabhängige Testfälle gegen den echten Repository-Code

`apps/ulc-linz/test/p02-catalog-favorite-guarded-repository.postgres.e2e.test.ts` erzeugt eine **isolierte Wegwerf-PostgreSQL-Datenbank** mit Katalogmigrationen `0000` bis `0004`. Sie ist explizit in `pnpm --filter @appbasis/app-ulc-linz test:postgres` aufgenommen und überprüft:

1. Echtes `setFavorite` → `markPrincipalDeletedAndDeleteFavorites` → stale `setFavorite` wird abgewiesen; exakt **35 Tage** Retention als Intervallbeleg.
2. Zwei unabhängige DB-Verbindungen: **Löscher nimmt Lock zuerst**, blockierter veralteter Writer sieht Marker nach Commit und kann nicht reinsertieren.
3. Zwei unabhängige DB-Verbindungen: **Writer nimmt Lock zuerst**, Löscher wartet, entfernt anschließend den fertigen Favoriten; Endbestand ebenfalls leer.
4. Gleicher Principal in anderer Organisation und andere Person in derselben Organisation bleiben unverändert.
5. Mehrfache autorisierte Löschung ist idempotent, `completed_at`/`purge_after` werden nicht erneuert.
6. Ungültige IDs/Timestamps und Löschaufruf bei nicht aktivierter Sicherheitsvariante werden zurückgewiesen.
7. **Negativer Realitätscheck:** Ein absichtlich neu angelegtes Repository im `legacy-unprotected`-Modus kann nach einer Löschung noch immer einen Favoriten erstellen. Das ist **ein aktives Integrationsrisiko**, keine fertige Produktionssicherheit.

## Explizite Aktivierungsblocker

- **Fachlich/rechtlich**: P01/D2 und neuere vollständige Löschquelle über alle acht Datenowner, tatsächlicher Backup-/Export-Maximalhorizont und `postExpiryRetry=deny` müssen nachweisbar entschieden sein. Diese Migration ist keine automatische Freigabe einer neuen personenbezogenen Tabelle, kein langfristiger Personen-Ledger und kein Nachweis zur zulässigen Purge-Zeit.
- **Integrationsseitig**: Der App-/Standard-Owner muss **alle** Schreibpfade atomar schützen: ULC-Standardmodul-Adapter, Service, konkurrierende Worker, externe SQL-Writers, Canonical-Principal-Delete-Aufrufer und Wiederherstellung. Ein nur teilweise opt-in `new Repository` ist nicht sicher. **Keine** heimliche Runtime-Umschaltung vor separatem Security Review und freigegebener Migration.
- **Datenlifecycle**: Die vorhandenen persönlichen `exercise_catalog_usage.note/source_ref`, historische unklare Subjektzuordnung und Provider-Medienlöschung aus P02-E bleiben separat BLOCKED. Nach Ablauf einer Löschmarkertabelle ohne echte Provider-Backup- und Restore-Grenzen kann alter personenbezogener Inhalt weiterhin zurückkehren. Diese 7 Tests beweisen nur den race-sicheren eigenen Favoriten-Writer, nicht acht Owner oder einen echten Restore.

**Kein Merge, keine SQL-Migration in Neon, kein Cloudflare-/Google-Zugriff, keine Änderungen an Echtdaten, Rollen, Release-Contracts oder freigeschalteter Produktion.** Bestehende `privacy=blocked` / `applicationLifecycle=blocked` und aktuelle E2E/Handy-PASS bleiben unverändert. Dieser Code kann erst nach einer ausdrücklichen Betreiber-Security-Freigabe und separater fachlicher Löschrichtlinienentscheidung aktiviert werden.
