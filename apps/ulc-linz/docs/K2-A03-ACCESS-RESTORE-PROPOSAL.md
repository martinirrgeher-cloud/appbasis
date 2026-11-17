
> **K2-A10 Sicherheits-Stopp (17.11.2026):** Der kontrollierte atomare Rechte-Reparaturversuch wurde **vollständig zurückgerollt**. PostgreSQL 18/Neon legt über `cloud_admin` automatisch `ADMIN TRUE, SET FALSE, INHERIT FALSE` für den bisherigen Restore-Owner an. Der vorgesehene Null-Mitgliedschaft-Nachtest ist mit den vorhandenen Neon-Rechten nicht erfüllbar. **Nicht erneut ausführen**, bevor der Betreiber eine eng begrenzte Plattform-Admin-Ausnahme oder eine neue Owner-Architektur separat genehmigt. Details und Negativtests: [K2-A10-NEON-ADMIN-AUTO-GRANT.md](./K2-A10-NEON-ADMIN-AUTO-GRANT.md).

# K2-A03 – Wiederherstellung der Zugriffsrechte (Entscheidungs- und Testentwurf)

**Datum:** 15.11.2026 · **Status:** HARD NO-GO für App-Anbindung der K2-Quarantäne · Die zwei `PUBLIC EXECUTE`-REVOKEs wurden nach gesonderter Betreiberfreigabe bereits ausgeführt und erfolgreich geprüft. **Alle weiteren DB-Rechteänderungen sind nicht freigegeben.**

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
- **Im Zustand vor dem bereits ausgeführten REVOKE: 14 zusätzlich erlaubte EXECUTE-Zellen** für die **zwei** Datenbankroutinen, weil `proacl IS NULL` wieder die PostgreSQL-Standardrechte einschließlich **PUBLIC EXECUTE** bewirkt. Die Zahl 14 bezeichnet sieben geprüfte Rollen/PUBLIC mal zwei Routinen, **nicht** 14 unabhängige Routinen.
- **94 Eigentümerzuordnungen weichen ab**; bei einem `pg_restore --no-owner --no-acl` ist dies erwartbar, aber ohne explizit geprüftes Owner-Konzept kein gleichwertiger App-Restore.
- Kein fehlender oder zusätzlicher Objekt-/Rollen-/Recht-Schlüssel im verwendeten Inventarumfang. **Wichtig:** Die Matrix prüft effektive Privilegien ausgewählter Rollen, nicht zusätzlich alle `GRANT OPTION`-Flags, Default-ACLs, externe Runtime-Bindings oder vollständige Rollenhierarchien.

### Besonders kritischer Befund

Die Routine `public.appbasis_ulc_linz_purge_expired_security_events()` besitzt `SECURITY DEFINER` und kann abgelaufene Sicherheitsprotokolle löschen. In der Preview-Quelle ist ihre Ausführung über PUBLIC und die geprüften Runtime-Rollen untersagt. Vor der bereits ausgeführten Korrektur hatten PUBLIC und die sechs geprüften Rollen durch Standard-ACLs das Recht `EXECUTE`. Auch die Funktion `public.ulc_linz_registration_calendar_guard()` war zuvor für PUBLIC ausführbar; **beide öffentlichen Ausführungsrechte sind inzwischen erfolgreich gesperrt**.

Dies war eine **unerwünschte Privilegienaufweitung in der isolierten Restore-Datenbank**, die nach gesonderter Freigabe behoben wurde; es liegt kein Nachweis vor, dass ein Angreifer darauf zugreifen konnte. Die K2-Quarantäne hat einen separaten Neon-Branch und Compute-Endpunkt. Die beiden bekannten aktiven Preview-Hyperdrive-Bindings wurden unabhängig geprüft und zeigen auf den Quell-Compute; **andere Worker-, Service- und Secret-Wege sind nicht vollständig ausgeschlossen**. Bis dahin: **kein App-Start, kein öffentlicher oder interner Worker-Zugriff, kein Smoke-Test mit Schreibfunktion gegen K2**.

## Zweite unabhängig lesende Prüfung: direkte GRANTs statt effektiver Privilegien

Der technische Restore-Ausfall wurde zusätzlich über `tooling/ulc-linz-k2-acl-direct-readonly.sql` bestätigt. Dieser neue Nur-Lese-Bericht verwendet ausdrücklich die **direkten PostgreSQL-ACL-Arrays**, nicht bloß die geerbten bzw. effektiven Rechte aus `has_*_privilege`.

| Direkte ACL-Einträge pro Objektfamilie | Preview-Quelle | K2-Restore |
| --- | ---: | ---: |
| Tabellen | 800 | 0 |
| Sequenzen | 22 | 0 |
| Geschützte Einzelspalten | 15 | 0 |
| Funktionen | 2 | 2 (nur Owner, nach REVOKE) |
| **Gesamt** | **839** | **2** (nach REVOKE) |
| Berechtigungen mit GRANT OPTION | 0 | 0 |
| Explizite Default-ACL-Einträge für Schema `public` | 4 | 2 |

Die 800 expliziten Tabellenberechtigungen enthalten **496 Einträge der ursprünglichen Migrationsrolle**, **242 der Anwendungsrolle** und **62 der Backup-Rolle**. Die 22 Sequenzberechtigungen verteilen sich auf Migration (12), Anwendung (5), Backup (4) und Sicherheits-Ingest (1); die 15 Spaltenrechte gelten der eingeschränkten Sicherheits-Ingest-Rolle. Beide expliziten Funktionsrechte der Quelle gelten der Migrationsrolle; `PUBLIC EXECUTE` ist dort für beide Routinen wirksam untersagt.

