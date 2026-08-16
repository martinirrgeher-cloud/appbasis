# M4 – Free-First Backup-Profil v0.1

## Entscheidung

Für die erste reale App bleibt Neon zunächst im kostenlosen Tarif. M4 wird deshalb **nicht** dadurch erfüllt, dass die bestehende kostenpflichtige Neon-Backup-Schedule-Anforderung abgeschwächt oder als erfüllt markiert wird.

Stattdessen erhält der aktuelle reale Verbraucher `m3-preview` einen zweiten, konkreten M4-Pfad:

- Neon Free bleibt die Datenbank- und kurzfristige PITR-Schicht,
- automatische vollständige PostgreSQL-Backups werden außerhalb von Neon gespeichert,
- Backups werden vor dem Upload client-seitig authentifiziert verschlüsselt,
- Cloudflare R2 Standard ist das erste konkrete externe Backupziel,
- der bestehende Neon-Snapshot-/Schedule-Pfad bleibt unverändert als spätere Upgrade-Option.

Es entsteht keine allgemeine Multi-Provider-Backup-Abstraktion. Das entspricht ADR-012: gemeinsame Plattformsemantik wird erst aus weiteren realen Verbrauchern abgeleitet.

## Warum dieses Profil M4 nicht abschwächt

Die AppBasis-Roadmap verlangt für M4:

- automatische Datenbankbackups,
- dokumentierte Aufbewahrung,
- möglichst Point-in-Time-Recovery,
- Sicherung vor kritischen Migrationen,
- dokumentierten Recovery-Prozess,
- mindestens einen real getesteten Restore,
- Prüfung von Datenintegrität, Auth, Permissions und mindestens einem Fachmodul.

`PITR` ist dabei bewusst ein **möglichst**-Kriterium. Die übrigen Punkte bleiben Pflicht und dürfen nicht durch den Free-Tarif als erfüllt angenommen werden.

M4 bleibt daher fail-closed, bis der externe Backup-Pfad real aktiviert, mindestens ein Backup erfolgreich erzeugt und mindestens ein Restore daraus vollständig geprüft wurde.

## Retention v0.1

Für die erste kleine App gilt zunächst:

- 7 tägliche Backups,
- zusätzlich 4 wöchentliche Backups, jeweils sonntags UTC,
- ein unveränderliches Pre-Migration-Backup pro expliziter `change_id`,
- Neon Free PITR zusätzlich innerhalb des tatsächlich verfügbaren Providerfensters.

Daily-/Weekly-Retention wird aus dem **tatsächlichen R2-Objektbestand** berechnet, nicht aus einem angenommenen lückenlosen Cron-Verlauf. Nach einem erfolgreich geschriebenen oder erfolgreich reconcilierten Backup listet der Workflow die verwalteten Daily- und Weekly-Präfixe vollständig und explizit paginiert. Unvollständige, nicht fortschreitende oder malformed Pagination schlägt fail-closed fehl.

Anschließend werden sämtliche kanonischen verwalteten Daily-Objekte gelöscht, deren UTC-Datum älter als die letzten sieben Kalendertage ist. Für Weekly werden die vier jüngsten Sonntagsslots bezogen auf den letzten erreichten UTC-Sonntag behalten; alle älteren kanonischen Weekly-Objekte werden entfernt. Damit konvergiert die Retention nach ausgefallenen oder übersprungenen Workflow-Tagen wieder auf die definierte 7/4-Grenze, statt verwaiste ältere Objekte unbegrenzt anzusammeln.

Malformed, doppelte, future-dated oder bei Weekly nicht auf einen Sonntag zeigende verwaltete Keys blockieren die automatische Bereinigung. Pre-Migration-Objekte werden von dieser automatischen Retention bewusst nicht erfasst.

Pre-Migration-Backups werden nur manuell und mit expliziter Freigabe erzeugt. Jede kanonische `change_id` erhält einen eigenen unveränderlichen Objektschlüssel und jeder Upload verwendet `If-None-Match: *`. Ein versehentlicher Wiederlauf kann daher einen bereits vorhandenen Vor-Migrationszustand nicht überschreiben. Die spätere Bereinigung älterer Pre-Migration-Stände wird erst ergänzt, wenn eine eigene fail-closed Retention-/Freshness-Evidenz dafür vorliegt.

## Konsistente Datenbasis

Fingerprint und Dump dürfen nicht aus zwei zeitlich getrennten Datenbankzuständen stammen.

`tooling/m4-consistent-backup.mjs` öffnet deshalb eine read-only `REPEATABLE READ`-Transaktion, exportiert genau deren PostgreSQL-Snapshot und verwendet denselben Snapshot für:

1. den bestehenden vollständigen M4-Datenfingerprint,
2. `pg_dump --snapshot=<exported snapshot>`.

