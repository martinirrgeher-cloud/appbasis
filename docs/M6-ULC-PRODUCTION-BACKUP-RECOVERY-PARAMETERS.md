# M6 – ULC Linz Production Backup & Recovery Parameters

Stand: 2026-08-19

## Status

**Entscheidungs- und Ausführungsvorbereitung. Keine Providerfreigabe, kein Backup-/Restore-Write und keine Produktionsänderung.**

Dieses Dokument konkretisiert den bereits vorhandenen M4-/M5-I-/M6-Backup-&-Recovery-Vertrag für die erste reale `ulc-linz`-Produktionsdatenbank. Es ersetzt keinen Provider-Read, keine reale Restore-Evidence und keine ausdrückliche Freigabe für produktive/externe Aktionen.

Verbindliche Grundlagen bleiben:

- eigene Neon-Produktionsdatenbank für `ulc-linz` in Frankfurt,
- automatische Backups/Recovery mit definierter Retention,
- Backup unmittelbar vor kritischen Produktionsmigrationen,
- dokumentierter Restore-Pfad,
- mindestens ein realer kontrollierter Restore vor Production Ready,
- Restore-Evidence für Datenintegrität, Auth, Permissions, Application-Smoke und Restore-Reconciliation,
- kein Production Release allein aufgrund eines vorhandenen Backups.

## 1. Bestehende AppBasis-Sicherheitsgrenze

Der aktuelle ULC-C/D-Vertrag hält abgeschlossene Löschentscheidungen als Löschmarker bzw. Identity-Deletion-Tombstones **35 Tage** vor.

Die Restore-Reconciliation verwendet diese autoritativ neueren Löschmarker, bevor ein älterer wiederhergestellter Datenstand produktiv werden darf. Rollen-, Organisations- oder Subject-Drift blockiert fail-closed; es wird keine gelöschte Identität aus einem alten Backup still reaktiviert.

Der PostgreSQL-E2E-Vertrag beweist zusätzlich:

- alter Datenbankstand wird real als Restore-Ausgangslage verwendet,
- Löschungen erfolgen danach in der neueren autoritativen Quelle,
- die Löschmarker werden in den alten Restore replayed,
- gelöschte Benutzer können danach nicht mehr authentifiziert werden,
- Permission-/Membership-Zustand bleibt gelöscht,
- Löschmarker bleiben exakt an der 35-Tage-Grenze erhalten und werden erst danach purgiert.

**Folgerung:** Solange dieser C/D-Vertrag gilt, darf kein personenbezogener ULC-Recovery-Point weiter restaurierbar bleiben, sobald der von ihm repräsentierte Datenstand älter als 35 Tage ist. Maßgeblich ist der Recovery-Point-Zeitpunkt, nicht der spätere Zeitpunkt, zu dem ein Snapshotobjekt angelegt wurde.

## 2. Aktueller Neon-Recovery-Baukasten – Planungsbasis

Die aktuellen offiziellen Neon-Unterlagen unterscheiden zwei Recovery-Ebenen:

1. **Instant Restore / Time Travel (PITR)** innerhalb des konfigurierten Restore Window.
2. **Snapshots**, manuell oder über einen Backup Schedule.

Aktueller Planstand laut Neon:

- Launch: bis zu 7 Tage Time Travel / Restore,
- Scale: bis zu 30 Tage Time Travel / Restore,
- neue bezahlte Projekte starten aktuell standardmäßig mit einem kürzeren Restore Window; der gewünschte Wert muss deshalb nach dem späteren Create explizit read-only geprüft bzw. bewusst konfiguriert werden,
- Backup Schedules benötigen einen bezahlten Plan.

Für Scheduled Snapshots definiert die aktuelle Neon-OpenAPI:

- bekannte Frequenzen `daily`, `weekly`, `monthly`,
- `retention_seconds` maximal und standardmäßig `3024000`, also exakt 35 Tage,
- manuelle Snapshots besitzen keine entsprechende Maximal-Retention und werden über `expires_at` begrenzt,
- ein manueller Snapshot kann über `timestamp` oder `lsn` auch einen älteren Punkt innerhalb des aktuellen Restore Window repräsentieren.

