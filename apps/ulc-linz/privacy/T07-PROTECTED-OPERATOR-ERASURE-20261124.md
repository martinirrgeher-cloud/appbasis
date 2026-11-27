# T07 – ausführbarer geschützter Löschweg, Betreiberablauf und Grenzen

**Stand:** 24.11.2026 · Zuständig: ULC-Linz-Vereinsadministration  
**Zentrale Abnahme:** [Issue #716](https://github.com/martinirrgeher-cloud/appbasis/issues/716).  
**Vor einer Datenlöschung:** separate, gezielte Betreiberfreigabe für genau diesen
Datensatz und den konkreten Vorgang. Die allgemeine Projekt-/PR-Freigabe ist **keine
Personendaten-Löschfreigabe**.

## Technisch erledigt

- Der echte geschützte Vier-Owner-Ablauf aus PR #726 ist nicht mehr nur eine
  Bibliotheksfunktion: Der **ausschließlich manuell aufrufbare** Workflow
  [ULC T07 Protected Athlete Erasure](../../../.github/workflows/ulc-linz-t07-protected-athlete-erasure.yml)
  startet ein zeitlich begrenztes, tokengebundenes, **nicht dauerhaft
  deploytes** Cloudflare-Remote-Development-Harness unter derselben geschützten
  GitHub-Umgebung `m4-dr` wie der vorhandene M5-Lifecycle-Pfad.
- Die Inspektion ermittelt seit dem aktuellen T07-Paket eine **Acht-Owner-
  Reconciliation mit echter SQL-Abfrage** und allen acht einzelnen Statuswerten.
  Fehlt die nachweisbare Identitätszuordnung, gelten Identity, Permissions und
  Katalog als **nicht verifiziert**, selbst bei null Tabellenzeilen. Fehlende
  Marker oder Restreferenzen sind eigenständige Stopps; auch eine einheitlich
  grüne strukturierte Prüfung ist ohne Freitext-/Audit-/Medien-Review kein
  vollständiger Datenschutzabschluss.
- **Identity, Permissions und personenbezogene Trainingsblock-Favoriten**
  können über den neuen, separat bestätigten
  `erase-identity-owner-only`-Modus aus dem bestehenden kanonischen
  Identity-/Permissions-Löschpfad abgewickelt werden. Er verlangt
  einen berechtigten, noch gültigen *Athleten-Quellmarker*, vier
  bereits vollständig abgeschlossene strukturierte Owner, genau
  eine nachweisbare ULC-Athleten-Mitgliedschaft bzw. echte
  gelöschte Identity-Marke, die vollständige Admin-Autorisierung und
  eine zusätzliche genaue Bestätigung
  `ERASE-ULC-T07-VERIFIED-IDENTITY-OWNER`. Ein alter oder mehrdeutiger
  Identitätslink, unbekannte Block-Favoriten-Marker oder ein
  aktives anderes Konto verhindern den Abschluss. Die echte
  Identity-/Permissions-Owner-Kette wird verwendet und der Erfolg
  nochmals physisch anhand User/Account/Session/Berechtigungen und
  Block-Favoriten-Löschmarker geprüft. Keine Selbstlöschung,
  kein Wiederherstellungs- oder Gesamt-Privacy-PASS.
- **Wichtig zur Reihenfolge:** Nach dem echten Athleten-Quellentscheid
  erst `erase-structured-only`, danach
  `erase-identity-owner-only` und anschließend
  `erase-catalog-owner-only` (jeweils mit getrennter Freigabe,
  wenn tatsächlich erforderlich und rechtlich zulässig). Der
  Quellmarker gilt nur **35 Tage**. Wird ein Konto schon davor
  separat gelöscht und der Identitätslink ist abgelaufen, darf
  die spätere Athletenlöschung **keinen Namen/Alttext raten**.
  Dieser historische Ablauf ist weiter ein T07-Gate und
  benötigt einen gesonderten genehmigten Korrekturpfad.
- Für den fünften, bisher getrennten **Exercise-Catalog-Owner** steht ein
  einzeln bestätigter `erase-catalog-owner-only`-Modus bereit. Er verlangt
  **zuvor vollständig erledigte vier strukturierte Owner**, genau eine
  aktuelle offizielle Athleten-Identitäts-Löschmarke sowie exakt zueinander
  passende Katalog-/Identitäts-Löschzeitpunkte. Gelöscht werden ausschließlich
  katalogeigene Favoriten und explizit dieser Identität zugeordnete
  Usage-Events über den bereits geschützten Modul-Repository-Pfad. Alte
  unklare `source_ref`-/Notiz-Texte und private Medien **bleiben bestehen**
  bis zu eigener fachlicher Prüfung. Dieser Modus ist durch die gleiche
  standardmäßig **nicht gesetzte** Variable
  `ULC_T07_ERASURE_ENABLED` gesperrt; ein vierter Owner-Erfolg allein
  stellt keine fünfte oder achte Freigabe dar.
- Modus `inspect` ist nicht destruktiv. Es werden Quellmarker, Berechtigungen,
  vier Owner-Marker/-Restdaten und zusätzlich **nur aggregierte Zahlen** zu
  verbleibenden Identitäts-/Trainer-/Actor-/Auditbezügen, vereinweiten
  Freitextkandidaten, unklaren Usage-Ereignissen und privaten Medien geprüft.
  Fehlende identitätsspezifische Quellzuordnung wird als **unverifiziert**,
  nicht als Nullbestand ausgewiesen.
- Modus `erase-structured-only` erfordert eine **eigene** exakte
  Bestätigung sowie das identische, nicht abgelaufene 35-Tage-Quellmarker-Zeitfeld.
  Der Workflow blockiert diesen destruktiven Modus **zusätzlich standardmäßig**,
  solange die geschützte GitHub-Environment-Variable
  `ULC_T07_ERASURE_ENABLED` nicht nach einer **separaten** Freigabe auf
  `1` gesetzt wurde. Diese Variable wird durch das Paket nicht gesetzt.
  Die vier getrennten Daten-Owner verwenden jeweils ihre eigenen geschützten
  Transaktionen; nachher werden die echten Datenbanklöschmarker und Restzeilen
  erneut geprüft. Teilfehler gelten **nicht** als Erfolg.
- Jede Ausführung prüft die festgelegte Main-Commit-SHA, die
  Produktions-Hyperdrive-Bindung, ein aktives Administrator-Login, die kanonische
  Vereins-/Adminberechtigung und die v19-Schreibschutz-Trigger.
  Die Sitzung wird beendet, sensible Daten werden nicht im Workflowbericht
  ausgegeben. Es wird **kein** neuer öffentlicher App-Endpunkt freigeschaltet.

## Zusätzliche punktgenaue Redigierung einer gemeinsamen Trainingsnotiz (PR #737)

Ein von einer betroffenen Person legitimierter T07-Löschfall kann in der
**gemeinsamen** Trainingssession eine personenbezogene `note` enthalten.
Der getrennte Modus `redact-session-note-only` darf ausschließlich diese
eine manuell geprüfte Note entfernen, **nicht** das ganze Training oder fremde
Athletenbezüge. Seine Freigabe ersetzt weder eine 90-Tage-Sammellöschung noch
die Prüfung historischer Revisionen, Actor-/Auditdaten und anderer Freitexte.

**Vor jeder Ausführung in privater Vereinsakte:** tatsächlichen Personenbezug,
exakte Session und Organisation, Zweck/Retention-Ausnahme und die individuelle
Entscheidung dokumentieren. Die vom Verantwortlichen geprüfte vorhandene Notiz
muss als UTF-8-Text über SHA-256 exakt fingerprinted sein. Ausschließlich über
geschützte Environment-Secrets `m4-dr` konfigurieren:

- `ULC_T07_TARGET_SUBJECT_ID`: kanonischer Athleten-Subject-Key;
- `ULC_T07_SOURCE_COMPLETED_AT`: originaler noch gültiger
  35-Tage-Quellentscheid;
- `ULC_T07_TARGET_SESSION_ID`: exakte freigegebene Trainingssession;
- `ULC_T07_TARGET_SESSION_DATE`: Datum `YYYY-MM-DD`;
- `ULC_T07_TARGET_SESSION_NOTE_SHA256`: SHA-256 der exakt
  freigegebenen Notiz, 64 kleine Hexzeichen.

Keines dieser Felder, auch nicht der Digest, gehört in öffentliche Actions-
Inputs, Logs oder Issues. Für genau diesen Fall im **bereits bestehenden**
geschützten Workflow `redact-session-note-only` auswählen und als
nichtpersonenbezogenen Bestätigungstext
`REDACT-ULC-T07-EXACT-SESSION-NOTE` verwenden. Gültige
Admin-Authentifizierung, exakter HEAD und `ULC_T07_ERASURE_ENABLED=1`
sind zusätzliche Sperren und werden durch diesen PR **nicht** aktiviert.

Die SQL-Transaktion sperrt die Session-Zeile, prüft Organisation, ID,
Datum und Hash, setzt **nur** `note=NULL` und verifiziert es im selben
Commitpfad. Jede Abweichung führt zum Abbruch. Der Status
`one-shared-session-note-redacted-only` ist **kein**
allgemeiner Lösch-/Freitext-/Audit-/Restore-/Privacy-PASS. Spätere
Wiederanlage durch neue reguläre Sessionschreibvorgänge ist damit allein
nicht garantiert verhindert; Nachkontrolle und gegebenenfalls zusätzliche
Schreibsperren bleiben fallbezogen notwendig. Bei aktuell fehlendem
Athleten-Quellentscheid ist der Modus nicht ausführbar.

## Geschützter Redaktionsweg für historische Owner-Notizen und Kommentare

Der einmalige operatorgeschützte Modus `redact-exact-owner-text-only`
unterstützt **zwölf fest vorgegebene Freitextfelder** aus Trainings-Anmeldung
und Änderungsverlauf, historischer Trainingsdokumentation, Trainingsplan-/
Trainingsblock-Revisionen und -Items sowie Katalog-/Block-Nutzungsdaten.
Er ergänzt `redact-session-note-only`, **ohne** den öffentlichen Worker,
die Anwesenheit, das Autosave oder bestehende Datensätze automatisch zu verändern.

Jeder Aufruf verlangt eine **zusätzliche individuelle Entscheidung** des
Verantwortlichen über *genau diese* Zelle und ihren vollständigen Wert.
Eine Namenssuche ist kein Identitätsnachweis: Vor Freigabe muss die Person
anhand des kanonischen Athleten-Quellmarkers, die Organisation, der Datensatz,
sein exakter unveränderter UTF-8-Zellinhalt, die Rechtsgrundlage und das Fehlen
einer Aufbewahrungsausnahme in der **nichtöffentlichen** Einzelfallakte geklärt
werden. Der Quellmarker muss noch innerhalb der 35-Tage-Schutzfrist gelten.
Wenn der Text auch rechtmäßig benötigte Angaben zu anderen Personen enthält,
ist die vollständige Zellenentfernung **nicht zulässig**; dann muss ein
separat geprüfter partieller Redaktionsweg erstellt werden.

Ausschließlich über geschützte GitHub-Environment-Secrets in `m4-dr`:
- `ULC_T07_TEXT_TARGET`: einer der zwölf im Code erlaubten Feldtypen;
- `ULC_T07_TEXT_KEY_1`: der Hauptschlüssel der historischen Zeile;
- `ULC_T07_TEXT_KEY_2`: falls benötigt, Revision oder Athleten-ID;
- `ULC_T07_TEXT_KEY_3`: nur für Revision-Items erforderliche Item-ID;
- `ULC_T07_TEXT_SHA256`: SHA-256 des vollständigen, exakt begutachteten
  UTF-8-Zellinhalts; niemals eine zu erratende Personennamen-Prüfsumme.

Darüber hinaus gelten unverändert die individuellen Geheimnisse
`ULC_T07_TARGET_SUBJECT_ID`, `ULC_T07_SOURCE_COMPLETED_AT`,
Administrator-Zugang, exakter 40-Zeichen-Main-HEAD, geschütztes Environment
und der **standardmäßig deaktivierte** destructive-Schalter
`ULC_T07_ERASURE_ENABLED`. Für diesen einen Modus muss die
separate Bestätigung `REDACT-ULC-T07-EXACT-OWNER-TEXT` benutzt werden.
Alle Geheimnisse bleiben aus öffentlichen Workflow-Inputs, Logs und
GitHub-Issues heraus. Der SQL-Owner verifiziert Originalquelle, Row-Lock,
Mandant, konkreten Zeilenschlüssel, SHA256, exakt **eine** NULL-Änderung
und Readback in einer Transaktion. Bei Abweichung keine Erfolgsbescheinigung.

Die Operation ist **keine** automatische personenbezogene Freitext-
Vollprüfung, keine Revision aller JSON-Nutzdaten und kein Audit-Retention-Purge;
sie erzeugt **niemals** `privacyReady`, `fullErasureAuthorized` oder eine
Restore-Freigabe. Besonders Trainer- und Actor-/Auditdatensätze benötigen
weiterhin eine **gesonderte** rechtmäßige, fällige
Löschung oder dokumentierte gesperrte Ausnahme. Kein Blindlöschen und
kein Vorziehen einer einjährigen Audit-Aufbewahrung.

## Vorgehen für die später freigegebene einzelne Löschung

1. In der **nichtöffentlichen Vereinsakte** rechtliche Löschentscheidung,
   eindeutige Identität/Betroffenenberechtigung, mögliche Aufbewahrungspflichten,
   verantwortlichen Entscheider, Datum und eventuell bestehenden Hold festhalten.
   Keine Personennamen, E-Mails, Klartextnotizen oder Personenschlüssel in
   GitHub-Issues, PRs oder Actions-Jobnamen protokollieren.
2. Erst der Athleten-Owner muss den berechtigten **originalen** Löschentscheid
   samt 35-Tage-Quellmarker bereits abgeschlossen haben. Nicht aus
   Inaktivität, anderen Löschmarkern, alten Backups oder vermuteten Daten ableiten.
3. **Das GitHub-Repository ist öffentlich.** Betroffenen- bzw.
   Subject-IDs und Quellmarkerzeitpunkte gehören **niemals** in
   `workflow_dispatch`-Inputs, Actions-Logs oder Issue-/PR-Texte.
   Stattdessen unter dem geschützten GitHub-Environment `m4-dr` vorab
   das **Environment-Secret** `ULC_T07_TARGET_SUBJECT_ID` mit dem
   intern autorisierten, exakt überprüften Athleten-Subject-Key setzen.
   Für eine später gesondert freigegebene Löschung außerdem das Secret
   `ULC_T07_SOURCE_COMPLETED_AT` mit dem exakten originalen, **privat
   geprüften** UTC-Quellmarker-Zeitpunkt setzen. Die Secrets nicht in
   einem normalen GitHub-Kommentar oder Workflow-Input wiederholen.
   Danach GitHub Actions → `ULC T07 Protected Athlete Erasure` →
   `Run workflow` auf geprüftem `main`: zunächst `inspect`,
   `INSPECT-ULC-T07-STRUCTURED-OWNERS`, technisches Administratorkonto
   und exakte Main-SHA. Ein fehlendes Target-Secret stoppt sicher.
   **Nur nicht zuordenbare Statusmeldungen** erscheinen öffentlich in
   der GitHub-Actions-Zusammenfassung, keine ID, kein Zeitstempel, keine
   individuellen Datensatzmengen. Detailentscheidungen bleiben in der
   **nichtöffentlichen Vereinsakte**.
4. `source-unverifiable`, `owner-marker-conflict`, offener SQL-Guard,
   fehlende Berechtigung, nicht eindeutige Identitätsverknüpfung oder unbekannte
   Providerkopien → **STOP**. Nicht erneut nach Ablauf des Quellmarkers
   ausführen und niemals ein Backupartefakt aus dem betroffenen Zeitraum
   ungeprüft promoten.
5. **Bei eindeutig identifiziertem betroffenem Benutzerkonto**:
   Nach dem Vier-Owner-Schritt zunächst `erase-identity-owner-only`
   mit `ERASE-ULC-T07-VERIFIED-IDENTITY-OWNER` und dem exakten
   separat gespeicherten Athleten-Quellzeitpunkt. Dies ist eine
   eigenständige Personenlöschung; vier Owner oder ein fehlendes
   Konto allein sind keine Berechtigung. Danach erst die
   Katalog-Owner-Bereinigung. Mit fehlender oder mehrdeutiger
   Verknüpfung gilt **STOP**.
6. Nur nach getrennter tatsächlicher, datensatzbezogener Freigabe kann
   zunächst `erase-structured-only` verwendet werden. Für den getrennten
   Katalog-Owner ist **nach** erfolgreicher Vier-Owner-Prüfung außerdem
   `erase-catalog-owner-only` mit der exakten Bestätigung
   `ERASE-ULC-T07-VERIFIED-CATALOG-OWNER` möglich; keine automatische
   Ergänzung bei unbekanntem Identitätslink. Hier zusätzlich
   `ERASE-ULC-T07-FOUR-STRUCTURED-OWNERS` im **nicht personenbezogenen**
   Workflow-Input angeben. Der exakte Quellmarker-Zeitpunkt wird **nur
   aus dem geschützten Secret** gelesen, nicht öffentlich eingetragen.
   Vorhandene GitHub-Environment-Schutzregeln bleiben wirksam.
   **Kein Routine-/Cron-Einsatz**.
7. Bei Fehler alle betroffenen Owner als **partiell/unverifiziert** behandeln,
   nicht direkt in Datenbanktabellen löschen. Nur der identische noch gültige
   Quellentscheid darf wiederholt werden. Resultate und manuelle Freigaben
   datensparsam **intern** protokollieren.

## Lesende Produktionsbasis am 24.11.2026 (Neon production / neondb)

- PostgreSQL 18, 69 öffentliche Tabellen; Neon Region AWS `eu-central-1`.
- Athleten, Athletenkontakte, Traineranwesenheit, Trainingssessions,
  Registrierungen/-Änderungen, Pläne, Dokumentation, Block-/Katalog-Usage,
  persönliche Favoriten und private Medien: **jeweils 0**.
- Alle sieben geprüften Athleten-/Anwendungs-/Modul-Löschmarkerarten: **0**.
  Folglich existiert kein tatsächlicher Betroffenenfall, bei dem eine
  Löschkette auf Echtdaten durchgeführt werden dürfte.
- `user` und `ulc_linz_membership`: **jeweils 3**;
  Security-Audit **35** und Berechtigungs-Audit **16**; 0 bereits
  fällige Security-, Trainer-, Lifecycle- oder Permissions-Auditlöschungen
  nach den gegenwärtigen 12-Monats-Prüfbedingungen.
- Vereinweite explizit geprüfte Session-/Registrierungs-/Block-/Katalog-
  Notizen: **0**. Kein Hinweis auf private Medienmetadaten im aktuellen
  Primärschema, aber **keine Cloudflare-Objektbestandsgarantie**.
- Der Neon-Projektverlauf hatte bei der Messung ein
  `history_retention_seconds` von **21.600 Sekunden (6 Stunden)**.
  Das beweist **nicht**, dass separate historische Neon-Branches,
  Exporte, R2-Objekte oder andere Kopien gelöscht sind.
- Auf dem Neon-Projekt waren außerdem getrennte ältere
  Backups/Restore-Rehearsal-Branches vorhanden. Diese sind
  **nicht** als neues Production-Writer-Ziel zugelassen.

**Dies ist eine aktuelle, rein lesende Nullbestands-/Fälligkeitskontrolle,
keine Bestätigung des zukünftigen Löschwegs für echte Vereinsmitglieder,
keine Backuplöschung und keine allgemeine Produktivfreigabe.**

## Was für T07-Gesamt-PASS noch tatsächlich nachzuweisen ist

Die vier strukturierten Owner plus der getrennt abgesicherte
Katalog-Folgeowner sind **nicht** alle acht persistenten Owner. Die laufende
Acht-Owner-Abfrage ist ein physischer Beleg für **noch vorhandene strukturierte
Referenzen**, aber kein Ersatz für echte Identity-/Permissions-Owner-Löschungen,
rechtlich erforderliche Logaufbewahrung oder menschliche Freitext-Entscheide.
Zusätzliche Entscheidungen/Prüfungen betreffen:

- **Identity, Permissions, Athletes, Exercise-Catalog:** abgeschlossene
  Konto-/Favoriten-/Nutzungs-/Athleten-Löschung und Identitäts-Referenzen
  an den jeweiligen Ownern nachweisen; generische historische
  `source_ref`/`note`-Usage darf nicht erraten werden.
- **Training-Blocks, Documentation, Training-Plans, ULC-Lifecycle:**
  strukturierte Owner-Abschlüsse, alle Revisionen, Teilnehmerlinks,
  Session-/Registrierungs-Notizen, Trainerpräsenz sowie Actor-/Audit-Verweise
  mit fachlich entschiedener Retention oder sicherer Bereinigung prüfen.
- **Freitext:** die 90-Tage-Regel ist ein *Review-/Entfernungsziel*,
  keine freigegebene Blindlöschung. Die SQL-Inventur zeigt nur
  **vereinsweite Kandidatenzählungen**, keine Zuordnung eines Textes zu einer
  einzelnen Person. Notizen, JSON, Übungs-/Katalognamen und sonstige
  Beschreibungen bleiben manuell zu beurteilen.
- **Private Medien und alle wiederherstellbaren Kopien:** kein Beleg der
  Cloudflare-/Storage-Provider-Objektlöschung durch leere SQL-Medientabellen.
  Kein historischer Restore-Promotion-PASS. **Absolute Sperre alter
  Restore-Promotion bleibt bestehen**, bis unabhängige jüngere Quelle,
  alle acht Owner, getrennte Quarantäne, Writer-Fences sowie vollständiger
  Backup-/Exporthorizont wirklich geprüft sind.

**Abnahmegrenze:** Ein erfolgreicher T07-Workflow darf nur
`four-structured-owners-complete-only` oder
`catalog-owner-complete-only` liefern – **niemals**
`privacy=verified`, Gesamt-T07-PASS, T10-GO, „vollständig gelöscht“ oder
die Freigabe historischer Backups. Betreiberentscheidungen werden nicht durch
einen grünen CI-Lauf ersetzt. Auch eine zwischenzeitlich leere Trainingsdatenbank
beweist keinen sicheren künftigen Acht-Owner-Löschprozess.

## Ergänzung Restdatenprüfung – 25.11.2026 (PR nach CI/Review noch separat abnehmen)

Der read-only Acht-Owner-Bericht zählt künftig auch identitätsgebundene
Berechtigungs-Auditeinträge (Akteur **oder** Ziel-Principals).
Die T07-Residualprüfung weist außerdem nichtleere verschachtelte
Trainingsinhalte (`training_content_items`) und Dokumentationsrevisionen
(`items_json`, `attendance_json`) als **organisationsweite
Prüfkandidaten** aus. Diese Zahlen beweisen weder einen Personenbezug noch
eine Verknüpfung zum einzelnen Athleten. Keine Namen, Texte, IDs oder
JSON-Inhalte werden ausgegeben.

Bei Kandidaten entscheidet die Vereinsadministration in einer nichtöffentlichen
Akte anhand von Zweck, Berechtigung, eventuell nötiger Aufbewahrung und
tatsächlichen Revisionen über Entfernung, Redigierung oder begründete
Beibehaltung. Die 90-Tage-Zielregel ersetzt keine Einzelprüfung und erlaubt
keine automatische Blindlöschung.

**Unverändert gesperrt:** Gesamt-Erasure-PASS, Datenschutz-/Lifecycle-READY,
alte Restore-Promotion, produktive Löschungen und neue private Medien, bis
die eigenständigen Owner-/Provider-/Backup-Nachweise erfüllt sind.
