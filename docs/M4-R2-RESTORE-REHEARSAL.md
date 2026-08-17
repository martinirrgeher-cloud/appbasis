# M4 – verschlüsselter R2-Restore-Rehearsal v0.1

## Zweck

Dieser Slice bereitet den realen M4-Restore eines verschlüsselten R2-Backups von `m3-preview` in eine **separate, vorab bereitgestellte und leere Restore-Datenbank** vor.

Er erzeugt weder R2-Bucket noch Datenbank, setzt keine Secrets und führt durch den Merge allein keinen Provider- oder Datenbank-Write aus.

Der Workflow ist ausschließlich manuell:

```text
.github/workflows/m4-r2-restore-rehearsal.yml
```

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
10. die Restore-Datenbank muss vor dem Write leer sein.

Ein anderer Benutzername, ein anderes Passwort oder andere URL-Queryparameter reichen **nicht**, um Source und Restore-Ziel als verschieden anzusehen. Für die Sicherheitsentscheidung zählen Host, Port und die dedizierte Datenbank `appbasis_m3_preview`.

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

Der PostgreSQL-Custom-Dump wird mit PostgreSQL 18 und folgenden Grenzen eingespielt:

```text
--single-transaction
--no-owner
--no-acl
--exit-on-error
```

Damit wird ein normaler Restorefehler transaktional zurückgerollt. Bleibt das Ergebnis wegen eines externen Fehlers trotzdem unbekannt, darf der Workflow nicht blind gegen dasselbe Ziel wiederholt werden. Vor einem neuen Versuch muss die Empty-Target-Prüfung erneut erfolgreich sein.

## Nachweis nach Restore

Nach erfolgreichem `pg_restore` wird der im Backup gespeicherte Fingerprint über den bestehenden Vertrag

```text
tooling/m4-restore-verification.mjs verify
```

gegen die Restore-Datenbank geprüft.

Der Fingerprint umfasst die relevanten Identity-, Permission- und Tasks-Tabellen. Ein Restore gilt in diesem Slice nur dann als erfolgreich, wenn Schema und Fingerprint exakt passen.

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

Die reale Einrichtung von Bucket, Restore-Datenbank, Providerrechten, Variablen oder Secrets ist **nicht Teil dieses Repository-Slices** und benötigt vor Ausführung die ausdrückliche Nutzerfreigabe.

## M4 DONE bleibt danach offen

Auch ein erfolgreicher Fingerprint-Restore allein schließt M4 noch nicht ab. Für DONE sind auf dem real restaurierten Stand zusätzlich erforderlich:

- Health-Smoke,
- Auth-Smoke,
- Permission-Smoke inklusive Negativfall,
- mindestens ein echter Fachmodul-Smoke, hier Tasks,
- dokumentierte Recovery-Evidenz.

Diese Betriebs-Smokes sollen erst auf dem realen isolierten Restore-Verbraucher verdrahtet werden, nicht vorab als neue abstrakte Plattformschicht.
