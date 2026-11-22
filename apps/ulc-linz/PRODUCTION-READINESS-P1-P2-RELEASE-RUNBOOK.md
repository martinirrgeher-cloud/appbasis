> **P2-CUTOVER STATUS 20.11.2026: PASS.** Der nachfolgende Text ist die ursprüngliche Vorabplanung und darf nicht mehr als aktueller Production-Zustand gelesen werden. **Production hat jetzt 69 Tabellen**, P2 51→69 wurde mit 91 SQL-Anweisungen in einer Transaktion abgeschlossen; 141/141 Alt-Datensätze und alle App-Rechte geprüft. Vollständige Umsetzung und Recovery-Nachweise: [P2 CUTOVER PASS](./PRODUCTION-READINESS-P2-CUTOVER-PASS-20261120.md). Kein Worker-Deployment, P3 benötigt gesonderte Freigabe.

# ULC Linz P2 – Production-Migration: ausführungsreifer Plan, KEINE Freigabe

**20.11.2026 | Vorbereitung im P1-PR #669 | Production-SQL: 0 Änderungen | Worker: kein Deployment.**

## Tatsächlicher Iststand

| Merkmal | Production | Preview |
|---|---:|---:|
| Projekt | `bold-dew-01343606` | `cool-unit-46141580` |
| Neon Default-Branch | `br-muddy-heart-b1vtydvc` | `br-delicate-surf-b1eu6ikn` |
| Datenbank | `neondb` | `appbasis_ulc_linz_preview` |
| Tabellen | 51 | 69 |
| Spalten | 378 | 501 |
| Indizes | 111 | 145 |

Production enthält gegenwärtig unter anderem **eine Mitgliedschaft**; die vollständige Production-Bestandskopie hatte **141 Zeilen in 15 Tabellen**. Am 20.11. wurden alle 141 Zeilen in den 51 Ausgangstabellen per ausschließlich in PostgreSQL berechneten kanonischen Fingerprints mit der isolierten 69er-Migrationskopie verglichen: **51/51 identische Tabelleninhalte**. Keine Zeileninhalte werden als Auditmaterial exportiert.

Bestehende separate Neon-Production-Prüfbranches:
- `br-calm-breeze-b18nlqw0`: 51→69-Migrations-/App-Rollenrechteprobe;
- `br-silent-sun-b1px7hsy`: Snapshot-Wiederherstellungsprobe.

Vorhandener Snapshot `snap-odd-hat-b1yz457q` läuft **21.11.2026 um 23:00 UTC** ab. **Er ist kein hinreichender aktueller Recovery-Punkt für einen späteren Produktionscutover.** Vor neuen Produktionswrites einen frischen aktuellen Snapshot anlegen und dessen Restore separat prüfen. Ressourcenkosten und Neon-Limits vorab kontrollieren; keine historischen Kopien ohne Freigabe löschen.

## EIN freigegebenes P2-Arbeitspaket (noch ausständig)

1. **Freeze/Backup/Restore:** Exakte Production-Branch, Schema- und SQL-Rollen verifizieren. Frischen zeitlich ausreichenden Production-Snapshot erstellen, in eine isolierte Branch **ohne `finalize`** wiederherstellen, echten Datenbestand und Berechtigungen serverseitig über alle 51 alten Tabellen vergleichen. Ohne funktionierenden Restore: **STOP**.
2. **Finale Migrationsprobe:** In isolierter, frischer Production-Kopie die **17 belegten fehlenden Original-Owner-Dateien** aus `tooling/ulc-linz-p02-g-synthetic-upgrade.postgres.test.mjs` in kanonischer Reihenfolge ausführen (**51→64**), Kalender **0016** (**→66**), Katalog **0004** (**→68**) und App-eigene Fence-Migration **0017** (**→69**). Diese Dateien stehen nach P1 im endgültigen 44-Migrationen-Repositorymanifest; keine Doppel-Ausführung auf gefüllten Datenbanken. Rollback bei jedem DDL-Fehler; Datenintegrität nach jedem Teilschritt. Abweichung vom belegten Production-51-Inventar: **STOP**.
3. **Least-Privilege-Probe:** Genau das getestete, explizite 17-Tabellen-App-Rollen-SQL aus `apps/ulc-linz/test/fixtures/p02-h-application-privileges.candidate.sql` nur für `ulc_linz_application` unter Produktionsschema-Identitätsprüfung. Trainings-Löschmarker erhält **keine** gewöhnlichen App-Rechte. Keine `GRANT ALL`, `PUBLIC`, `TRUNCATE`, keine stillen `REVOKE` bestehender Module. SQL-Positiv-/Negativabfragen als echte App-Rolle.
4. **Freigabe und echter Production-Cutover:** Erst nach erfolgreicher frischer Backup-/Restore-Kopie, schema-/datenkonformem 51→69-Vergleich und ausdrücklicher Betreiberfreigabe denselben expand-only DDL-/Rollenplan **transaktional auf `br-muddy-heart-b1vtydvc`** anwenden. Vorher/nachher 51 alte Tabellen plus neue DDL, Zeilenanzahlen und Fingerprints vergleichen; keine personenbezogenen Werte loggen. **Kein automatisches Deploy.**
5. **Privater Produktions-Worker:** Eigenständige Freigabe für bereits vorhandenen `m6-ulc-private-production-deploy.yml` nur auf dem geprüften `main`-SHA; öffentliches Ingress bleibt bis Pilotabnahme deaktiviert. Anmeldung, Gruppenrechte, Anwesenheit U12/U14/Kindertraining, IRG Selbstanmeldung, Katalog, Blöcke, Pläne, Dokumentation und schnelles Speichern durch Betreiber/Handy prüfen. Rückfall: Worker-Version auf letzte bekannte gute Version, DB per geprüftem Restore – nur mit Datenschutz-Reconcile gegen bereits gelöschte Subjekte.

## Nicht als technisch erfüllt werten

- Das reguläre AppBasis-`applyRepositoryMigrationPlan` installiert nur in ein **leeres** Schema. Production enthält 51 Tabellen; **kein** leere-DB-Installer, kein Blind-Apply der 44 Dateien.
- Einen angeblichen erfolgreichen Snapshot-**No-Resurrection**-Replay für Freitext, Trainer, Actor-Identität, R2-Medien und Cross-Owner-Daten gibt es noch **nicht**. Ein gewöhnlicher SQL-Backup-/Restore-PASS ersetzt diese Prüfung nicht.
- Die kanonischen Datenschutzinventare klassifizieren neu 69 Tabellen, enthalten aber weiterhin `pending`-/`fail-closed`-Rechte-, Lösch- und Restore-Autorisierungen. Automatische destruktive Lösch-/Purge-Routinen **nicht** freischalten; reale personenbezogene Daten nur nach klarer Betreiber- und Controller-Entscheidung.

**Abnahmeregel:** P2 gilt erst als PASS, wenn ein aktueller Backup-/Restore-Pfad, Production-Upgrade auf 69 Tabellen und alle ursprünglichen Zeilen+Rollen-Checks nachweislich bestanden sind. P3/Go-live bleibt ein separater Release-Schritt.
