# P02 – Eigene SQL-Löschrolle für Trainingsblock-Nutzung

**22.11.2026 · Operator-Cutover-Vorbereitung, keine Echtmigration / keine Betreiberfreigabe.**

## Datenbank-Iststand (nur Katalogabfrage, keine personenbezogenen Zeilen)

Neon-Produktion `appbasis-ulc-linz-production`, Branch `production`, DB `neondb`:
- `neondb_owner`: hat breite Owner-Rechte an den drei Tabellen für Nutzungsbuchungen, deren personenbezogene Zuordnung und Löschmarker.
- `ulc_linz_application`: auf `appbasis_training_block_usage` aktuell `SELECT/INSERT/UPDATE/DELETE`; auf der Subjektzuordnung nur `SELECT/INSERT`; auf dem Löschmarker nur `SELECT`. **UPDATE/DELETE der Legacy-Usage bleiben ein bestätigter überschüssiger App-Grant.**
- Ein eigener SQL-Login `ulc_linz_erasure` ist gegenwärtig **nicht vorhanden**. Kein neuer Neon-Login oder Password wurde angelegt.
- Aggregierter Produktionsbestand bei der letzten Prüfung: 0 Usage-Ereignisse/0 Subjektzuordnungen/0 Löschmarker/0 Dokumentationen/Revisionen. Das ist nur ein Zeitpunktbefund.

## Was dieser PR #708 liefert

1. `assertUlcDedicatedBlockErasureRoleReady` ist ein **rein lesender**, unabhängig von HTTP/Worker-Startup aufrufbarer Operator-Check. Exakte DB-/Loginrolle, `LOGIN NOINHERIT`, kein SUPERUSER/CREATEROLE/CREATEDB/BYPASSRLS, kein Mitglied von Owner-/App-Rolle, nur nötige DML und keinerlei andere Schreibrechte auf öffentlichen Anwendungstabellen. Auch spaltenweise Grants werden kontrolliert; insbesondere darf der Erasure-Login keine nur auf Einzelspalten eingeschränkten `INSERT`-Rechte für Nutzungsbuchungen oder deren Subjektzuordnung besitzen.
2. Unit-Negativfälle für Rollenwechsel, Zusatzprivilegien, fehlende Berechtigungen, falsche Datenbank und fehlende Metadaten.
3. Echte PostgreSQL-18-E2E erzeugt **nur in einer ausdrücklich localhost-geprüften Wegwerfdatenbank** eine unabhängige SQL-Rolle mit eigenem Passwort, verbindet über eine eigene Verbindung, prüft alle Grants, weist die App-Rolle beim direkten DELETE ab und führt `markSubjectDeletedAndRemoveAttributedUsage` über die neue Rolle aus. Marker und Nutzungslöschung sind derselbe Datenbank-Commit; ein Zusatz-Grant an einer Spalte oder beliebiger fremden Anwendungstabelle führt zum FAIL.
4. Die Tests ersetzen an einem bisher vom allgemeinen `postgres`-Owner durchgeführten Probe-DELETE den tatsächlichen minimalen Erasure-Principal. Kein Echt-Datensatz wird berührt.

**Nicht umgesetzt:** echte Neon-Rolle/Credentials, produktiver Lösch-Operator, Rechtsgrundlage, zentraler Lösch-Audit, sichere Vollrestore-Promotion und abschließende acht Owner. Dieser PR **aktiviert** keinen Lösch-Endpunkt und verändert `appbasis.production.json` nicht.

## Vorschlag für einen gesondert freizugebenden Cutover

Diese Schritte erfordern eine gesonderte Betreiber-/DB-Berechtigungsfreigabe und geeignete Backups. **Nicht automatisch ausführen.**

1. Zuerst Backup-/Restore-Pfad und Auskunfts-/Löschzwecke freigeben. Betreiber bestimmt verantwortlichen Lösch-Operator mit eigenem Secret-Store und revisionssicherem Audit. Keine SQL-Anmeldedaten im Repository/GitHub-Log.
2. In der **jeweiligen** Neon-Datenbank separate `LOGIN NOINHERIT`-Rolle `ulc_linz_erasure` (Preview entsprechend `appbasis_ulc_linz_preview_erasure`) mit einzigartigem sicherem Passwort **ohne Owner-/App-Rollenmitgliedschaft** erstellen. Der Operator-Login bleibt außerhalb der normalen HTTP-Worker-Konfiguration; nur auf dem gesicherten Kontrollpfad verwenden.
3. `GRANT CONNECT ON DATABASE neondb`, `GRANT USAGE ON SCHEMA public`. Genau:
   - Usage: `GRANT SELECT, DELETE`
   - Subject attribution: `GRANT SELECT`
   - Subject deletion marker: `GRANT SELECT, INSERT, UPDATE` (FOR UPDATE für Restore-Marker)
   - Kein DELETE auf Marker, keine UPDATE-/INSERT-Rechte auf Usage und keine DML auf anderen App-Tabellen.
4. Die read-only Preflight-Prüfung aus diesem PR **unter der tatsächlichen Erasure-Rolle** durchführen. Bei jeglichem FAIL nicht fortfahren.
5. In isoliertem Restore/Preview unter freigegebenem kontrolliertem Lösch-Operator einen synthetischen, genau einem Subjekt zugeordneten Nutzungseintrag erfassen, mit `markSubjectDeletedAndRemoveAttributedUsage` entfernen, den 35-Tage-Marker prüfen, Wiederanlage und Restore-Replay verweigern, sowie Cross-Owner-Inspektion bestätigen. App-Rolle darf Marker weder verändern noch direkte Löschung ausführen.
6. Erst **nach** erfolgreichem privilegierten Lifecycle-Test, aktuellen Backup-Belegen und gesonderter Freigabe das überschüssige `UPDATE, DELETE` auf `appbasis_training_block_usage` von `ulc_linz_application` kontrolliert widerrufen; danach `assertUlcLegacyBlockUsageRoleCutoverReady` unter der echten normalen App-Verbindung ausführen. Für Preview gelten andere Datenbank und Rollen. SQL-Besitz-/PUBLIC-/Spaltengrants separat beachten.
7. Produktive neue App- und Löschschreibvorgänge erst nach privatem E2E und Smoke zulassen; keine unkontrollierte Restore-Promotion.

**Grenze:** Für ~30 Vereinsnutzer möglichst **eine** konsolidierte Freigabe von Rollentrennung, Zugriffsnachweis und isoliertem Wiederherstellungstest, nicht wiederkehrende manuelle Einzel-Approvals. Eine einzelne technische CI-Prüfung ersetzt aber keine fehlende Daten-/Provider-/Rechtsfreigabe.
