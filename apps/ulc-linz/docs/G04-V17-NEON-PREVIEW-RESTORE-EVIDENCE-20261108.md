# G-04.4 – Reale Preview-Snapshot-Probe und Testkalender-Löschregel

**Datum:** 08.11.2026 (UTC-Zeiten wie von Neon gemeldet). **Status:** Testphase technisch PASS, v17-Freigabe ausdrücklich weiter BLOCKED.

## Betreiberentscheidung für die aktuelle Testphase

Am 08.11.2026 wurde für die **noch nicht mit Echtdaten betriebene** ULC-Testumgebung folgende fachliche Regel ausdrücklich bestätigt:

1. **Gruppe aktiv:** zugehörige Kalenderregeln, Ausnahmen und Revisionen bleiben erhalten.
2. **Gruppe reversibel deaktiviert:** sämtliche Kalenderregeln, Ausnahmen und CAS-Revisionen bleiben erhalten, sodass eine spätere Reaktivierung denselben Zustand wiederherstellt.
3. **Gruppe ausdrücklich physisch und zulässig gelöscht:** die rein gruppenbezogenen Kalender-Konfigurationstabellen werden im selben Datenbankvorgang über `ON DELETE CASCADE` bereinigt. Ein solcher Hard-Delete muss über die bereits bestehenden separaten Berechtigungs- und Löschregeln autorisiert sein. **Es wird kein neuer automatischer Gruppenlöschpfad eingeführt.**
4. **Abgelaufene Termine:** keine zeitgesteuerte automatische Kalenderbereinigung, damit alte Clientversionen/Revisionen nicht unerwartet wieder gültig werden.
5. **Kein Wechsel in Produktion und keine Datenschutz-Aktivierung:** Diese Testbetriebsentscheidung ist **keine** Freigabe der Datenverantwortlichen zu rechtlicher Aufbewahrungsdauer, personenbezogenem Export oder produktiver Datenverarbeitung. Die v17-Privacy-Staging-Metadaten mit `controllerApproval: pending` und der Evidence-Ledger bleiben gesperrt und unverändert.

## Tatsächliche Neon-Preview-Prüfung

- **Projekt:** `cool-unit-46141580` / `appbasis-ulc-linz-preview`; kein Zugriff auf das Neon-Produktionsprojekt.
- **Originalquelle:** Branch `br-delicate-surf-b1eu6ikn`, Datenbank `appbasis_ulc_linz_preview`, PostgreSQL 18.
- **Bestehender alter manueller Snapshot:** `snap-tiny-unit-b1jxvdtv` vom 31.10.2026 wurde nach ausdrücklicher Betreiberzustimmung gelöscht. Andere Projekte und ältere Branches wurden nicht gelöscht.
- **Neuer echter Provider-Snapshot:** `snap-ancient-voice-b1y0mz7b`, `ULC G04 Preview v16 recovery checkpoint 2026-11-08`, erstellt 08.11.2026 13:42:40Z auf dem unveränderten ursprünglichen Branch.
- **Wiederhergestellter separater Prüf-Branch:** `br-autumn-sunset-b1eb8zvj`, jetzt `ulc-g04-v16-restored-snapshot-20261108`. Provider bestätigte `restored_from=snap-ancient-voice-b1y0mz7b`. Eigener ausschließlich lesender Prüf-Endpunkt `ep-winter-wave-b1k9syam`; er ist **nicht** der Preview-Anwendungsendpunkt.

### Kritischer Provider-Effekt und unmittelbare Korrektur

Bei der Wiederherstellung mit `restore_snapshot` wurde vom Provider standardmäßig `finalize=true` angewendet, obwohl ein neuer Branch angefordert worden war. Dadurch wurde der wiederhergestellte Branch **vorübergehend als `main`/Default eingesetzt** und der bestehende Preview-Compute-Endpunkt umgehängt. Dies war **nicht** beabsichtigt und wird als Abweichung dokumentiert. Ein kurzzeitiger Einfluss auf Verbindungen kann nicht ausgeschlossen werden.

Die Zuordnung wurde sofort berichtigt und danach verifiziert:

