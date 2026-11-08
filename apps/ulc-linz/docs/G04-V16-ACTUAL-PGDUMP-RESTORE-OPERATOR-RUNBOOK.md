# G-04.5 – echtes Preview-v16-Backup und unabhängiger pg_restore

**Status 08.11.2026: Ausführungspfad und Regressionen vorbereitet – keine echte pg_dump-Datei und kein realer pg_restore ausgeführt.** Der vorangehende echte Neon-Snapshot/Branch-Restore (G-04.4) ist hiervon ausdrücklich verschieden.

## Abgrenzung

Das Tool `tooling/ulc-linz-g04-v16-actual-recovery.mjs` hat die getrennten Modi `backup` und `restore`. Es verlangt in **beiden** Modi eine erneute ausdrückliche Operatorautorisierung. Kein automatischer Aufruf über CI, PR, Deploy, Preview-Refresh oder die Migration. Für beide Schritte werden **PostgreSQL-18-Clients** über ein gepinntes Docker-Image verwendet; es wird kein neuer Neon-Branch erstellt oder ein Endpoint umgehängt.

### Vorbereitete Zugänge und Umgebung

Ein Betreiber mit Linux, Node/Pnpm-Abhängigkeiten und Docker stellt **ohne Veröffentlichung** dieser Werte die erforderlichen Umgebungsvariablen bereit:

- `APPBASIS_MIGRATION_DATABASE_URL`: geprüfte bestehende **Preview**-Migration-Rolle (nur für Identitäts-Preflight, **keine Migration**).
- `APPBASIS_DATABASE_URL`: bestehende getrennte Preview-App-Rolle (nur für Identitäts-Preflight).
- `APPBASIS_SECURITY_LOG_DATABASE_URL`: bestehende getrennte Preview-Security-Rolle (nur für Identitäts-Preflight).
- `APPBASIS_G04_V16_BACKUP_DATABASE_URL`: eigene, nur-lesende Preview-Backup-Rolle; derselbe direkte Neon-Host und exakt `appbasis_ulc_linz_preview`. Bestehender M5-Least-Privilege-Check muss die Rolle ohne Schreib-, DDL- oder erhöhte Adminrechte akzeptieren.
- `APPBASIS_G04_V17_RESTORE_DATABASE_URL`: separat bereitgestellter **direkter** Neon-Host mit neuer, vorher **leerer** Datenbank `appbasis_ulc_linz_...restore...` und unterschiedlicher Restore-Rolle. Die Quelle und das Ziel dürfen weder Host noch DB noch Rolle teilen. Ziel muss erforderliche bekannte ACL-Zielrollen bereitstellen. Nicht die aktuelle Preview, nicht Produktion und **kein bestehender Snapshot-Restore-Branch als Ziel mit gefüllter DB**.
- Alle fünf URLs: PostgreSQL-Verbindung über direktes Neon, explizites `sslmode=require`, `verify-ca` oder `verify-full`; keine Pooler und keine Query-/Datenbank-Overrides.
- `APPBASIS_G04_V16_EVIDENCE_DIR`: **existierender, leerer, absoluter Ordner außerhalb des Git-Repos mit Zugriffsrechten 0700** und ausreichend Platz für ein vollständiges Backup. Der Ordner darf nicht öffentlich synchronisiert, geloggt oder als CI-Artefakt hochgeladen werden.

**Credential-Preflight** prüft alle drei Anwendungsrollen, Backup- und Restore-Rollen sowie die unabhängigen DB-Origins vor jedem Zugriff. Das Backup wird mit dem M5-Snapshot-Least-Privilege-Guard erstellt.

## Zwei bewusst getrennte Operatoraktionen

Mit getrennten, ausdrücklich zu erteilenden Zustimmungen:

```bash
# Nach Backup-Freigabe; Umgebungsvariablen aus geschütztem Secret-Store beziehen.
export APPBASIS_G04_V16_OPERATOR_APPROVED=g04-v16-backup
node tooling/ulc-linz-g04-v16-actual-recovery.mjs backup

# Später, erst nach sicherer Prüfung des neuen leeren, unabhängigen Zieles
# und eigener Restore-Freigabe (dieselbe Evidence-Mappe verwenden):
export APPBASIS_G04_V16_OPERATOR_APPROVED=g04-v16-restore
node tooling/ulc-linz-g04-v16-actual-recovery.mjs restore
```

### Ergebnis

1. Ein **exportierter konsistenter PostgreSQL-Snapshot** verbindet den Quell-Schema-, Zeilenanzahl-, Zeileninhalts- und Security-ACL-Fingerprint mit dem tatsächlichen `pg_dump --format=custom --no-owner --snapshot`. **Kein** `--no-acl`.
2. Der Dump wird in `preview-v16.pgdump` gesichert. Ein SHA-256 wird **über die tatsächlichen Datei-Bytes** ermittelt und mit der Quell-Evidence in `preview-v16.manifest.json` dokumentiert.
3. Vor `pg_restore` wird der Dump-SHA erneut berechnet und die **leere** Ziel-DB verifiziert; das Restore erfolgt via `--single-transaction --no-owner --exit-on-error` ohne `--clean` oder `--create`.
4. Das Tool verifiziert danach Schema-/Zeilenanzahl-Fingerprints, den SHA-256-Inhaltsfingerprint sämtlicher öffentlichen Tabellen sowie die expliziten SECURITY-DEFINER-Schutzberechtigungen. Nur bei vollständiger Übereinstimmung entsteht `preview-v16.restore-report.json`, mit dem identischen SHA des Original-Dumps.
5. Backup und Restore erhalten einen **separaten Evidence-Nachweis**. Der Operator muss anschließend unabhängige, geschützte und abrufbare Beleg-URLs für Quell-Backup und Wiederherstellung dokumentieren und den weiteren Privacy-/Migration-Gates separat vorlegen.

**Datenrisiken:** Der Dump enthält potenziell persönliche Daten und Zugangsdaten/Hashes aus vorhandenen Testtabellen; nie in Git, Chat, CI, PR, unverschlüsselte Cloudspeicher oder ungesicherte E-Mail übernehmen. Streng begrenzte Aufbewahrung und sichere Löschung nach gesondert genehmigtem Plan. Während des Restore kann nur die **unabhängige Zieldatenbank** verändert werden. Fehlgeschlagene Restores können eine teilweise beschriebene Zieldatenbank hinterlassen; sie dürfen nicht erneut auf derselben DB laufen.

## Unverändert blockiert

Weder das Tool noch die CI-Tests erstellen eine Preview-Backup-Datei automatisch. Das Ledger `privacy/g04-v17-preview-activation-evidence.json` bleibt `blocked-pending-independent-operator-evidence`. Der Controller muss die formale Aufbewahrungs- und Exportentscheidung für Echtdaten weiterhin separat treffen. Eine v17-Migration, Aktivierung, Preview-Deployment oder Produktionsänderung ist **nicht** Teil von G-04.5. Ein echtes Run-PASS darf erst **nach** dem getrennt autorisierten und nachweislich ausgeführten Backup/Restore erklärt werden.
