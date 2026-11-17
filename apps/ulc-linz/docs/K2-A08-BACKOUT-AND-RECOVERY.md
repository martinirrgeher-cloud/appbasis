# K2-A08 – K2-Restore: Vor-Commit- und Nach-Commit-Rückfall (17.11.2026)

**Status: Review-only. Keine Neon-Snapshots oder Restore-Aktionen angelegt/ausgeführt; keine Datenbankrechte geändert.** Dieses Dokument gilt ausschließlich für das isolierte K2-Ziel, nicht für die laufende ULC-Preview-/Produktiv-App.

## Tatsächliche aktuelle Neon-Evidenz (nur gelesene Projektmetadaten)

- Projekt: `cool-unit-46141580`
- K2-Branch: `br-small-wind-b10p67j8` (`ulc-k2-restore-quarantine-20261114`)
- K2-Compute: `ep-snowy-fog-b1xzh562`; Quarantäne-Datenbank: `ulc_linz_k2_restore_quarantine`
- **Auf demselben Branch befinden sich drei Datenbanken:** `appbasis_ulc_linz_preview`, `neondb`, `ulc_linz_k2_restore_quarantine`. Eine Branch-weite Wiederherstellung kann daher **alle drei** Datenbanken zurückversetzen, auch wenn nur die letzte repariert werden soll.
- Neon-Snapshot-Liste am 17.11.: **ein manueller Snapshot** `snap-ancient-voice-b1y0mz7b` vom **Hauptbranch** `br-delicate-surf-b1eu6ikn`, erstellt **08.11.2026**. **Kein Snapshot** des Quarantäne-Branches vorhanden.
- Automatischer Snapshot-Zeitplan des Quarantäne-Branches: **leer**. Ein bestehender Hauptbranch-Snapshot darf niemals als K2-Backout-Nachweis gelten.

## Zwei getrennte Fehlerfälle

**A – Fehler innerhalb der noch offenen Transaktion.** Die ausschließlich nach einer späteren konkreten Betreiberfreigabe auszuführende K2-Owner-/GRANT-Reparatur muss in einer vollständig begrenzten PostgreSQL-Transaktion liegen. Vor einem Commit sind die 64 direkten Owner, vier indirekt mitgeführten Identity-Sequenzen, 329 Rechte und geschützte Funktionen zu kontrollieren. Bei **jeder** Abweichung: `ROLLBACK`, unabhängiger erneuter Read-only-Katalogcheck. Keinen teilweise reparierten Zustand akzeptieren. Der alte hochprivilegierte Owner darf nicht unbesehen Runtime-Zugriff erhalten.

**B – Problem nach erfolgreichem Commit.** PostgreSQL `ROLLBACK` ist dann nicht mehr möglich. Ein unabhängiger K2-Branch-Snapshot vor dem Eingriff ist dafür der Rückfallpunkt. Das ist eine **andere** Operation als ein SQL-Rollback.

## Einmaliges Betreiberverfahren (neue ausdrückliche Freigaben erforderlich)