Die exportierende Transaktion bleibt offen, bis `pg_dump` abgeschlossen ist. Damit beschreibt der im Backup gespeicherte Fingerprint exakt denselben konsistenten Datenzustand wie der Dump, auch wenn die Quellanwendung während des Backups weiter schreibt.

Der Dump-Writer erzeugt sein Ziel ausschließlich per `wx`. Schlägt diese exklusive Erzeugung fehl, wird eine bereits vorhandene fremde Datei nicht gelöscht. Nur eine von der aktuellen Ausführung selbst erzeugte partielle Dump-Datei darf bei einem späteren Dump-Fehler bereinigt werden.

## Verschlüsselung

Vor jedem Provider-Upload werden ausschließlich lokal im GitHub-Runner erzeugt:

1. der M4-Datenfingerprint aus dem gemeinsamen exportierten Snapshot,
2. der PostgreSQL-18-Custom-Dump aus demselben Snapshot,
3. ein minimales Manifest ohne Secrets oder Fachinhalte.

Diese drei Artefakte werden zu einem TAR zusammengefasst und mit **AES-256-GCM** client-seitig verschlüsselt. Erst die verschlüsselte Datei darf an R2 übertragen werden.

Der Schlüssel liegt ausschließlich als geschütztes Secret `APPBASIS_M4_BACKUP_ENCRYPTION_KEY` vor. Rohdump, Fingerprint und Manifest werden nach erfolgreicher Verschlüsselung aus dem temporären Workspace entfernt. Der gesamte Workspace wird am Jobende auch bei Fehlern gelöscht.

Die R2-eigene Verschlüsselung at rest bleibt eine zusätzliche Provider-Schicht, ersetzt aber nicht diese client-seitige Verschlüsselung.

## R2-Sicherheitsgrenze

Der Workflow `.github/workflows/m4-free-external-backup.yml` darf **keinen Bucket erzeugen**.

Er erwartet einen bereits separat freigegebenen R2-Bucket sowie dedizierte, möglichst nur auf diesen Bucket beschränkte S3-Credentials. Für den konkreten Workflow müssen diese Credentials nur die benötigten Bucket-/Objektoperationen für Read/List, immutable Put und Retention-Delete besitzen; sie dürfen keine allgemeine Cloudflare-Control-Plane-Berechtigung ersetzen.

### Environment-Variablen `m4-dr`

- `APPBASIS_M4_FREE_BACKUP_ENABLED`
  - muss exakt `1` sein, bevor ein geplanter oder manueller Backup-Write möglich ist
- `APPBASIS_M4_R2_BUCKET`
  - Name des bereits vorhandenen Backup-Buckets
- `APPBASIS_M4_R2_JURISDICTION`
  - `default` oder `eu`

### Secrets `m4-dr`

- `CLOUDFLARE_ACCOUNT_ID`
- `APPBASIS_M4_SOURCE_DATABASE_URL`
- `APPBASIS_M4_BACKUP_ENCRYPTION_KEY`
- `APPBASIS_M4_R2_ACCESS_KEY_ID`
- `APPBASIS_M4_R2_SECRET_ACCESS_KEY`

Keine dieser Angaben wird in das App-Manifest geschrieben.

### Private Bucket ist getrennt zu beweisen

`HeadBucket` beweist nur, dass die dedizierten S3-Credentials auf den konfigurierten Bucket zugreifen können. Es beweist **nicht**, dass für diesen Bucket kein `r2.dev`-Zugang und keine öffentliche Custom Domain aktiviert ist.

Darum darf ein erfolgreicher Backup-Workflow nicht als Privacy-Nachweis für den Bucket interpretiert werden. Vor der realen Aktivierung muss der konkrete R2-Providerzustand separat read-only geprüft und dokumentiert werden. Ein unbekannter oder öffentlich erreichbarer Bucket bleibt für echte App-Daten gesperrt.

Die client-seitige AES-256-GCM-Verschlüsselung bleibt zusätzlich verpflichtend und ist kein Ersatz für diese Bucket-Prüfung.

## Immutable Write und Reconciliation

Alle Daily-, Weekly- und Pre-Migration-Uploads verwenden `PutObject` mit `If-None-Match: *`. Es gibt pro Workflowlauf und Zielobjekt höchstens **einen** Put-Versuch.

Ein nicht bestätigter Put-Ausgang wird als unbekannter Provider-Write behandelt. Der Workflow führt dann **keinen zweiten Put** aus. Stattdessen reconciliert er das exakte immutable Zielobjekt ausschließlich read-only:

- `HeadObject` muss die App-, Objektart- und SHA-256-Bindung des exakten Objektschlüssels tragen,
- der gespeicherte Ciphertext-Digest muss formal gültig sein,
- das Objekt wird in einen geschützten temporären Pfad gelesen,
- tatsächliche Größe und SHA-256 des heruntergeladenen Ciphertexts müssen den autoritativen Objektmetadaten entsprechen.

