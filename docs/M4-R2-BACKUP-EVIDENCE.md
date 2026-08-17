# M4 – R2 Backup Freshness-/Retention-Evidenz v0.1

## Zweck

Dieser Slice ergänzt den gemergten Free-First-Backup-Pfad um eine **rein lesende** Evidenzprüfung gegen den tatsächlichen Cloudflare-R2-Objektbestand von `m3-preview`.

Er erzeugt keine Backups, verändert keine Objekte, löscht keine Objekte und erzeugt keinen Bucket. Ein erfolgreicher Repository-Test ist noch **keine reale M4-Evidenz**. Erst ein erfolgreicher Lauf gegen den später ausdrücklich freigegebenen echten R2-Bucket zählt als Betriebsnachweis.

## Wiederverwendeter Vertrag

Die Retention wird nicht erneut implementiert. `tooling/m4-r2-backup-evidence.mjs` verwendet direkt `selectExpiredM4BackupKeys()` aus `tooling/m4-free-backup-plan.mjs`.

Damit bleiben dieselben Regeln maßgeblich:

- letzte 7 UTC-Kalendertage für Daily,
- 4 jüngste Sonntagsslots für Weekly,
- malformed, doppelte, future-dated oder nicht-sonntägliche verwaltete Keys schlagen fail-closed fehl.

Zusätzlich verlangt die Freshness-Prüfung für den geplanten Evidenzlauf das Daily-Objekt des aktuellen UTC-Kalendertags. Fehlt es, ist die Evidenz nicht grün.

## Read-only Provider-Grenze

Workflow:

```text
.github/workflows/m4-r2-backup-evidence.yml
```

Er darf ausschließlich lesende R2-S3-Operationen verwenden:

- `HeadBucket`,
- `ListObjectsV2`.

`PutObject`, `DeleteObject`, `GetObject`, Bucket-Erzeugung oder Cloudflare-Control-Plane-Writes sind in diesem Workflow nicht zulässig und werden durch einen Repository-Vertragstest geschützt.

Die Daily- und Weekly-Präfixe werden explizit und vollständig paginiert. Truncated Pages ohne neuen Continuation Token, wiederholte Tokens oder strukturell ungültige Antworten führen zum Abbruch.

## Eigene Evidence-Credentials

Der Read-only-Workflow verwendet bewusst **nicht** die schreibfähigen Backup-Credentials. Für die spätere reale Aktivierung sind eigene, bucket-scoped Credentials erforderlich:

- `APPBASIS_M4_R2_EVIDENCE_ACCESS_KEY_ID`
- `APPBASIS_M4_R2_EVIDENCE_SECRET_ACCESS_KEY`

Diese Credentials sollen providerseitig nur die für Bucket-Erreichbarkeit und Objekt-Listing notwendigen Leserechte besitzen. Das Einrichten dieser Secrets und Providerrechte ist eine externe Aktion und erfolgt erst nach ausdrücklicher Nutzerfreigabe.

Weiter verwendet der Workflow die bereits vorgesehenen `m4-dr`-Werte:

- `CLOUDFLARE_ACCOUNT_ID`
- `APPBASIS_M4_R2_BUCKET`
- `APPBASIS_M4_R2_JURISDICTION`
- `APPBASIS_M4_FREE_BACKUP_ENABLED`

## Zeitliche Prüfung

Der Backup-Workflow ist für `02:17 UTC` vorgesehen. Die Evidenzprüfung läuft geplant um `03:47 UTC`, also danach.

Sie verlangt das Daily-Objekt des aktuellen UTC-Tags. Dadurch wird ein ausgefallener oder verspäteter täglicher Backup-Lauf sichtbar, statt nur einen vorhandenen historischen Stand als ausreichend zu akzeptieren.

## Auswertung

Die Auswertung arbeitet ausschließlich mit dem tatsächlich gelisteten Inventar (`Key`, `LastModified`, `Size`) und prüft fail-closed:

- ausschließlich verwaltete Daily-/Weekly-Keys,
- positive Objektgröße,
- gültiges, nicht in der Zukunft liegendes `LastModified`,
- aktuelles Daily-Objekt,
- keine abgelaufenen Objekte gemäß bestehendem 7/4-Vertrag,
- keine Überschreitung von 7 Daily bzw. 4 Weekly.

Das strukturierte Ergebnis enthält keine Secrets und kann im GitHub-Run als Betriebsnachweis verwendet werden.

## Aktivierungsgrenze

Solange `APPBASIS_M4_FREE_BACKUP_ENABLED != 1` ist, bleibt der Scheduled Evidence-Lauf ohne Secret-Zugriff wirkungslos. Ein manueller Evidence-Lauf gegen ein inaktives Profil schlägt bewusst fehl.

Dieser Repository-Slice nimmt **keine** der später erforderlichen externen Aktionen vor. Vor echter Aktivierung bleiben insbesondere erforderlich:

1. aktuellen Cloudflare-Free-Tier-/Kostenstatus prüfen,
2. Jurisdiction und privaten Bucketzustand live verifizieren,
3. Bucket und bucket-scoped Backup-/Evidence-Credentials nach ausdrücklicher Nutzerfreigabe vorbereiten,
4. `m4-dr`-Variablen und Secrets geschützt hinterlegen,
5. echten Daily-Backup-Lauf erzeugen,
6. danach diesen Evidence-Workflow real erfolgreich ausführen.

Auch danach bleiben Pre-Migration-Backup, Restore in eine getrennte Datenbank, Fingerprint-Prüfung sowie Health/Auth/Permission/Tasks-Smokes für M4 DONE offen.
