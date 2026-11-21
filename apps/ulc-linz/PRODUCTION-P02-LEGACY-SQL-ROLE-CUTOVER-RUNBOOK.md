# ULC Linz P02 – Trennung der Trainingsblock-Nutzungsrechte

**Status 21.11.2026: Vorbereitung im PR, kein GRANT/REVOKE in Produktion/Preview, keine Datenänderung.**

## Ausgangslage und Sicherheitsziel

In Neon `appbasis-ulc-linz-production / production / neondb` und Preview hat die gewöhnliche App-SQL-Rolle `SELECT, INSERT, UPDATE, DELETE` auf `public.appbasis_training_block_usage`. Produktionsbestand laut ausschließlich aggregierter Kontrolle: **0** Ereignisse, **0** unzugeordnete Ereignisse, **0** Marker und **0** Dokumentationsrevisionen. Diese Momentaufnahme beweist weder zukünftige Löschung noch externe Backup-Fristen.

**Zielzustand der gewöhnlichen Rolle:**

- `appbasis_training_block_usage`: `SELECT, INSERT` erlaubt; `UPDATE, DELETE, TRUNCATE` untersagt.
- `appbasis_training_block_usage_subject`: `SELECT, INSERT` erlaubt; `UPDATE, DELETE, TRUNCATE` untersagt.
- `appbasis_training_block_usage_subject_deletion`: nur `SELECT`, niemals `INSERT, UPDATE, DELETE, TRUNCATE`.
- Der **getrennte** privilegierte Erasure-/Restore-Owner behält kontrollierte Lösch- und Markerrechte. Er darf nicht auf der normalen HTTP-App-Verbindung als SQL-Rolle laufen.

## Umgesetzt und automatisch getestet

`worker/training-block-legacy-rights-cutover.ts` enthält einen **getrennten** strikten Post-Cutover-Check. Er läuft ausschließlich auf der regulären App-SQL-Verbindung, prüft `current_user` und `current_database` exakt sowie effektive Rechte aus PostgreSQL (inkl. geerbter Rechte/PUBLIC). Er liest weder Namen/Notizen noch Datensätze, führt kein `GRANT` oder `REVOKE` aus und sperrt fail-closed bei falscher Rolle/fehlenden Objekten/zu weit reichenden Rechten.

Synthetische Negativtests und die schon bestehende, lokal isolierte **69-Tabellen-PostgreSQL-18**-P4-E2E zeigen: Die gewöhnliche Rolle darf Nutzungen und Subjektzuordnungen anlegen; direkte `UPDATE`- und `DELETE`-Versuche scheitern. Ein eigener privilegierter Datenbank-Owner kann anschließend die synthetische Nutzung löschen, und die Subjektzuordnung verschwindet durch den echten FK-Cascade. Ein absichtlich gewährtes `UPDATE` oder `DELETE` lässt den strikten Check scheitern, nach Rollback der Test-Grants ist er wieder grün.

## Geplanter, noch nicht ausgeführter Betreiber-Cutover

1. **Zuerst** bestehende Privatproduktion und Preview-Backup-/Restore-Freigaben bestätigen und den separaten Erasure-/Restore-Owner mit isolierten Credentials und zentralem Audit nachweisen. Insbesondere `markSubjectDeletedAndRemoveAttributedUsage` und `reconcileSubjectUsageDeletionMarker` brauchen weiterhin das privilegierte `DELETE`; dieser Pfad darf nach dem Cutover nicht über `ulc_linz_application` laufen. Die aktuelle App-Rolle darf die Löschmarker nicht schreiben.
2. Sicherstellen, dass sämtliche bestehenden und künftigen normalen HTTP-Writer ausschließlich den verifizierten Plan→Block-Writer nutzen. Die Legacy-Methoden `recordUsage` und `recordUsageIfAbsent` dürfen keine unzugeordneten neuen Ereignisse erzeugen. Eine reine Rollenreduktion unterbindet **keine** solche `INSERT`-Fehlverwendung.
3. Prüfen, dass beim tatsächlichen Cutover weiterhin keine unzugeordneten Legacy-Zeilen existieren, und einen erfolgreichen isolierten Restore vorweisen. Ohne diese Nachweise keine Aktivierung.
4. Erst nach **gesonderter** Betreiberfreigabe kann ein privilegierter Datenbank-Owner gezielt `REVOKE UPDATE, DELETE ON public.appbasis_training_block_usage FROM ulc_linz_application` (entsprechend für Preview-Rolle in **anderer** Datenbank) innerhalb einer kontrollierten Transaktion ausführen. Keine pauschalen Schema-/Tabellenrechte verändern. Bei Privilegien durch geerbte Rollen/PUBLIC reicht das REVOKE am direkten Grantee nicht; der strikte Check verweigert dann die Freigabe.
5. Neuen strikten Post-Cutover-Check mit der **echten** App-Verbindung sowie normale Buchung, idempotenten Retry, Fehlerpfad, privilegierte Löschung, Restore und P02-/P03-E2E erneut prüfen. Anschließend erst die Aufnahme des Gates in den geschützten Runtime-Start separat freigeben.

**Rollback:** Bei Fehler innerhalb der überprüften Rechte-Transaktion `ROLLBACK` statt Commit. Nach einer produktiv erfolgten Änderung nur nach dokumentierter Incident-/Restore-Entscheidung reagieren; die alten gefährlichen Rechte nicht automatisch wiederherstellen.

**Abgrenzung:** Dieser PR führt absichtlich keinen solchen Cutover aus, erzeugt keinen neuen normalen Lösch-Endpunkt und setzt weder `appbasis.production.json` noch P01-Datenschutz-/Provider-Nachweise auf `ready`. Kein Composition-Gate-Retry.