Snapshots sind aktuell als Beta ausgewiesen. Diese Eigenschaft muss am realen Production-Freigabetag erneut geprüft und bewusst akzeptiert oder durch einen anderen Backup-Pfad ersetzt werden. Diese Vorbereitung nimmt keine Beta-/Kostenfreigabe vorweg.

## 3. Empfohlene erste Produktionsparameter

### 3.1 Scheduled Backup

Für den ersten realen ULC-Produktionsstand wird vorbereitet:

- Frequenz: **täglich**,
- Retention: **3024000 Sekunden / 35 Tage**,
- Quelle: ausschließlich der maßgebliche Production-Root-Branch,
- konkrete Ausführungsstunde: noch **nicht** hart codieren; beim später freigegebenen Setup zunächst die Provider-Zeitzonensemantik und ein geeignetes verkehrsarmes Fenster autoritativ prüfen,
- Backup Schedule nach dem Write sofort wieder per Provider-GET verifizieren.

35 Tage werden nicht gewählt, weil längere Historie unerwünscht wäre, sondern weil sie exakt der heute bewiesenen maximalen C/D-Restore-Reconciliation-Grenze entsprechen.

### 3.2 PITR / Restore Window

PITR bleibt zusätzlich erwünscht, weil es für jüngere Vorfälle feinere Recovery Points als tägliche Snapshots erlaubt.

Vorbereitet wird:

- Restore Window nach dem späteren Projekt-Create ausdrücklich auf den für den freigegebenen Plan gewünschten Wert setzen und read-only verifizieren,
- Launch kann aktuell bis zu 7 Tage bereitstellen,
- Scale kann aktuell bis zu 30 Tage bereitstellen,
- kein Upgrade auf Scale **nur** wegen des 35-Tage-C/D-Fensters: Scheduled Snapshots können den 35-Tage-Horizont abdecken; die finale Planwahl muss gemeinsam mit den übrigen Security-, Networking-, Logging- und Kostenanforderungen erfolgen.

Damit ist `PITR < 35 Tage` kein Sicherheitsproblem: Die Löschmarker leben länger als jeder PITR-Punkt und decken zusätzlich die 35-Tage-Snapshots ab.

### 3.3 Manueller Snapshot vor kritischen Migrationen

Vor jeder kritischen Produktionsmigration ist ein expliziter Pre-Migration-Recovery-Point erforderlich.

Für einen normalen Pre-Migration-Snapshot soll der Recovery Point der unmittelbar vor der Migration liegende aktuelle Production-Zustand sein. Neon erlaubt technisch aber auch die Erzeugung eines Snapshots aus einem älteren `timestamp`-/`lsn`-Punkt. Deshalb gilt die Ablaufgrenze immer relativ zum **repräsentierten Recovery Point**.

Für einen manuellen Neon-Snapshot gilt fail-closed:

- Snapshot nur vom maßgeblichen Production-Root-Branch,
- Snapshot-ID/Branch-ID nur in geschützter Operations-Evidence, nicht im normalen App-Manifest/UI-Snapshot,
- Recovery-Point-Zeitpunkt aus der autoritativen Snapshot-/Operation-Evidence eindeutig bestimmen,
- `expires_at` **muss gesetzt** sein,
- `expires_at` darf maximal `recovery-point-at + 35 Tage` betragen,
- ist dieser berechnete Ablaufzeitpunkt beim geplanten Create bereits erreicht oder überschritten, darf der Snapshot nicht als zulässiger ULC-Recovery-Point erzeugt/verwendet werden,
- kein `expires_at = null`, kein „never expires“ und kein manuell später verlängertes Ablaufdatum über die Recovery-Point-Grenze,
- die konkrete Migration darf erst nach read-only bestätigtem Snapshotzustand freigegeben werden.

Damit kann ein heute erzeugtes Snapshotobjekt eines bereits älteren PITR-Zustands die 35-Tage-Lifecycle-Grenze nicht nach hinten verlängern.

Wenn künftig ein Backup länger als 35 Tage benötigt wird: **STOP.** Zuerst C/D-Löschmarker-/Tombstone-Retention und Restore-Reconciliation bewusst neu bewerten und technisch neu beweisen. Backup-Retention niemals allein verlängern.

