# K2-A02 – tatsächliche ACL-Abweichung der Restore-Quarantäne

Stand: 15.11.2026. **Echte read-only Neon-Katalogabfrage; kein Restore-, GRANT- oder Produktiv-Go.**

## Ausgangspunkt und verbindliche Beobachtung

K2-Backup/Restore waren bereits erfolgreich (Actions #43645974462 und #43647364218). Die folgenden Werte stammen **nicht** aus simulierten Fixtures, sondern aus ausschließlich lesenden `SELECT`-Abfragen der PostgreSQL-Systemkataloge des bestehenden EU-Neon-Previewprojekts. Verglichen wurden die originale Preview-Datenbank auf dem Default-Branch und **die separate K2-Restore-Datenbank** auf dem eigenen Quarantäne-Branch. Der Quarantäne-Branch enthält zusätzlich eine automatisch übernommene Preview-Datenbank; diese wurde **nicht** als Restore-Ziel verwechselt.

| Prüfung | Original Preview | K2-Restore | Einordnung |
| --- | ---: | ---: | --- |
| Tabellen `public` | 62 | 62 | Struktur vorhanden |
| Tabellen mit expliziter `relacl` | 62 | 0 | **FAIL**: explizite ACLs fehlen |
| Anwendungsrolle: Tabellen mit SELECT | 61 | 0 | **FAIL** |
| Anwendungsrolle: Tabellen mit INSERT | 61 | 0 | **FAIL** |
| Anwendungsrolle: Tabellen mit UPDATE | 60 | 0 | **FAIL** |
| Anwendungsrolle: Tabellen mit DELETE | 60 | 0 | **FAIL** |
| Backup-Rolle: Tabellen mit SELECT | 62 | 0 | **FAIL** |
| Aktiviertes / erzwungenes PostgreSQL-RLS | 0 / 0 | 0 / 0 | Kein RLS-Sicherheitsnachweis |
| PostgreSQL-RLS-Policies | 0 | 0 | Kein RLS-Sicherheitsnachweis |
| Sequences `public` | 4 | 4 | Rechte auf Sequences **nicht** geprüft |
| Anwendung: Schema USAGE / CREATE | ja / nein | ja / nein | Auf Schemaebene keine Abweichung |

Diese Werte sind aggregiert; keine privaten Tabellenzeilen, Konten, Zugangsdaten, Hostnamen oder Medienobjekte wurden in Dokument oder CI ausgegeben.

**Resultat: Die Datenbank wurde technisch wiederhergestellt, ist aber mit der bisherigen Preview-Anwendungsrolle nicht direkt verwendbar.** Der Restore ruft `pg_restore --no-owner --no-acl` auf. Das ist für die Isolation bewusst sicher; es reproduziert jedoch **nicht** die ursprünglichen GRANTs und Owner. `relacl IS NULL` bedeutet nicht, dass die Tabelle `PUBLIC`-Zugriff besitzt, sondern dass die expliziten Zugriffsrechte fehlen bzw. Standardregeln greifen.

## Reproduzierbare, nur lesende Diagnose

Die Datei `tooling/ulc-linz-k2-acl-readonly.sql` enthält genau **eine SELECT-Abfrage**, ohne DDL/DML, und erzeugt nur Zähler. Sie muss von einem zugelassenen read-only Operator **zweimal getrennt** gegen die exakt bestätigten Datenbanken ausgeführt werden: erst gegen die originale Preview-Quelle, dann gegen `ulc_linz_k2_restore_quarantine`. Nicht auf den Quarantäne-Branch allein vertrauen, da er mehrere Datenbanken enthält. Quelle und Ziel müssen vor dem Abruf separat anhand von Neon-Metadaten verifiziert werden.

Der rein lokale Node-Prüfer `evaluateK2AclParity({source, restored, controls})` vergleicht anschließend diese Zähler und blockiert bei jeder Abweichung. Bei gleichen Zählern verlangt er **zusätzliche unabhängige Nachweise**: Herkunft, getrennte Endpunkte, Rechte pro Tabelle, Rollenmitgliedschaften, geprüfte Owner-Zuordnung, Sequence-/Funktionsrechte, negative App-Berechtigungstests sowie nachgewiesene Cloudflare-Nichtanbindung. Er erteilt auch dann **niemals** Freigaben für GRANT, Provideraktionen, Deployments oder Produktion.

Tests: `node --test tooling/ulc-linz-k2-acl-parity.test.mjs`. Die Tests verwenden die beobachteten aggregierten Werte sowie synthetische Grenzfälle; sie verbinden sich **nicht** mit Neon.

## Warum nicht pauschal Rechte kopieren?

Die Preview-Zugriffslogik in `tooling/ulc-linz-d4-preview-database-access.mjs` enthält gezielte Ausnahmen:
- Kein allgemeiner Anwendungszugriff auf die sicherheitsrelevante Ereignistabelle;
- eingeschränkter Zugriff auf Traineridentitäts-Auditdaten;
- begrenzte Sequence-/Funktionsrechte;
- separate Sicherheitsprotokoll-Rollen und strikte Membership-/Owner-Grenzen.

Ein blindes `GRANT ALL ON ALL TABLES` oder ein Restore inklusive fremder Owner/ACLs kann diese Schutzgrenzen aushebeln. Der fachlich richtige zukünftige Test muss ein **reviewtes, zielgebundenes Rechte-Mapping** für den isolierten Restore enthalten; er darf die Quarantäne weder mit Live-Routen noch mit produktiven Berechtigungsnachweisen vermischen.

## Betreiber-Gates, in dieser Reihenfolge

1. **P1-A: read-only:** Tabellen-/Spalten-/Sequence-/Funktion-ACLs und Rollenmitgliedschaften pro Objekt vergleichen; nicht nur Zähler. Exakte Ausnahmen aus vorhandener D4-/M5-Zugriffslogik übernehmen; gesondert die Cloudflare-/Hyperdrive-/Route-Nichtanbindung nachweisen. Bei unbekannten Daten: BLOCK.
2. **P1-B: gesonderter isolierter Rechteaufbau (noch nicht genehmigt):** Nach ausdrücklich erteilter Provider-/Schreibfreigabe ausschließlich auf der benannten Quarantäne-DB, getrennte Rollen, transaktionale, idempotente und rollbackfähige Grants unter Audit. Keinerlei Produktions- oder Preview-DB-Mutation. Vorher Backup-/Restore-Stand, Owner-Konzept und Berechtigungsmatrix verbindlich prüfen.
3. **P1-C: App-Rechte:** erst mit eigenen isolierten Testidentitäten Login/Logout, Gruppen-/Organisationsgrenzen, Schreibverbote, Security-Logging und geschützte ULC-Module prüfen. Da in den geprüften Tabellen **keine PostgreSQL-RLS-Policies aktiv** sind, muss die tatsächliche Sicherheitsgrenze primär auf App-/Service-Ebene getestet werden; ein leerer RLS-Befund ist kein PASS für Organisationstrennung.
4. **P2/P3:** separat echten Medienbackup- und Medien-Restore sowie isoliertes App-E2E nachweisen, anschließend echte Wiederanlaufzeiten und datenschutzrechtliche Re-Deletion abnehmen. Siehe [Issue #640](https://github.com/martinirrgeher-cloud/appbasis/issues/640).

**Aktueller Status:** P1 Neon-Branch- und DB-Trennung teilweise PASS, **ACL-Parität FAIL**, Cloudflare-Nichtanbindung OFFEN, echte App-/Medien-/RPO-/RTO-Abnahme offen. **Kein GRANT, REVOKE, Merge, Deployment, Provider-Write oder Produktiv-Go in diesem Paket.**
