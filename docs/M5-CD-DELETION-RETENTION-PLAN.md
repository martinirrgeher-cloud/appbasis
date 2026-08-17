# M5-C/D – ULC Lösch- und Aufbewahrungsplan

Stand: 2026-08-17

## Zweck

Dieser Plan konkretisiert die M5-Pflichtkriterien **Löschkonzept** und **Aufbewahrungskonzept** der ersten realen Ziel-App **ULC Linz**.

Die Betreiberwerte sind bestätigt. Der Plan setzt trotzdem weder `deletionPolicy` noch `retentionPolicy` auf `verified`, führt keine Datenbankänderung aus und löst keine Provider- oder Produktionsaktion aus. M5 bleibt all-required und fail-closed.

## Verbindliche Grundsätze

- Deaktivieren ist nicht Löschen.
- Archivieren ist nicht Löschen.
- Anonymisieren darf nur dann als Endzustand gelten, wenn eine Re-Identifizierung aus dem verbleibenden App-Datenbestand nicht mehr möglich ist.
- Löschung und Aufbewahrung werden **je Datenklasse** entschieden; eine Ausnahme für eine Klasse darf nicht stillschweigend alle anderen Klassen blockieren.
- Jeder privilegierte Lösch-/Ausnahmevorgang muss serverseitig autorisiert und auditiert werden.
- Cross-Organization-Zugriffe bleiben deny-by-default.
- Restore/Backup darf bereits wirksam gewordene Lösch- oder Anonymisierungsentscheidungen nicht dauerhaft rückgängig machen.
- Backup-Retention und Primärdaten-Retention sind getrennte Verträge und müssen beide nachweisbar sein.
- Keine produktive Datenbankänderung, kein Providerwrite und keine Produktionsfreigabe ohne ausdrückliche Zustimmung.

## Datenklassen für ULC

Die technische Umsetzung muss mindestens folgende reale Klassen getrennt behandeln:

1. **Mitglieds- und Kontaktstammdaten**
   - Person-/Kontaktbezug, Mitgliedschaftsbezug und organisatorische Zuordnung.
2. **Operative Trainings- und Teilnahmedaten**
   - Anmeldungen, Anwesenheiten, Trainings-/Planungs-/Dokumentationsdaten und daraus abgeleitete operative Historie.
3. **Besonders sensible Zusatzdaten**
   - Daten, die über die normale Vereins-/Trainingsverwaltung hinaus besonderen Schutz benötigen.
   - Medizinische Diagnosen und Gesundheitsakten sind für v0.1 nicht als normaler App-Datenbestand vorgesehen.
4. **Audit- und Security-Daten**
   - Auth-, Rollen-, Permission- und privilegierte Administrationsereignisse.
5. **Medien/Dateien**
   - soweit die konkrete ULC-App sie tatsächlich verwendet; Ownership und Zweck müssen dem zugehörigen Datensatz zuordenbar sein.
6. **Backups/Restore-Kopien**
   - technisch getrennt von der Primärdatenbank; Rotation und Wiederherstellungsprozess müssen Löschentscheidungen respektieren.

Neue Datenklassen werden nicht pauschal einer bestehenden Klasse zugeschlagen. Wenn ein reales Fachmodul zusätzliche Daten mit eigener Zweck-/Retention-Semantik einführt, braucht diese Klasse eine explizite Zuordnung.

## Aktueller realer technischer Ausgangspunkt

Der derzeitige ULC-Runtime-Slice verwendet weiterhin `modules: []`. Das Datenbankmanifest besitzt ausschließlich die bereits bestehenden Owner `identity` und `permissions`. Mitgliedschafts- und Subject-Scope-Daten werden im aktuellen M5-B-Slice bewusst über app-spezifische Resolver angebunden; dort wird keine neue Membership-/Relation-Tabelle erfunden.

Für M5-C/D folgt daraus:

