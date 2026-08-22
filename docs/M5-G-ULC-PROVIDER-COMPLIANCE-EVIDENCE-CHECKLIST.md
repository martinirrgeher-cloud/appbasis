# M5-G – ULC Provider Compliance Evidence Checklist

Stand: 2026-08-19

## Zweck

Diese Checkliste bereitet die reale M5-G-Evidenz für `ulc-linz` vor. Sie ist **keine juristische Freigabe, keine Production-Ready-Evidence und keine Provider-Autorisierung**.

Sie konkretisiert ausschließlich die vier bestehenden M5-G-Kriterien:

- `dataRegion`
- `dpa`
- `encryption`
- `subprocessors`

Alle vier Kriterien bleiben voneinander getrennt und fail-closed. Ein gültiger Nachweis für ein Kriterium verifiziert kein anderes Kriterium implizit.

## Verbindlicher AppBasis-Rahmen

- ULC v0.1 verwendet Standard Cloudflare Workers mit kontrollierter globaler Transient-Verarbeitung und wird ausdrücklich **nicht als EU-only** bezeichnet.
- Persistente personenbezogene Primärdaten gehören in die eigene ULC-Neon-Produktionsressource in `aws-eu-central-1` / Frankfurt.
- Cloudflare bleibt für personenbezogene Fach-/Identity-Daten soweit möglich zustandslos.
- Zusätzliche Cloudflare-Persistenzdienste für personenbezogene ULC-Daten sind nicht Teil des freigegebenen v0.1-Modells.
- Reale Production-Evidence muss an die konkret gebundenen ULC-Produktionsressourcen gekoppelt sein; Provider-Baseline- oder Marketingaussagen allein genügen nicht.
- Provider-IDs, Connection Strings, Tokens, Secrets und andere Credentials dürfen nicht in normalen Factory-/Evidence-Ausgaben erscheinen.
- Ein zusätzlicher Logging-Sink erweitert später den realen Datenfluss-/Subprozessor-Scope und benötigt eine eigene Bewertung.

## Quellenaktualisierung gegenüber älteren Vorbereitungsständen

Die Neon-/Databricks-Vertragslage wurde am 2026-08-19 gegen die aktuell veröffentlichten offiziellen Quellen neu geprüft.

**Wichtig:** Die ältere Vorbereitungsformulierung, wonach der Neon Product Specific Schedule auf eine separate Neon-spezifische Subprozessorliste verweist, ist für den aktuellen Stand überholt.

Der am 2026-08-19 aktuelle **Product Specific Schedule (Neon)**:

- ist laut offizieller Seite zuletzt am **2026-08-05** aktualisiert worden,
- wird zwischen **Databricks, Inc.**, der Muttergesellschaft von Neon, LLC, und dem Customer geschlossen,
- unterliegt dem jeweils aktuellen Databricks Master Cloud Services Agreement,
- nennt für die Neon Platform Services **Grafana Labs (US)** zusätzlich zu den übrigen auf der Databricks-Subprozessorliste geführten Subprozessoren,
- ersetzt für Neon den allgemeinen Security-Addendum-Verweis durch die Security Measures in Exhibit A des Schedules,
- modifiziert den Audit-Abschnitt der Databricks-DPA.

Diese Checkliste ist für die Provider-Vertragsquellen der aktuellere Vorbereitungsstand. Vor einem finalen Merge des Vorbereitungsstrangs muss jede ältere widersprüchliche Kurzformulierung im selben PR konsistent nachgezogen werden.

---

## 1. Cloudflare – DPA / AVV

### Aktuell dokumentierter Quellenstand

Offizielle Quelle:

`https://www.cloudflare.com/cloudflare-customer-dpa/`

Am 2026-08-19 verifiziert:

- **Cloudflare Data Processing Addendum, Version 6.4**
- **effective April 3, 2026**
- das DPA bildet einen Teil des jeweiligen Main Agreement mit dem Customer
- das DPA gilt, soweit Cloudflare personenbezogene Daten als Processor/Sub-Processor für den Customer verarbeitet

### Spätere reale Evidence

- [ ] tatsächliche juristische Customer-/Betreibereinheit des ULC-Cloudflare-Accounts festgehalten
- [ ] für genau diesen Customer gültiger Main-Agreement-/DPA-Bezug bestätigt
- [ ] DPA-Version bzw. bei späterer Änderung dann aktuelle Version dokumentiert
- [ ] Abruf-/Prüfzeitpunkt dokumentiert
- [ ] konkreter ULC-Production-Account-/Resource-Scope intern eindeutig zugeordnet
- [ ] normale Evidence enthält keine Cloudflare-Account-ID oder Credentials

