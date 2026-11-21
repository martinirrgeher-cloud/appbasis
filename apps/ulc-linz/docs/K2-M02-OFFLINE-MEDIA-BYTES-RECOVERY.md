# K2-M02 – Bytegenaue Wiederherstellung privater Übungsvideos (Offline-Nachweis)

**21.11.2026 · technischer Test, kein produktives Medienbackup und keine Medienfreigabe.**

## Welche Lücke dieses Paket schließt

Der bestehende K2-Datenbank-Backup/Restore enthält **keine** separaten
R2-Objekt-Bytes. Die K2-M01-Inventarprüfung vergleicht
SQL-/Objektinventare, aber nicht selbst die tatsächlich rekonstruierten
Dateiinhalte. Das ist kein Wiederherstellungsnachweis.

`tooling/ulc-linz-k2-offline-media-recovery.mjs` ergänzt deshalb
eine *rein lokale und lesende* Datei-/Byteprüfung. Sie akzeptiert nur ein
bereits unabhängig versioniertes Inventar mit exaktem ULC-Medien-Key,
Bytegröße und **SHA-256 des echten Inhalts**. Die Dateien liegen in einer
vom Betreiber vorher isolierten Quarantäne-Verzeichnisstruktur:
`exercise-catalog/<organisation>/<übung>/<medium>`. Es gibt keinen
Cloudflare-/Neon-Zugriff, keinen Upload, keine Löschung und kein Deployment.

Die Prüfung validiert:
- vollständige Übereinstimmung aller Inventareinträge mit realen Bytes,
  Dateigröße und SHA-256, unabhängig von R2-ETags;
- keine unbekannten, fehlenden oder doppelten Medien, keine versteckten
  Dateien oder zusätzlichen Verzeichnisse im Restore;
- keine Symlinks oder Hardlinks, keine Nicht-Dateien, keine Pfadtraversal-
  und Kodierungsvarianten, maximale Größe **100 MiB je Datei**;
- gleich benannte, extern verifizierte Snapshot-Fence sowie explizit
  unabhängig bestätigte Offline-Isolation; bei fehlender Zusage **FAIL**;
- nur zusammengefasste Zahlen in der Rückgabe, niemals Medien-Keys,
  personenbezogene Inhalte, Secrets oder absolute Dateipfade.

Die beiden neuen Kontrollflags sind **Betreiber-Evidenz**, nicht durch
Dateiinhalt nachprüfbar. Das Modul setzt daher
`mediaRestoreVerified=false`, `providerBackupVerified=false` und
`productionReady=false`, selbst wenn alle lokalen Dateien passen.
Auch ein leeres, korrektes Verzeichnis ist **kein** echter Medien-Restore.

## Technischer Nachweis in CI

`node --test tooling/ulc-linz-k2-offline-media-recovery.test.mjs`

Die Regression erzeugt zwei **synthetische** private Videodateien, packt
sie in ein tar-Archiv, verschlüsselt mit dem bereits verwendeten
AES-256-GCM-Backup-Modul, löscht die lokale Quellkopie, entschlüsselt,
entpackt in eine neue Quarantäne und verifiziert beide rekonstruierte
Dateiinhalte bytegenau. Negativtests: gleiche Größe bei manipuliertem
Inhalt, unbekannte und fehlende Datei, Symlink/Hardlink, falscher
Snapshot, fehlende Isolation, ungültige/duplizierte Inventareinträge,
leere Inventare. Das Testarchiv stammt ausschließlich aus selbst
generierten Daten; das Prüfmodul selbst **extrahiert keine unbekannten
Archive**.

## Unveränderte Produktionssperren / nächster echter Schritt

Vor tatsächlicher Freigabe der privaten Medienfunktion noch notwendig:
1. Exakte tatsächliche R2-Medienbindung/Region und Datenzugriff
   unabhängig kontrollieren; keine pauschale TTL oder Object-Löschung.
2. Konsistentes, verschlüsseltes **R2-Objektbackup** mit eigenem,
   geprüften Aufbewahrungs-/Key- und Datenschutzvertrag,
   statt Medien-Metadaten im `pg_dump` als ausreichend zu betrachten.
3. Unter dokumentierter Write-Fence/Versionierung Datenbankinventar,
   Media-Source und verschlüsseltes Backup vergleichen.
4. Tatsächliche Bytes in eine isolierte, ungeroutete
   Medienquarantäne zurückspielen, unabhängig nachlesen und
   mit echten Providerbytes und Metadaten abgleichen.
5. Restore-/Lösch-Reconciliation älterer Snapshots inklusive
   freigegebener P1-Aufbewahrungsentscheidung, keine Wiederauferstehung
   gelöschter Medien. Testidentitäten/ACL über separaten privaten
   Worker mit gültiger Betriebsfreigabe prüfen.

**Nicht ausgeführt:** Kein Cloudflare-/R2-API-Zugriff, keine
Änderung an Neon oder produktiven Medien, kein Migrations-/Runtime-
Refresh, keine Übernahme von Preview-Medien und keine Produktivfreigabe.
