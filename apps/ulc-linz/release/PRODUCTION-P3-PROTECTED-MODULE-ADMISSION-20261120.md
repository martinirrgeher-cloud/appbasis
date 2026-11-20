# P3-B — Produktions-Rollenprüfung für Katalog/Trainingsblöcke (inaktiv)

Stand 20.11.2026. **Kein Produktiv-Deploy, kein Datenschutzentscheid und keine automatische Aktivierung.**

## Warum diese Änderung nötig ist

Im geprüften `main` waren die neuen, gegen personenbezogene Wiederanlage geschützten Datenbankpfade ausschließlich für `appbasis_ulc_linz_preview` / `appbasis_ulc_linz_preview_application` freischaltbar. Der Produktionsstand `neondb` / `ulc_linz_application` konnte diese Prüfungen technisch nie bestehen, obwohl die Production-Datenbank inzwischen 69 Tabellen besitzt. Ohne separate Produktionserkennung wäre eine spätere, bewusst geschützte Katalog-/Blöcke-Funktion nur über ungeschützte Legacy-Modi verfügbar.

## Kandidat, absichtlich nicht im laufenden Worker aktiv

- `standard-module-protected-production` für Katalog: nutzt **genau** dieselben vorhandenen Marker-/Subject-geschützten Repositorypfade wie der isolierte Preview-Mode. Für jede Aktivierung werden vor dem Runtime-Start Datenbank `neondb`, Login `ulc_linz_application`, **69 Tabellen**, genau drei aktive Trainings-Fences, keine gewöhnlichen Rechte auf app-owned Löschmarker, Schreib-/Leserechte auf Katalog und seine Kindtabellen, nur lesbares Katalog-Löschmarker-Register und kein Marker-Schreibrecht geprüft.
- `protected-production-verified-subject` für Trainingsblock-Nutzungsbuchungen: prüft denselben exakten Produktionskontext sowie beide Katalog-Marker, die Plan-/Revisionstabellen, Nutzungssubjekt, Nutzungslöschregister und alle benötigten effektiven SQL-Rechte. Vorhandene verifizierte Usage-Buchung und der alte Preview-Modus bleiben unverändert.
- **Beide Modi sind Opt-in**. `production-exercise-catalog-standard.ts` setzt unverändert `standard-module`; `GeneratedPostgresApplicationRuntimeOptions` hat keine automatische Production-Aktivierung, keinen Umgebungsvariablen-Kurzschluss. Die bereits getesteten Preview-Modi behalten ihre 66/68/69-Kompatibilität.
- Neue Regressionstests belegen READ ONLY, exakte SQL-Rolle, fehlende/teilweise Marker, fehlende GRANTs, Drift der drei aktiven Trigger und die bewusste Nicht-Aktivierung.
- Keine Änderung an Migrationen, Tabellendaten, Deploy-Workflow, privaten Medien, freigegebenen Modulverträgen oder Retention.

## Noch blockiert vor einer tatsächlichen Produktionsaktivierung

1. **Katalog:** vollständige autorisierte Favorite-/Usage-Subject-Identität, sichere reale Löschung privater Medien inkl. gesperrtem Reupload und überprüfbarem Restore-No-Resurrection über alle Owner.
2. **Blöcke:** für alle Nutzungsereignisse echte Owner-Zuordnung, geschützte Revisionshistorie und Cross-Owner Löschung/Restore.
3. **Dokumentation:** bereits vorhandene HTTP- und PostgreSQL-Tests sind **noch keine** App-weite produktive Erasure-/Restore-Freigabe. Fremde Teilnehmer in allen historischen Dokumentrevisionen müssen den gemeinsamen Prozess passieren.
4. **Gesamt-App:** Betreiberfreigabe der bedingten Aufbewahrungsregeln, Provider/Backuphorizont und aller acht Daten-Owner sowie expliziter Composition-Gate-PASS.

**Abnahme:** Feature-Test auf isolierter Kopie der 69er-Neon-Datenbank mit gewöhnlicher App-Rolle; Rechte- und Negativtests für jede Änderung. Getrennte Betreiberfreigabe zur Aktivierung der Modi. Bleibt `appbasis.production.json` auf `blocked`, ist kein Go-live zulässig.

### Live-Abgleich, nur gelesen

Bei der Read-only-Prüfung am 20.11.2026 hatten die produktiven Katalog-/Blöcke-/Dokumentations-Tabellen die zugehörigen selektiven App-Rechte. Kein `TRUNCATE`-Recht der gewöhnlichen Rolle auf den 22 geprüften Modul-Tabellen; die drei Löschmarker-Tabellen waren lesbar, aber nicht durch die App-Rolle beschreibbar. **Das ist nur ACL-Inventar, kein Funktionstest unter aktivem Produktions-Worker.**
