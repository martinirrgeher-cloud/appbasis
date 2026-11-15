# K2-M01 – Private Übungskatalog-Medien: Inventarabgleich (Entwurf)

**15.11.2026 · rein offline · kein Providerzugriff · kein Produktivnachweis**

## Befund und Grenzen

- Die K2-Sicherung `pg_dump -Fc` enthält PostgreSQL-Tabellen, **keine** R2-Videodateien. Der echte K2-DB-Restore #43647364218 (62 Tabellen, 1.305 Zeilen) beweist daher **keine** Medien-Wiederherstellbarkeit.
- Der ULC-Worker erzeugt private Objektpfade mit `privateExerciseVideoStorageKey()` in `apps/ulc-linz/worker/exercise-catalog-private-media.ts`: `exercise-catalog/<organization>/<exercise>/<media>`. Video-Maximum 100 MiB. Die Medien-API ist in `tooling/ulc-linz-exercise-catalog-preview-media-smoke.mjs` getestet, allerdings **mit Upload und Löschung**; dieser Smoke-Test darf nicht während der nächtlichen Nur-Vorbereitung gestartet werden.
- Die bestehenden P02-E/I-Löschprotokolle und offenen P02-PRs sind **kein** Medien-Backup, kein Beleg für providerseitige vollständige Löschung und keine Restore-Freigabe. Bestehende Medien und Backup-Objekte dürfen nicht pauschal durch eine R2-Lifecycle-TTL gelöscht werden.
- Es ist **nicht nachgewiesen**, ob alle Medien im gleichen R2-Bucket liegen oder ob eine zweite Region/zweiter Bucket genutzt wird. Vor produktivem Einsatz müssen tatsächliche R2-Bindings und Datenflüsse unabhängig bestätigt werden.

## Sicherer Prüfmechanismus

`tooling/ulc-linz-k2-media-inventory.mjs` vergleicht zwei **extern bereitgestellte** strukturierte Inventare (SQL-Metadaten vs. tatsächliche Storage-Objekte). Erwartet werden je Objekt `key`, `size` und `sha256` der **tatsächlich gelesenen Bytes**; R2-ETag ist kein SHA-256-Ersatz. Der Aufrufer muss eine überprüfte, identische Snapshot-Fence für beide Inventare bestätigen. Ohne diese scheitert die Prüfung. Sie erkennt fehlende, zusätzliche, doppelte, größen- und hashabweichende Objekte. Es werden nur aggregierte Zähler zurückgegeben, keine Dateinamen, IDs oder Schlüssel.

**Wichtig:** Die Funktion ist bewusst kein R2-Client und erstellt keinen Snapshot. Ohne einen separaten, autorisierten **read-only** Collector mit überprüfter Version-/Write-Fence sind echte Providerinventare und ein PASS **nicht** möglich. Ein PASS des Offline-Abgleichs beweist nur Parität der gelieferten Snapshots; weder Abrufbarkeit/Entschlüsselung noch tatsächliche Restore-Fähigkeit, Autorisierung oder rechtliche Zulässigkeit. Die Offline-Tests nutzen ausschließlich synthetische Daten.

## Vor der Freigabe des Medienbetriebs

1. Betreiber bestätigt exakte Medien-Bindings, Bucket/Region, Zugriffsschutz und ob Medien minderjähriger Athleten betroffen sind. Keine neuen privaten Kindermedien bis Rechtsgrundlage, AVV, Zugriff, Lösch-/Wiederherstellungskonzept geklärt sind.
2. **Separater Medien-Backup-Pfad**: konsistentes, verschlüsseltes, versionsgebundenes Inventar + Bytes außerhalb des aktiven Media-Prefix; Kosten/Freikontingent und Verschlüsselung prüfen. Kein Backup durch bloße SQL-Metadaten.
3. Sicherer unabhängiger read-only Inventarcollector mit SHA-256 aus vollständigen Bytes und Version-Fence; keine Geheimnisse oder Identifikatoren in Logs. Das ist ein künftiges, gesondert freizugebendes Paket.
4. **Isolierter Restore-Nachweis**: Medien aus Backup in ein nicht produktiv angebundenes Quarantäne-Ziel wiederherstellen; hash- und größengetreu mit SQL-Metadaten abgleichen; dann HTTP-Abruf/Rechte mit synthetischen Konten prüfen. Ohne diese Schritte bleibt `mediaRestoreVerified=false`.
5. **Löschsperren/DSGVO**: Vor jeder Wiederverwendung alter Backups müssen neuere Löschaufträge/erfolgte Löschungen und Versionen berücksichtigt werden; kein automatisches Wiederauferstehen gelöschter Medien. Retention ist getrennt vom DB-Backup zu beschließen.

## Test

`node --test tooling/ulc-linz-k2-media-inventory.test.mjs`

11 Offline-Tests: Gleichheit, fehlende/verwaiste Objekte, Größen-/Hashabweichung, doppelte Keys, inkonsistente Fence, Pfadtraversal, falsche Größen/ETags, ungültige Eingaben, leeres Inventar. **Kein** Cloudflare/Neon-Write, kein App-Deployment. Der Draft-PR ist nur ein Prüfbaustein, nicht die Freigabe einer Medien-Backup-Automatik.