Fehlt die Account-/Customer-Bindung, bleibt `dpa` offen.

---

## 2. Cloudflare – internationale Transfers

Der aktuelle Cloudflare-DPA-Stand dokumentiert ausdrücklich, dass Cloudflare bzw. seine Subprozessoren bestimmte geschützte personenbezogene Daten außerhalb EEA, Schweiz und UK verarbeiten können.

Für eingeschränkte Transfers sieht das DPA unter anderem die anwendbaren Standardvertragsklauseln und zusätzliche Schutzmaßnahmen vor.

Das passt zur bestehenden ADR-/ULC-Entscheidung:

- Standard Workers werden **nicht als EU-only** dargestellt.
- Neon Frankfurt ist die Zielregion der persistenten Primärdaten.
- Globale transiente Cloudflare-Verarbeitung bleibt Bestandteil der bewussten Betreiber-/Datenschutzbewertung.

### Spätere reale Evidence

- [ ] aktuelle Transferregelung im dann gültigen Cloudflare-DPA erneut geprüft
- [ ] verwendeter Transfermechanismus für den konkreten Customer dokumentiert
- [ ] Betreiber bestätigt, dass das reale ULC-Verarbeitungsmodell weiterhin der freigegebenen Standard-Workers-Variante entspricht
- [ ] kein später aktivierter Dienst erzeugt eine unbeabsichtigte neue Persistenz-/Transfergrenze

Wenn die reale Nutzung EU-only-Verarbeitung voraussetzen würde, muss ADR-022 neu geöffnet werden; M5-G bleibt bis dahin fail-closed.

---

## 3. Cloudflare – Subprozessoren

Offizielle Quelle:

`https://www.cloudflare.com/gdpr/subprocessors/cloudflare-services/`

Am 2026-08-19 zeigt die offizielle Liste für **Cloudflare services**:

- **Last Updated: October 1, 2025**
- eine getrennte Liste von Drittanbieter-Subprozessoren und Cloudflare-Group-Unternehmen
- einen RSS-Feed für Änderungen

Die separate Liste für **professional services** ist nicht automatisch Teil des ULC-Scopes. Sie wird nur relevant, wenn solche Professional Services tatsächlich beauftragt/verwendet werden.

### Spätere reale Evidence

- [ ] Cloudflare-Services-Subprozessorliste frisch abgerufen
- [ ] Last-Updated-Datum dokumentiert
- [ ] unveränderliche Kopie oder kryptografischer Digest der bewerteten Liste im geschützten Evidence-Paket hinterlegt
- [ ] nur tatsächlich relevante Cloudflare-Dienste in den ULC-Datenfluss einbezogen
- [ ] RSS-/Änderungsbenachrichtigung für den Betreiber aktiviert oder gleichwertiger Review-Prozess definiert
- [ ] neue/relevante Subprozessoren auf Datenfluss, Zweck, Region und Transferfolgen bewertet

Fehlende oder veraltete Subprozessor-Evidence hält `subprocessors` offen.

---

## 4. Neon / Databricks – aktuelle Vertragskette

### 4.1 Product Specific Schedule (Neon)

Offizielle Quelle:

`https://neon.com/platform-terms`

Am 2026-08-19 verifiziert:

- Titel: **Product Specific Schedule (Neon)**
- **Last Updated: August 5, 2026**
- Vertragspartei auf Providerseite: **Databricks, Inc.**, parent company of Neon, LLC
- der Schedule ergänzt/ändert für Neon das jeweils aktuelle Databricks Master Cloud Services Agreement
- der Schedule hat bei Widersprüchen für die Neon Platform Services Vorrang

### 4.2 Databricks Master Cloud Services Agreement

Offizielle Quelle:

`https://www.databricks.com/legal/mcsa`

Der aktuelle MCSA:

- bindet die DPA-Regelungen per Verweis für die Verarbeitung personenbezogener Daten ein,
- enthält Customer-Verantwortung für angemessene Konfiguration,
- enthält eine eigene Customer-Verantwortung für Backups; dies ersetzt daher nicht den AppBasis-M4/M5-I-Restore-Nachweis.

### 4.3 Databricks Data Processing Addendum

Offizielle Quelle:

`https://www.databricks.com/legal/databricks-data-processing-addendum`

Die öffentliche DPA-Seite stellt die jeweils aktuelle DPA zur Unterzeichnung bzw. als Muster bereit. Der Neon Schedule modifiziert für die Neon Platform Services insbesondere den Audit-Abschnitt.

### Spätere reale Evidence

