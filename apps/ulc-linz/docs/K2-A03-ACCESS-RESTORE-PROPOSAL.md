# K2-A03 – Wiederherstellung der Zugriffsrechte (Entscheidungs- und Testentwurf)

**Datum:** 15.11.2026 · **Status:** HARD NO-GO für App-Anbindung der K2-Quarantäne · **Keine DB-Rechteänderung freigegeben.**

## Nachweis aus echten Neon-Katalogen

Die K2-Preview-Quelle und die separate K2-Restore-Datenbank wurden über **explizit ausgewählte Neon-Branches und Datenbanknamen** ausschließlich mit `SELECT` auf `pg_catalog` verglichen. Die Abfrage las **keine personenbezogenen Tabellenzeilen**, keine Secrets und keine R2-Inhalte. Das SQL in `tooling/ulc-linz-k2-acl-object-readonly.sql` ist wiederholbar; der zugehörige Offline-Evaluator verarbeitet nur außerhalb der App ermittelte Kataloginventare.

| Katalogumfang | Quelle | K2-Quarantäne |
| --- | ---: | ---: |
| Tabellen | 62 | 62 |
| Sequences | 4 | 4 |
| Routinen | 2 | 2 |
| besonders geschützte Spalten (Security-Event/Trainer-Audit) | 26 | 26 |
| Objektidentitäten insgesamt | 94 | 94 |
| ausgewertete Rolle×Objekt×Recht-Einträge | 3.864 | 3.864 |

**Ergebnis des vollständigen Objektabgleichs:**
- **373 erforderliche Privilegzellen fehlen** im Restore (u. a. App SELECT/INSERT 61 Tabellen; App UPDATE/DELETE 60 Tabellen; Backup SELECT 62 Tabellen; eingeschränkte Spalten- und Sequences-Rechte).
- **14 zusätzlich erlaubte EXECUTE-Zellen** für die **zwei** Datenbankroutinen, weil `proacl IS NULL` wieder die PostgreSQL-Standardrechte einschließlich **PUBLIC EXECUTE** bewirkt. Die Zahl 14 bezeichnet sieben geprüfte Rollen/PUBLIC mal zwei Routinen, **nicht** 14 unabhängige Routinen.
- **94 Eigentümerzuordnungen weichen ab**; bei einem `pg_restore --no-owner --no-acl` ist dies erwartbar, aber ohne explizit geprüftes Owner-Konzept kein gleichwertiger App-Restore.
- Kein fehlender oder zusätzlicher Objekt-/Rollen-/Recht-Schlüssel im verwendeten Inventarumfang. **Wichtig:** Die Matrix prüft effektive Privilegien ausgewählter Rollen, nicht zusätzlich alle `GRANT OPTION`-Flags, Default-ACLs, externe Runtime-Bindings oder vollständige Rollenhierarchien.

### Besonders kritischer Befund

Die Routine `public.appbasis_ulc_linz_purge_expired_security_events()` besitzt `SECURITY DEFINER` und kann abgelaufene Sicherheitsprotokolle löschen. In der Preview-Quelle ist ihre Ausführung über PUBLIC und die geprüften Runtime-Rollen untersagt. Im Restore haben PUBLIC und sämtliche sechs geprüften Rollen aufgrund der Standard-ACL das Recht `EXECUTE`. Die zweite Funktion `public.ulc_linz_registration_calendar_guard()` ist ebenfalls im Restore für PUBLIC ausführbar, obwohl die Quelle dies nicht erlaubt.

Dies ist eine **unerwünschte Privilegienaufweitung in der isolierten Restore-Datenbank**; es liegt kein Nachweis vor, dass ein Angreifer darauf zugreifen konnte. Die K2-Quarantäne hat zwar einen separaten Neon-Branch und Compute-Endpunkt, aber die tatsächliche Nichtanbindung an Cloudflare-Routen/Hyperdrive ist **noch nicht unabhängig geprüft**. Bis dahin: **kein App-Start, kein öffentlicher oder interner Worker-Zugriff, kein Smoke-Test mit Schreibfunktion gegen K2**.

## Technischer Designvorschlag für späteren, separat freizugebenden Rechteaufbau

**0 – Verbindliches Ziel und Schutzgrenze.** Betreiber bestätigt schriftlich K2-Branch, **die separate Restore-Datenbank** und ihren Compute. Auf demselben Branch liegt noch eine geklonte Preview-Datenbank; ein alleiniger Branch-Check wäre gefährlich. Cloudflare-Routen, Worker-/Hyperdrive-Bindings und Scheduler werden unabhängig als nicht verbunden bestätigt. Keine Secrets/Hostnames in Logs.

**1 – Fail-closed Privilegienbereinigung zuerst.** Nur auf ausdrücklich erlaubtem Quarantäne-Ziel den unbeabsichtigten `PUBLIC EXECUTE`-Zugriff auf beide Routinen sowie jeden weiteren unerwarteten Ausführungszugriff nach einem eigens reviewed, transaktionalen und wiederholbaren Rechteplan beseitigen. **Kein blanket `GRANT ALL`**, kein Zugriff auf den Preview-Quellbranch. Dieses Dokument und die PR **enthalten bewusst keinen ausführbaren Patch/Apply-Workflow**.