**Sicherheitsrelevante Schlussfolgerung:** Die oben genannten **373 effektiven Fehlberechtigungen** dürfen nicht mechanisch in 373 direkt anzulegende GRANTs übersetzt werden. Effektiver Zugriff hängt auch von Eigentümerschaft, Mitgliedschaften, Default-ACLs und impliziten PostgreSQL-Rechten ab. Ebenso dürfen die **839 expliziten Quell-ACL-Einträge** nicht blind ins Restore kopiert werden: 496 Tabellengrant-Einträge beziehen sich auf den ursprünglichen Migration-Owner, während sämtliche 94 Objekt-Owner im Restore abweichen. Andernfalls kann die Eigentümer-/SECURITY-DEFINER-Grenze erneut verändert werden.

**Nächster noch offener Fix (nur nach gesonderter Betreiberfreigabe):** Die zuvor ungewollten `PUBLIC EXECUTE`-Rechte sind bereits nach Freigabe geschlossen. Nun gewünschte **eigene Quarantäne-Owner** samt Eigentümer-/SECURITY-DEFINER-Kontext bestätigen, schließlich nur gezielte **nicht-eigentümerbezogene** Tabellen-, Spalten- und Sequenzrechte für separat genehmigte Quarantäne-Testrollen wiederherstellen. Danach direkte ACLs **und effektive Rechte** erneut vergleichen. Der alte Migrations-Owner wird nicht zum Runtime-Login oder pauschalen Grant-Empfänger.

Die bereits geprüfte App- und Sicherheits-Log-Hyperdrive-Konfiguration des laufenden Test-Workers zeigt laut Cloudflare-Dashboard jeweils auf den originalen Preview-Neon-Compute, nicht auf den K2-Quarantäne-Compute. Das ist ein **PASS für diese zwei Bindings**, keine accountweite Bestätigung aller aktiven Worker-Versionen, Service-Bindings oder verborgenen direkten Datenbank-Secrets. Bis zur vollständigen Isolation und expliziten Schreibfreigabe bleibt der Restore **HARD NO-GO**.

## Historische, bereits ausgeführte erste Schutzkorrektur – nicht erneut anwenden

`tooling/ulc-linz-k2-quarantine-function-revoke-proposal.sql` ist ein vollständig eingegrenzter **Transaktionsvorschlag**, kein Workflow. Seine einzigen beiden möglichen Schreiboperationen sind:
- `REVOKE EXECUTE` von `PUBLIC` auf der geschützten Security-Event-Purge-Funktion.
- `REVOKE EXECUTE` von `PUBLIC` auf der Registration-Calendar-Guard-Funktion.

Er enthält `BEGIN/COMMIT`, kurze Transaktions-Timeouts, eine harte Prüfung des logischen Ziel-Datenbanknamens `ulc_linz_k2_restore_quarantine`, die erwarteten 62 Anwendungstabellen und die beiden bekannten Nullargument-Routinen. Er verweigert die Ausführung, falls andere nicht autorisierte Routinenrechte vorhanden sind, und prüft **vor dem Commit**, dass `PUBLIC EXECUTE` auf beiden Routinen tatsächlich gesperrt ist. Die Revoke-Aktion ist bei unverändert sicherem Zustand wiederholbar.

**Historische Stop-Gates des bereits ausgeführten Eingriffs; nicht erneut anwenden:** Der Datenbankname beweist nicht den richtigen Neon-Branch. Ein unabhängiger Operator muss unmittelbar davor den **eigenen K2-Quarantäne-Compute** und den exakten Datenbanknamen erneut mit Neon-Metadaten prüfen, die fehlende Cloudflare-/Service-/Secret-Verknüpfung bestätigen, den funktionsbezogenen SECURITY-DEFINER-Owner einschließlich seiner Fähigkeiten reviewen und diese zwei konkreten DB-**Schreiboperationen separat freigeben**. Das Original-Preview darf niemals als Restore-Ziel verwendet werden. Die beiden REVOKE-Anweisungen wurden am 15.11.2026 nach konkreter Betreiberfreigabe auf dem ausdrücklich gewählten K2-Branch und der K2-Restore-Datenbank in einer Transaktion ausgeführt. Der Nachtest bestätigte `0 PUBLIC EXECUTE`, `0 App EXECUTE` und keine weiteren direkten EXECUTE-Rechte. Das hier abgelegte Skript bleibt nur historischer Nachweis; **nicht erneut starten**.

**Begrenzter Nutzen:** Auch nach den bereits autorisierten und abgeschlossenen REVOKEs bleibt die K2-App **NO-GO**: Die 839 direkten Quellrechte/373 effektiven Runtime-Rechte sind noch nicht korrekt rekonstruiert, und alle 94 Owner unterscheiden sich. Daher bedeutet die erste defensive Revoke-Aktion nur das Schließen der konkret gemessenen Function-EXECUTE-Ausweitung, nicht die Aktivierung der App oder eine vollständige Restore-Freigabe.

## Technischer Designvorschlag für späteren, separat freizugebenden Rechteaufbau

**0 – Verbindliches Ziel und Schutzgrenze.** Betreiber bestätigt schriftlich K2-Branch, **die separate Restore-Datenbank** und ihren Compute. Auf demselben Branch liegt noch eine geklonte Preview-Datenbank; ein alleiniger Branch-Check wäre gefährlich. Cloudflare-Routen, Worker-/Hyperdrive-Bindings und Scheduler werden unabhängig als nicht verbunden bestätigt. Keine Secrets/Hostnames in Logs.

**1 – Privilegienbereinigung bereits erledigt.** Der ungewollte `PUBLIC EXECUTE`-Zugriff auf beide Routinen wurde unter enger Betreiberfreigabe auf dem Quarantäne-Ziel geschlossen und unmittelbar nachkontrolliert. **Kein blanket `GRANT ALL`**, kein Zugriff auf den Preview-Quellbranch. Dieses Dokument und die PR **enthalten bewusst keinen ausführbaren Patch/Apply-Workflow**.

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

