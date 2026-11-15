# K2 – EU-R2 Backup-Aufbewahrung: freigabepflichtiger Vorschlag

**Stand 15.11.2026 · NICHT FREIGEGEBEN · keine Provider-Regel aktiviert.** Dieses Paket ergänzt [K2 Lean Backup](../apps/ulc-linz/PRODUCTION-READINESS-K2-LEAN-BACKUP.md) und ersetzt weder die offene P01-Datenschutzentscheidung (Draft PR #619) noch den Medien-Löschvertrag.

## 1. Betreiberentscheidung – ausschließlich Datenbank-Backup-Prefix

- **Geltungsbereich:** `appbasis/ulc-linz/pilot/db/<exakter-db-name>/daily/` im dedizierten **EU-Jurisdiction-R2-Bucket**. Keine bucketweite oder generische `appbasis/`-Lifecycle-Regel, keine Regel für Medien, M3, Restore-Quarantäne oder Audit-Exports.
- **Kandidat:** 21 volle Tage ab tatsächlichem, geprüftem `LastModified` (UTC); nicht automatisch als rechtskonforme Frist interpretieren. Für ca. 30 Benutzer ist eine kurze, überschaubare Backup-Historie sinnvoll, sofern Recovery-Ziel, Datenschutz, Vorhalte-/Löschsperren und Kosten gemeinsam bestätigt sind.
- **Recovery-Schutz:** Mindestens zwei unabhängig verifizierte und testweise wiederherstellbare Sicherungen müssen verfügbar bleiben. Die aktuell nachgewiesene einzelne Sicherung vom 14.11. genügt für eine automatisierte Löschentscheidung **nicht**.
- **Löschsperren:** Juristische Holds, laufende Restores, strittige Löschanträge, forensische Sicherungen, offene Vorfälle und unklarer Hold-Status sperren Löschung. Eine pauschale Lifecycle-TTL kann solche Holds **nicht** zuverlässig berücksichtigen. Daher **keine automatische R2-Lifecycle-TTL aktivieren**, solange ein Hold-fähiger Freigabe-/Ausnahmemechanismus fehlt.
- **Restore nach Datenlöschung:** Backups können bereits gelöschte Daten enthalten. Restore niemals direkt auf Produktion schalten; erst autorisierte Re-Deletion aller betroffenen Owner und externer Medien, Identity/Permissions/Retention-Prüfung sowie erneute Abnahme.
- **Versionierung und Nebenbestände:** Providerseitige Versionen, Multipart-Reste, Kopien, Offsite-/Google-Drive-Backups und Storage-Lifecycle sind separat zu inventarisieren. Ein einzelnes `DeleteObject` ist kein Beleg, dass alle Kopien endgültig entfernt sind.

## 2. Technisches Offline-Werkzeug

`tooling/ulc-linz-k2-retention-plan.mjs` exportiert `planK2Retention()`. Es ist **nur eine reine Funktion**: kein AWS SDK, kein Netzwerk, keine Credentials, kein Provider-Delete. Die Ausgabe trägt immer `status=NOT_APPROVED`, `dryRun=true`, `deleteAuthorized=false`, `inventoryComplete=false`, `providerLifecycleConfigured=false`. `REVIEW_ONLY` bedeutet **nicht löschen**.

Eingabe pro Objekt: `key`, ISO-`lastModified`, `verified: true`, `restoreTested: true`, `legalHold: false`; dazu `legalHoldKeys` und `restoreReferencedKeys`. Fehlen Informationen, wird `KEEP` mit Grund ausgegeben. Fremde/ungültige Keys, unbekannte Holds, doppelte Inventarzeilen, unplausible Zeitstempel und nicht wiederherstellbare Objekte werden nicht als Kandidaten eingestuft. Mindestens zwei verifizierte Kopien bleiben geschützt. Die Funktion kann **nicht** selbst beweisen, dass eine Inventarliste vollständig ist oder dass eine Restore-Prüfung tatsächlich stattfand; diese Wahrheitswerte sind Betreiberbelege.

Offline-Test (keine Secrets, keine Provider-Zugriffe):

```bash
node --test tooling/ulc-linz-k2-retention-plan.test.mjs
```

## 3. Vor einer späteren Aktivierung zwingend nachweisen

1. Rechtsgrundlage, Zweck und konkrete Aufbewahrungsdauer durch Vereinsverantwortliche genehmigt; P01-Entscheidung zu Backup-Horizont, Minderjährigen, Löschsperren und Nachlauf bestätigt.
2. Exakter Bucket und Prefix, EU-Jurisdiction, vollständiges Objekt-/Versionen-Inventar und Kostenobergrenze dokumentiert. Keine Vermischung von Preview und künftiger Produktiv-DB.
3. Mindestens zwei erfolgreiche, voneinander getrennte Restore-Nachweise, aktuelle Wiederherstellungsfähigkeit, Restore-Quarantäne und Zugriffstrennung dokumentiert.
4. Verifizierbare Hold-Verwaltung und tatsächlicher Provider-Delete inklusive Versionen/Nebenbeständen; **keine einfache TTL als Ersatz**.
5. Medien-Backup-/Löschpfad und Offsite-Kopien unabhängig geprüft. Das K2-`pg_dump` enthält **keine** R2-Mediendateien.
6. Separate schriftliche Betreiberfreigabe für tatsächliche Lifecycle-/Löschaktion. Bis dahin keinerlei automatisierte Löschung.

## 4. Beleggrenzen / Stand

- GitHub K2 Backup #43645974462 und Quarantäne-Restore #43647364218 PASS am 14.11.2026.
- Read-only SQL-Vergleich der damaligen Preview-Quelle und Quarantäne: 62/62 Tabellen, 1.305 Zeilen, 62/62 Datenfingerprints; 472 Spalten, 136 Indizes, 698 Constraints und 4 Sequenzen gleich.
- Das beweist Datenbank-Snapshot-Konsistenz, **nicht** Medien-Wiederherstellung, laufende App-Authentisierung, ACL-Minimalrechte, DSGVO-Freigabe oder die vollständige Kette aller R2-Versionen.
- Draft PR #619 behandelt 64 Tabellen in einer **anderen, noch nicht freigegebenen** P01-Inventur. Keine Gleichsetzung mit den 62 Tabellen des konkreten K2-Snapshots.

**Freigabevorschlag:** Diesen Offline-Entwurf als technische Entscheidungsunterlage abnehmen, ohne daraus eine Provider-Aktivierung oder Löschberechtigung abzuleiten. Weitere Implementierung erst nach fachlicher Freigabe.
