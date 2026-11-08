# G-04 – Kalender-v17 in der bestehenden ULC-Linz-Preview

**Stand: 08.11.2026.** Betreiberfreigabe: Kalender und Sondertermine **in der bestehenden ULC-App** testen, keine neuen Sandbox-Logins, Cloudflare-Worker oder Hyperdrives. **Produktion bleibt auf v16.**

## Bereits durchgeführter Test-DB-Teil (nicht erst nach PR)

Die bestehende **Neon Preview** im Projekt `cool-unit-46141580`, Branch `br-delicate-surf-b1eu6ikn` (`main/default/primary`), Origin `ep-green-resonance-b19c78rm.c-5.eu-central-1.aws.neon.tech`, Datenbank `appbasis_ulc_linz_preview` wurde nach ausdrücklicher Nutzerzustimmung von v16 auf die **v17-Teststruktur** erweitert.

- Vorher: heutiger realer Preview-Provider-Snapshot `snap-ancient-voice-b1y0mz7b`, isoliert wiederhergestellt und gegen Original geprüft (G-04.4). **Kein unabhängiger `pg_dump`-Artefakt-Nachweis**, daher kein Produktivbackup.
- Vorher: 4 Gruppen, 14 Trainingssitzungen und 9 Anmeldungen. Alle 9 vorhandenen kindertraining-Anmeldungen lagen in aktiven Selbstanmeldegruppen mit geplanten Trainings. Keine bestehende Kalenderregel.
- In **einer einzigen PostgreSQL-Transaktion** genau die fünf zuvor getesteten SQL-Statements aus `apps/ulc-linz/migrations/0016_ulc_linz_registration_calendar.sql` angewandt: 2 neue Konfigurationstabellen, Anmelde-Guard-Funktion, `PUBLIC EXECUTE`-Entzug und Registrierungstrigger. Keine bestehenden Tabellen gelöscht oder Trainingseinträge migriert.
- Nur auf derselben Preview-DB: bestehender Anwendungsrolle Rechte auf die zwei neuen Tabellen verliehen, zunächst `SELECT/INSERT/UPDATE`, danach das bisherige D4-Standard-DML-Recht `DELETE` zur Erfüllung des bestehenden Preview-Rollenvertrags ergänzt. **Keine Änderungen** an Sicherheitslogrollen oder deren Tabellen.
- Nachher: 62 Public-Tabellen; beide neuen Tabellen, Guard-Funktion und aktivierter Trigger vorhanden; keine öffentlichen Ausführungsrechte; 4 Gruppen, 14 Sessions, 9 Registrierungen erhalten; 0 Kalenderregeln/Ausnahmen. Direkter Preview-Endpunkt, Standardbranch und bestehende DB-Rollen unverändert.
- Regression: Ein `UPDATE` auf eine vorhandene Anmeldung (ohne Sachänderung) löste den neuen Guard bei **noch nicht konfigurierter Kalenderregel** aus und wurde mit **Rollback zum Savepoint** geprüft. Alle 9 Anmeldungen blieben bestehen.

### Abgrenzung der Testfreigabe

Diese Freigabe gilt ausschließlich für die **noch nicht mit Echtdaten betriebene Preview/Testphase**, nach Betreiberaussage. Die bereits dokumentierte Testregel gilt: Bei Deaktivierung Kalenderkonfiguration erhalten, bei autorisiertem physischem Gruppenlöschen nur zugehörige Konfiguration transaktional löschen, keine automatische zeitbasierte Bereinigung.

Die Controller-/Retention-/Exportentscheidung und ein unabhängiges `pg_dump`/`pg_restore` für spätere echte personenbezogene Daten sind **noch offen**. Das Privacy-Ledger `apps/ulc-linz/privacy/g04-v17-preview-activation-evidence.json` bleibt deshalb als **Produktiv-/formales Migrations-Evidence-Gate gesperrt**. Es ist falsch, diesen Testdurchlauf als formale Freigabe zu markieren. Vor Echtdatenbetrieb müssen Canonical Manifest und Datenschutz-/Exportverträge ausdrücklich auf v17 gebracht werden. Nicht automatisch die gesamte App/Produktion auf v17 hochstufen.

## Der gewohnte App-Weg ohne zusätzliche Infrastruktur

