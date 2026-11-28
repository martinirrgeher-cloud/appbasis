# T10 – Exercise Catalog: Lifecycle-Nachweis für den begrenzten ULC-Pilot

**Umfang:** Standard-Katalog, Stammübungen/Parameter/Kategorien, mandantengetrennte Favoriten und **nachweislich einer Identität zugeordnete** Usage. **Nicht freigegeben:** private Medien, unverifizierte Legacy-Nutzung, freies automatisches Purge, Offline-Restore-Promotion. Dieses Modulblatt gibt weder T10-GO noch eine Cloudflare-/Neon-Datenschutzentscheidung.

## Tatsächlich geprüfte Beweiskette
- `src/postgres-repository.ts`: `require-catalog-erasure-marker` schützt Favoriten; `require-explicit-subject` verweigert nicht zugeordnete Usage; `markPrincipalDeletedAndDeletePersonalCatalogData` verlangt beide Modi und den genehmigten Owner.
- `migrations/0004_appbasis_exercise_catalog_subject_lifecycle.sql` und `0005_appbasis_exercise_catalog_subject_deletion_write_fence.sql`: 35-Tage-Löschmarker und Datenbankfences für Favoriten/Usage, keine autonome Retention- oder Provider-Löschung.
- `apps/ulc-linz/test/p07-catalog-erasure-fence.postgres.e2e.test.ts`: direkter Legacy-Re-Insert/UPDATE, Rennen und Mandanten-Isolation im isolierten PostgreSQL 18.
- `apps/ulc-linz/test/t07-catalog-owner-follow-up.test.ts`: kanonische gelöschte Identität, Quellmarker, Triggerprüfung, Wiederholung und Abbruch bei unklarer Herkunft.
- `apps/ulc-linz/test/p02-catalog-retention-negative.postgres.e2e.test.ts`: dokumentiert ausdrücklich die Risiken des **nicht geschützten** Alt-Writers und des externen Medienproviders; diese Pfade sind **nicht** Teil des freigegebenen Pilotumfangs.
- `apps/ulc-linz/worker/production-protected.ts` und `apps/ulc-linz/test/production-protected.test.ts`: tatsächlich genutzter M6-Pilot-Einstieg erzwingt `standard-module-protected-production` und `exerciseCatalogMediaStore=null`; der separate Standard-/Legacy-Einstieg wird nicht verändert.
- PostgreSQL PRODUKTION, **nur lesend am 28.11.2026**: 69 Tabellen; `ulc_linz_application` hat Item/Favoriten-Schreibrecht und Marker-SELECT, **kein Marker-Write**; beide Katalog-Schutztrigger sind aktiv. Diese Lesung ist keine Produktivdaten-Löschung.

## Verbindliche Betriebsgrenzen
Erstanlage vorhandener gewöhnlicher Katalogdaten unter dem geschützten Writer ist zulässig **erst nach T10-GO + T11-geschütztem Deploy**. Einzelfall-Löschungen erfolgen ausschließlich über die im T07-Pilot beschlossene private Nachbearbeitung. Mehrdeutige historische Usage-/Freitextzuordnung = **STOP und Einzelprüfung**; Media-R2-Objekte nicht schreiben/lesen oder freigeben. Der private Produktionsstart muss den exact-role Preflight bestehen; jeder Fehler = kein Start. Nie alten Restore auf den aktiven Writer promoten. Kein autonomes Löschen personenbezogener Bestände.
