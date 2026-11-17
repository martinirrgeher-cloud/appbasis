# K2-A09 – Branch-Checkpoint statt Neon-Snapshot (17.11.2026)

**Bereits ausgeführt (durch Betreiber für eine Sicherung + isolierte Wiederherstellungsprobe freigegeben):** Nur ein neuer Neon-Kind-Branch vom **K2-Quarantäne-Branch** wurde angelegt und read-only geprüft. **Kein Snapshot**, kein `restore_snapshot`, kein `finalize_branch_restore`, keine Datenbank-SQL-Schreiboperation, kein Merge, kein Worker-/App-Deployment.

## Wichtige Provider-Einschränkung

Der Versuch, einen Snapshot **des K2-Branches** via Neon zu erstellen, wurde vom Provider mit **HTTP 400: `not allowed to snapshot non-root branch`** abgewiesen. Es wurde dabei kein Snapshot angelegt. Der **einzige frühere** manuelle Snapshot ist vom Neon-**Hauptbranch** vom 08.11. und damit **nicht** der K2-Rückfallpunkt. Ein Snapshot vom Hauptbranch darf auch als Workaround **nicht** erstellt oder zurückgespielt werden.

Der erste Versuch zur Erstellung eines Kind-Branches mit geändertem Suspend-Timeout wurde ebenfalls von Neon blockiert (**HTTP 412: `modifying the suspend interval is not permitted on this account`**). Die dann erfolgreich angelegte Kopie verwendet deshalb Neon-Standard-Compute-Einstellungen; **etwaige Ressourcen-/Compute-Kosten** beobachten.

## Erfolgreich angelegte physisch separate K2-Kopie

| Feld | Wert |
| --- | --- |
| Neon-Projekt | `cool-unit-46141580` |
| Ursprünglicher isolierter K2-Branch | `br-small-wind-b10p67j8` |
| Neuer unabhängiger Kind-Branch | `br-solitary-violet-b1advl8z` |
| Name | `ulc-k2-pre-rights-repair-checkpoint-20261117` |
| Parent | **exakt** `br-small-wind-b10p67j8` |
| Point-in-time Parent-LSN | `0/6EA7508` |
| Erstellt | `2026-11-17T20:42:15Z` |
| Neon-Zustand | `ready`, `default=false` |
| Alte Branches ersetzt? | **nein** |

Das ist ein **Neon Copy-on-write-Kind-Branch** (Point-in-time-Datenzweig im selben Projekt), **kein unabhängiges externes Backup** und auch keine bereits erprobte automatisierte Rücksetzung des ursprünglichen Branches.

## Schonende Compute-Nachbereitung

Neon legte zur Prüfung einen Read-write-Compute `ep-calm-mountain-b18rzgrx` mit minimal/maximal **0,25 CU** und `suspend_timeout_seconds=0` (keine automatische Abschaltung) an. Nach Abschluss sämtlicher Leseprüfungen wurde **ausschließlich dieser neue Compute** manuell suspendiert; `list_branch_computes` meldete danach `current_state=idle` sowie `suspended_at=2026-11-17T20:48:02Z`. Der Branch bleibt `ready` und seine drei Datenbanken bleiben erhalten. Ein erneuter Zugriff kann den Compute wieder aktivieren. **Storage- und spätere Compute-Kosten sind damit nicht ausgeschlossen**; keine bestehenden oder produktiven Endpunkte wurden angehalten.

## Tatsächliche Wiederanlaufprobe: drei Datenbanken ohne DML

Mit separaten **SELECT**-Abfragen gegen den alten K2-Branch und die neue Kopie wurden die folgenden Objekte/ACL-Merkmale verglichen:

| Datenbank | Alter K2-Branch | Neuer Sicherungs-Branch | Ergebnis |
| --- | --- | --- | --- |
| `ulc_linz_k2_restore_quarantine` | 62 Tabellen, 4 IDENTITY-Sequenzen, 2 Funktionen | identische Zähler und Rollen-/ACL-Metadaten | **PASS** |
| `appbasis_ulc_linz_preview` (im K2-Branch) | 66 Struktur-Objekte, 2 Funktionen | derselbe aggregierte Objekt- und Funktions-Digest | **PASS** |
| `neondb` | 2 Struktur-Objekte, 0 Funktionen | derselbe aggregierte Objekt-Digest | **PASS** |