Der Code dieses PR aktiviert den Kalender nur für den **bestehenden Preview-Worker `appbasis-ulc-linz`** in der vorhandenen E7B9-Preview-GitHub-Actions-Deployment-Pipeline:

- Derselbe Worker und dieselben zwei bereits bestehenden Anwendung/Security-Log-Hyperdrives (keine neue Sandbox).
- `renderGeneratedPreviewWranglerConfig` kennt einen **expliziten, standardmäßig deaktivierten** Parameter `registrationCalendarV17`. Er darf nur bei App-ID `ulc-linz`, bestehendem Preview-Entrypoint `./worker/preview-exercise-catalog-standard.ts`, zwei getrennten Hyperdrives und Worker-URL `https://appbasis-ulc-linz.<subdomain>.workers.dev` aktiviert werden.
- Nur dann erhält die Preview-Worker-Konfiguration die bestehenden Runtime-Flags `APPBASIS_GENERATED_APP_ID`, `APPBASIS_RUNTIME_ENVIRONMENT` und `APPBASIS_REGISTRATION_CALENDAR_V17=enabled`. Andere Apps und alle normalen Konfigurationen bleiben unverändert.
- Der **bestehende** manuelle Workflow `.github/workflows/ulc-linz-e7b9-preview.yml` führt vor jeder v17-Preview-Bereitstellung sowohl die bestehenden v16-/D4-Tests als auch die **v17-Schema- und Origin/Anwendungsrollen-/Guard-Prüfung** aus. Nur bei PASS wird die vorhandene Preview mit dem v17-Featureflag deployed. Die App-Runtime prüft beim Start die echte DB erneut und verweigert bei fehlenden Objekten/ACLs die Aktivierung.
- **Keine automatische Workflow-Ausführung** durch diesen PR, kein Produktionszugriff und kein neuer Cloudflare-Worker. Bestehende U12/U14/Kindertraining-/Doku-Funktionen bleiben Teil der E7B9-Regressionsabnahme.

## Freigabe und Handytest

1. PR-CI auf exakt dem aktuellen HEAD und Codex-Review müssen **PASS** sein.
2. Erst nach separater **Merge-Freigabe** den PR nach `main` übernehmen und Main-CI prüfen.
3. Erst nach separater **Preview-Deploy-Freigabe** den bekannten Workflow **ULC E7B9 Training Plans Preview** mit Operation `deploy-accept` (oder `deploy` und später `accept`) sowie bestätigtem `apply=true` manuell ausführen. Dieser Workflow verwendet die bestehenden geschützten Preview-Credentials und dieselbe bestehende App-Adresse.
4. Abnahme: exakter Build-SHA, Datenbank-Smoke, aktivierte Kalender-UI, Anmelde- und Rechteprüfungen.
5. Am Handy: **Stammdaten → Gruppen → aktive Selbstanmeldegruppe → Kalender**, Wochentage/Anmeldevorlauf/Frist anpassen, Sondertermin hinzufügen/absagen/zurücksetzen, anschließend Wochenanmeldung einschließlich abgelaufener Frist und bestehende U12/U14/Kindertraining/Trainingsdoku prüfen.

**Bei FAIL:** keinen Produktions-Deploy durchführen. Feature kann beim nächsten Preview-Deploy durch `registrationCalendarV17:false` wieder ausgeblendet werden; **das entfernt nicht automatisch den bereits installierten DB-Trigger**. Darum vor einer Rücknahme immer prüfen, ob vorhandene Kalenderregeln Anmeldungen beschränken. Ohne Regeln ist der bestehende 7-Tage-Anmeldepfad weiterhin offen.

## Nicht mehr verwendeter Alternativweg

Der zusätzliche Sandbox-PR [#564](https://github.com/martinirrgeher-cloud/appbasis/pull/564) wurde **ungemergt geschlossen**. Der frühere getrennte Neon-Testbranch bleibt vorerst ungenutzt und verursacht **keine** Cloudflare- oder App-Umschaltung. Sein späterer Abbau ist ein eigener, optionaler Cleanup-Schritt.

## Status

- Bestehende Preview-Datenbank: **v17 Schema PASS**, unveränderte Altanmeldungen.
- Neue App-Freischaltung im gewohnten Preview-Worker: **PR, noch nicht deployed**.
- Produktiver Echtbetrieb / unabhängiger Backup- und formaler Privacy-Gate: **BLOCKED**.