**Begrenzung:** Erfolgreiche Tests sind synthetisch; der echte K2-Restore bleibt wegen der oben **real gemessenen** Abweichungen HARD NO-GO. Dieser Draft-PR führt **keine zusätzlichen** SQL-Writes, Cloudflare-API-Aufrufe, Merges, Deployments, Backup-/Restore-Runs oder Provider-Ressourcenwechsel aus. Die zwei zuvor separat genehmigten REVOKEs wurden am 15.11.2026 tatsächlich vorgenommen. Die bestehende K2-Quarantäne ist nicht leer und darf nicht einfach erneut mit `apply=true` beschrieben werden.

**Nachweise/Tracking:** Issue #640 (P1), Issue #607 (Audit), Issue #530 (Übergabe); PR #641 (aggregierte ACL-Parität) bleibt ein eigenständiger Draft.

## A04 – vollständiges, eigentümergetrenntes Rechte-Restore-Paket (15.11.2026)

Dieses Arbeitspaket ersetzt weitere kleinteilige Teil-PRs durch einen **gemeinsamen, rein offline geprüften Reparaturvorschlag** im bereits bestehenden Draft #642. Die Quelle ist **kein ausgedachter ACL-Standard**, sondern ein aus dem originalen Neon-Preview-Branch einmalig read-only entnommener Katalog-Snapshot:

- `tooling/ulc-linz-k2-restore-privilege-contract.json` – 62 Tabellen, vier Sequenzen, zwei Funktionen sowie die **329 direkten Nicht-Eigentümer-Rechteeinträge** der ursprünglichen Anwendung, Sicherheits-Ingest-Rolle und Backup-Rolle (146 Objekt/Rollen-Gruppen). **Keine Zugangsdaten oder Personen-/Tabellenzeilen.** Die Snapshot-Datei ist im Test auf die Git-Blob-Prüfsumme fixiert; Änderungen erzwingen ein erneutes Code-Review.
- `tooling/ulc-linz-k2-restore-rights-plan.mjs` – reiner, deterministischer Offline-Planer mit strikten Rollen- und Privileg-Allowlisten, Prüfung aller 68 Objektidentitäten und der exakten 329 Berechtigungszellen. Er gibt ausschließlich **`REVIEW_ONLY`** zurück und führt keinerlei SQL, APIs oder Provider-Writes aus.
- `tooling/ulc-linz-k2-restore-rights-plan.test.mjs` – umfangreiche Tests mit dem tatsächlichen Source-Snapshot sowie mutierten Negativfällen; kontrolliert u. a. `PUBLIC`, `GRANT ALL`, Funktions-`EXECUTE`, Schutz der Audit-Tabellen und unzulässige Owner.

### Der wesentliche neue Owner-Befund

Die originale Eigentümerrolle aller 62 Tabellen, vier Sequenzen und zwei Funktionen ist die eingeschränkte `appbasis_ulc_linz_preview_migration` (keine `CREATEDB`-, `CREATEROLE`- oder `BYPASSRLS`-Privilegien). Im Restore gehören alle 68 eigenständigen Objekte `ulc_linz_k2_restore_owner`. Dessen Neon-Rolle besitzt **`CREATEDB`, `CREATEROLE` und `BYPASSRLS`** und ist ein Login. Die privilegierte Sicherheitsprotokoll-Löschfunktion ist `SECURITY DEFINER`. **Eine erneute pauschale Freigabe der Funktionsausführung mit diesem Owner wäre besonders riskant.**

Deshalb sieht der Plan **vor einer App-Anbindung** eine neue, ausschließlich für die Quarantäne vorgesehene `NOLOGIN`-Objekteigentümerrolle `ulc_linz_k2_object_owner` vor: ohne Superuser, `CREATEDB`, `CREATEROLE`, `BYPASSRLS`, Replikations- und vererbte Mitgliedschaftsrechte. Diese Rolle **existiert im Restore noch nicht**, wie eine aktuelle read-only PostgreSQL-Rollenprüfung bestätigt. Ein menschlicher Operator muss erst Rolleneinrichtung, Erreichbarkeit, Mitgliedschaften, SECURITY-DEFINER-Rechte und spätere Ausführbarkeit fachlich prüfen. **Der Plan legt diese Rolle nicht an und ändert keinen Owner.**

Die **94** vorher gemessenen Owner-Abweichungen umfassen 62 Tabellen, vier Sequenzen, zwei Funktionen und 26 geschützte Spalten-Metadatensichten. Zur fachlichen Wiederherstellung des Eigentümermodells sind demnach **64 direkte Eigentümeranweisungen** plus **4 rekursiv über die zugehörigen Tabellen übertragene Sequenz-Eigentümerwechsel** vorzusehen; Spalten besitzen keinen unabhängig über `ALTER COLUMN OWNER` umstellbaren Eigentümer. Die geplanten Ownership-Anweisungen sind ein technischer Vorschlag, **noch keine ausführbare Freigabe**. Zu prüfen ist insbesondere, welche Sequenzen durch Tabellen-Spalten-Ownership automatisch mitwechseln, und ob alle `ALTER OWNER`-Vorbedingungen/Neon-Rollenrechte erfüllt sind.

### Rechte-Matrix nach Aufgaben (jeweils nur bei separater Freigabe)

| Bereich | Direkte Source-Rechte | Review-Anweisungen |
| --- | ---: | ---: |
| Anwendungstabellen | 242 Rechte auf 61 Tabellen | 61 objektgenaue Gruppen |
| Anwendungssequenzen | 5 Rechte auf drei Sequenzen | 3 Gruppen |
| Sicherheitslog-Spalten-Ingest | 15 einzelne INSERT-Rechte | 15 Gruppen |
| Sicherheitslog-ID-Sequenz | ein USAGE-Recht | eine Gruppe |
| Backup-Tabellen | 62 SELECT-Rechte auf 62 Tabellen | 62 Gruppen |
| Backup-Sequenzen | 4 SELECT-Rechte auf vier Sequenzen | 4 Gruppen |
| **Gesamt** | **329 Rechte** | **146 Gruppen** |