- [ ] tatsächliche juristische Customer-/Betreibereinheit des Neon-Accounts festgehalten
- [ ] aktueller Product Specific Schedule erneut abgerufen
- [ ] aktueller MCSA erneut abgerufen
- [ ] für den Customer geltende DPA-Vertragsbindung bestätigt
- [ ] Neon-Schedule-spezifische Abweichungen gegenüber MCSA/DPA im Evidence-Paket dokumentiert
- [ ] konkrete ULC-Production-Ressource intern eindeutig dem richtigen Account/Customer zugeordnet
- [ ] normale Evidence enthält keine Project-/Branch-/Database-ID oder Credentials

Ohne eindeutige Customer-/Account-/Ressourcenbindung bleibt `dpa` offen.

---

## 5. Neon / Databricks – Subprozessoren

Der aktuelle Neon Schedule legt für die Platform Services fest:

- **Grafana Labs**, United States, für Infrastructure Services,
- zusätzlich die übrigen auf der aktuellen **Databricks Subprocessors**-Liste geführten Subprozessoren.

Offizielle Quelle:

`https://www.databricks.com/legal/databricks-subprocessors`

Am 2026-08-19 zeigt diese Seite:

- **Last Updated: June 9, 2026**
- Third-party Subprocessors einschließlich Cloud-Service-Providern und Support-/Service-Anbietern
- Databricks Affiliates
- eine Möglichkeit, sich über neue Subprozessoren benachrichtigen zu lassen

### Spätere reale Evidence

- [ ] Product Specific Schedule frisch prüfen, weil er den Neon-spezifischen Scope definiert
- [ ] Databricks-Subprozessorliste frisch abrufen
- [ ] Grafana Labs aus dem Neon Schedule ausdrücklich mit erfassen
- [ ] Last-Updated-Datum und Abrufzeit dokumentieren
- [ ] unveränderliche Kopie oder kryptografischen Digest der bewerteten Liste im geschützten Evidence-Paket hinterlegen
- [ ] tatsächlichen Cloud-Provider/Region der ULC-Neon-Ressource gegen den realen Provider-Snapshot korrelieren
- [ ] Benachrichtigung/Review-Prozess für Änderungen definieren

Ein alleiniger Verweis auf eine alte Neon-Subprozessorliste reicht für den aktuellen Schedule nicht aus.

---

## 6. Neon – Datenregion

Zielvertrag bleibt:

- `application=ulc-linz`
- `environment=production`
- dedizierte Neon-Produktionsressource
- AWS Europe (Frankfurt)
- autoritative Region: `aws-eu-central-1`

### Spätere reale Evidence

- [ ] Region ausschließlich aus autoritativer Provider-API/Provider-Metadatenquelle ableiten
- [ ] keine Ableitung aus Project-Namen, Hoststrings oder Dokumentationsannahmen
- [ ] Project/Branch/Database-Binding eindeutig und dediziert
- [ ] derselbe Production-Resource-Fingerprint wie in M5-F/H verwendet
- [ ] Evidence innerhalb des erlaubten Freshness-Fensters

Fehlt die autoritative Frankfurt-Bindung, bleibt `dataRegion` offen.

---

## 7. Verschlüsselung

### Neon contractual/provider baseline

Der aktuelle Neon Schedule, Exhibit A, dokumentiert:

- HTTPS/SSL/TLS für Login Interfaces,
- gespeicherte Daten werden verschlüsselt at rest.

Die technische Neon-Sicherheitsdokumentation ist ergänzende Provider-Baseline. Für AppBasis reicht die Baseline allein nicht.

### Reale Production-Evidence

- [ ] konkrete ULC-Production-Verbindung benutzt den freigegebenen TLS-Vertrag
- [ ] Cloudflare/Hyperdrive → Neon Transportverschlüsselung konkret belegt
- [ ] At-rest-Verschlüsselung für die konkret verwendete Neon-Plattform/Region nachgewiesen
- [ ] freigegebener HTTPS-Origin der ULC-Produktion besitzt gültiges TLS
- [ ] falls ein externer Logging-Sink verwendet wird: Transport- und At-rest-Verschlüsselung dieses Sinks separat nachgewiesen

Ohne konkrete Resource-/Connection-Bindung bleibt `encryption` offen.

---

## 8. Cloudflare-Persistenz – Negativnachweis

Für den freigegebenen ULC-v0.1-Vertrag ist nicht nur vorhandene Infrastruktur relevant, sondern auch die **Abwesenheit** unerwarteter Persistenz.

Später read-only prüfen:

