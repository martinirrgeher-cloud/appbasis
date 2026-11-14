# P02-E – Übungskatalog: Datei beim Anbieter löschen, erst dann SQL abschließen

**Datum:** 14.11.2026 · **Status:** ISOLIERTER SECURITY-ENTWURF / TESTS / KEINE PRODUKTIV-INTEGRATION. Basis ist der vierfache PostgreSQL-Lückennachweis in [P02-D PR #620](https://github.com/martinirrgeher-cloud/appbasis/pull/620), auf dem dieser PR absichtlich aufsetzt.

## Konkrete Lücke und neue Alternative

Aktuell lässt der produktionsfähige Standard-Owner `PostgresExerciseCatalogRepository.completePrivateMediaDeletion()` die SQL-Metadaten entfernen, sobald `deletion_requested_at IS NOT NULL` gilt. **Die externe Datei muss dabei nicht gelöscht worden sein.** Die bestehende ULC-Runtime enthält weiterhin einen direkten Aufruf dieser SQL-Methode; das ist **nicht behoben**, solange sie nicht vollständig ersetzt wird.

Neuer opt-in Prototyp: `modules/exercise-catalog/src/private-media-deletion-coordinator.ts`, aus `@appbasis/exercise-catalog` exportiert, aber **nirgendwo in eine Live-/Preview-HTTP-Route, Cron, Worker, SQL-Trigger oder eine Default-Servicefunktion eingebaut**.

Der Ablauf:

1. `requestPrivateMediaDeletion(organizationId, exerciseId, mediaId)` markiert die zutreffende Metadatenzeile als pending. Organisation, Übung, Medium und `storageKey` werden gegen den angeforderten Scope validiert. Nicht vorhandene Zeilen ergeben `metadata-not-found`, ohne einen Provider anzurufen.
2. Der vorerst **nur simulierte** Storageadapter wird mit dem exakten Scope (Organisation, Übung, Medium, Speicherpfad) zum Löschen aufgerufen. Die Antwort muss einen passenden Schlüssel und `delete-accepted` oder `already-absent` bestätigen. Ein Fehler führt zu keinem SQL-Finalize.
3. **Unabhängig von der Löschantwort** muss ein zweiter Provideraufruf das tatsächliche Nichtvorhandensein **des gleichen Speicherpfads** bestätigen (`status=absent`). `present`, `indeterminate`, Providerfehler oder Schlüsselabweichungen führen zu keinem Metadatenabschluss.
4. Erst dann darf die bereits vorhandene `completePrivateMediaDeletion` ausgeführt werden. Liefert sie `false`, wird der Erfolg **nicht** behauptet (`metadata-delete-race`). Providerfehlertexte werden redigiert; bei Ausfall bleibt der `deletion_requested_at`-Eintrag für einen überprüfbaren erneuten Versuch erhalten.

## Testnachweise

- **10 Offline-Vitest-Fälle:** normale Löschung, Wiederholbarkeit, fehlendes Medium, vorhandenes Objekt nach Delete, unbestimmter HEAD, falscher Speicherpfad, fremde Organisation, Provider-Ausfall und erneuter Versuch, Ausfall beim HEAD, Metadaten-Finalize-Race/Fehler sowie ungültige Eingaben. *(Anzahl der konkreten `it()`-Blöcke ist 10.)*
- **3 zusätzliche echte isolierte PostgreSQL-E2E**, im bestehenden `p02-catalog-retention-negative.postgres.e2e.test.ts`: (A) SQL-Zeile bleibt nach Fake-Provider-Delete ohne unabhängige Bestätigung gespeichert und wird bei Retry erst nach bestätigter Abwesenheit entfernt, (B) Provider-Ausfall lässt `deletion_requested_at` als Pending für Retry bestehen, (C) gleiches Medium-ID in anderer Organisation bleibt erhalten.
- Die **vorhandenen vier P02-D-Negativtests bleiben unverändert aussagekräftig**: sie beweisen den unsicheren direkten SQL-Finalize-Bypass weiter. Das ist beabsichtigt. Kein falsch positives `production-ready`-Urteil.

## Was für den echten Betriebsnachweis fehlt

- **Storageprovider und Autorisierung**: realer Anbieter (Cloudflare R2, anderes System) und echte `deleteExactObject`-/`verifyExactObjectAbsence`-Implementierung müssen separat nachgewiesen werden. Ein Fake, der nur `absent` behauptet, ist kein physischer Löschbeleg; dieser Prototyp authentifiziert keine Provider-Belege und kann sie nicht aus sich heraus garantieren.
- **Lösch-/Neu-Upload-Rennen**: Ohne am Speicheranbieter erzwungenes Version-/Generation-Matching, Objekt-Ownership, Write-Fence und idempotenten Provider-Betrieb kann eine Datei zwischen HEAD und SQL-Abschluss neu entstehen. Ein späterer Produktionspatch muss dies verhindern und den tatsächlichen vollständigen Löschstatus über längere Provider-Retention-/Backups prüfen.
- **Alle anderen Writer**: Der direkte SQL-Pfad bleibt vorhanden. Der neue Coordinator darf nicht als Sicherheitsbeweis missbraucht werden, solange keine freigegebene App-/Modul-Integration jeden Metadatenabschluss absichert (ggf. DB-Gate gegen Direkt-SQL).
- **D1/D2/D3/Kindermedien**: keine neuen identifizierbaren privaten Medien von Minderjährigen, solange Rechtsgrundlage, AVV, physische Löschung, Zugriffskontrolle und Restore-Checkpoints offen sind. P01-Fristen/35-Tage-Marker und Produktivfreigabe unverändert.
- **Weitere P02-Blocker**: Favoriten nach Principal-Löschung wieder anlegbar; personalisierte Usage/Notiz und Legacy-Ownership nicht geschlossen. Diese sind separat zu lösen, bevor Übungskatalog auf `ready` gesetzt werden kann.

**Dieser Patch greift weder auf echte Medien/Neon/Google Drive zu noch führt er ein Deployment, einen Merge, einen PR-Push nach Main oder eine Produktiv-Löschung aus.** Erfolg der CI bedeutet nur, dass der **isolierte alternative Ablauf** getestet wurde, nicht dass der aktive Worker sicher ist.