Die weiteren **510** direkten Quell-ACL-Einträge gehören dem ursprünglichen Migrations-Owner (496 Tabellen, 12 Sequenzen, zwei Funktionen). Sie werden **nicht** als Rechte für die originale Migration oder den privilegierten Restore-Owner neu vergeben. Die geplante isolierte `NOLOGIN`-Rolle wird stattdessen zum eigenständigen Objekteigentümer; die Anwendung erhält niemals Eigentümerrechte. Für Sicherheitsfunktionen werden **keine direkten EXECUTE-Grants** vorbereitet. Der bereits separat genehmigte und erfolgreich ausgeführte Zwei-Funktions-`REVOKE EXECUTE FROM PUBLIC`-Fix bleibt Voraussetzung.

### Einmaliges, zusammenhängendes Abnahmeverfahren

**Stufe 1 – externe, unveränderliche Zielbindung.** Original-Preview-Branch und eigener K2-Quarantäne-Branch/Compute/DB werden direkt in Neon bestätigt. Die zwei aktiven App-Hyperdrives zeigen laut Cloudflare-Dashboard korrekt auf den ursprünglichen Preview-Compute. Vor tatsächlichen Schritten sind darüber hinaus aktive Worker-Versionen, Service-Bindings, weitere Worker/Hyperdrives und direkte Connection-Strings/Secrets **ohne Herausgabe der Secret-Werte** unabhängig auf Nichtanbindung zu kontrollieren. Ohne diesen Nachweis keine Änderung der Quarantäne-App-Verbindung.

**Stufe 2 – geprüfter Besitzerwechsel.** Neutrale isolierte `NOLOGIN`-Ownerrolle samt rollenübergreifenden Negativprüfungen fachlich beschließen; 64 direkte Owner-Anweisungen (62 Tabellen, 2 Funktionen) und 4 rekursive IDENTITY-Sequence-Transfers in einem ausdrücklich freigegebenen, atomaren/rollbackfähigen Quarantäne-only-Operatorablauf vorsehen. Vorher/nachher insbesondere Funktion-`SECURITY DEFINER`, ausdrückliches `PUBLIC EXECUTE`-Verbot, Schemanutzungsrechte und Owner-Mitgliedschaft prüfen.

**Stufe 3 – streng geteilte GRANT-Stufen.** Anwendungsrechte (64 Gruppen), Sicherheitslog-Ingest (16 Gruppen) und Backup-Read-Only (66 Gruppen) separat genehmigen und getrennt auswertbar halten; keine generischen `GRANT ALL`, keine Funktion-`EXECUTE`, keine Grants an Migrations-/Restore-Owner oder `PUBLIC`. Für Testanmeldungen idealerweise spezifische, separate Quarantäne-Identitäten und nicht die produktiven Runtime-Secrets verwenden. Eine Sicherheitslog-Gruppe ist keine Freigabe für die Anwendung, Sicherheitslogs allgemein zu lesen.

**Stufe 4 – vollständiger, tatsächlicher Nachtest.** Erneute direkte und effektive Katalogvergleiche inklusive Rollenmitgliedschaften und `GRANT OPTION`, abweichender Default-ACLs (vier Quell- vs. zwei Restore-Definitionen), Owner-/RLS-Status und geschützter Funktionen. Zusätzlich reale Ablehnungsfälle für fremde Organisations-/Gruppen-/Benutzerrollen auf einer getrennt gerouteten, privaten Test-App. Bei aktivem `SECURITY DEFINER` ist die zukünftige Bereinigung sicherzustellen, ohne privilegierten Runtimezugriff freizugeben.

**Stufe 5 – fachliche Wiederanlaufabnahme.** Tatsächliche R2-Medien-Wiederherstellung, Login/Logout, Anwesenheit, Anmeldung, Training, Statistik, Berechtigungen und Re-Deletion prüfen; RPO/RTO nach Ausfallbeginn bis vollständiger Abnahme messen. Erst danach darf separat über Backup-Automatik und Produktivstart entschieden werden.

### Technische und organisatorische Stop-Gates

- Die in diesem PR erzeugten SQL-Satzvorschläge sind **prüfbares Material**, kein automatisches Anwenden. Es gibt weder eine CLI-Apply-Funktion noch einen Workflow, der sie ausführt.
- Für jeden schreibenden Owner-/Grant-Schritt ist eine neue **ausdrückliche und auf exakte DB und Aktionen begrenzte Betreiberfreigabe** erforderlich. Die bisherige „Ok“-Freigabe betraf **nur zwei PUBLIC-REVOKEs**, die erfolgreich ausgeführt und unabhängig geprüft wurden.
- Die tatsächliche App-Quarantäne bleibt **HARD NO-GO**, solange neutrale Owner, fehlende Rechte, Default-ACL, Cloudflare-Gesamtrouting und negative App-/Medientests ausstehen.
- Die Quell-Datei bildet einen **festen Zeitpunkt** ab. Vor einer späteren Durchführung müssen Snapshot, Main-App-Stand und Datenbankschema erneut lesend abgeglichen werden. Der neue Source-Katalog darf nicht stillschweigend als aktueller Stand übernommen werden.


## A04 – Risiko-Review: effektive Eigentümerrechte und zukünftige ACLs

Dieser Abschnitt ergänzt den **historischen Vorher-Befund** oben. Die ursprünglichen 14 zusätzlichen Funktions-EXECUTE-Einträge sind nach den gesondert freigegebenen beiden `REVOKE EXECUTE FROM PUBLIC` vom **15.11.2026 behoben**. Eine unabhängige Katalogprüfung bestätigte anschließend `0 PUBLIC EXECUTE` und `0 App EXECUTE` in der K2-Quarantäne sowie dieselben gesperrten Ausführungsrechte in der unveränderten Preview-Quelle. **Das ist keine Freigabe für den App-Restore**.

