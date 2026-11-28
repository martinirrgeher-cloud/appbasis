# T10 – Training Blocks: Lifecycle-Nachweis für den begrenzten ULC-Pilot

**Umfang:** Standard-Blockdefinitionen, Revisionen, Favoriten und identitätsgebundene/geschützte Trainingsplan-Usage. Keine automatische ungeprüfte Textklassifikation, kein alter Restore-Promotion oder blinde Löschung aller Revisionen. Kein globaler Datenschutz-GO.

## Tatsächlich geprüfte Beweiskette
- `src/lifecycle.ts`, `src/postgres-repository.ts`: geschützter Personenfavoriten-Löschmarker, atomare Favoritenbereinigung und durch Postgres abgesicherte identitätsgebundene Blocknutzung.
- `migrations/0004_appbasis_training_block_favorite_deletion.sql`, `0005_appbasis_training_block_usage_subject.sql`, `0006_appbasis_training_block_usage_subject_tombstone_guard.sql`: versionierte Owner-Lösch-/Re-Insert-Sperren.
- `test/lifecycle.test.ts`: atomare Favoriten-Nachlöschung, fremde Mandanten und nachfolgende Schreibsperre; erlaubte normale Blockrevisionen bleiben verfügbar.
- `test/favorite-restore-reconciliation.test.ts`: idempotente Offline-Reconciliation, abgelaufene/unvollständige Löschquelle -> FAIL ohne Write.
- `test/subject-usage-restore-reconciliation.test.ts` und `test/postgres-repository.postgres.e2e.ts`: Re-Insert-Schutz, Restore-Replay, fehlende Autorität, Parallelität, Isolation; reale isolierte PostgreSQL-E2E.
- `apps/ulc-linz/test/p02-verified-block-usage-reconciliation.postgres.e2e.test.ts`: keine doppelte Usage-Buchung bei Autosave/Retry, keine Wiederbelebung nach Löschmarker.
- `apps/ulc-linz/worker/production-protected.ts`, `apps/ulc-linz/test/production-protected.test.ts`: M6-Pilot erzwingt `protected-production-verified-subject`; die getrennte Runtime prüft zuerst Rollen-/Schema-/Marker-Privilegien.
- PRODUKTIONS-Postgres **nur lesend am 28.11.2026**: 69 Tabellen; `ulc_linz_application` darf Subject-Usage einfügen und Marker lesen, aber **keine** Löschmarker schreiben und keine Attribution überschreiben.

## Verbindliche Betriebsgrenzen
Freigabe gilt für die geschützten aktuellen Pfade, **nicht** für eine Promotion historischer Restores. Nicht eindeutig einer gelöschten Person zuordenbare Nutzungsnotizen und historische Kommentare erfordern den bestehenden privaten T07-Redaktionsentscheid oder **STOP**. Kein direktes SQL-DELETE des gewöhnlichen Writers, keine neue Aufbewahrungsautomatik. Vor Start exact-role Preflight; Fehler hält den Start an.
