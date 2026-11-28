# T10 – App-Lifecycle-Nachweis, privater Sechs-Modul-Pilot

**Abgegrenzter Geltungsbereich:** circa 30 berechtigte Vereinsnutzer, alle sechs im App-Vertrag definierten Module, private Benutzer-/Trainer-/Athletendaten; **keine privaten erkennbaren Minderjährigenmedien, keine medizinischen Daten, keine ungeprüften Alt-Restores**. Der Betreiber hat die beschränkte manuelle T07-Löschpraxis freigegeben. Alle Fälle ohne eindeutige Owner-/Rechtsgrundlage bleiben STOP. Das ist keine automatische generelle Vollerasure und **kein** T10-Rechts-/Anbieter-/Deploy-GO.

## Bereits nachgewiesene technische Owner-Kette

- `worker/production-protected.ts` und `test/production-protected.test.ts`: im tatsächlichen M6-Production-Refresh die vier serverseitigen Produktionsschreibschutzmodi, privater Medienstore zwingend `null`, keine Preview-Flags, identitätsgebundene Actor-Prüfung. Die getrennte Standard-/Preview-Runtime bleibt unverändert.
- `worker/exercise-catalog-protected-runtime-readiness.ts`, `worker/training-block-verified-runtime-readiness.ts`, `worker/training-documentation-production-readiness.ts`: ausschließlich lesender Exaktrollen-/69-Tabellen-Guard vor Aktivierung, Ablehnung unvollständiger Rollen/Tabellen/SQL-Rechte.
- `test/t07-protected-operator-workflow.test.ts` und `test/t07-protected-operator-harness.test.ts`: nur privat geschützter manuell bestätigter Löschweg, kein Public-HTTP- oder automatisches Purge.
- `test/t07-eight-owner-reconciliation.test.ts`: nach Löschung acht Owner gezielt untersuchen, unbekannte Actor-/Audit-/Media-Reste und alter Restore werden **niemals** als `privacyReady=true` ausgegeben.
- `test/t07-exact-session-note-redaction.postgres.e2e.test.ts` und `test/t07-exact-owner-text-redaction.postgres.e2e.test.ts`: datensatzgenaue Notizredaktion und historische Kommentar-/Revisions-Owner im isolierten PostgreSQL, Fremdmandant und Readback werden geprüft.
- `test/p03-live-training-session-writer-guard.postgres.e2e.test.ts`, `test/training-documentation-postgres-write-guard.test.ts`, `test/p02-verified-block-usage-reconciliation.postgres.e2e.test.ts`: neue App-Anwesenheit/Dokumentation/Usage nur über aktive Berechtigungen/Actor, Subject-/Deletion-Fences und idempotenten Writer.
- `test/p06-fresh-restore-fence-v19.postgres.e2e.test.ts` und `test/p3-cross-owner-restore-admission.test.ts`: ältere Datenbestände dürfen ohne neuere achtfache Löschquellenprüfung **nicht** auf produktiven Writer/Ingress zurückgeführt werden; manuell beschlossene Restore-STOP-Grenze beibehalten.
- `privacy/T07-LOESCHPRAXIS-BETRIEBSANWEISUNG-20261127.md`: fallbezogene Verantwortliche, minimale interne Akte, Ausnahmen, Laufzeit und Nachkontrolle. Lösch- oder Retention-Automatik nicht angeschaltet.
- PRODUKTIONS-Neon, **rein lesend am 28.11.2026**: `neondb`, 69 öffentliche Tabellen, normale App-Rolle `ulc_linz_application`, zugelassene Katalog-/Block-/Doku-Schreibrechte und getrennte nicht erteilte Löschmarker-/Revision-Overwrite-Rechte, zwei aktive Katalog- und zwei Doku-Guard-Trigger. Keine echten Daten gelöscht oder verändert.

## Vorstart und T11-Grenze

Die App-Lifecycle-TECHNIK ist für die ausdrücklich begrenzte **manuell geschützte Pilotpraxis** überprüft. Ein anderes Datenschutz-/Anbieter-/Verarbeitungs-GO wird damit **nicht** abgeleitet; `crossCutting.privacy` bleibt bis zur getrennt dokumentierten, heute vom Betreiber als bereits geklärt bezeichneten Rechts-/Providerbeleg-Verifikation **blocked**. Vor der ersten personenbezogenen Erfassung muss T10 tatsächlich vollständig GO und T11 separat zum Deploy autorisiert sein.

T06/T08 Remote-Rechte/Rollenentzug sind bereits Vorstart-PASS. Die reale erste erfolgreiche Doku-POST/GET-Kette wird einmalig nach T11 beobachtet, **nicht** als künstlicher Vorstartfall erzeugt. Backup EU R2 30 Tage wird weiter überwacht; alte Neon-Branches/Snapshots bleiben ohne vollständigen Re-Deletion-Beleg quarantänisiert. Privater Medienstore bleibt aus. Keine ungeschützten Legacy-Writer, keine direkte Admin-SQL-Ausnahme im normalen HTTP.