### Weitere tatsächlich verifizierte Rechte-Risiken

- **Hochprivilegierter Owner:** Alle 62 Tabellen, vier Sequenzen und zwei Funktionen gehören auf dem Restore weiterhin zur Rolle `ulc_linz_k2_restore_owner`, die `CREATEDB`, `CREATEROLE` und `BYPASSRLS` besitzt. Ihre `SECURITY DEFINER`-Funktion ist zwar derzeit gesperrt, soll aber nicht später von einer hochprivilegierten Owner-Rolle abhängig bleiben.
- **Rollen-Erreichbarkeit:** Ein reiner K2-Lesecheck über `pg_has_role(..., 'MEMBER'/'USAGE'/'SET')` bestätigt für die vier geprüften Runtime-/Backup-Rollen **0** Mitgliedschaften, geerbte Rechte und mögliche `SET ROLE`-Wege zum aktuellen Restore-Owner. Das beweist keine accountweite Isolation und **sagt nichts über eine künftig neu anzulegende Owner-Rolle**.
- **Standardrechte für künftige Objekte:** `pg_default_acl` zeigt vier `public`-Konfigurationen in der Quelle und zwei im Restore. Zwei Quellrechte erteilen der Backup-Rolle automatisch `SELECT` auf künftig von der eingeschränkten Migrationsrolle angelegten Tabellen und Sequenzen; im Restore fehlen genau diese zwei Regeln. Die übrigen Regeln betreffen das Neon-interne `cloud_admin`-Modell und dürfen nicht manuell übernommen werden. Der Dateivergleich `tooling/ulc-linz-k2-future-acl-owner-readonly.sql` wurde **rein lesend gegen beide echten Datenbanken** ausgeführt.
- **Keine blinde Übertragung der Defaults:** PostgreSQL-Standardprivilegien gelten für **den tatsächlich erstellenden Rolle-Owner**. Eine neue `NOLOGIN`-Objekteigentümerrolle wird nicht automatisch zum Ausführungskonto für künftige Migrationen. **Deshalb bleibt die zukünftige DDL-/Default-ACL-Policy explizit unentschieden**, bis klar ist, welcher separate Quarantäne-Migrationsprozess neue Objekte erzeugen darf.

### Abnahmeschnittstelle für den späteren Eigentümerwechsel

Vor einem separaten Schreibauftrag müssen mindestens diese Bedingungen nachgewiesen werden:

1. Quelle und Ziel-DB anhand **Branch, Compute, Datenbankname und Objektinventar** separat bestätigt; kein Proxy/Worker/Service/Secret-Pfad auf K2. Die zwei verwendeten Preview-Hyperdrives sind bereits nachweislich an den **ursprünglichen** Preview-Branch gebunden; weitere Infrastruktur bleibt offen.
2. Neuer Owner `ulc_linz_k2_object_owner` ist nach Erstellung **NOLOGIN, NOSUPERUSER, NOCREATEDB, NOCREATEROLE, NOBYPASSRLS und ohne privilegierte Rollenmitgliedschaft**. Runtime- und Backup-Rollen dürfen den Owner **weder erben noch per SET ROLE übernehmen**. `CREATEROLE` des ausführenden Operators allein stellt diese Eigenschaft nicht sicher.
3. Eigentümerwechsel für 68 Objekte geprüft (64 direkte Anweisungen + 4 durch Tabellen verknüpfte Sequenzen); insbesondere zwingende rekursive Sequenz-Owner-Änderungen durch `ALTER TABLE ... OWNER`, erforderliche Admin-/Owner-Mitgliedschaften für die DDL-Ausführung und die Rechte der `SECURITY DEFINER`-Funktion.
4. **329 direkte Nicht-Eigentümer-Rechte** aus dem quellenbasierten, SHA-gepinnten Contract in 146 Gruppen – keine Grant-All-Berechtigungen, kein `PUBLIC EXECUTE`, keine Grants für die alte Migrations- oder privilegierte Restore-Ownerrolle.
5. Getrennter Beschluss, ob die Quarantäne überhaupt **zukünftige Migrationen** unterstützen muss; danach zielgenaue Default-ACLs für den **tatsächlichen** künftigen Objektersteller und negative Rechte-Tests. Nicht auf Verdacht `ALTER DEFAULT PRIVILEGES` für die `NOLOGIN`-Objekteigentümerrolle generieren.
6. Transaktion/Backout sowie **unabhängiger Nachtest** aller direkten und effektiven Rechte, Rolle-SET-/Inherit-Pfade, Owner, Funktions-EXECUTE und gruppenbezogener App-Ablehnungsfälle; ein grüner CI-Test allein ist kein realer Restore-Nachweis.

**Status:** Der Code in #642 liefert ausschließlich Review-Vorschläge; nachgewiesene Default-ACL-/Owner-Abweichungen **BLOCK** einen unkontrollierten K2-App-Restore. Keine automatischen Provider-/DB-Schreibaktionen.

## A04 – tatsächliche Runtime-Berechtigungsabnahme nach dem späteren Rechte-Fix

Neu: `tooling/ulc-linz-k2-runtime-rights-readonly.sql` wird **ohne Datensatzlesezugriff** auf den Systemkatalogen beider getrennten Neon-Datenbanken ausgeführt. Die SQL-Datei wurde am 15.11.2026 wirklich mit zwei reinen `SELECT`-Abfragen validiert; sie liefert aktuell folgende, für den Betrieb maßgebliche Referenz:

| Effektives Recht / Anzahl | Preview-Quelle | K2-Restore (Stand vor Owner-/GRANT-Fix) |
| --- | ---: | ---: |
| Tabellen | 62 | 62 |
| App SELECT / INSERT | 61 / 61 | 0 / 0 |
| App UPDATE / DELETE | 60 / 60 | 0 / 0 |
| Backup SELECT | 62 | 0 |
| Backup INSERT / UPDATE / DELETE | 0 / 0 / 0 | 0 / 0 / 0 |
| Security-Ingest: geschützte INSERT-Spalten | 15 | 0 |
| App: INSERT / SELECT in Sicherheitslog-Spalten | 0 / 0 | 0 / 0 |
| App: Sequence USAGE / SELECT | 3 / 2 | 0 / 0 |
| Backup: Sequence SELECT | 4 | 0 |
| App: Function EXECUTE | 0 | 0 |
| PUBLIC: Function EXECUTE | 0 | 0 |

Der Offline-Prüfer `evaluateK2RuntimeRightsEvidence` trennt sauber zwischen **`KNOWN_RESTORE_PRIVILEGES_MISSING`** (aktueller, tatsächlich geprüfter Zustand), `BLOCK` (abweichende/unvollständige Evidenz) und `CATALOG_AGGREGATES_MATCH_ONLY` (alle Zähler nach künftigen, separat freigegebenen Änderungen gleich). **Selbst beim letzten Ergebnis bleibt `appReady=false`**, bis die tatsächlichen Rechte pro Objekt, die Owner-/Mitgliedschaftsgrenzen und App-API-Negativtests bestanden sind. Eine aggregierte ACL-Parität ersetzt keine Prüfung der Organisations-/Gruppenberechtigungen auf Service-Ebene (Quelle und Restore besitzen keine aktivierten PostgreSQL-RLS-Policies).

### Übertragbares zusammenhängendes Operatorpaket

- **Ist-Zustand gesichert:** Branch/Compute/DB, 68 Objekte, zwei bereits gesperrte öffentliche Funktionen, privilegierter alter Owner und fehlende Grants sind rein lesend dokumentiert.
- **Soll-Zustand im Code:** neutrales, nicht anmeldbares Owner-Modell, 64 direkte Owner-Anweisungen und 4 rekursiv übertragene Sequenz-Owner, 146 direkte rollen- und objektspezifische GRANT-Gruppen mit 329 Einträgen. Kein pauschales `GRANT ALL` und keine unmittelbare Datenbank-Ausführung.
- **Zwei harte Entscheidungsfragen vor einem echten Rechte-Write:** (a) Wer darf künftige Quarantäne-Migrationen ausführen und welche Default-ACL-Policy gilt für den **wirklichen DDL-Ersteller**? (b) Ist die vollständige Cloudflare-/Service-/Secret-Nichtanbindung des K2-Compute nachgewiesen? Solange ungeklärt, kein App-Restore-Go.
- **Nachträgliche Abnahme:** exakte Soll-Summen dieses Tabellenvergleichs **plus** 94er per-Objekt-/Spaltenmatrix, Ownership-/Rollen-Set-/Inherit-Rechte, Sicherheitslog-Denials, echte isolierte Test-App und Medien-Restore; anschließende bewusste Entscheidung über wiederverwendbaren Restore-Ablauf.

**Änderungsgrenze dieses größeren Pakets:** ausschließlich GitHub-Draft #642, Offline-CI und SELECT-Abfragen an beiden Datenbanken. Keine weitere DB-Schreibaktion, kein Merge, kein Deployment, keine Provider- oder Cloudflare-Konfigurationsänderung.


### Eigentümerwechsel: zusätzliche PostgreSQL-Schema-Voraussetzung (real geprüft)

Ein ergänzender read-only `has_schema_privilege(...,'public','CREATE')`-Vergleich ergab: Der eingeschränkte **originale Migrationseigentümer** besitzt auf der Quell-DB `CREATE` für `public`. Auf dem Restore fehlt ihm dieses Recht, während der **alte privilegierte Restore-Owner** dort `CREATE` besitzt. Schema-Owner ist in beiden Datenbanken `pg_database_owner`. Der vorgeschlagene neutrale `NOLOGIN`-Objektowner **existiert noch nicht** und besitzt somit keine nachweisbaren Schema-Rechte.

**Harter technischer Stop:** `ALTER TABLE/SEQUENCE/FUNCTION ... OWNER TO ...` setzt im regulären PostgreSQL-Berechtigungsmodell neben der ausführenden Objekt-Owner-/Rollenbefugnis grundsätzlich auch ausreichende Rechte des **neuen Owners** am Schema voraus (insbesondere `CREATE`). Der Plan setzt dieses Recht deshalb **nicht stillschweigend voraus**, sondern verlangt vor einem echten Eigentümerwechsel die separate Prüfung und Freigabe eines minimalen `public`-Schema-Privilege-Konzepts für die neutrale Ownerrolle. Eine beliebige `GRANT CREATE`-Zuweisung an Runtime-/Backup-Rollen oder `PUBLIC` bleibt verboten. Nach Eigentümerwechsel sind Mitgliedschaften, `SET ROLE`-/Inherit-Rechte und Funktions-Denials erneut zu testen.

Damit ist das Eigentümerpaket **fachlich vorbereitet, aber nicht ausführungsfreigegeben**. Keine zusätzliche SQL-Write-Aktion ist erfolgt.

## K2-A05 – reale IDENTITY-Sequenz-Abhängigkeiten, korrigierter Eigentümerplan (16.11.2026)

**Konkreter Fehler im bisherigen Review-only-Plan entdeckt und behoben:** Die vier Sequenzen des echten Quell- und K2-Restore-Katalogs sind jeweils über `pg_depend.deptype='i'` intern an die IDENTITY-Spalte ihrer jeweiligen Anwendungstabelle gebunden; keine der vier ist eine frei stehende Sequenz. PostgreSQL verbietet `ALTER SEQUENCE ... OWNER TO` bei einer solchen Bindung als eigenständige Eigentümeraktion. Beim Eigentümerwechsel der Tabelle erfolgt der Eigentümerwechsel der abhängigen Sequenz rekursiv; anschließend muss die Sequenz-Eigentümerschaft wirklich nachgelesen werden.

