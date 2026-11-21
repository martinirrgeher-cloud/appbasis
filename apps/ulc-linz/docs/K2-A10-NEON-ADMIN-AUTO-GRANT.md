# K2-A10 – Neon/PostgreSQL 18: automatische Rollenmitgliedschaft blockiert strikte Owner-Freigabe

**Stand 17.11.2026: BLOCK, keine Rechteänderungen übernommen.** Dies ist der tatsächliche Befund nach einem vom Betreiber ausdrücklich für die isolierte K2-Datenbank freigegebenen atomaren Reparaturversuch.

## Was tatsächlich geschah

Auf der exakt ausgewählten Neon-Quarantäne `cool-unit-46141580` / Branch `br-small-wind-b10p67j8` / Compute `ep-snowy-fog-b1xzh562` / DB `ulc_linz_k2_restore_quarantine` wurde der SHA-gepinnte Quellvertrag mit **64 direkten Owner-Anweisungen**, vier Tabellen-gebundenen IDENTITY-Sequenzen, **146 GRANT-Gruppen / 329 spezifischen Berechtigungen** kompiliert. Der gesamte Ablauf lag in einem **einzigen** `run_sql_transaction`-Aufruf mit 223 Schritten, fail-closed Vor-/Nachkontrolle, `lock_timeout=3s`, `statement_timeout=120s`. Die 64 Owner- und 146 GRANT-Befehle liefen innerhalb der Transaktion, aber die abschließende Prüfung stoppte mit `K2_POST_TEMP_PRIVILEGES_LEFT`. Die gesamte Transaktion wurde **zurückgerollt**, nicht committet.

Der Rückfall wurde unabhängig read-only überprüft: **0 neutrale Rollen**, weiterhin 66 Relations-/2 Funktionsobjekte beim Restore-Owner, **0** Relation-/Spalten-ACLs, **0** App-/Backup-SELECT. Keine Tabellenzeilen, Athleten- oder Trainingsdaten gelesen. Sicherungs-Branch `br-solitary-violet-b1advl8z` blieb unverändert, Cloudflare unverändert.

## Exakte Ursache – reproduzierbare Diagnose mit absichtlichem ROLLBACK

PostgreSQL 18 gibt einem `CREATEROLE`-Benutzer automatisch eine ADMIN-Mitgliedschaft in jeder von ihm erzeugten Rolle, `SET FALSE` und `INHERIT FALSE`. Auf Neon wurde diese Mitgliedschaft von der internen Plattformrolle **`cloud_admin`** erteilt:

| Element | Wert |
| --- | --- |
| Neue, nur transaktional vorhandene Rolle | `ulc_linz_k2_object_owner` |
| Automatisch berechtigter Benutzer | `ulc_linz_k2_restore_owner` |
| `pg_auth_members.grantor` | `cloud_admin` |
| `admin_option` | `true` |
| `inherit_option` | `false` |
| `set_option` | `false` |

Die selbst erteilte temporäre `SET TRUE`-Berechtigung konnte mit `REVOKE` wieder zurückgenommen werden; **die vom Provider stammende ADMIN-Mitgliedschaft blieb bestehen**. Das temporäre `CREATE ON SCHEMA public` wurde nachweislich entfernt (`hascreate=false`, direkte `CREATE`-Grants 0). Eine danach isoliert getestete, explizite `REVOKE ... GRANTED BY cloud_admin`-Operation scheiterte erwartungsgemäß mit `permission denied to revoke privileges granted by role cloud_admin`.

Alle Nachforschungs-Diagnosen wurden mit absichtlich geworfenem Fehler ebenfalls **vollständig zurückgerollt**. Eine eigenmächtige Ausweitung der Neon-Adminrechte, ein Wechsel auf `cloud_admin` oder Provider-Workaround fand nicht statt.

Referenz: [PostgreSQL 18 – Role Attributes](https://www.postgresql.org/docs/18/role-attributes.html) und [REVOKE](https://www.postgresql.org/docs/18/sql-revoke.html).

## Konsequenz

Die alte Freigabe verlangte eine NOLOGIN-Neutralrolle **ohne jede alte Eigentümer-Mitgliedschaft**. Diesen Zustand können wir mit den vorhandenen Neon-Berechtigungen nicht erzielen. Der fehlgeschlagene Reparaturversuch darf **nicht** einfach mit schwächerem Nachtest erneut ausgeführt werden. Zwei mögliche fachliche Architekturentscheidungen sind:

**A. Eng begrenzte Neon-Admin-Ausnahme nur für isolierte K2-Testdatenbank (empfohlen, falls Restore-Test rasch fortgesetzt werden soll):** Die automatisch von `cloud_admin` vergebene eine **ADMIN-ONLY-Mitgliedschaft** für `ulc_linz_k2_restore_owner` wird als *explizite Provider-Ausnahme* akzeptiert, **nicht** als Runtime-Zugriffsrecht. Die neue Objektrolle bleibt `NOLOGIN`, `NOCREATEROLE`, `NOCREATEDB`, `NOBYPASSRLS`, `NOINHERIT`, `NOSUPERUSER`. Die Ausnahme muss exakt `grantor=cloud_admin`, `admin=true`, `set=false`, `inherit=false` nachweisen; alle weiteren Mitglieder (insbesondere App, Security-Ingest, Backup) bleiben verboten. Beachten: Der Restore-Owner ist weiterhin ein hoch privilegierter Admin und kann mit `ADMIN TRUE` später `SET` neu vergeben; **vollständige Admin-Isolation ist damit ausdrücklich NICHT bewiesen**. Die unerreichbaren Null-Mitgliedschaft-Postchecks müssten durch den exakten Cloud-Admin-Ausnahme-Postcheck ersetzt werden. **Vorher neue, ausdrückliche Betreiberfreigabe einholen.**

**B. Keine Provider-Ausnahme akzeptieren:** Keine neutrale Rolle mittels des bisherigen `CREATEROLE`-Benutzers erzeugen; stattdessen Neon-eigene Berechtigungs- oder bereits vorhandene Owner-/Migration-Rollenstrategie grundlegend neu planen. Auch das wäre eine **neue Sicherheitsarchitektur** und ist nicht von der bisherigen Freigabe gedeckt.

## Automatischer Fail-closed-Gate

`tooling/ulc-linz-k2-neon-role-auto-grant-gate.mjs` bewertet die diagnostizierte Mitgliedschaft. Ohne neue explizite Entscheidung lautet das Resultat zwingend `BLOCK`; falscher `grantor`, ein zweites Mitglied, `SET TRUE`, `INHERIT TRUE` und fehlender Rückfall- oder Zielnachweis blockieren ebenfalls. Selbst mit einer späteren Risikoausnahme gibt der Prüfer **niemals** selbst einen Datenbank-Write, Merge oder Deploy frei.

**Status:** K2-Quarantäne weiterhin NO-GO, ursprüngliche ULC-App unverändert, Draft PR [#642](https://github.com/martinirrgeher-cloud/appbasis/pull/642) weiterhin ohne Merge. Kein eigenmächtiges Nachgeben bei Schutzbedingungen.
