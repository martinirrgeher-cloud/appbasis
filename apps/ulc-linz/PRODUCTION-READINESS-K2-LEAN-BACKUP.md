# K2 – ULC Linz: preiswerter Backup- und Restore-Pilot

**Stand 14.11.2026. ENTWURF / NICHT AKTIVIERT.** App-Produktivvertrag bleibt `blocked`.
Keine produktive Freigabe und kein Rechts-/Löschbeleg durch diese Workflows.

## Technische Entscheidung

- Neon-Organisation hat aktuell Plan **free**. Die ULC-Produktionsbranch ist archiviert; die Neon-History beträgt laut Provider 6 Stunden, automatischer Snapshot-Zeitplan leer. Die kostenpflichtige Neon-Snapshot-Automatik ist **nicht** Voraussetzung für die vorgeschlagene Alternative.
- Stattdessen: **täglich ein eigener konsistenter `pg_dump -Fc`** der ULC-PostgreSQL-Datenbank (PostgreSQL 18) per GitHub Actions, verschlüsselt mit dem bestehenden getesteten AES-256-GCM-Modul `tooling/m4-backup-crypto.mjs`, **vor** dem Upload in Cloudflare **R2 EU-Jurisdiction**. Objektpfad ausschließlich `appbasis/ulc-linz/pilot/db/<freigegebener-datenbankname>/daily/YYYY-MM-DD.tar.aesgcm`, kein Überschreiben am gleichen Tag.
- **Keine Vermischung mit M3**: Die alten `m4-free-external-backup`-/`m4-r2-restore-rehearsal`-Workflows bleiben unverändert und sind `m3-preview`-gebunden.
- **Backup und Restore sind standardmäßig ausgeschaltet**, Credentials fehlen absichtlich im Repo. Neuer GitHub Workflow `.github/workflows/ulc-linz-k2-encrypted-backup.yml` schreibt nur wenn `APPBASIS_ULC_K2_BACKUP_ENABLED=1` in der dedizierten GitHub-Environment `ulc-linz-k2-backup` hinterlegt wurde. Manuelle Ausführung zusätzlich nur mit `apply=true`.
- Ein zweiter **manueller** Workflow `ulc-linz-k2-isolated-restore.yml` entschlüsselt ein streng validiertes, exakt gebundenes Backup. Er prüft, dass der Restore-Host ein **anderer Neon-Endpunkt** und der Ziel-Datenbankkatalog **leer** ist. `apply=false` liest/prüft nur; `apply=true` schreibt nur in den isolierten Quarantäne-Endpunkt. **Keine automatische Promotion/Cloudflare-Routingänderung.**

## Konfiguration durch Betreiber vor Aktivierung

GitHub Environment `ulc-linz-k2-backup`:
- **Vars**: `APPBASIS_ULC_K2_BACKUP_ENABLED` (erst nach gesonderter Freigabe auf `1`), `APPBASIS_ULC_R2_BUCKET` (eigener Bucket), `APPBASIS_ULC_R2_JURISDICTION=eu`, `APPBASIS_ULC_EXPECTED_DATABASE_NAME` (genau die später angebundene ULC-Datenbank; im aktuell geprüften isolierten Preview-Projekt: `appbasis_ulc_linz_preview`, **nicht** die leere Standard-DB `neondb`).
- **Secrets**: `APPBASIS_ULC_SOURCE_DATABASE_URL` (read-only Rolle, bestehende echte ULC-Produktionsdatenbank, TLS), `APPBASIS_ULC_BACKUP_ENCRYPTION_KEY` (neuer **eigener** 32-Byte-Schlüssel in 64 kleinen Hexziffern), `CLOUDFLARE_ACCOUNT_ID`, `APPBASIS_ULC_R2_BACKUP_ACCESS_KEY_ID`, `APPBASIS_ULC_R2_BACKUP_SECRET_ACCESS_KEY` (auf dedizierten Bucket beschränkt, keine globalen Adminrechte).
- **Spezielle EU-R2-Bucket-Jurisdiction verbindlich**, keine automatische Anlage/Änderung des Cloudflare-Buckets. Kein App- oder Auth-Secret als Backup-Schlüssel wiederverwenden.

GitHub Environment `ulc-linz-k2-restore`:
- Dieselben R2-Bucket-/EU-Variablen **und `APPBASIS_ULC_EXPECTED_DATABASE_NAME`**, der gleiche verschlüsselte Backup-Schlüssel und `CLOUDFLARE_ACCOUNT_ID`; **read-only** `APPBASIS_ULC_R2_RESTORE_ACCESS_KEY_ID`/`APPBASIS_ULC_R2_RESTORE_SECRET_ACCESS_KEY`.
- `APPBASIS_ULC_SOURCE_DATABASE_URL` nur für die sichere **Abgrenzung des Quellendpunkts**, `APPBASIS_ULC_RESTORE_DATABASE_URL` mit separat angelegtem, leerem, isoliertem Neon-Branch-Endpunkt und beschränkter Restore-Rolle.
- **Besonders prüfen:** Quarantäne-Branch darf nicht als Worker-Hyperdrive oder R2-Synchronisation eingebunden sein. Getesteten Restore nicht automatisch zu Produktionsdaten machen.

## Einmaliger operativer Nachweis vor einem Echtdaten-Pilot

