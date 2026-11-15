# K2-E01 – Quarantäne-Restore: Abnahme-Nachweis (Entwurf)

**Stand 15.11.2026. Nur Offline-Prüfung, keine Produktivfreigabe.**

## Ergebnis und Grenze

K2-Preview-Backup und tatsächlicher Quarantäne-Restore sind nachgewiesen (GitHub Actions [Backup #43645974462](https://github.com/martinirrgeher-cloud/appbasis/actions/runs/43645974462), [Restore #43647364218](https://github.com/martinirrgeher-cloud/appbasis/actions/runs/43647364218)). Der unabhängige read-only Vergleich ergab 62/62 Tabellen, 1.305/1.305 Zeilen, 62/62 Datenfingerprints, 472 Spalten, 136 Indizes, 698 Constraints und vier Sequenzen. Dies ist **nur ein Datenbankbeleg**.

Der neue `evaluateK2RestoreEvidence` akzeptiert ausschließlich bereits erhobene, **anonymisierte Offline-Evidenz**: Tabellenname, Zeilenzahl und SHA-256-Fingerprint, Schemadigests und ausdrücklich bestätigte Boolesche Kontrollgates. Keine DB-URLs, Credentials, Personendaten, R2-Keys oder Netzwerkanbindung. Er erzeugt höchstens `READY_FOR_HUMAN_REVIEW`, **niemals** ein automatisches Deployment-/Restore-/Löschsignal. Alle fehlenden, unbekannten oder negativen Kontrollen führen zu `BLOCK`. Die in der Testfixture verwendeten Hashes sind synthetisch, keine echten Belege.

## Kontrollmatrix für den Betreiber

| Gate | Status | Benötigter Nachweis |
| --- | --- | --- |
| K2 DB-Backup / isolierter Restore | PASS | Die beiden oben verlinkten Runs |
| Tabellendaten / Grundschema | PASS | 62/62 Fingerprints und Schema-Read-only-Vergleich; Datenstand des Snapshots |
| Identität / Login | OFFEN | Login, Session, Logout, Wiederanmeldung nur auf isoliertem Test-Worker |
| Berechtigungen / RLS | OFFEN | Negativtests für fremde Organisationen, Rollen und eingeschränkte Benutzer |
| Athleten / Trainingsblöcke / Planung / Doku | OFFEN | Lesetest und Schreib-/Rollback-Proben auf Quarantäne **nur mit separater Freigabe** |
| Anwesenheit / Anmeldung / Statistik | OFFEN | Modul-Regressionen mit anonymisierten Testkonten |
| Übungskatalog / Medien | OFFEN | Unabhängiger R2-Medienbackup- und tatsächlicher isolierter Medien-Restore; PR #634 ist nur Offline-Inventur |
| Löschsperren / Retention / Re-Deletion | OFFEN | Rechtlich geprüfte Aufbewahrungsfrist, Löschautorität und Wiederanlauf-Reconciliation; PR #633 ist nur Dry-run |
| Quarantäne-Trennung | TEILWEISE | Separater Neon-Endpunkt bestätigt; unabhängiger Nachweis, dass kein Worker/Hyperdrive/öffentlicher Route darauf zeigt |
| Produktionsfreigabe | BLOCKIERT | Alle Gates erfüllt, ausdrückliche Betreiberfreigabe, gesonderter Rolloutplan |

## Nutzung ohne echte Daten

`node --test tooling/ulc-linz-k2-restore-evidence.test.mjs`

`evaluateK2RestoreEvidence({source,restored,controls})` ist bewusst kein CLI für Providerzugriff. Ein künftiger evidenzliefernder Collector muss vor der Freigabe gesondert reviewed werden, ausschließlich read-only arbeiten, tatsächliche Herkunft/Signatur und Snapshot-Zeitpunkt prüfen und **keine sensitiven Rohdaten ausgeben**. Ein grüner synthetischer Test ersetzt keinen echten Medien-, Rollen- oder App-E2E-Test.

## Morgenfreigabe

Nur Draft-PR mit Offline-Logik und Testmatrix prüfen/mergen; **keine** automatische Produktivschaltung. Offene Betreiberentscheidungen: 21-Tage-Retention und Legal Holds, unabhängiges Medienbackup, Testidentitäten/Rollen, explizite Freigabe für isolierte App-Tests und spätere Backuproutine. Keine Änderung von Neon, R2, Secrets, GitHub Environments oder Workers.
