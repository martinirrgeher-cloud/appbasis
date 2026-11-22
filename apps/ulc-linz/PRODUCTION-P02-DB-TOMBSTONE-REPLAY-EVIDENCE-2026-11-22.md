# P02 – SQL-Restore-Replay nach Subjektlöschung

**22.11.2026, nur isolierter Neon-Testbranch. Keine Produktionsmigration, kein R2-Backup-Restore.**

Auf dem aus Produktion geklonten Testbranch `ulc-p02-erasure-isolated-rehearsal-20261122` wurden ausschließlich synthetische Club-, Trainingsblock-, Subjekt- und Nutzungsdaten angelegt. Eine eigens erstellte `ulc_linz_erasure`-Rolle (NOLOGIN, NOINHERIT; keine Super-/Adminrolle) erhielt exakt SELECT/DELETE für Usage, SELECT für Subjektzuordnungen sowie SELECT/INSERT/UPDATE für die 35-Tage-Löschmarker. Nach dem unter `SET LOCAL ROLE` ausgeführten Löschpfad waren **0 Usage, 0 Attribution und 1 Tombstone** vorhanden.

Die normale `ulc_linz_application`-Rolle konnte **trotz Tombstone** in einem direkten SQL-INSERT-Transaktionspaar Usage und Subjektattribution neu anlegen (**1/1/1**): der verifizierte Anwendungswriter war bereits geschützt, jedoch fehlte an der Tabelle ein Datenbank-Trigger.

Auf dem isolierten Branch wurde deshalb ein `SECURITY INVOKER`-`BEFORE INSERT OR UPDATE`-Trigger getestet. Er verwendet denselben `pg_advisory_xact_lock(hashtextextended(jsonb_build_array('training-block-usage-subject', org, subject)::text,0))` wie das Standardmodul. Bei bestehendem Marker verweigert er die direkte Subjektwiederanlage mit `SQLSTATE 23514`; die komplette INSERT-Transaktion rollt zurück. Ergebnis nach Replay-Test: **0 Usage, 0 Attribution, 1 Tombstone, Trigger aktiv**.

Die geplante reine Ergänzungsmigration ist `modules/training-blocks/migrations/0006_appbasis_training_block_usage_subject_tombstone_guard.sql` (Schema-Version 7). Sie verändert keine vorhandenen Daten oder Marker. Das Repository erhält echte PostgreSQL-Negativtests und reguläre Migrationsmanifest-Einträge.

**Wichtige Grenzen:** Ein nackter INSERT in die Legacy-Usage-Tabelle **ohne** Subjektzuordnung wird durch diesen Trigger nicht verhindert; der produktive HTTP-Writer bleibt auf den verifizierten Pfad beschränkt. Das Advisory-Lock-Verfahren wird für unterstützte READ-COMMITTED-Schreibpfade geprüft; privilegierte fremde Writer, abweichende Transaktionsisolation und alte Offlinestände benötigen zusätzlich eine Restore-Freigabe. Ein Neon-Branch-Klon ist kein verschlüsselter R2-Restore und kein Acht-Owner-Löschbeleg.

**Bis zum abgesicherten Migrationseinspielen bleibt P02 blockiert.** Die Rolle auf dem Testbranch ist NOLOGIN und besitzt kein Betreiberpasswort; eine operative Neon-Erasure-Rolle ist noch nicht provisioniert. Auf echten Preview-/Produktionsbranches erfolgte **keine** Rechteänderung oder Löschung.