- Es existieren aktuell **keine realen ULC-Fachmodultabellen**, an denen Trainings-/Teilnahmedaten technisch gelöscht oder aufbewahrt werden könnten.
- Es existiert aktuell **kein ULC-Object-Storage-Vertrag**; Medien-Retention bleibt deshalb Policy-/Acceptance-Vorbereitung und darf noch nicht als technisch erfüllt gelten.
- Der bestehende gemeinsame `IdentityService` besitzt einen expliziten `disableIdentity()`-Pfad. Dieser beendet Zugriff, ist aber kein Lösch- oder Anonymisierungsvertrag und darf M5-C nicht verifizieren.
- Der bestehende Permissions-Pfad schreibt privilegierte Rollen-/Principal-Änderungen in `appbasis_permission_administration_audit`. Diese Audit-Daten haben den bestätigten eigenen Retention-Vertrag von 12 Monaten und dürfen nicht still mit dem Lifecycle des betroffenen Principals gelöscht werden.
- Die tatsächliche Persistenz hinter ULC-Membership- und Subject-Scope-Resolvern muss vor einem M5-C/D-`verified` vollständig inventarisiert sein. Ein Resolver-Interface allein beweist keine Lösch-/Retention-Semantik.

Diese Feststellung ist keine neue Plattformarchitektur. Sie verhindert gerade, dass vor dem ersten realen Fachmodul spekulative Lifecycle-Tabellen, Jobs oder generische Datenschutz-Frameworks gebaut werden.

## Bestätigte Betreiberwerte

Am 2026-08-17 wurden folgende Werte bestätigt:

| Datenklasse | bestätigter Zielwert | Status |
|---|---:|---|
| Mitglieds-/Kontaktstammdaten | 12 Monate nach Austritt/Zweckende; danach löschen oder belastbar anonymisieren | **bestätigt** |
| operative Trainings-/Teilnahmedaten | 24 Monate; danach löschen oder irreversibel anonymisieren; rein anonyme Statistik darf bleiben | **bestätigt** |
| besonders sensible Zusatzdaten | 90 Tage nach Zweckende | **bestätigt** |
| Audit-/Security-Daten | 12 Monate | **bestätigt** |
| Backup-Rotation | maximal 35 Tage | **bestätigt** |
| Medien | folgen dem zugehörigen Datensatz; verwaiste Medien spätestens nach 30 Tagen entfernen | **bestätigt** |

Diese Werte sind verbindlicher Policy-Input. Sie sind noch keine technische M5-Evidenz und werden nicht automatisch in einer produktiven Datenbank aktiviert.

## M5-C – Löschung

### Zielzustände

Für jede Datenklasse muss die spätere technische Policy explizit festlegen, welche der folgenden Operationen zulässig sind:

- `deactivate`: Nutzung/Zugriff beenden, Daten bleiben erhalten.
- `archive`: aus dem aktiven Arbeitsbestand entfernen, Daten bleiben erhalten.
- `anonymize`: Personenbezug irreversibel aus dem verbleibenden App-Datenbestand entfernen.
- `delete`: Datensatz/Objekt entsprechend dem bestätigten Datenklassenvertrag entfernen.

Ein technischer Consumer darf diese Zustände nicht synonym behandeln.

### Mindest-Acceptance für die spätere Runtime

1. Der Löschpfad ist an die exakte ULC-App und Organisation gebunden.
2. Unberechtigte Nutzer und Cross-Organization-Aufrufe werden abgewiesen.
3. `deactivate` und `archive` erfüllen das Kriterium **Löschung** nicht; insbesondere verifiziert der bestehende `disableIdentity()`-Pfad M5-C nicht.
4. Für jede Datenklasse ist der erlaubte Endzustand explizit.
5. Eine Anonymisierung wird nur akzeptiert, wenn die verbleibenden app-eigenen Referenzen keinen Personenbezug rekonstruieren können.
6. Beziehungen und abhängige Datensätze werden entweder entsprechend der bestätigten Datenklassenregel behandelt oder blockieren fail-closed; keine stillen Orphans.
7. Jeder privilegierte Lösch-/Anonymisierungsvorgang erzeugt ein Audit-Ereignis ohne den gelöschten sensiblen Inhalt selbst in das Audit zu kopieren.
8. Fehler innerhalb eines mehrstufigen Löschvorgangs dürfen keinen scheinbaren Erfolgszustand erzeugen.
9. Ein Restore-Test beweist, dass bereits fällige/ausgeführte Löschentscheidungen nicht dauerhaft als aktive Daten wiederkehren.
10. Eine nicht abgedeckte neue Datenklasse hält M5-C `open`, bis ihr Löschvertrag explizit ergänzt wurde.
11. Falls ein Principal fachlich gelöscht/anonymisiert wird, dürfen aktive Rollen, direkte Grants/Revokes oder Sessions keinen fortbestehenden Zugriff ermöglichen; Audit-Aufbewahrung wird trotzdem nach ihrem eigenen Vertrag behandelt.
12. Eine unbekannte Persistenz hinter Membership-/Subject-Scope-Resolvern hält M5-C `open`.