**2 – Abweichende Ownership als Zielmapping reviewen.** Ursprünglicher Preview-Migration-Owner und isolierter Restore-Owner haben unterschiedliche Rollen. Besitzerrechte, `SECURITY DEFINER`-Kontext, Funktions-Owner, Schema-/Sequenz-Owner und Grantor-Ketten müssen getrennt gegen die vorgesehenen K2-Quarantäne-Rollen abgeglichen werden. Ein blindes Owner-Kopieren aus der Quellumgebung kann die Isolation beschädigen.

**3 – Least-Privilege-Grant-Matrix nur aus überprüften Verträgen aufbauen.** Die vorhandenen Verträge `tooling/ulc-linz-d4-preview-database-access.mjs`, `apps/ulc-linz/preview-migrations/0000_d4_security_role_isolation.sql` sowie `apps/ulc-linz/migrations/0003_ulc_linz_security_event_access.sql` enthalten besondere Ausnahmen:
- App: eingeschränkte Tabellen-/Spalten-/Sequenzrechte; kein pauschaler Zugriff auf `ulc_linz_security_event_log`.
- Traineridentitäts-Auditdaten: nur explizit erlaubte SELECT-/INSERT-Rechte, keine pauschale UPDATE-/DELETE-Rechte.
- Sicherheitsereignisse: getrennte Log-Ingest-/Read-/Cleanup-Rollen; pro-Spalte-Ingest, spezielle Sequences-/Funktionsrechte und restriktive Memberships.
- Backup-Rolle: nur die ausdrücklich autorisierten Leseprivilegien, keine Schreibrechte.
- Geschützte Funktionen: `PUBLIC`-Berechtigungen und `SECURITY DEFINER`-Eigentümer separat prüfen.

**4 – Noch nicht abgedeckte Sicherheitsflächen erfassen.** Neben den 3.864 Inventarzellen müssen die **6 aktuellen relevanten Rollenmitgliedschaften**, `GRANT OPTION` und Default ACLs, weitere Schema-/Datenbankrechte, direkte Zugriffe auf privilegierte Funktionen, `SET ROLE`, Login-/Inherit-Regeln und Triggerfunktionsverhalten gegen das Quellmodell überprüft werden. Diese Prüfung darf keine echten Daten verändern.

**5 – Nur nach gesondertem Betreiberentscheid schreiben.** Zuerst einen eigens geprüften Ziel- und Rollenumfang, Re-Run-/Rollbackkonzept, Quellenprovenienz und Testzeitpunkt dokumentieren. Danach kann eine andere, explizit freigegebene Operatoraktion die Quarantäneberechtigungen korrigieren. Die vorliegende PR ist **nur ein Diagnose- und Entwurfsartefakt**, kein impliziter Schreibauftrag.

**6 – End-to-End-Validierung.** Exakt diese K2-Datenbank erneut lesend prüfen: keinerlei PUBLIC-EXECUTE auf geschützten Routinen, pro-Objekt-Rechte und Rollen gegen die freigegebene Matrix, Rechte-Negativfälle. Erst danach eigenständige isolierte App-/Gruppen-/Organisations-Negativtests mit eigens freigegebenen nicht-produktiven Testidentitäten, getrennter Medien-Restore und RPO/RTO-Abnahme. **Keine Live-Routen oder produktive Aktivierung.**

## Testwerkzeug und Beweisgrenze

`node --test tooling/ulc-linz-k2-acl-object-drift.test.mjs` prüft Privilegienausweitung, fehlende Grants, PUBLIC-Sicherheitsroutine, Owner-/RLS-Drift, Manipulation unvollständiger Inventare und unzulässige Objekt-/Rollennamen. Der Prüfer akzeptiert nur vollständige Rolle×Privileg-Matrizen der sieben definierten Rollen, kontrolliert die Objektanzahl und verlangt acht zusätzliche Belege. Er gibt höchstens `READY_FOR_HUMAN_REVIEW` aus; **alle** Flags für GRANT, App-Restore, Deploy und Produktion sind dauerhaft `false`.

**Begrenzung:** Erfolgreiche Tests sind synthetisch; der echte K2-Restore bleibt wegen der oben **real gemessenen** Abweichungen HARD NO-GO. Kein SQL-Write, Cloudflare-API-Zugriff, Merge, Deployment, Backup-/Restore-Run oder Provider-Ressourcenwechsel erfolgt durch dieses Paket. Die bestehende K2-Quarantäne ist nicht leer und darf nicht einfach erneut mit `apply=true` beschrieben werden.

**Nachweise/Tracking:** Issue #640 (P1), Issue #607 (Audit), Issue #530 (Übergabe); PR #641 (aggregierte ACL-Parität) bleibt ein eigenständiger Draft.