## 4. Recovery-Pfad – Preview zuerst, Promotion separat

Ein realer Restore ist ein produktionsrelevanter Write und benötigt ausdrückliche Nutzerfreigabe.

Der sichere Ablauf wird wie folgt vorbereitet:

1. **READ:** Incident-/Recovery-Ziel, aktuelle Production-Bindung, verfügbares PITR-/Snapshot-Inventar und Recovery Point erfassen.
2. **READ:** eine **autoritativ neuere Quelle der aktuell noch gültigen ULC-Löschmarker** sichern/identifizieren. Das kann der noch erreichbare aktuelle Production-Stand oder ein autoritativ neuerer Recovery Point sein.
3. **RESTORE-WRITE:** Restore zunächst isoliert bzw. mit Neon-Snapshot-Restore `finalize_restore=false` erstellen. Produktion wird dadurch nicht ersetzt.
4. **READ:** Restore-Operation vollständig abschließen lassen und ein vom Source-Binding verschiedenes Restore-Target nachweisen.
5. **READ/TEST:** Datenintegritäts-Fingerprint/Counts prüfen.
6. **READ/TEST:** Auth prüfen.
7. **READ/TEST:** Permissions inklusive Allow- und Deny-Fall prüfen.
8. **READ/TEST:** Application-Smoke durchführen.
9. **RECONCILIATION-WRITE:** autoritativ neuere Löschmarker gegen den älteren Restore reconciliieren.
10. **READ/TEST:** nach Reconciliation erneut beweisen, dass gelöschte Identitäten, Memberships und Permissions nicht reaktiviert sind.
11. **ENTSCHEIDUNG:** nur wenn alle Checks grün sind, darf eine tatsächliche Produktionsumschaltung überhaupt zur ausdrücklichen Freigabe vorgelegt werden.
12. **PRODUCTION-RESTORE-WRITE:** `finalize_restore=true` bzw. eine gleichwertige Production-Umschaltung ist ein eigener, separat freizugebender Produktionswrite.
13. **READ:** nach Finalisierung die neue reale Branch-/Database-/Runtime-Bindung erneut autoritativ inventarisieren.
14. **READ:** alle volatilen M5-F/G/H/I/J-Evidenzen neu erheben; alte Resource-Binding-Fingerprints dürfen nicht weiterverwendet werden.
15. **CLEANUP-WRITE:** einen von Neon beim finalisierten Restore erzeugten alten/orphaned Branch erst nach vollständiger Verifikation und eigener destruktiver Freigabe entfernen.

### Harte Restore-Abbruchregel

Ist für einen Restore auf einen älteren Datenstand **keine autoritativ neuere Löschmarkerquelle** mehr verfügbar, gilt:

**STOP – der alte Restore darf nicht als Produktion promoted werden.**

Es wird weder aus dem alten Backup geraten, wer zwischenzeitlich gelöscht wurde, noch wird die Reconciliation übersprungen.

Diese Regel bevorzugt bewusst Fail-closed-Verfügbarkeitseinbußen gegenüber der Wiederbelebung bereits gelöschter personenbezogener Daten.

## 5. Controlled-Restore-Evidence für M5-I

Der bestehende M5-I-Owner darf `backupRestoreBeforeProduction=true` nur aus einer realen, production-gebundenen Controlled-Restore-Evidence ableiten.

Vor Production Ready müssen deshalb gemeinsam belegt sein:

- reale Source-Production-DB-Bindung,
- Restore-Target-Binding verschieden von Source,
- `evidenceSource = controlled-restore-run`,
- `automaticBackupsEnabled = true`,
- Retention definiert,
- Pre-Migration-Backup definiert,
- Restore-Verfahren dokumentiert,
- Restore erfolgreich,
- Datenintegrität erfolgreich geprüft,
- Auth erfolgreich geprüft,
- Permissions erfolgreich geprüft,
- Application-Smoke erfolgreich geprüft,
- Restore-Reconciliation erfolgreich geprüft,
- realer Restore-Testzeitpunkt nicht in der Zukunft,
- Evidence gehört weiterhin zum aktuell gebundenen Production-Resource-Snapshot.

