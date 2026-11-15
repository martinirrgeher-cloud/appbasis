# K2-Q01: Restore-Quarantäne – Prüf- und Freigabegates (15.11.2026)

## Nachgewiesener Stand
- Backup GitHub Actions #43645974462 und isolierter Restore #43647364218: PASS.
- Read-only Neon-Quell-/Quarantänevergleich: 62/62 Tabellen, 1.305/1.305 Datensätze, 62/62 Daten-Fingerprints, 472 Spalten, 136 Indizes, 698 Constraints und 4 Sequenzen in der geprüften Momentaufnahme übereinstimmend.
- Die Quarantäne ist **nicht mehr leer**. Ein zweiter `apply=true`-Lauf muss am Leere-Gate abbrechen. Keine erneute Restore-Ausführung auf diesem Ziel ohne ausdrücklich genehmigte neue leere Quarantäne.
- Keine produktive Verbindung, kein App-Routing und keine Freigabe für Echtdaten aus diesem Nachweis ableiten.

## Automatische Offline-Regression
`node --test tooling/ulc-linz-k2-restore-boundary.test.mjs` prüft sieben getrennte Schutzverträge: manueller Trigger und Berechtigungsminimum; Endpoint-Isolation; Backup-Key-Scope; Leere-/Hash-Gates; Authentifizierung und Archiv-Pfadprüfung; `apply`-Gate plus transaktionaler Restore; temporäre Dateibereinigung. Diese Tests lesen nur lokale Workflow- und JavaScript-Dateien, benötigen weder Secrets noch Cloudzugang und führen keine Datenbankoperation aus.

## Noch offen vor Freigabe einer produktiven Backup-/Restore-Strecke
1. **Restore-Rollen:** `--no-owner --no-acl` bedeutet, dass Daten und Struktur wiederhergestellt wurden, nicht aber die ursprünglichen Owner-/GRANT-Verhältnisse. Rollen- und RLS-Verhalten muss mit separaten, nicht-produktiven Testidentitäten nachgewiesen werden.
2. **Anwendung:** Smoke-/E2E-Tests der ULC-Module auf isoliertem Restore-Endpoint, ohne Nutzerzugriff oder öffentliche Preview-Umschaltung; keine produktiven Tokens/Passwörter verwenden.
3. **Medien:** SQL-Backup umfasst nicht automatisch Übungskatalog-Videos/R2-Objekte. Siehe K2-M01 Draft-PR #634; getrenntes Medien-Restore nachweisen.
4. **Retention:** K2-R01 Draft-PR #633 ist ein Dry-run; Frist, Sperren, Mindestanzahl und Rechtsgrundlage müssen entschieden werden. Keine automatische Löschung oder Lifecycle-Regel aktivieren.
5. **Betrieb:** Backup-Zeitfenster, Fehleralarm, Wiederherstellungszeit, Schlüsselrotation und Kosten/Free-Tier überwachen. Vor jeder Wiederholung neue leere Quarantäne und ausdrückliche Freigabe.

## Entscheidungsvorlage
Diese PR nur als **Offline-Test- und Dokumentationspaket** prüfen. Merge erst nach separater Freigabe. Der Merge selbst würde weder Backup noch Restore starten; keinerlei Provider-Aktion wird in dieser PR vorbereitet oder ausgeführt. Die produktive K2-Aktivierung bleibt gesperrt.