- Der **ursprüngliche** Branch `br-delicate-surf-b1eu6ikn` heißt wieder `main`, ist `primary=true` und `default=true`.
- Der **ursprüngliche** Preview-Endpunkt `ep-green-resonance-b19c78rm` zeigt wieder auf `br-delicate-surf-b1eu6ikn` und behält seine ursprüngliche direkte Hostadresse.
- Der beim Providerwechsel zwischenzeitlich automatisch erzeugte Compute `ep-orange-smoke-b11kknzv` wurde entfernt, damit der ursprüngliche Endpunkt wieder auf den ursprünglichen Branch verschoben werden konnte. Der neue Prüfsnapshot und der Prüf-Branch blieben erhalten.
- Nach Korrektur zeigt eine lesende Quellprüfung weiterhin 4 Gruppen, 14 Trainingssessions und 9 Registrierungen. Keine sichtbaren Abweichungen bei den nachfolgenden Gesamtvergleichen.

**Sicherer zukünftiger Operatorablauf:** `restore_snapshot` nur mit **explizitem `finalize: false`** auf einen unabhängigen Ziel-Branch verwenden. Niemals den Default-Wert voraussetzen; anschließend Default-Branch-ID und Anwendungs-Endpunkt vor und nach dem Restore prüfen. `finalize_branch_restore` darf nicht aufgerufen werden. Ein produktiver Cutover benötigt eine gesonderte ausdrückliche Freigabe.

### Objektiver, lesender Quelle-/Restore-Vergleich

Nach der Korrektur wurden die ursprüngliche Quelle und der aus dem neuen Provider-Snapshot wiederhergestellte Branch über getrennte Endpunkte mit ausschließlich lesendem SQL verglichen:

| Prüfkriterium | Quelle | Restore |
| --- | --- | --- |
| Öffentliche Tabellen | 60 | 60 |
| Spalten | 457 | 457 |
| Gesamte Tabellenzeilen | 1.104 | 1.104 |
| Fehlende Datenhashes | 0 | 0 |
| SHA-256 der deterministisch aggregierten Tabelleninhalte | `65c6a7f783e21839175759e450f523e3e1a807cdf8aea798eed2804bcb0fb649` | identisch |
| SHA-256 aller Tabellen-Zeilenanzahlen | `87ea72d0266955f66b709c5f0e61c6ac3f66045fcc5b1e39821916311fe3dcf7` | identisch |
| SHA-256 der geschützten Purge-Funktions-ACL | `4034e0ce0619a9956a18639aa7a3060cc3fec007210b12368bc1589c05eec31d` | identisch |
| Geschützte Purge-Funktion vorhanden | ja | ja |
| v17-Kalenderregel / -Ausnahme | beide nicht vorhanden | beide nicht vorhanden |

Der vom Provider bereitgestellte Schema-Vergleich zwischen diesen Branches meldete einen **leeren Diff**.

**Beweisgrenze:** Der SHA-256-Wert der Tabelleninhalte ist **kein SHA-256 des Snapshot-Artefakts**. Das Provider-Snapshot wurde real wiederhergestellt, ist aber **kein separat gespeichertes, unabhängig erneut herunterladbares `pg_dump`-Backup** und kein `pg_restore` in eine unabhängig bereitgestellte leere Datenbank. Das vorhandene v17-Evidence-Ledger fordert genau diese getrennten Nachweise sowie eine noch ausstehende fachliche Privacy-Entscheidung. Sie werden durch dieses Paket **nicht** künstlich erfüllt.

## Abnahme und Folgearbeit

- **PASS:** alter Snapshot mit Zustimmung entfernt; neuer Provider-Snapshot vorhanden und isolierter Restore technisch nachgewiesen; Quelle/Restore-Schema, Zeilenanzahlen, Inhalte und relevante ACLs stimmen überein; die ursprüngliche Preview-Route ist wiederhergestellt.
- **OFFEN:** unabhängiges echtes `pg_dump`-Backup mit eigenem SHA-256 und `pg_restore`-Verifikationsnachweis; Controller-Entscheidung zu personenbezogener Datenverarbeitung/Export und Backup-Retention; separate Freigabe des v17-Preview-Migrationsgates.
- **BLOCKED:** aktives v16-Manifest, v17-Runtime-Aktivierung, Preview-/Produktionsdeployment oder Produktionsdatenmutation durch dieses Paket.

**Technische Vorkehrung für Folgeaktionen:** `finalize: false` **zwingend** übergeben, nicht auf den Neon-Standard verlassen.