- [ ] kein unerwartetes KV für personenbezogene ULC-Daten
- [ ] kein unerwartetes D1
- [ ] kein unerwartetes R2
- [ ] keine unerwartete Durable-Object-Persistenz
- [ ] keine weitere persistente Developer-Platform-Komponente mit personenbezogenen ULC-Daten
- [ ] vollständiges Binding-/Telemetry-Inventar enthält keine unbekannte Persistenz

Wenn ein solcher Dienst real benötigt wird, **STOP**: Datenfluss, DPA/Subprozessor-Scope, Verschlüsselung, Lifecycle und Backup müssen neu bewertet werden. Kein stilles Erweitern des v0.1-Modells.

---

## 9. Evidence-Paket – Mindestfelder

Das geschützte M5-G-Evidence-Paket soll für jede Quelle bzw. jeden Providerzustand mindestens enthalten:

- `application = ulc-linz`
- `environment = production`
- `observedAt`
- `validUntilOrReviewAt`
- Evidence-Quelle / Dokumentname
- Dokumentversion, Effective-/Last-Updated-Datum soweit vorhanden
- Abrufzeitpunkt
- Service-Scope
- juristische Customer-/Betreibereinheit in der geschützten Compliance-Akte
- interne Korrelation zur konkreten Production-Ressource
- Region aus autoritativer Providerquelle
- dokumentierter Transfermechanismus, soweit relevant
- Subprozessorlisten-Stand bzw. geschützter Snapshot/Digest
- Transportverschlüsselungsnachweis
- At-rest-Verschlüsselungsnachweis
- vollständiges reales Binding-/Telemetry-/Datenflussinventar
- derselbe Resource-Binding-Fingerprint wie bei den gleichzeitig bewerteten M5-F-/M5-H-Inputs

Normale Factory-/UI-Ausgabe darf daraus nur die notwendigen semantischen Readiness-Werte übernehmen.

---

## 10. Fail-closed STOP-Bedingungen

M5-G bleibt offen, sobald mindestens einer dieser Fälle eintritt:

- Customer-/Account-/Ressourcenbindung ist unklar,
- Providerquelle ist veraltet oder widersprüchlich,
- Neon-Region ist nicht autoritativ Frankfurt,
- Standard Workers werden fälschlich als EU-only bezeichnet,
- zusätzlicher Datenfluss/Telemetry-/Logging-Sink fehlt im Inventar,
- unerwartete Cloudflare-Persistenz vorhanden,
- DPA-/Schedule-Kette ist unvollständig,
- Subprozessorliste ist nicht aktuell oder unvollständig,
- Verschlüsselung nur als allgemeine Marketingaussage statt konkret gebundener Evidence vorliegt,
- F/G/H stammen aus unterschiedlichen Production-Resource-Snapshots,
- Evidence-Freshness ist abgelaufen,
- Evidence enthält Secrets/Credentials oder unzulässige interne Providerwerte im normalen Output.

---

## 11. Manuelle Betreiberpunkte vor realem M5-G-Lauf

Noch später ausdrücklich zu bestätigen:

- [ ] welche juristische Einheit der Customer/Betreiber der Cloudflare-Ressourcen ist
- [ ] welche juristische Einheit der Customer/Betreiber des Neon-/Databricks-Vertrags ist
- [ ] dass die aktuellen DPA-/Vertragsbedingungen für diese Accounts tatsächlich gelten
- [ ] dass die dokumentierte globale transiente Cloudflare-Verarbeitung akzeptiert bleibt
- [ ] dass die aktuelle Subprozessor-/Transferlage akzeptiert wurde
- [ ] wer Subprozessoränderungen künftig überprüft
- [ ] zusätzlicher Logging-Sink: eigener DPA-/Region-/Subprozessor-/Transfer-/Encryption-Check nach Anbieterwahl

Keine dieser Bestätigungen autorisiert einen Provider-Write oder eine Produktionsfreigabe.

## Offizielle Quellen – am 2026-08-19 geprüft

- Cloudflare Data Processing Addendum: `https://www.cloudflare.com/cloudflare-customer-dpa/`
- Cloudflare Sub-Processors – Cloudflare services: `https://www.cloudflare.com/gdpr/subprocessors/cloudflare-services/`
- Neon Product Specific Schedule: `https://neon.com/platform-terms`
- Databricks Master Cloud Services Agreement: `https://www.databricks.com/legal/mcsa`
- Databricks Data Processing Addendum: `https://www.databricks.com/legal/databricks-data-processing-addendum`
- Databricks Subprocessors: `https://www.databricks.com/legal/databricks-subprocessors`

Diese URLs sind Recherchequellen. Die reale Production-Evidence muss unmittelbar vor bzw. während des finalen M5-G-Laufs frisch erhoben und an den konkreten ULC-Produktionszustand gebunden werden.