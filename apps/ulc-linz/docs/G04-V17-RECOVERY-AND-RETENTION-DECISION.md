# G-04.2f – Löschentscheidung und isolierte Backup-/Restore-Probe

**Stand: 08.11.2026. Technisches Testpaket, keine v17-Aktivierung.**

## Abgegrenzter Scope

1. Die bestehende technische Entscheidung G-04.2e wird als Vorschlag übernommen, nicht als datenschutzrechtliche Freigabe.
2. Ein automatisierter PostgreSQL-18-Test installiert die **aktuelle kanonische v16** in einer frisch erzeugten Datenbank, ergänzt ausschließlich künstliche Beispieldatensätze und erstellt mit echtem pg_dump ein Custom-Format-Backup.
3. pg_restore stellt **genau dieses Backup** in einer zweiten, nachweislich leeren und verschiedenen Testdatenbank wieder her. Geprüft werden SHA-256-Form, vollständige Schema-/Tabellen-/Zeilenanzahl-Fingerprints, die konkreten synthetischen Testzeilen sowie zusätzlich explizite PostgreSQL-ACLs (Verbot von PUBLIC EXECUTE auf der SECURITY-DEFINER-Löschfunktion, Cleanup-Rollenfreigabe, kein PUBLIC SELECT auf dem Sicherheitslog und Leserecht der Audit-Rolle). Beide v17-Kalendertabellen müssen ausdrücklich fehlen.
4. Test-Datenbanken und Backupdatei werden nach Abschluss gelöscht. Es werden keine Daten, keine Zugangsdaten und keine Backup-Artefakte in Git oder CI-Artefakte übernommen.
5. Die CI-Prüfung akzeptiert nur den lokalen Testservice mit dem exakten Datenbanknamen appbasis_identity_e2e, PostgreSQL über localhost:5432 und GitHub-Actions-CI. Preview-/Produktionsdatenbanken werden vor jeder Verbindung abgewiesen.

**Wichtige Beweisgrenze:** Der Test belegt nur, dass der kanonische v16-Stand mit synthetischen Daten technisch sicherbar und isoliert wiederherstellbar ist. Er ist **nicht** die reale v16-Preview-Sicherung, nicht der unabhängige Preview-Restore und **niemals** Freigabe-Evidence für die v17-Migration. Die aktive Datei privacy/g04-v17-preview-activation-evidence.json bleibt unangetastet und blockiert weiterhin alle Migrationspfade.

## Offene Entscheidung des Datenverantwortlichen

Die folgenden Punkte benötigen eine dokumentierte Entscheidung, bevor v17 in Preview aktiviert wird. Es wird keine gesetzliche Frist geraten und keine rückwirkende Löschung ausgelöst.

| Frage | Technische Empfehlung / Vorschlag | Entscheidung |
| --- | --- | --- |
| Aktive Trainingsgruppe | Kalenderregeln und Ausnahmen bei bestehender Gruppe erhalten | **Offen** |
| Reversible Deaktivierung | Keine Löschung; identische Regel, Ausnahmen und CAS-Versionen bei Reaktivierung | **Offen** |
| Zulässige physische Gruppenlöschung | Nur Kalenderkonfigurationen im selben DB-Commit per ON DELETE CASCADE entfernen; andere Modulbestände folgen eigenen Regeln | **Offen** |
| Alte/abgelaufene Ausnahmetermine | Vorläufig keine zeitgesteuerte Bereinigung, da dadurch Versionsschutz gegen alte Clients verloren gehen kann | **Offen** |
| Aufbewahrungsfrist | Dauer und Auslöser (Gruppenlöschung, Inaktivität, Trainingsdatum) nach Datenminimierung und fachlichem Bedarf festlegen | **Offen** |
| Backup-Aufbewahrung | Eigenes vorhandenes Backup-/Wiederherstellungskonzept beachten; ggf. Löschung in wiederhergestellten Daten sicherstellen | **Offen** |
| Datenexport & Berechtigung | Indirekten Personenbezug bewerten; kein persönlicher Member-Export für bloße Gruppenkalender-Konfiguration vorgeschlagen; Adminzugriff auf Gruppenbindung prüfen | **Offen** |
| Zuständigkeit | Verantwortlichen, Entscheiddatum und abrufbare Beleg-URL in einem separaten Entscheidungsprotokoll dokumentieren | **Offen** |

Datenschutzentscheidung und technische Umsetzung müssen sich decken. Wenn ein zeitbasierter Löschmechanismus verlangt wird, ist dafür wegen der bestehenden CAS-Revisionen zuerst ein **eigenes** sicherheitsgeprüftes Konzept, ein eigener PR und eine getrennte Freigabe nötig.

## Abnahmekriterien für dieses PR

- **AC-1**: Der lokale PostgreSQL-18-Test startet nur gegen den exakten isolierten CI-Testservice; Preview, Produktion und fremde Hosts werden verweigert.
- **AC-2**: Auf dem reinen Testservice wird eine neue v16-Quelldatenbank angelegt, v16 installiert und nur synthetischer Fixture-Inhalt geschrieben.
- **AC-3**: Die Wiederherstellung erfolgt in einer zweiten, neuen und leeren Testdatenbank mit pg_dump/pg_restore. SHA-256 des Dump-Artefakts wird berechnet; Schema-/Zeilenanzahl-Fingerprints, konkrete Fixture-Datensätze und explizit geprüfte Sicherheitsberechtigungen stimmen nach Restore exakt überein.
- **AC-4**: v17 bleibt in Quelle und Ziel deinstalliert; alle Testdatenbanken und temporären Dateien werden nach dem Test entfernt.
- **AC-5**: CI exact HEAD (PostgreSQL E2E, Quality Gate, Typecheck, Unit, Chromium-Smokes, Build) PASS.
- **AC-6**: Aktives v16-Manifest, bestehende M5-Privacy-/Exportverträge, v17-Evidence-Ledger, Runtime-Flags und produktive Daten bleiben unverändert.
- **AC-7**: PR bleibt bis zur separaten ausdrücklichen Freigabe offen. Kein Preview-/Produktionsdeploy, kein echtes Backup, kein v17-Migrationslauf.

## Nach diesem Paket ausdrücklich noch notwendig

1. Fachliche Datenschutz-/Retention-/Exportentscheidung mit Referenzen und Betreiberprüfung.
2. **Separat genehmigte** reale v16-Preview-Sicherung (mit prüfbarem SHA-256, Ziel-/Quellnachweis, Zeitpunkt und Schutz des Backup-Artefakts).
3. **Separat genehmigter** isolierter Restore **dieser identischen Sicherung** auf einer anderen Preview-Testdatenbank samt nachprüfbarem Fingerprint und unabhängigen Belegen.
4. Unabhängige Prüfung und Aktualisierung des weiterhin gesperrten Evidence-Ledgers unter Review; erst danach **gesonderte** v17-Preview-Migrationsfreigabe und später ein eigener Runtime-/Deploy-Gate.

**Produktion: BLOCKED.**
