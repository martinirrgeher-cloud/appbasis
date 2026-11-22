# P06 – ULC Linz: v19-Neuinstallation und Quarantäne-Restore

**Gültigkeitsbereich:** Technische Verfahrensanweisung; keine Berechtigung zum Restore, zur Löschung, zur Produktions- oder Datenschutzfreigabe. Grundlage: aktuelle v19-Migrationskette von `apps/ulc-linz/appbasis.database.json`, bis zur Bestätigung durch CI/Review nur **vorgeschlagene** Version. Source of Truth: [ULC #607](https://github.com/martinirrgeher-cloud/appbasis/issues/607).

## 1. Drei Zustände strikt auseinanderhalten

| Zustand | Datenbankfunktion | Konsequenz |
| --- | --- | --- |
| Historische v18-Installation nach ursprünglicher `0017` | Alter Funktionskörper ohne Prüfung von `transaction_isolation` | **NEVER CONNECT** mit normalen schreibenden Anwendern, solange eine neuere Löschentscheidung möglich ist |
| Neue deklarative v19-Installation nach `0018` | Exakte Vorwärts-Reconciliation, unveränderte 3 Trigger/ACL, nur `READ COMMITTED` | Dieser **einzelne** Write-Fence-Baustein kann nach Test und Funktionsvergleich PASS sein; keine automatische 8-Owner-/Privacy-Freigabe |
| Produktiver Neon-Branch `production` | **22.11.2026 live hotfixed**, exakter Body im `ulc_linz_application`-Konto gelesen, [Beleg #607](https://github.com/martinirrgeher-cloud/appbasis/issues/607) | Nicht neu migrieren oder rekonfigurieren, solange kein eigener Auftrag vorliegt; Live-PASS beweist nicht historischen Restore |

## 2. Einzig gültige technische Restore-Kette

1. Konkrete Backup-ID und Quell-Branch, Ziellocation, DB, PostgreSQL-Version, Key und neuesten **nach Backup ergangenen** Löschentscheid und Backup-Horizont identifizieren. Wenn unbekannt **STOP**.
2. Restore ausschließlich in ausdrücklich genehmigter, **writer-isolierter, nicht mit dem privaten Worker verbundener** Quarantäne. Keine bestehende Neon-Default-Datenbank überschreiben, keine automatischen Adress-/Ingress-/Secret-Wechsel.
3. `pg_catalog.pg_tables` muss 69 kanonische Tabellen und acht deklarierte Owner abdecken; historisches Restore darf ggf. fehlen, muss dann zuerst als **Migration erforderlich** statt `ready` gelten.
4. Nach tatsächlicher DDL-Installation **unter der richtigen App-Rolle** verifizieren, dass `public.ulc_linz_training_subject_write_fence()` `pg_proc.prosrc` genau dem `AS $fence$...$fence$`-Funktionskörper aus **`apps/ulc-linz/migrations/0018_ulc_linz_training_subject_isolation_reconciliation.sql`** bzw. dem geprüften `p05`-Kandidaten entspricht, inklusive `READ COMMITTED`-Isolationscheck. **Keinen bloßen Funktionsnamens-/Triggerexistenz-Check akzeptieren.**
5. Weiterhin Owner, `SECURITY DEFINER`, festes `search_path=pg_catalog, pg_temp`, unveränderte Funktions-ACL, **3/3 aktive** Trigger mit richtigen Tabellen und keine Rechteausweitung prüfen. Die **Funktions-OID darf auf einer Neuinstallation anders als die produktive `115099` sein**; sie muss über die Reconciliation innerhalb **derselben** DB stabil bleiben.
6. Die 35-Tage-Löschquellmarker dürfen nicht verlängert werden; `postExpiryRetry=deny`. Daten/Accounts/Logs/Notizen/Revisionen/Katalog-/Block-Usage und Medien auch auf versteckte Teilnehmer- oder Fremdpersonenbezüge prüfen. Neuere autoritative Löschungen müssen **alle acht** Owner abdecken, inklusive Quarantäne-Replay und dokumentierter Restzählung. Der vorhandene `p3-cross-owner-restore-admission.ts` sperrt unvollständige oder alte Belege.
7. Erst nach **vollständiger** 8-Owner-/Provider-/Legal-/Betreiberprüfung ist eine **gesonderte** Produktiv-Promotion überhaupt diskutierbar. Keine selbsttätige Umschaltung, kein Löschen oder Deployment aus dieser Datei heraus.

## 3. Regression und Abbruch

`apps/ulc-linz/test/p06-fresh-restore-fence-v19.postgres.e2e.test.ts` lädt ausschließlich lokale, temporäre PG18-Datenbank, reproduziert zuerst den 45-Migrationsstand, appliziert anschließend die **registrierte 46. Migration** und vergleicht danach den Funktionskörper mit dem separat geprüften P05-Kandidaten. Stale `REPEATABLE READ`- und `SERIALIZABLE`-Writes über Attendance, Registration und History müssen scheitern; normales `READ COMMITTED` muss für unmarkierte Nachbar-/Fremdorg-Subjects funktionieren, markierte Subjects bleiben gesperrt. Das ist **synthetische Testevidenz**, kein echter R2-Backup- oder Live-Restore-Test.

**STOP** bei fehlendem aktuellen Backup-/DPA-/Providerbeleg, einem offenen Trainer-/Freitext-/Medienrest, fehlender Neuer-Löschquelle, nicht gematchtem Funktionskörper, Rechten/Triggerdrift oder unbekannter Quell-/Ziel-Verbindung. Nur Status melden und konkretes Eigentümer-/Operator-GO einholen, keine automatische Reparatur in Produktion.

Die technisch bestätigte offizielle Vereinsnutzung der persönlichen Cloudflare-/Neon-Konten und fachlich beschlossenen Fristen werden **nicht nochmals abgefragt**; die kontospezifische rechts-/vertragliche Dokumentation bleibt davon getrennt.
