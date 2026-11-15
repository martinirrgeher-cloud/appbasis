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

## Zweite unabhängig lesende Prüfung: direkte GRANTs statt effektiver Privilegien

Der technische Restore-Ausfall wurde zusätzlich über `tooling/ulc-linz-k2-acl-direct-readonly.sql` bestätigt. Dieser neue Nur-Lese-Bericht verwendet ausdrücklich die **direkten PostgreSQL-ACL-Arrays**, nicht bloß die geerbten bzw. effektiven Rechte aus `has_*_privilege`.

| Direkte ACL-Einträge pro Objektfamilie | Preview-Quelle | K2-Restore |
| --- | ---: | ---: |
| Tabellen | 800 | 0 |
| Sequenzen | 22 | 0 |
| Geschützte Einzelspalten | 15 | 0 |
| Funktionen | 2 | 0 |
| **Gesamt** | **839** | **0** |
| Berechtigungen mit GRANT OPTION | 0 | 0 |
| Explizite Default-ACL-Einträge für Schema `public` | 4 | 2 |

Die 800 expliziten Tabellenberechtigungen enthalten **496 Einträge der ursprünglichen Migrationsrolle**, **242 der Anwendungsrolle** und **62 der Backup-Rolle**. Die 22 Sequenzberechtigungen verteilen sich auf Migration (12), Anwendung (5), Backup (4) und Sicherheits-Ingest (1); die 15 Spaltenrechte gelten der eingeschränkten Sicherheits-Ingest-Rolle. Beide expliziten Funktionsrechte der Quelle gelten der Migrationsrolle; `PUBLIC EXECUTE` ist dort für beide Routinen wirksam untersagt.

**Sicherheitsrelevante Schlussfolgerung:** Die oben genannten **373 effektiven Fehlberechtigungen** dürfen nicht mechanisch in 373 direkt anzulegende GRANTs übersetzt werden. Effektiver Zugriff hängt auch von Eigentümerschaft, Mitgliedschaften, Default-ACLs und impliziten PostgreSQL-Rechten ab. Ebenso dürfen die **839 expliziten Quell-ACL-Einträge** nicht blind ins Restore kopiert werden: 496 Tabellengrant-Einträge beziehen sich auf den ursprünglichen Migration-Owner, während sämtliche 94 Objekt-Owner im Restore abweichen. Andernfalls kann die Eigentümer-/SECURITY-DEFINER-Grenze erneut verändert werden.

**Praktischer nächster Fix für die gesonderte Betreiberfreigabe:** erst alle nicht beabsichtigten `PUBLIC EXECUTE`-Rechte auf beiden Funktionen explizit schließen (Vorsicht: ohne geprüfte Quarantäne-Zielbindung nicht ausführen), dann gewünschte **eigene Quarantäne-Owner** samt Eigentümer-/SECURITY-DEFINER-Kontext bestätigen, schließlich nur gezielte **nicht-eigentümerbezogene** Tabellen-, Spalten- und Sequenzrechte für separat genehmigte Quarantäne-Testrollen wiederherstellen. Danach direkte ACLs **und effektive Rechte** erneut vergleichen. Der alte Migrations-Owner wird nicht zum Runtime-Login oder pauschalen Grant-Empfänger.

Die bereits geprüfte App- und Sicherheits-Log-Hyperdrive-Konfiguration des laufenden Test-Workers zeigt laut Cloudflare-Dashboard jeweils auf den originalen Preview-Neon-Compute, nicht auf den K2-Quarantäne-Compute. Das ist ein **PASS für diese zwei Bindings**, keine accountweite Bestätigung aller aktiven Worker-Versionen, Service-Bindings oder verborgenen direkten Datenbank-Secrets. Bis zur vollständigen Isolation und expliziten Schreibfreigabe bleibt der Restore **HARD NO-GO**.

## Konkret vorbereitete, aber **nicht ausgeführte** erste Schutzkorrektur

`tooling/ulc-linz-k2-quarantine-function-revoke-proposal.sql` ist ein vollständig eingegrenzter **Transaktionsvorschlag**, kein Workflow. Seine einzigen beiden möglichen Schreiboperationen sind:
- `REVOKE EXECUTE` von `PUBLIC` auf der geschützten Security-Event-Purge-Funktion.
- `REVOKE EXECUTE` von `PUBLIC` auf der Registration-Calendar-Guard-Funktion.

Er enthält `BEGIN/COMMIT`, kurze Transaktions-Timeouts, eine harte Prüfung des logischen Ziel-Datenbanknamens `ulc_linz_k2_restore_quarantine`, die erwarteten 62 Anwendungstabellen und die beiden bekannten Nullargument-Routinen. Er verweigert die Ausführung, falls andere nicht autorisierte Routinenrechte vorhanden sind, und prüft **vor dem Commit**, dass `PUBLIC EXECUTE` auf beiden Routinen tatsächlich gesperrt ist. Die Revoke-Aktion ist bei unverändert sicherem Zustand wiederholbar.

**STOP vor einer eventuellen Ausführung:** Der Datenbankname beweist nicht den richtigen Neon-Branch. Ein unabhängiger Operator muss unmittelbar davor den **eigenen K2-Quarantäne-Compute** und den exakten Datenbanknamen erneut mit Neon-Metadaten prüfen, die fehlende Cloudflare-/Service-/Secret-Verknüpfung bestätigen, den funktionsbezogenen SECURITY-DEFINER-Owner einschließlich seiner Fähigkeiten reviewen und diese zwei konkreten DB-**Schreiboperationen separat freigeben**. Das Original-Preview darf niemals als Restore-Ziel verwendet werden. Diese SQL-Datei wurde bislang **nicht gegen Neon ausgeführt** und ist daher kein Live-Write-Test.

**Begrenzter Nutzen:** Auch nach einem künftig autorisierten Revoke wäre die K2-App **weiter NO-GO**: Die 839 direkten Quellrechte/373 effektiven Runtime-Rechte sind noch nicht korrekt rekonstruiert, und alle 94 Owner unterscheiden sich. Daher bedeutet die erste defensive Revoke-Aktion nur das Schließen der konkret gemessenen Function-EXECUTE-Ausweitung, nicht die Aktivierung der App oder eine vollständige Restore-Freigabe.

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