**Neu gesicherter Prüfvertrag:** `tooling/ulc-linz-k2-owner-preflight-readonly.sql` prüft nur Metadaten und verlangt genau **vier** bekannte Identitätszuordnungen mit exakt bekannten Tabellen-/Spaltennamen (`identity_sequence_link_count=4`, `reviewed_identity_sequence_link_count=4`), zusätzlich zum bisherigen Datenbank-, Tabellen-, Owner-, Rollen- und PUBLIC-Funktionscheck. Live-Nachtest auf ausschließlich dem separat ausgewählten K2-Quarantäne-Ziel am 16.11.2026: **4/4 PASS**, alle bisherigen Befunde unverändert.

**Korrigierter, nicht ausführender Plan:** 68 unterschiedliche Objekte bleiben unter Eigentümerkontrolle, jedoch nur **64 direkte Owner-Anweisungen** = 62 Tabellen + zwei Funktionen; die vier IDENTITY-Sequenzen gehören zu den automatischen Tabellen-Owner-Folgen. Genau 146 objektgenaue GRANT-Gruppen / 329 Nicht-Owner-Rechte bleiben unverändert; der bereits gepinnte ACL-Source-Contract bleibt unangetastet. Bei unbekannten Sequences oder einer Abweichung im Live-Abhängigkeitsnachweis blockiert die nächste Prüfung. Aktualisierte Regressionen testen den Verzicht auf eigenständige `ALTER SEQUENCE OWNER`-Anweisungen sowie die Preflight-Pflicht.

**Nicht erfolgt:** Keine Eigentümer-/Rechte-DB-Writes, keine Neuvergabe von Credentials, kein Cloudflare-Deploy, keine Merges. Cloudflare-Account-weit fehlende Worker-/Route-/Service-/Secret-Isolationsnachweise bleiben offen. Vor einem echten DBA-Eingriff sind ein gesonderter präziser Betreiber-Writeauftrag, Rollen-/Schema-CREATE-Entscheidung, atomarer Rollback und ein unabhängiger nachheriger Funktions-/ACL-/Owner-Test unverzichtbar.

## K2-A07 – tatsächlicher 18er-PostgreSQL-Operator-Preflight (17.11.2026)

**Ziel:** Ein zusammenhängender, realitätsnaher Reparaturdurchgang für die isolierte K2-Quarantäne, nicht wieder eine Reihe neuer kleiner Provider-Aktionen.

### Neuer Live-Nachweis (ausschließlich lesend)

`tooling/ulc-linz-k2-operator-admission-readonly.sql` wurde am 17.11.2026 direkt über die getrennt ausgewählte Neon-Verbindung für Projekt `cool-unit-46141580`, Branch `br-small-wind-b10p67j8`, Compute `ep-snowy-fog-b1xzh562`, logische DB `ulc_linz_k2_restore_quarantine` ausgeführt. **Nur Systemkataloge**, keine Athleten-/Trainings-/Anmeldedaten, keine Secrets, keine DB-Änderungen. Beobachtete Zähler:

- PostgreSQL `180007` (18.x), aktive Rolle `ulc_linz_k2_restore_owner`; 62 Tabellen, 4 IDENTITY-Sequenzen, 2 Funktionen.
- 66 Relation-/2 Funktionsobjekte weiterhin beim alten Restore-Owner; **0** explizite Tabellen-/Sequenz-ACLs.
- Vier `pg_depend`-Sequenzverknüpfungen exakt zugeordnet (**4/4**); bei späterem Owner-Wechsel **keine** eigenständigen `ALTER SEQUENCE OWNER`-Befehle ausführen.
- Funktionsdefinitionen unverändert (Digest `f096a8e6786da42145aa56c2a6e61d87`), eine `SECURITY DEFINER`-Funktion mit eingeschränktem `search_path=pg_catalog`, **0** `PUBLIC EXECUTE` / **0** App-Funktions-`EXECUTE`.
- Neutrale `NOLOGIN`-Ownerrolle noch nicht vorhanden; bestehender Restore-Owner hat weiterhin `CREATEROLE`, `CREATEDB` und `BYPASSRLS`. Seine Mitgliedschaft in `neon_superuser` ist nachweislich **1** und damit ein **Break-Glass-/Admin-Risiko**, kein Nachweis einer Runtime-Eskalation.
- App-/Backup-Tabellen-`SELECT` noch **0/0**; drei geprüfte Runtime-/Backup-Rollen haben **0** unerlaubte Mitgliedschaften zum vorgesehenen/bisherigen Restore-Owner.
- `public` ist im DB-Owner-Kontext; Restore-Owner besitzt dort `CREATE`, der neue Eigentümer noch keine Rechte. **0** weitere DB-Sitzungen zum Prüfzeitpunkt (Momentaufnahme, kein dauerhaftes Routing-Verbot).

