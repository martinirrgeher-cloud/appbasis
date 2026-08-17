# M4 – verschlüsselter R2-Restore-Rehearsal v0.1

## Zweck

Dieser Slice bereitet den realen M4-Restore eines verschlüsselten R2-Backups von `m3-preview` in eine **separate, vorab bereitgestellte und frische Restore-Datenbank** vor.

Er erzeugt weder R2-Bucket noch Datenbank, setzt keine Secrets und führt durch den Merge allein keinen Provider- oder Datenbank-Write aus.

Der Workflow ist ausschließlich manuell:

```text
.github/workflows/m4-r2-restore-rehearsal.yml
```

Der Restore-Job läuft ausschließlich auf `refs/heads/main`. Ein manuell ausgewählter Feature-Branch wird nicht ausgeführt und erhält damit keinen Restore-Pfad zu den geschützten `m4-dr`-Eingaben.

## Sicherheitsgrenzen

Vor jedem Restore werden fail-closed geprüft:

1. kanonischer R2-Key unter `appbasis/m3-preview/m4/`,
2. exakte Objektart `daily`, `weekly` oder `pre-migration`,
3. Objekt-Metadaten für App, Art, Erstellzeit, Key-SHA-256 und Ciphertext-SHA-256,
4. tatsächliche Ciphertext-Größe und SHA-256 nach dem Download,
5. AES-256-GCM-Authentizität durch den bestehenden `m4-backup-crypto.mjs`-Decrypt-Pfad,
6. exakt drei reguläre Archivdateien:
   - `database.pgdump`
   - `fingerprint.json`
   - `manifest.json`,
7. Manifest-Bindung an ausgewählten R2-Key und Objekt-Metadaten,
8. kanonischer Fingerprint-Vertrag,
9. Source und Restore-Ziel müssen unterschiedliche Datenbank-Endpunkte sein,
10. Source und Restore-Ziel müssen verschlüsselten PostgreSQL-Transport mit genau einem starken `sslmode` erzwingen,
11. die Restore-Datenbank muss unmittelbar vor dem Write als frisches isoliertes Ziel bestätigt werden.

Als starker `sslmode` werden für diesen Restore-Vertrag nur `require`, `verify-ca` oder `verify-full` akzeptiert. Fehlender `sslmode`, schwächere Werte wie `prefer`/`disable` oder doppelte `sslmode`-Parameter werden vor jeder Datenbankverbindung fail-closed abgewiesen.

Ein anderer Benutzername, ein anderes Passwort oder andere URL-Queryparameter reichen **nicht**, um Source und Restore-Ziel als verschieden anzusehen. Für die Sicherheitsentscheidung zählen Host, Port und die dedizierte Datenbank `appbasis_m3_preview`. Bei Neon werden direkte und `-pooler`-Hostnamen desselben Endpunkts zusätzlich als identisch behandelt.

„Frisch“ bedeutet für diesen Rehearsal-Vertrag:

- keine Anwendungsrelationen im Schema `public`,
- keine Routinen im Schema `public`,
- keine Typen im Schema `public`,
- keine zusätzlichen User-Schemas außerhalb der PostgreSQL-Systemschemas und `public`.

Unerwarteter Providerzustand wird nicht automatisch bereinigt. Die Prüfung bricht fail-closed ab und verlangt ein frisches isoliertes Ziel.

## Preflight und Apply

`apply=false` führt nur die vollständige lesende Vorbereitung aus:

- R2 `HeadObject`,
- R2 `GetObject`,
- Ciphertext-Prüfung,
- lokale Entschlüsselung,
- Archiv-/Manifest-/Fingerprint-Prüfung,
- read-only Prüfung des Restore-Datenbankziels.

Es erfolgt kein Datenbank-Write.

`apply=true` aktiviert zusätzlich den eigentlichen Restore in die bereits existierende isolierte Restore-Datenbank.

Der PostgreSQL-Custom-Dump wird mit demselben bereits im M4-Backup-Vertrag verwendeten, per SHA-256-Digest gepinnten PostgreSQL-18-Alpine-Image eingespielt. Der Restore verwendet:

```text
--single-transaction
--no-owner
--no-acl
--exit-on-error
```

Damit wird ein normaler Restorefehler transaktional zurückgerollt. Bleibt das Ergebnis wegen eines externen Fehlers trotzdem unbekannt, darf der Workflow nicht blind gegen dasselbe Ziel wiederholt werden. Vor einem neuen Versuch muss die Fresh-Target-Prüfung erneut erfolgreich sein.

## Nachweis nach Restore

Nach erfolgreichem `pg_restore` wird der im Backup gespeicherte Fingerprint über den bestehenden Vertrag

```text
tooling/m4-restore-verification.mjs verify
```

gegen die Restore-Datenbank geprüft.

Der Fingerprint umfasst die relevanten Identity-, Permission- und Tasks-Tabellen. Zusätzlich läuft die bestehende `m3-preview`-Schema-Prüfung. Ein Restore gilt in diesem Slice nur dann als erfolgreich, wenn Schema und Fingerprint exakt zum gespeicherten Nachweis passen.

Der Workflow selbst serialisiert Restore-Rehearsals für `m3-preview` über eine feste GitHub-Actions-Concurrency-Gruppe. Eine zusätzliche generische Lock-/Provider-Schicht wird für diesen konkreten isolierten Verbraucher nicht eingeführt.

## Credentials

Der Restore verwendet eigene bucket-scoped Read-Credentials:

- `APPBASIS_M4_R2_RESTORE_ACCESS_KEY_ID`
- `APPBASIS_M4_R2_RESTORE_SECRET_ACCESS_KEY`

Sie dürfen keine R2-Schreibrechte benötigen. Zusätzlich werden später geschützt benötigt:

- `CLOUDFLARE_ACCOUNT_ID`
- `APPBASIS_M4_BACKUP_ENCRYPTION_KEY`
- `APPBASIS_M4_SOURCE_DATABASE_URL`
- `APPBASIS_M4_RESTORE_DATABASE_URL`
- `APPBASIS_M4_R2_BUCKET`
- `APPBASIS_M4_R2_JURISDICTION`

Die beiden Datenbank-URLs müssen den oben definierten starken `sslmode` enthalten. Die reale Einrichtung von Bucket, Restore-Datenbank, Providerrechten, Variablen oder Secrets ist **nicht Teil dieses Repository-Slices** und benötigt vor Ausführung die ausdrückliche Nutzerfreigabe.

## M4 DONE bleibt danach offen

Auch ein erfolgreicher Fingerprint-Restore allein schließt M4 noch nicht ab. Für DONE sind auf dem real restaurierten Stand zusätzlich erforderlich:

- Health-Smoke,
- Auth-Smoke,
- Permission-Smoke inklusive Negativfall,
- mindestens ein echter Fachmodul-Smoke, hier Tasks,
- dokumentierte Recovery-Evidenz.

Diese Betriebs-Smokes sollen erst auf dem realen isolierten Restore-Verbraucher verdrahtet werden, nicht vorab als neue abstrakte Plattformschicht.