### Noch nicht festgelegte Implementierungsdetails

Die Policy schreibt bewusst **nicht** vor, ob die spätere Umsetzung über Tombstones, Lifecycle-Tabellen, Jobs oder einen anderen bestehenden Vertrag erfolgt. Diese Entscheidung wird erst mit dem realen ULC-Verbraucher und den vorhandenen Runtime-/Datenverträgen getroffen. Keine neue Plattformabstraktion ohne realen Bedarf.

Insbesondere wird der gemeinsame Identity-/Permissions-Vertrag nicht nur für M5-C/D erweitert, solange noch nicht feststeht, dass ein realer ULC-Verbraucher diese Erweiterung benötigt. Eine notwendige Änderung an diesen gemeinsamen Security-Boundaries wäre ein eigener eng begrenzter technischer Slice und darf nicht parallel zum aktiven M5-B-Runtime-Slice erfolgen.

## M5-D – Aufbewahrung

### Policy-Anforderungen

Jede bestätigte Retention-Regel benötigt mindestens:

- stabile Datenklassen-ID,
- auslösendes Ereignis, z. B. Austritt oder Zweckende,
- Frist oder expliziten Reviewzeitpunkt,
- zulässigen Endzustand nach Fristablauf,
- definierte Ausnahmegründe,
- nachvollziehbaren Status `active`, `due`, `exception` oder `completed`,
- Auditierbarkeit privilegierter Ausnahmen.

### Mindest-Acceptance für die spätere Runtime

1. Fälligkeit wird deterministisch aus dem bestätigten Datenklassenvertrag berechnet.
2. Fehlender/ungültiger Zeitbezug führt nicht zu automatischer Löschung, sondern fail-closed in einen prüfbaren Fehlerzustand.
3. Ein fälliger Datensatz wird erkannt, auch wenn der automatische Verarbeitungslauf zeitweise ausgefallen war.
4. Eine dokumentierte Ausnahme blockiert nur die konkret betroffene Datenklasse bzw. den konkret betroffenen Datensatz.
5. Ausnahmen benötigen Grund, Actor, Zeitpunkt und Reviewzeitpunkt; unbegrenzte stille Ausnahmen sind unzulässig.
6. Nach Wegfall einer Ausnahme wird die ursprüngliche Fälligkeit erneut bewertet; die Frist startet nicht automatisch neu.
7. Backup-Rotation wird separat geprüft und darf eine längere Aufbewahrung der Primärdaten nicht rechtfertigen.
8. Provider-/DPA-Retention wird separat unter M5-G belegt; eine App-Policy allein beweist keine Providerlöschung.
9. Technische Uhr-/Metadatenfehler bleiben fail-closed und erzeugen kein `verified`.
10. Eine tatsächlich verwendete personenbezogene Datenklasse ohne explizite bestätigte Frist hält M5-D `open`.
11. Audit-/Security-Daten behalten ihren eigenen 12-Monats-Vertrag auch dann, wenn der betroffene operative Datensatz oder Principal vorher gelöscht/anonymisiert wird; nach Ablauf benötigt auch die Audit-Klasse einen definierten Lösch-/Anonymisierungsendzustand.
12. Neue Fachmodule dürfen M5-D nicht automatisch von einer bestehenden Klasse erben, wenn deren Zweck, Trigger oder Endzustand nicht nachweislich identisch ist.

## Medienregel

- Ein Medium ist einem fachlichen Datensatz bzw. einer expliziten Ownership zugeordnet.
- Wird dieser Datensatz endgültig gelöscht und besteht keine separate bestätigte Aufbewahrungsgrundlage, wird auch das Medium gelöscht.
- Verwaiste Medien werden spätestens 30 Tage nach Feststellung entfernt.
- Ein Medium ohne belastbare Ownership-/Zweckzuordnung darf M5-C/D nicht als `verified` passieren.
- Solange ULC keinen realen Object-Storage-Verbraucher besitzt, wird dafür keine Storage-/Cleanup-Abstraktion vorab gebaut.

## Vorbereitete technische Slice-Reihenfolge

Sobald der finale ULC-Runtime-/M5-B-Stand auf `main` integriert und erneut live geprüft ist:

1. **M5-CD1 – reales Dateninventar:** exakte persistente Owner, Membership-/Subject-Scope-Backing-Stores und vorhandene Fachmodule inventarisieren. Nur read-only; unbekannte Owner halten C/D `open`.
2. **M5-CD2 – vorhandene Plattformdaten:** für tatsächlich ULC-relevante Identity-/Permissions-Daten den Lifecycle gegen bestehende Verträge prüfen. `disableIdentity()` bleibt Deaktivierung; ein fehlender Lösch-/Anonymisierungsvertrag wird nicht durch Dokumentation ersetzt.
3. **M5-CD3 – erster realer Fachdatensatz:** erst wenn ein tatsächliches ULC-Fachmodul persistente personenbezogene Daten besitzt, genau eine Datenklasse als kleinen Vertical Slice mit Fälligkeit, Autorisierung, Audit und Endzustand implementieren und PostgreSQL-E2E testen.
4. **M5-CD4 – weitere reale Datenklassen:** nur aus tatsächlichen Verbrauchern fortsetzen; keine generische Lifecycle-Schicht vorab.
5. **M5-CD5 – Medien:** erst mit realem Object Storage Ownership, Löschung und 30-Tage-Orphan-Cleanup technisch ergänzen.
6. **M5-CD6 – Restore-Evidence:** M4-Restore um den Nachweis ergänzen, dass bereits wirksame Lösch-/Anonymisierungsentscheidungen nicht dauerhaft reaktiviert werden.
7. **M5-CD7 – Factory-Evidenz:** `deletionPolicy` und `retentionPolicy` erst dann auf `verified` setzen, wenn alle tatsächlich verwendeten personenbezogenen Datenklassen vollständig abgedeckt und die technischen Tests grün sind.

Jeder technische Slice folgt danach dem normalen Gate: Implementierung → vollständige CI → ausführliche ChatGPT-Diff-/Architektur-/Security-Prüfung → gebündelte Findings → Exact-Head-CI → ein finaler Codex-Review, sobald Kontingent vorhanden ist.

## Technische Testmatrix für den ersten ausführbaren Slice

Mindestens folgende Fälle sind bereits vorbereitet und müssen auf reale Tabellen/Resolver gebunden werden, statt mit erfundenen Fixtures die Architektur vorzugeben:

- eigener Verein + berechtigter Actor + noch nicht fällig → keine Löschung
- eigener Verein + berechtigter Actor + fällig → definierter Endzustand
- Cross-Organization → deny
- inaktive/fehlende Membership → deny
- unbekannte Datenklasse → fail-closed
- fehlender/ungültiger Zweckende-/Austrittszeitpunkt → kein automatischer Erfolg
- dokumentierte Ausnahme → nur betroffener Datensatz/diese Klasse blockiert
- abgelaufene Ausnahme → ursprüngliche Fälligkeit wird erneut bewertet
- `disableIdentity()` → weiterhin **nicht gelöscht**
- Lösch-/Anonymisierungserfolg → kein aktiver Permission-/Session-Zugriff bleibt bestehen
- Audit-Ereignis enthält Metadaten, aber keinen gelöschten sensiblen Payload
- Restore eines älteren Backups → bereits wirksame Lifecycle-Entscheidung wird erneut durchgesetzt bzw. bleibt nachweisbar wirksam
- neu hinzugefügter persistenter Owner oder Fachmodul-Datensatz ohne Lifecycle-Zuordnung → M5-C/D bleiben `open`

## Aktueller Blocker

Der **manuelle Betreiberblocker ist aufgehoben**. Die Retention-, Medien- und Löschgrundwerte sind bestätigt.

Der technische Blocker ist jetzt präziser:

- Der reale ULC-Runtime-/M5-B-Strang ist noch nicht auf `main` integriert und darf nicht parallel durch M5-C/D an derselben Security-/Runtime-Grenze verändert werden.
- Der aktuelle ULC-Runtime-Stand besitzt noch keine Fachmodule und damit keine realen Trainings-/Teilnahmetabellen; dafür wird bewusst keine spekulative Lifecycle-Schicht gebaut.
- Identity besitzt bislang einen Deaktivierungs-, aber keinen durch M5-C verifizierbaren Lösch-/Anonymisierungsvertrag.
- Membership-/Subject-Scope-Persistenz muss mit dem finalen realen Verbraucher identifiziert werden.

Bis diese Punkte durch reale Verbraucher aufgelöst sind, dürfen Acceptance-/Inventarverträge weiter vorbereitet werden; M5-C/D bleiben technisch `open` und `Production Ready` bleibt fail-closed.