Dokumentation oder Fixtures allein erzeugen diese Evidence ausdrücklich nicht.

## 6. Provider-/Planentscheidung

Diese Vorbereitung legt **keinen kostenpflichtigen Neon-Plan** fest.

Aktueller Entscheidungsrahmen:

- ein bezahlter Plan ist für Scheduled Backup Schedules erforderlich,
- Launch ist nach aktuellem Funktionsstand für **Backup/Recovery allein** grundsätzlich ausreichend, weil 7 Tage PITR mit Scheduled Snapshots bis 35 Tage kombiniert werden können,
- Scale ist allein für den 35-Tage-C/D-Reconciliation-Horizont nicht erforderlich; es kann aus anderen Security-/Networking-/SLA-Anforderungen trotzdem notwendig oder sinnvoll werden,
- Plan, tatsächliche Kosten und Beta-Status der Snapshotfunktion müssen unmittelbar vor Bestellung erneut live geprüft und vom Nutzer ausdrücklich akzeptiert werden.

Keine neue kostenpflichtige Ressource wird durch dieses Dokument freigegeben.

## 7. Kein erfundenes SLA

Für ULC v0.1 wird in dieser Vorbereitung kein künstliches RPO-/RTO-SLA erfunden.

Stattdessen wird beim ersten kontrollierten Production-Restore real erfasst:

- ausgewählter Recovery Point,
- Startzeit,
- Ende,
- tatsächliche Restore-Dauer,
- Dauer bis Datenintegrität/Auth/Permissions/Application-Smoke/Reconciliation grün sind,
- Ergebnis und relevante Abweichungen.

Ein späteres formales RPO/RTO-Ziel wird erst aus realen Betriebsanforderungen und gemessenen Restore-Daten abgeleitet.

## 8. Re-Validation Trigger

Backup-/Recovery-Evidence muss neu bewertet bzw. neu getestet werden, wenn mindestens eine dieser Grenzen materially driftet:

- Production-DB-/Branch-Binding,
- Neon-Plan oder Restore Window,
- Backup-Schedule-/Snapshot-Retention,
- Provider-Snapshot-/Restore-Semantik,
- ULC-Datenowner oder neue personenbezogene Persistenz,
- Löschmarker-/Tombstone-Horizont,
- Restore-Reconciliation-Vertrag,
- Auth-/Permissions-/Lifecycle-Persistenz,
- kritischer Migration-/Schema-Vertrag.

Keine generische zusätzliche Backup-Plattform wird vorsorglich aufgebaut. Ein externer/cross-provider Backup-Pfad wird erst ergänzt, wenn ein realer Recovery-/Compliance-Verbraucher ihn verlangt.

## 9. Manuelle Freigabepunkte

Später getrennt und ausdrücklich freizugeben:

1. konkreter Neon-Plan und Kosten,
2. Akzeptanz des dann aktuellen Snapshot-/Backup-Produktstatus,
3. Production-Projekt-/Branch-/DB-Create,
4. Restore-Window-/Backup-Schedule-Konfiguration,
5. Pre-Migration-Snapshot,
6. produktive Migration,
7. realer isolierter Controlled Restore,
8. Reconciliation-Write im Restore-Ziel,
9. tatsächliche Production-Restore-Finalisierung im Incident-Fall,
10. spätere Löschung eines alten/orphaned Restore-Branches.

## 10. Aktuelle offizielle Planungsquellen

Planungsgrundlage, keine Production-Evidence:

- Neon OpenAPI Specification: `https://neon.com/api_spec/release/v2.json`
- Backup Schedule API: `https://api-docs.neon.tech/reference/setsnapshotschedule`
- Snapshot Create API: `https://api-docs.neon.tech/reference/createsnapshot`
- Snapshot Restore API: `https://api-docs.neon.tech/reference/restoresnapshot`
- Neon Backup/Snapshot Changelog: `https://neon.com/docs/changelog/2025-10-31`
- Neon Pricing/plan limits: `https://neon.com/pricing`

Providerangaben werden unmittelbar vor einem produktiven/zahlungspflichtigen Write erneut live geprüft.