1. **Unmittelbarer Zielabgleich (lesen):** Neon-Projekt, physische Branch-/Compute-ID, exakt drei Datenbanken und K2-Quarantäne-DB prüfen. Der aktuelle `tooling/ulc-linz-k2-operator-admission-readonly.sql` muss `CATALOG_MATCH_ONLY` ergeben. Quellvertrag 329/329 ist am 17.11. gegen Preview verifiziert; unmittelbar vor der eigentlichen Reparatur bei Bedarf auf Drift überprüfen.
2. **K2-Snapshot erstellen (separate Genehmigung für Neon-Ressourcenschreibaktion):** den **K2-Branch `br-small-wind-b10p67j8`** vor jeder DDL-Reparatur snapshotten, mit eindeutigem Namen wie `ulc-k2-before-permissions-repair-<datum>`. Als eigene Provider-Aktion protokollieren: Snapshot-ID, `source_branch_id`, Erstellungszeitpunkt, Ablaufdatum (nicht kurz vor Ablauf), Projekt-/Branch-ID und Umfang von drei Datenbanken. Niemals von `main` snapshotten und nie die K2-Test-DB mit einer anderen gleichnamigen DB verwechseln.
3. **Fail-closed-Snapshot-Prüfung:** `tooling/ulc-linz-k2-backout-gate.mjs` ist ein offline auswertbarer Metadatenprüfer. Er verlangt explizit gewählte neue Snapshot-ID, **dieselbe K2-Branch-ID**, exakt die drei Datenbanknamen, `manual=true`, ein höchstens zwei Stunden altes Exemplar und keine unmittelbar ablaufende Sicherung. Der Prüfer kann nur `SNAPSHOT_METADATA_MATCH_ONLY` ergeben, nie eine automatische Schreibfreigabe. Ein Snapshot aus dem Hauptbranch wird explizit abgewiesen.
4. **Nachweis für Wiederherstellbarkeit:** den K2-Snapshot **nur auf einem getrennten, neu angelegten Branch** isoliert wiederherstellen (`finalize=false`, eigener Genehmigungsschritt). Dort alle drei logischen Datenbanken einschließlich K2-ACLs, geschützter Funktionen und Zugriffstrennung im Katalog vergleichen. **Nicht** mit `finalize=true` an der ursprünglichen Quarantäne ersetzen. Eigenes Protokoll für erfolgreichen Wiederherstellungstest, Branch-ID und Datum; ggf. entstandene Neon-Kosten beachten.
5. **Ausführung der Rechte-Reparatur (erneute konkrete Freigabe):** nur nach erfolgreichen Vorbedingungen eine kontrollierte atomare Transaktion auf der isolierten K2-DB (neutrale `NOLOGIN`-Ownerrolle, temporäre `CREATE`-/Rollenberechtigungen, 64 Owner-Anweisungen + 4 verknüpfte Sequenzen, genau 329 Rechte). Temporäre Rechte **vor COMMIT** wieder entziehen, den Owner-/ACL-/Funktions-/Membership-Nachtest erzwingen; sonst `ROLLBACK`. Kein Worker-Routing auf K2.
6. **Post-Commit-Negativtests:** direkte und effektive ACLs, `PUBLIC EXECUTE=0`, keine Owner-Erreichbarkeit für App/Backup, funktionsbezogene `SECURITY DEFINER`-Ausführung nur nach gesondertem Review, getrennte isolierte App-/Medien-Restore-Tests. Bis dahin bleibt Produktivstart **NO-GO**.
7. **Post-Commit-Notfall:** Änderungen am K2-Branch stoppen, Cloudflare-Bindings nicht verändern, den zuvor erfolgreich erprobten Snapshot **wieder zunächst separat als neuen Branch** herstellen und den vorherigen K2-Zustand dort auswerten. **Ein physisches Finalisieren/Tauschen des alten K2-Branches** (Compute-Neustart; möglicherweise alle drei Datenbanken betroffen) ist ausdrücklich **eine separate, hochriskante Betreiberentscheidung**, die niemals automatisiert oder aus diesem Draft ausgelöst wird. Alternativ nur eine anschließend separat freigegebene rollenbezogene Gegenreparatur mit Nachtest. Den ursprünglichen Preview-/Produktivbranch niemals zurücksetzen.

### Freigabeschwellen

| Befund | Bedeutung |
| --- | --- |
| Aktuell: kein K2-Snapshot | **BLOCK für sämtliche DB-Reparaturwrites** |
| K2-Snapshot erstellt, Metadaten passend | Notwendiger Rückfallpunkt, **noch keine Write-Freigabe** |
| Snapshot auf getrenntem Branch verifiziert, Rollen-/Transaktionsplan fachlich genehmigt | Bereit für **konkrete** Operator-Entscheidung |
| Rollen-/Grant-Reparatur mit unabhängigem Nachtest erfolgreich | Nur K2-DB-Reparaturabnahme, keine App-/Produktivfreigabe |
| End-to-End-, Medien- und Zugriffstests erfolgreich | Separates App-Restore-Go/No-Go |

**Technischer Stand:** bestehender Draft [#642](https://github.com/martinirrgeher-cloud/appbasis/pull/642), Issue [#640](https://github.com/martinirrgeher-cloud/appbasis/issues/640). Der leere K2-Snapshot-Zustand wurde direkt über Neon-Projektlisten festgestellt, nicht aus einer historischen Bildschirmaufnahme. Es wurde weder eine Sicherung erstellt noch eine Wiederherstellung ausgeführt.

Quellen zur Funktionsweise: [Neon Snapshots](https://neon.com/blog/announcing-neon-snapshots-a-smoother-path-to-recovery), [PostgreSQL ALTER TABLE](https://www.postgresql.org/docs/18/sql-altertable.html).
