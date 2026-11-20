# ULC Linz – P2 Production Cutover: PASS

**Datum:** 20.11.2026. **Genehmigung:** gesondertes Betreiber-„Ja“ zum P2-Gesamtpaket im Chat. **Umsetzung:** Neon Production-Schema und eng begrenzte App-Rollenrechte. **Nicht enthalten:** Worker-Deployment, öffentliche Freigabe, automatisierte Löschungen.

## Tatsächlicher produktiver Datenbankzustand

- **Neon-Projekt:** `bold-dew-01343606`
- **Default-Branch:** `br-muddy-heart-b1vtydvc` (bestehende Branch beibehalten; keine Branch-Umschaltung)
- **Datenbank:** `neondb`, Eigentümerrolle `neondb_owner`
- **Vorher:** 51 Tabellen, 378 Spalten, 111 Indizes, 141 Datensätze in 15 belegten Tabellen
- **Nachher:** **69 Tabellen, 501 Spalten, 145 Indizes**; unveränderte eine Mitgliedschaft
- **Migration:** **91 vorbereitete Einzel-SQL-Anweisungen in EINER Neon-Transaktion**, erfolgreich COMMITTED; keine Zwischenstände nach draußen sichtbar
- **Operator-SQL-Git-Blob:** `8c57a95d41542053c2fadbb1db9953b4f5ef3907` in `apps/ulc-linz/release/p2-atomic-51-to-69-operator.sql`; Originalmigrationsdateien aus Main `7badb82c640fbb4599db32a9127bd8061369f758`
- Reihenfolge: exakt die 17 in P02-G begründeten fehlenden Owner-Dateien 51→64; Kalender 0016 →66; Katalog 0004 →68; Training Fence 0017 →69; 17 spezifische, vorausgeprüfte GRANT-Anweisungen

## Backup und geprüfter Rückweg

**Neon meldete `snapshots limit exceeded`** für einen zusätzlichen aktuellen Snapshot. Bestehende Sicherungen wurden **nicht gelöscht**. Stattdessen zwei belegte unabhängige Rückwege:

1. **Frisch aus Production erzeugter Point-in-Time-Backup-Branch `br-aged-surf-b1rt45m8`**, angelegt 20.11.2026 19:28 UTC, Parent `br-muddy-heart-b1vtydvc`, LSN `0/37ABF70`. Ein aus diesem Backup abgeleiteter Kind-Branch `br-little-snow-b1yzavs2` wurde erfolgreich von 51 auf 69 migriert. Der Backup-Branch selbst bleibt **unverändert auf 51 Tabellen**.
2. **Neon-Snapshot `snap-odd-hat-b1yz457q`**, angelegt am 20.11.2026 um 13:41 UTC. Server-seitiger Datenvergleich beweist identische 51 Alt-Tabellen/141 Zeilen mit Production vor dem Cutover. Die Sicherung wurde bis **05.12.2026 23:00 UTC verlängert**. Ein realer Restore ohne `finalize` nach `br-floral-dust-b1phhp4u` war erfolgreich (initial 51 Tabellen). Danach bestand dort das **komplette 91-SQL-Atomar-Upgrade** auf 69 Tabellen. **Restored-Testbranch ist jetzt ein 69er Teststand und selbst KEIN 51er Recovery-Backup**; dafür Snapshot bzw. der unberührte frische Backup-Branch verwenden.

**Rückfallregel:** Kein unkontrollierter Restore/Branch-Swap. Falls P3 scheitert, Worker zu letzter freigegebener Version zurück, Änderungen der Production erst nach eigener Freigabe und vorherigem Abgleich der zwischenzeitlichen Daten einschließlich gelöschter Subjekte. Kein Restore darf gelöschte Personen wieder sichtbar machen. Backup-Ressourcen mindestens bis nach Pilotabnahme erhalten.

## Umfassende Post-Cutover-Verifikation (Production, read-only)

- Auf allen **51 Originaltabellen** wurden ausschließlich die ursprünglichen Production-Spalten normalisiert und serverseitig geordnet gehasht. **51/51 Fingerprints identisch** zum aktuellen Backup, **141/141 Zeilen erhalten**, 15 nichtleere Tabellen. Auch die zuvor migrierte Snapshot-Testkopie ist 51/51 identisch. **Keine personenbezogenen Zellinhalte exportiert.**
- Aus `information_schema`: **69 Tabellen, 501 Spalten, 145 Indizes**.
- Drei aktiven Training-Fence-Trigger stehen korrekt auf der Schutzfunktion; neuer Trainings-Subjekt-Löschmarker existiert.
- Als gewöhnliche SQL-Anwendungsrolle `ulc_linz_application`: **keine** SELECT/INSERT/UPDATE/DELETE-Rechte auf `public.ulc_linz_training_subject_deletion`.
- **17 neue Tabellen-GRANTs**, **39/39 einzelne App-Berechtigungen PASS**.
- Auf allen 51 Alt-Tabellen ist jede der **255** geprüften Kombinationen aus fünf Rechtearten (SELECT, INSERT, UPDATE, DELETE, TRUNCATE) unverändert; vor/nachher **198** tatsächlich erteilte Kombinationen, **0 Abweichungen**.

## Strikte Trennung P2/P3

**P2 Datenbankmigration PASS. Kein Worker-Deployment durch dieses Paket.** Der bislang geprüfte Preview-Worker und sein Stand bleiben unverändert; kein öffentliches Production-Ingress freigeschaltet.

Für **P3** vor Nutzerfreigabe:
- Private Production-Worker-Konfiguration auf freigegebenem Git-SHA, exakter Neon-Anwendungsrolle und Production-Branch verifizieren (kein Alias zur Preview-DB).
- Manuell ausgelöster privater Worker-Deploy `m6-ulc-private-production-deploy.yml` nach gesonderter Freigabe, ohne öffentliche Exposition.
- Handy-Pilot: Anmeldung, Rollen, Traineranwesenheit, U12/U14/Kindertraining, IRG Selbstanmeldung, Übungskatalog, Blöcke, Pläne, Dokumentation und Autosave.
- Die datenschutz-/rechtlich noch ungeklärten `pending`-Lösch-, Freitext-, Medien-, R2- und No-Resurrection-Regeln bleiben `fail-closed`; **keine automatischen Purges** bis eigenständiger Entscheidung.

**Keine Production-Datenbankänderungen mehr ohne gesonderte Freigabe.**