1. Betreiber prüft Anbieterregion, R2-Ziel, **logischen Datenbanknamen** (in der Neon-Vorschau liegt ULC in `appbasis_ulc_linz_preview`, während `neondb` leer ist), alle **acht Owner-Schemata** und dedizierte Rechte; entscheidet Backup-Aufbewahrung und richtet eine **nachprüfbare Löschfrist z. B. 21 Tage** für den exklusiven R2-Backup-Prefix ein. Nicht nur „alte Dateien nie löschen“.
2. Nach separater Aktivierungsfreigabe ein manuelles ULC-Backup `apply=true` auf main ausführen; zugehörige GitHub-Run-ID, exakte Commit-SHA, R2-Objektgröße und Hash ohne Schlüssel dokumentieren.
3. Einen **eigenen leeren Restore-Endpunkt** vorbereiten; Restore-Workflow zunächst `apply=false` ausführen, nach separater Freigabe auf **den verifizierten Quarantäne-Endpunkt** `apply=true` ausführen. Fehlgeschlagene/teilweise Wiederherstellungen auf neuem leeren Ziel wiederholen, niemals auf Hauptbranch.
4. **App-E2E nach Restore:** Identity, Permissions, Athleten, Trainingsplanung, -blöcke, -doku, Anwesenheit/Registrierung, Katalog, Audits und zentrale Stichproben/Fingerprints. Der Workflow bestätigt momentan **nur** die kryptografische Backup-Integrität, PostgreSQL-Restore und Grundtabellen; **nicht** Vollständigkeit über acht Owner.
5. **Separate Medienabsicherung:** Übungskatalog-Dateien in R2 sind **nicht** Bestandteil des PostgreSQL-Dumps. Ihre laufenden Aufbewahrungs-/Löschregeln sowie Wiederherstellbarkeit sind vor Echtdaten zu verifizieren.
6. **Datenschutz/Löschsperre:** Ist ein Datensatz seit dem gewählten Backup bereits gelöscht, darf die Quarantäne nie ohne neuere geprüfte Löschautorität und Re-Deletion aller Owner in die Produktion. Die vorhandene 35-Tage-Quellmarkierung ist kein pauschaler Restore-Freigabeschein. Keine eigenen längerlebigen Löschmarker ohne Betreiberbeschluss.

## Vorher/Nachher – Sicherheitsgrenze

| Nachweis | Mit diesem Draft geliefert? |
| --- | --- |
| Vollständig von M3 getrennte ULC-Backup-Konfiguration | Ja (Code, noch nicht aktiviert) |
| PostgreSQL-`pg_dump` und AES-256-GCM-Verschlüsselung vor R2-Upload | Ja (Code, Providerlauf ausstehend) |
| Unveränderbare Tagesobjektnamen / kein Überschreiben | Ja (Code) |
| Eigener verschlüsselter Quarantäne-Restore / Prüfung leerer DB | Ja (Code, Providerlauf ausstehend) |
| Tatsächlicher automatisierter ULC-Sicherungslauf | **Nein** |
| Nachgewiesener vollständiger ULC-Restore mit 8 Ownern | **Nein** |
| R2-Mediendateien, DSGVO-/Kinder-/AVV- und Löschfristbelege | **Nein** |
| Freigabe für Echtgeld-/Echtdatenbetrieb | **Nein** |

**Warum bewusst nur dieser Umfang:** Für ca. 30 Vereinsnutzer ist ein tägliches verschlüsseltes DB-Backup plus erprobter Restore sinnvoll. Eine neue Backup-Plattform, weitere Mikro-PRs oder zusätzliche Komfortfunktionen sind derzeit nicht erforderlich. Vor produktiver Aktivierung auch die Abrechnung der GitHub Actions und R2 prüfen; kostenlose Kontingente hängen vom tatsächlichen Verbrauch ab.

### Read-only-Befund zur Source-Validierung

In der ULC-Neon-Preview (`cool-unit-46141580`) hat `neondb` nach aktueller API-Inventur **keine** Anwendungstabellen. Die separate Datenbank `appbasis_ulc_linz_preview` enthält hingegen die erforderlichen acht Owner-Tabellen. Der neue Workflow verweigert einen Backupstart, wenn entweder der explizit konfigurierte Datenbankname nicht zur URL passt oder eine dieser acht Tabellen fehlt. Dies ist eine **Mindestprüfung**, kein vollständiger Konsistenz-/Datenschutzbeleg. Der spätere echte Produktionsdatenbankname wurde noch nicht bestimmt, der Produktions-Neon-Branch ist derzeit archiviert; **niemals** einen Preview-Namen blind für produktive Echtdaten übernehmen.

### Trennung von Test- und Echtdatenbackups

Das Backupobjekt trägt den zuvor ausdrücklich geprüften logischen Datenbanknamen als festen Pfadbestandteil. Ein ULC-Preview-Backup aus `appbasis_ulc_linz_preview` kann somit nicht mit einem späteren Backup aus einer anderen produktiven Datenbank kollidieren. Der Restore-Workflow verweigert Keys, deren Datenbankpfad nicht exakt der `APPBASIS_ULC_EXPECTED_DATABASE_NAME`-Konfiguration entspricht. Die korrekte Datenbank und der separate Restore-Branch müssen trotzdem vom Betreiber unabhängig geprüft werden.
