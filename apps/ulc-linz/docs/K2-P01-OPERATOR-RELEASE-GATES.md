# K2-P01 – Betreiberentscheidung: Freigabe ohne automatische Produktivschaltung

Stand: 15.11.2026. **ENTWURF / NO-GO für Echtdaten**. Diese Matrix ergänzt K2-R01 (#633), K2-M01 (#634), K2-Q01 (#635) und K2-E01 (#636); die vier Draft-PRs sind **nicht** in `main`. Diese Datei allein schaltet nichts frei.

## Nachweise und Grenzen

- Technischer Pilot: verschlüsselter ULC-Preview-Backup [#43645974462](https://github.com/martinirrgeher-cloud/appbasis/actions/runs/43645974462) und isolierter PostgreSQL-Restore [#43647364218](https://github.com/martinirrgeher-cloud/appbasis/actions/runs/43647364218) PASS.
- Unabhängiger, read-only Datenvergleich zum Snapshot: 62 Tabellen, 1.305 Datensätze, 62/62 Daten-Fingerprints, 472 Spalten, 136 Indizes, 698 kanonische Constraints und vier Sequenzen gleich. Das ist **kein** App-Login-/Rechte-/Medien-/DSGVO-Nachweis.
- Die Restore-Quarantäne ist ein isolierter Neon-Branch, **keine** zugelassene Laufzeit-/Produktivdatenbank. Der Restore verwendet `--no-owner --no-acl`; produktive Rollen- und Berechtigungsgleichheit ist dadurch nicht nachgewiesen.

## Betreiberentscheidungen (einzeln freigeben; keine implizite Freigabe)

| ID | Entscheidung und Minimalnachweis | Default | Nachweisverantwortung |
| --- | --- | --- | --- |
| D01 | EU-R2-Backup-Aufbewahrung: Frist **21 Tage nur Vorschlag**, Minimum 2 unabhängig verifizierte Wiederherstellungspunkte, Holds, Lösch-/Backup-DSGVO-Regeln und Kosten schriftlich bestätigen; R01 ist nur Offline-Dry-Run | BLOCKED | Vereinsverantwortliche + Datenschutz |
| D02 | Mediensicherung: tatsächliches R2-Objektinventar, EU-Jurisdiction, separater verschlüsselter Export, Hashvergleich, isolierter Medien-Restore, Datei-Download/Abspieltest und rechtmäßige Löschung; M01 ist nur Offline-Inventar | BLOCKED | Betreiber + Datenschutz |
| D03 | Rechte: App-Login mit Testkonten je Rolle, Least-Privilege, gruppenbezogene Sichtbarkeit, RLS und negative Cross-Org-/Cross-Group-Tests auf separater Restore-Testanbindung; Q01 sind nur Offline-Gates | BLOCKED | Trainer-/Funktionärstest + Betreiber |
| D04 | Recovery: RPO/RTO-Ziele, Notfallkontakt, Key-Rotation/-Wiederbeschaffung, Medien-/DB-Konsistenz, Rücknahme und Re-Deletion bereits gelöschter Daten schriftlich prüfen; E01 ist nur Offline-Gate | BLOCKED | Betreiber + Datenschutz |
| D05 | Datenschutz: Rechtsgrundlagen, Minderjährigendaten, AVV/DPA, Aufbewahrung/Löschsperren, Zugriff/Protokolle, Sicherungs-Kopien und Restore-Autorität freigeben | BLOCKED | Vereinsverantwortliche |
| D06 | Betriebsaktivierung: tägliche Sicherung erst nach gesondertem Betreiberbeschluss, erfolgreichem E2E-Nachweis und Kostenkontrolle; `APPBASIS_ULC_K2_BACKUP_ENABLED` bleibt `0` | BLOCKED | Betreiber |
| D07 | Go-live: eigener freigegebener Produktiv-Branch, Schema-/Datenmigration, Runtime-Bindings, Testbenutzer, Abnahme und explizite Merge-/Deploy-Freigabe; keine Preview-Backup-Key-Übernahme | BLOCKED | Betreiber |

## Empfohlene Reihenfolge für etwa 30 Vereinsnutzer

1. **Draft-PRs nur nach CI und Review** in der Reihenfolge R01 → M01 → Q01 → E01 → P01 einzeln freigeben. Die Reihenfolge ersetzt keine echte Provider-/App-Abnahme. Branches der PRs stammen von `main` und sind voneinander unabhängig.
2. Betreiber D01/D02/D05 schriftlich entscheiden; zunächst **keine** automatische R2-Lifecycle-Löschung konfigurieren. Medien-Restore separat und ohne Überschreiben der Originalobjekte nachweisen.
3. Quarantäne-Restore-App ausschließlich mit eigenen Test-Bindings starten, ohne DNS/Worker-Promotion; D03/D04 und E2E-Abnahme durchführen. Bereits gelöschte Personendaten dürfen durch Rückspielen alter Backups nicht wieder produktiv werden.
4. Erst nach allen Nachweisen D06 (tägliche Sicherung) und **gesondert** D07 (Produktivnahme) freigeben.

## Stop-Regeln

**STOP** bei unbekannter Rechtsgrundlage, ungeklärten Löschsperren, fehlender Mediensicherung, abweichender DB-Quelle, ungetesteten Rollen, fehlenden Provider-/Region-Belegen, nicht reproduzierbarem Restore, fehlender Schlüsselwiederbeschaffung oder unbekannten Kosten. Keine Löschung, kein Merge, kein Deployment, keine Secret-Änderung, kein Provider-Schreibzugriff und keine Echtdatenfreigabe durch diese Vorlage.

## Morgendliche Sammelabnahme

Für jeden Draft-PR dokumentieren: genaue HEAD-SHA, CI-Run/Ergebnis, Tests, Scope, unveränderte Funktionen, bekannte Lücken, Freigabe oder Rückstellung. **PR-Review ≠ Aktivierung**; Cloudflare-/Neon-/GitHub-Environment-Aktionen benötigen eigene Entscheidung.