`tooling/ulc-linz-k2-operator-admission.mjs` bewertet diesen exakt bekannten Ist-Zustand nur mit `CATALOG_MATCH_ONLY`, bei jedem Feld-/Versions-/Schema-Drift mit `BLOCK`; **nie** mit einer Schreib-/Merge-/Deploy-/App-Betriebsfreigabe. Der Test ist im bestehenden PR-Workflow integriert. Auch der echte Cloudflare-Lesecheck [#44165601049](https://github.com/martinirrgeher-cloud/appbasis/actions/runs/44165601049) belegt nur die acht untersuchten Hyperdrive-Ziele und sieben aktiven Worker-Versionen; Secret-Werte wurden **nicht** geprüft.

### Ein fachlich zusammenhängender, separat freizugebender Betreiber-Eingriff

1. **Unmittelbar vor Ausführung:** Neon-Branch, Compute, DB, aktueller Original-Quelle/K2-Schema-Snapshot und Quarantäne-/Worker-Nichtanbindung erneut bestätigen. Keinerlei App-/Scheduler-Connection auf K2; direkte verschlüsselte Secret-Inhalte lassen sich nicht aus Metadaten ausschließen. Keine Preview-/Production-Verbindung umstellen.
2. **DB-Rollenansatz:** Nur auf diesem K2-Ziel eine neue `ulc_linz_k2_object_owner` als `NOLOGIN, NOSUPERUSER, NOCREATEDB, NOCREATEROLE, NOINHERIT, NOREPLICATION, NOBYPASSRLS` anlegen. PostgreSQL 18 erfordert für `ALTER ... OWNER TO` u.a. temporäre `SET ROLE`-Berechtigung und `CREATE` des neuen Owners auf dem Schema. Diese Rechte ausschließlich während des kontrollierten Vorgangs gewähren und vor Commit wieder entfernen. **Wichtig:** Die alte Neon-Adminrolle bleibt auch nach dem Wechsel administrativ mächtig; neutrale Objekt-Ownership ist daher keine vollständige Admin-Isolation.
3. **Objekte und Grants:** Exakt **64 direkte Owner-Anweisungen** aus dem SHA-gepinnten Quellvertrag (62 Tabellen, zwei Funktionen), die vier gekoppelten IDENTITY-Sequenzen über ihre Tabellen, dann exakt **146 minimale, objektgenaue Grant-Gruppen / 329 Nicht-Eigentümer-Rechte** für App, getrennte Security-Ingest und reine Backup-Leserolle. Keine Übernahme der 510 alten Migration-Owner-Grants, kein `PUBLIC`-/Funktions-`EXECUTE`, kein `GRANT ALL`, keine pauschalen Rechte.
4. **Atomar/prüfbar:** Nur in **einer** kontrollierten, mit Timeouts versehenen, abbrechbaren Transaktion auf K2 durchführen. Während der Transaktion: neue Owner, alle vier Sequenzen, alle direkten/effektiven Rechte, deny-Fälle, Verbot von PUBLIC-Funktionsausführung und entfernte temporäre Owner-Mitgliedschaft unabhängig prüfen. Bei *irgendeinem* abweichenden Ergebnis **ROLLBACK** – nie teilweise committen.
5. **Post-Commit-Fall:** Eine Transaktion schützt nur *bis zum Commit*. Für Fehler danach ist **vorher** ein eigener nachgewiesener Wiederherstellungs-/Backout-Pfad der K2-Quarantäne bereitzuhalten; kein improvisiertes `GRANT ALL`, kein `pg_restore --no-acl` auf die nichtleere K2-DB. Die unentschiedene zukünftige DDL-/Default-ACL-Strategie bleibt bis zu einem eigenen Beschluss außerhalb dieses statischen Test-Restores.
6. **Getrennte fachliche Abnahme:** Erst nach unabhängiger DB-Nachprüfung kontrollierte, **isolierte** App-Testidentitäten mit erfolgreichen und verweigerten Aktionen über Anwesenheit, Anmeldung, Trainingsplanung, Benutzerrechte, Statistik sowie ein verifizierter Medienrestore. Noch keine Produktiv- oder Worker-Freigabe.

**Stand 17.11.2026:** Fachlich-technische Live-Bestandsaufnahme **PASS**, alle tatsächlichen Owner-/GRANT-Reparaturen **NICHT AUSGEFÜHRT** und weiter **NO-GO** bis zur gesonderten **konkret benannten** Schreibfreigabe und geklärtem Post-Commit-Rückfallverfahren. PR #642 bleibt Draft. Kein Merge/Deploy/Provider-Write aus A07.

PostgreSQL-18-Rollenregeln: [GRANT](https://www.postgresql.org/docs/18/sql-grant.html), [Role Membership](https://www.postgresql.org/docs/18/role-membership.html), [ALTER TABLE](https://www.postgresql.org/docs/18/sql-altertable.html).

### K2-A07 – aktuelle source-of-truth Privilegienparität (17.11.2026)

Zur Absicherung des historischen Vertrags vom 15.11. wurden **alle direkten** für App, Security-Ingest und Backup vorgesehenen Berechtigungen erneut per `pg_catalog.aclexplode` auf der tatsächlichen Original-Preview-DB ausgelesen, und zwar getrennt nach Tabelle/Sequenz/Spalte, Objektname, Rolle, Privileg und `is_grantable`. Die 146 Grant-Gruppen aus dem SHA-gepinnten Manifest ergeben **329 erwartete Einzelberechtigungen**.

**Tatsächliches Ergebnis des direkten Mengenvergleichs (nicht nur Summen):**

| Metadatenprüfung | Original-Preview | K2-Quarantäne |
| --- | ---: | ---: |
| Direkte Rechte der drei freizugebenden Laufzeit-/Backup-Rollen | **329** | **0** |
| Gegen Manifest fehlende Rechte | **0** | **329** |
| Gegen Manifest zusätzliche Rechte | **0** | **0** |
| `WITH GRANT OPTION` der untersuchten Rechte | **0** | **0** |
| Abgeschnittene SQL-Ergebnismenge | nein | nein |

Die Originalquelle stimmt damit **329/329** exakt zum freigegebenen Prüfumfang des gespeicherten Vertrags; der Restore hat weiterhin null dieser Rechte. Es wurden keine Appdaten gelesen oder Veränderungen vorgenommen. **Der Vergleich prüft diese 329 Nicht-Eigentümer-Grants, nicht alle denkbaren Rollen-, Provider- oder Objektberechtigungen.**

Damit ist keine Notwendigkeit erkennbar, den Quell-ACL-Vertrag neu zu erstellen oder die alten 510 Eigentümer-Grants zu übertragen. Die erforderliche nächste Stufe bleibt eine **separat ausdrücklich genehmigte**, in einer Transaktion kontrollierte K2-Owner-/Grant-Wiederherstellung samt exakter Nachkontrolle und Rückfallregelung. Ohne diese Freigabe **kein** DB-Write und keine App-Anbindung.