Nur ein solcher bereits vorhandener exakter Stand darf einen Rerun nach `412`, Netzwerkfehler oder einem zuvor unklaren Write-Ausgang erfolgreich fortsetzen. Fehlt das Objekt oder stimmen Bindung, Größe oder Digest nicht, bleibt der Lauf fail-closed. Die AES-GCM-Authentizität des Inhalts wird zusätzlich beim späteren Restore mit dem getrennten Backup-Schlüssel geprüft.

## Ausführungsgrenze

Der Workflow besitzt nur `contents: read` und läuft im geschützten Environment `m4-dr`.

Zusätzlich gilt:

- nur `refs/heads/main` darf erfolgreich ausführen,
- die Aktivierungsvariable wird vor jedem Secret-Zugriff geprüft,
- manuelle Läufe verlangen zusätzlich `apply=true`,
- der automatische tägliche Lauf bleibt wirkungslos, solange `APPBASIS_M4_FREE_BACKUP_ENABLED != 1`,
- vor jedem Backup wird der bereits vorhandene Bucket read-only auf Erreichbarkeit geprüft,
- der Workflow verwendet keine Bucket-Create- oder Auto-Provisioning-Funktion.

Damit kann dieser Repository-Slice sicher gemerged werden, ohne dadurch bereits eine externe R2-Ressource zu erzeugen oder Backups zu aktivieren.

## Objektpfade

Daily:

```text
appbasis/m3-preview/m4/daily/YYYY-MM-DD.tar.aesgcm
```

Weekly, nur sonntags UTC:

```text
appbasis/m3-preview/m4/weekly/YYYY-MM-DD.tar.aesgcm
```

Pre-Migration:

```text
appbasis/m3-preview/m4/pre-migration/<change_id>.tar.aesgcm
```

## Free-Tier-Grenze bleibt ein echtes Gate

Dieses Profil garantiert nicht, dass R2 dauerhaft kostenlos bleibt. Vor der Aktivierung und später regelmäßig muss geprüft werden, ob Datenmenge und Operationen innerhalb des aktuellen kostenlosen Cloudflare-Kontingents liegen.

Für die erste kleine App ist die Daily-/Weekly-Retention bewusst knapp gewählt. Pre-Migration-Stände werden vorerst nicht automatisch gelöscht, weil ein älterer korrekter Vorzustand wichtiger ist als eine voreilige Speicheroptimierung. Wird die kostenlose Speicher-/Operationsgrenze relevant oder reicht ein RPO von ungefähr einem Tag nicht mehr aus, ist das ein echter Upgrade-/Architekturtrigger und kein Grund, das M4-Gate stillschweigend zu lockern.

Auch ein konfigurierter GitHub-Actions-Cron ist allein noch kein Backup-Nachweis. M4 braucht später eine read-only Freshness-/Retention-Evidenz aus dem tatsächlichen R2-Objektbestand, damit ein ausgefallener oder verspäteter Scheduled Run fail-closed sichtbar wird.

## Bestehender Neon-Paid-Pfad

Die vorhandenen Verträge

- `m4-neon-backup-readiness`,
- `m4-neon-backup-schedule`,
- Neon Snapshot / Restore Rehearsal

bleiben unverändert bestehen. Sie bilden weiterhin den stärkeren Provider-internen Pfad für einen späteren Neon-Tarif mit längerer PITR- und automatischer Snapshot-Unterstützung.

Der Free-First-Pfad ersetzt nur die operative Annahme, dass M4 zwingend einen kostenpflichtigen Neon-Schedule benötigt.

## Noch erforderlich bis M4 DONE

Dieser Repository-Slice allein macht M4 **nicht DONE**.

Noch erforderlich:

1. privaten R2-Bucket und bucket-scoped Credentials nach ausdrücklicher Nutzerfreigabe vorbereiten,
2. Free-Tier-/Jurisdiction-/Kostenstatus sowie nichtöffentlichen Bucketzustand vor Aktivierung erneut live prüfen,
3. `m4-dr`-Variablen und Secrets geschützt hinterlegen,
4. automatischen Backup-Pfad aktivieren und einen echten Daily-Backup-Lauf erfolgreich nachweisen,
5. read-only Freshness-/Retention-Evidenz gegen den realen R2-Objektbestand ergänzen,
6. Pre-Migration-Backup real nachweisen,
7. einen verschlüsselten R2-Backupstand in eine getrennte geeignete Restore-Datenbank zurückspielen,
8. den im selben Snapshot erzeugten Fingerprint gegen das Restore-Ziel verifizieren,
9. Health-, Auth-, Permission- und Tasks-Smokes gegen die wiederhergestellte Laufzeit durchführen,
10. fachliches Restore-Ergebnis dokumentieren.

Erst dann darf das M4-/Backup-Recovery-Gate auf grün wechseln.
