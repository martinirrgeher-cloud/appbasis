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
3. `deactivate` und `archive` erfüllen das Kriterium **Löschung** nicht.
4. Für jede Datenklasse ist der erlaubte Endzustand explizit.
5. Eine Anonymisierung wird nur akzeptiert, wenn die verbleibenden app-eigenen Referenzen keinen Personenbezug rekonstruieren können.
6. Beziehungen und abhängige Datensätze werden entweder entsprechend der bestätigten Datenklassenregel behandelt oder blockieren fail-closed; keine stillen Orphans.
7. Jeder privilegierte Lösch-/Anonymisierungsvorgang erzeugt ein Audit-Ereignis ohne den gelöschten sensiblen Inhalt selbst in das Audit zu kopieren.
8. Fehler innerhalb eines mehrstufigen Löschvorgangs dürfen keinen scheinbaren Erfolgszustand erzeugen.
9. Ein Restore-Test beweist, dass bereits fällige/ausgeführte Löschentscheidungen nicht dauerhaft als aktive Daten wiederkehren.
10. Eine nicht abgedeckte neue Datenklasse hält M5-C `open`, bis ihr Löschvertrag explizit ergänzt wurde.

### Noch nicht festgelegte Implementierungsdetails

Die Policy schreibt bewusst **nicht** vor, ob die spätere Umsetzung über Tombstones, Lifecycle-Tabellen, Jobs oder einen anderen bestehenden Vertrag erfolgt. Diese Entscheidung wird erst mit dem realen ULC-Verbraucher und den vorhandenen Runtime-/Datenverträgen getroffen. Keine neue Plattformabstraktion ohne realen Bedarf.

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

## Medienregel

- Ein Medium ist einem fachlichen Datensatz bzw. einer expliziten Ownership zugeordnet.
- Wird dieser Datensatz endgültig gelöscht und besteht keine separate bestätigte Aufbewahrungsgrundlage, wird auch das Medium gelöscht.
- Verwaiste Medien werden spätestens 30 Tage nach Feststellung entfernt.
- Ein Medium ohne belastbare Ownership-/Zweckzuordnung darf M5-C/D nicht als `verified` passieren.

## Technische Reihenfolge

1. Reale ULC-Datenklassen gegen vorhandene Schema-/Modulverträge inventarisieren.
2. Bestätigte Betreiberwerte exakt binden; keine impliziten Defaults.
3. Kleinen app-spezifischen Lifecycle-Consumer auf bestehende Runtime-/Permission-/Audit-Verträge verdrahten.
4. Positive und negative PostgreSQL-E2E-Fälle für Autorisierung, Fälligkeit, Ausnahme und Endzustand ergänzen.
5. Restore-/Recovery-Acceptance mit M4 abgleichen.
6. Factory-Evidenz erst dann setzen, wenn die konkrete ULC-Runtime den Vertrag nachweislich erfüllt.
7. Vollständige Exact-Head-CI und ausführliche ChatGPT-Diff-/Architektur-/Security-Prüfung.
8. Codex-Review später auf dem tatsächlichen finalen Head nachholen; bis dahin kein Merge eines final-review-pflichtigen technischen PRs.

## Aktueller Blocker

Der **manuelle Betreiberblocker ist aufgehoben**. Die Retention-, Medien- und Löschgrundwerte sind bestätigt.

Der nächste technische Blocker ist die fehlende reale ULC-App-Runtime auf `main`: Ohne realen ULC-Verbraucher werden keine spekulativen Lifecycle-/Schema-Abstraktionen gebaut. Bis diese Runtime über den kanonischen `createAppSkeleton()`-Pfad existiert, dürfen Acceptance-/Testverträge weiter vorbereitet werden, aber M5-C/D bleiben technisch `open`.