In der K2-Datenbank separat anhand von `tooling/ulc-linz-k2-operator-admission-readonly.sql` **vollständig identisch:** 66 Relation-/2 Funktions-Owner, 4/4 interne IDENTITY-Abhängigkeiten, alter hochprivilegierter Restore-Owner, 0 neue Owner-Rollen, 0 explizite Relation-ACLs, 0 `PUBLIC`-/App-`EXECUTE`, 0 App-/Backup-`SELECT`, eine sichere `SECURITY DEFINER`-Funktion. Der Funktions-Definitions-Digest blieb `f096a8e6786da42145aa56c2a6e61d87`.

Die zwei zusätzlichen Datenbanken wurden ausschließlich über **Objekt-/Funktionsmetadaten und Rollen** verglichen. **Tabellenzeilen und Medien wurden nicht einzeln geprüft**, auch nicht auf externer Storage-Ebene. Das ist kein vollumfänglicher Restore-Test nach einem Ausfall.

## Abnahme der Rückfallstrategie

Der ursprüngliche **snapshot-only**-Gate `tooling/ulc-linz-k2-backout-gate.mjs` bleibt korrekt **BLOCK**, weil Neon kein Snapshot des nicht-root K2-Branches zulässt. **Für die tatsächlich realisierte branchbasierte Alternative** prüft `tooling/ulc-linz-k2-checkpoint-branch-gate.mjs` offline die konkrete Parent-/Child-Lineage, `parent_lsn`, exakte drei Datenbanknamen samt Owner und die heute tatsächlich verifizierten Metadaten-Digests. Er gibt allenfalls `CHECKPOINT_BRANCH_METADATA_MATCH_ONLY`, **niemals** eine SQL-/Restore-/Finalize-/Merge-/Deployfreigabe. Bei Katalog-/Berechtigungsdrift: **BLOCK**.

**Notfall nach späterer Rechte-Reparatur:** K2-Anbindungen weiterhin gesperrt lassen, Nach-Commit-Zustand lesen, von diesem *unveränderten Kind-Branch* bei Bedarf einen **zusätzlichen** Prüf-Branch erzeugen oder eine neue Quarantäne-Verbindung gezielt vorbereiten. **Nicht** den originalen K2-Branch oder gar die produktive Preview via `finalize_branch_restore` austauschen. Da im K2-Branch drei Datenbanken liegen, würde ein kompletter Branch-Wechsel auch die anderen beiden Datenbanken zurücksetzen. Jede künftige Branch-Umschaltung und jede Rechtekorrektur benötigen **eigene** Betreiberfreigaben und eindeutige physische Zielprüfung.

## Nächste eigenständige Freigabe

Die Branch-Kopie wurde angelegt und lesend geprüft. Für eine **atomare Rechtekorrektur** auf `ulc_linz_k2_restore_quarantine` auf dem **ursprünglichen K2-Quarantäne-Branch** gibt es noch **keine** Schreibfreigabe. Geplant sind exakt 64 eigenständige Owner-Wechsel + 4 gekoppelte Sequenzen und 329 gezielte Nicht-Owner-Privilegien. Temporäre `SET ROLE`-/Schema-`CREATE`-Erlaubnisse erfordern Neon/PostgreSQL-18-Kompatibilitätsprüfung, anschließend müssen sie wieder entzogen werden. Nach Commit unabhängiger ACL-Vergleich und negative App-/Medientests. Bis zum abgeschlossenen Test bleibt K2 **NO-GO**.

**Siehe:** [K2-Tracking #640](https://github.com/martinirrgeher-cloud/appbasis/issues/640), [Draft PR #642](https://github.com/martinirrgeher-cloud/appbasis/pull/642).
