# M5-C/D – ULC Lösch- und Aufbewahrungsplan

Stand: 2026-08-17

## Zweck

Dieser Plan konkretisiert die Vorbereitung für die M5-Pflichtkriterien **Löschkonzept** und **Aufbewahrungskonzept** der ersten realen Ziel-App **ULC Linz**.

Er ist Policy-/Acceptance-Vorbereitung. Er setzt weder `deletionPolicy` noch `retentionPolicy` auf `verified`, führt keine Datenbankänderung aus und trifft keine rechtliche Betreiberentscheidung stellvertretend für den Verein. M5 bleibt all-required und fail-closed.

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

## Datenklassen für die ULC-Entscheidung

Die technische Umsetzung muss mindestens folgende reale Klassen getrennt behandeln:

1. **Mitglieds- und Kontaktstammdaten**
   - Person-/Kontaktbezug, Mitgliedschaftsbezug und organisatorische Zuordnung.
2. **Operative Trainings- und Teilnahmedaten**
   - Anmeldungen, Anwesenheiten, Trainings-/Planungs-/Dokumentationsdaten und daraus abgeleitete operative Historie.
3. **Besonders sensible Zusatzdaten**
   - Daten, die über die normale Vereins-/Trainingsverwaltung hinaus besonderen Schutz benötigen.
4. **Audit- und Security-Daten**
   - Auth-, Rollen-, Permission- und privilegierte Administrationsereignisse.
5. **Medien/Dateien**
   - nur soweit die konkrete ULC-App diese tatsächlich verwendet; Ownership, Zweck und Löschung müssen separat belegbar sein.
6. **Backups/Restore-Kopien**
   - technisch getrennt von der Primärdatenbank; Rotation und Wiederherstellungsprozess müssen Löschentscheidungen respektieren.

Neue Datenklassen werden nicht pauschal einer bestehenden Klasse zugeschlagen. Wenn ein reales Fachmodul zusätzliche Daten mit eigener Zweck-/Retention-Semantik einführt, braucht diese Klasse eine explizite Zuordnung.

## Vorbereitete, noch nicht bestätigte Betreiberwerte

Die bestehende M5-Acceptance-Matrix enthält folgende **Kandidaten**, die vor technischer Bindung vom Betreiber bestätigt oder begründet angepasst werden müssen:

| Datenklasse | vorbereiteter Zielwert | Status |
|---|---:|---|
| Mitglieds-/Kontaktstammdaten | 12 Monate nach Austritt/Zweckende | **nicht bestätigt** |
| operative Trainings-/Teilnahmedaten | 24 Monate, danach löschen oder belastbar anonymisieren | **nicht bestätigt** |
| besonders sensible Zusatzdaten | 90 Tage nach Zweckende | **nicht bestätigt** |
| Audit-/Security-Daten | 12 Monate | **nicht bestätigt** |
| Backup-Rotation | maximal 35 Tage | **nicht bestätigt** |
| Medien | eigene Zweck-/Ownership-/Löschregel | **offen** |

Diese Werte sind keine M5-Evidenz und dürfen nicht stillschweigend als produktive Retention-Regeln aktiviert werden.

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
10. Fehlt die bestätigte Betreiberregel für eine betroffene Datenklasse, bleibt M5-C `open`.

### Noch nicht festgelegte Implementierungsdetails

Die Vorbereitung schreibt bewusst **nicht** vor, ob die spätere Umsetzung über Tombstones, Lifecycle-Tabellen, Jobs oder einen anderen bestehenden Vertrag erfolgt. Diese Entscheidung wird erst mit dem realen ULC-Verbraucher und den vorhandenen Runtime-/Datenverträgen getroffen. Keine neue Plattformabstraktion ohne realen Bedarf.

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
10. Fehlt eine bestätigte Frist für eine tatsächlich verwendete personenbezogene Datenklasse, bleibt M5-D `open`.

## Technische Reihenfolge nach Betreiberbestätigung

1. Reale ULC-Datenklassen gegen vorhandene Schema-/Modulverträge inventarisieren.
2. Betreiberwerte exakt binden; keine impliziten Defaults.
3. Kleinen app-spezifischen Lifecycle-Consumer auf bestehende Runtime-/Permission-/Audit-Verträge verdrahten.
4. Positive und negative PostgreSQL-E2E-Fälle für Autorisierung, Fälligkeit, Ausnahme und Endzustand ergänzen.
5. Restore-/Recovery-Acceptance mit M4 abgleichen.
6. Factory-Evidenz erst dann setzen, wenn die konkrete ULC-Runtime den Vertrag nachweislich erfüllt.
7. Vollständige Exact-Head-CI und ausführliche ChatGPT-Diff-/Architektur-/Security-Prüfung.
8. Codex-Review erst später nachholen, sobald Kontingent verfügbar ist; bis dahin kein Merge eines final-review-pflichtigen technischen PRs.

## Aktueller manueller Blocker

Vor der **technischen** Umsetzung von M5-C/D muss der Betreiber die oben vorbereiteten Fristen und die Medienregel bestätigen oder anpassen. Diese Entscheidung kann unabhängig von Codex vorbereitet werden.

Bis dahin ist weitere Acceptance-/Testplanung zulässig, aber kein produktiver Lösch-/Retention-Vertrag darf als bestätigt oder `verified` behandelt werden.
