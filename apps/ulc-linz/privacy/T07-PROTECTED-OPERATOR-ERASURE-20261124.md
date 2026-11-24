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
5. Nur nach getrennter tatsächlicher, datensatzbezogener Freigabe kann
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
6. Bei Fehler alle betroffenen Owner als **partiell/unverifiziert** behandeln,
   nicht direkt in Datenbanktabellen löschen. Nur der identische noch gültige
   Quellentscheid darf wiederholt werden. Resultate und manuelle Freigaben
   datensparsam **intern** protokollieren.

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
