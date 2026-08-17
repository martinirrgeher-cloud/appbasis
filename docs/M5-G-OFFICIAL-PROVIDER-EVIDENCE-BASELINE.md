# M5-G – Official Provider Evidence Baseline

Beobachtet: 2026-08-17, Europe/Vienna

## Zweck und Status

Dieses Dokument hält die **aktuell öffentlich abrufbare offizielle Baseline** für den bestätigten ULC-v0.1-Provider-Scope `Cloudflare + Neon/PostgreSQL` fest.

Es ist:

- Vorbereitung für M5-G
- Quelle für spätere fixture-basierte Evidence-Tests
- kein juristisches Gutachten
- kein Nachweis, dass ein konkreter ULC-Betreiberaccount einen bestimmten Vertrag tatsächlich abgeschlossen hat
- kein Nachweis einer realen ULC-Produktionsressource
- kein Grund, eines der vier M5-G-Kriterien vorzeitig auf `verified` zu setzen

Unmittelbar vor einem Production Gate müssen alle veränderlichen Quellen erneut live geprüft werden.

## Cloudflare

### CF-1 – Data Processing Addendum

Offizielle Quelle:

`https://www.cloudflare.com/en-gb/cloudflare-customer-dpa/`

Beobachteter Stand:

- Cloudflare Data Processing Addendum
- Version `6.4`
- effective `2026-04-03`
- gilt, soweit Cloudflare personenbezogene Daten als Processor/Sub-Processor für den Kunden verarbeitet
- enthält Subprocessing-Regeln, Transferregeln und technische/organisatorische Maßnahmen
- Section 6 geht ausdrücklich davon aus, dass Cloudflare bzw. Subprozessoren bestimmte europäische personenbezogene Daten außerhalb EEA/Schweiz/UK verarbeiten können; dafür werden die dort definierten Transfermechanismen/Safeguards verwendet
- Annex 2 beschreibt Verschlüsselungs- und Sicherheitsmaßnahmen für Transport und Speicherung

M5-G-Auswirkung:

- belastbare öffentliche DPA-Baseline vorhanden
- unterstützt ADR-022 darin, Standard Cloudflare nicht als EU-only zu behaupten
- `dpa` bleibt trotzdem `open`, bis der tatsächlich verwendete ULC-Account/Vertragsrahmen account-spezifisch gebunden ist
- `encryption` bleibt `open`, bis zusätzlich die reale ULC-Konfiguration geprüft ist

Operative Freshness:

- vor Production Gate erneut prüfen
- vorbereitende Wiederprüfung spätestens `2026-11-15`

### CF-2 – Standard Workers / Regional Services

Offizielle Quellen:

`https://developers.cloudflare.com/data-localization/how-to/workers/`

`https://developers.cloudflare.com/data-localization/regional-services/`

Beobachteter Stand:

- Workers-Dokumentation zuletzt aktualisiert `2026-07-23`
- Regional Services ist der Mechanismus, um TLS-Terminierung und Worker-Ausführung auf eine konfigurierte Region zu beschränken
- selbst bei Regional Services werden Worker-Code und Secrets global in Cloudflare-Rechenzentren ausgerollt; die regionale Beschränkung betrifft die Ausführung
- Regional Services erstreckt sich nicht automatisch auf ausgehende Worker-Subrequests und nicht auf andere Trigger wie Queues oder Cron Triggers
- ADR-022 wählt bewusst **nicht** Regional Services/CMB als Voraussetzung

M5-G-Auswirkung:

- normalisierte Production-Evidence muss `providerModel = standard-workers-global-transient` und `euOnly = false` tragen
- Fehlen von Regional Services ist unter ADR-022 kein Fehler
- jede Aussage `Standard Workers = EU-only` ist fail-closed ungültig

Operative Freshness:

- vor Production Gate erneut prüfen
- vorbereitende Wiederprüfung spätestens `2026-09-16`

### CF-3 – Default HTTP processing baseline

Offizielle Quelle:

`https://developers.cloudflare.com/data-localization/regional-services/http-requests/`

Beobachteter Stand:

- Cloudflare beschreibt sein Default-Netz als globales Anycast-Netz
- Verkehr innerhalb Cloudflare sowie zwischen Cloudflare und Origin wird laut Dokumentation während der Übertragung verschlüsselt
- Request-/Response-Verarbeitung innerhalb eines Cloudflare-Rechenzentrums erfolgt laut Dokumentation grundsätzlich im Speicher; ausgenommen sind insbesondere cache-fähige Inhalte bzw. konfigurierte Cache-Regeln

M5-G-Auswirkung:

- diese Quelle unterstützt die Architekturannahme „global transient“ nur für den beschriebenen HTTP-Verarbeitungspfad
- sie beweist **nicht**, dass die konkrete ULC-Runtime keine zusätzlichen Logs, Cache-, Storage-, Queue- oder Telemetry-Pfade besitzt
- deshalb bleibt das reale Binding-/Telemetry-Inventar Pflicht

Operative Freshness:

- vor Production Gate erneut prüfen
- vorbereitende Wiederprüfung spätestens `2026-10-16`

### CF-4 – Subprocessors for Cloudflare services

Offizielle Quelle:

`https://www.cloudflare.com/gdpr/subprocessors/cloudflare-services/`

Beobachteter Stand:

- offizielle Seite aktuell abrufbar
- auf der Seite angegebener Stand: `2025-10-01`
- für die Cloudflare Developer Platform nennt die Liste unter anderem Google LLC mit Verarbeitung in EEA, USA, Australien und Indien sowie Oracle America, Inc. mit mehreren Verarbeitungsregionen
- Cloudflare Group Companies können ebenfalls als Subprozessoren relevant sein
- Cloudflare DPA verpflichtet Cloudflare zur Pflege und Vorabankündigung neuer/ersetzter Subprozessoren gemäß DPA-Regelung

M5-G-Auswirkung:

- die öffentliche Liste ist die aktuelle Baseline, obwohl ihr eigener `Last Updated`-Wert älter ist
- die breite Standortliste bestätigt erneut, dass Standard Developer Platform nicht als EU-only dokumentiert werden darf
- für `subprocessors = verified` muss später der tatsächlich verwendete Cloudflare-Serviceumfang gegen die dann aktuelle Liste gebunden werden

Operative Freshness:

- dynamische Quelle; erneute Prüfung spätestens `2026-09-16`
- zusätzlich unmittelbar vor Production Gate

## Neon / Databricks

### NEON-1 – Product Specific Schedule

Offizielle Quelle:

`https://neon.com/platform-terms`

Beobachteter Stand:

- `Product Specific Schedule (Neon)`
- `Last Updated: August 5, 2026`
- Vertragspartner/übergeordneter Rahmen ist Databricks; der Schedule unterliegt dem jeweils aktuellen Databricks Master Cloud Services Agreement
- der Schedule definiert für Neon die maßgebliche Dokumentation
- Subprozessorregel: Neon Platform Services verwenden Grafana Labs (USA) zusätzlich zu den auf der Databricks-Subprozessorliste genannten Subprozessoren
- der Security-Rahmen wird durch das Schedule-eigene Exhibit A konkretisiert
- Auditregel des DPA wird für Neon im Schedule angepasst

M5-G-Auswirkung:

- frühere isolierte Neon-Terms-/Subprozessorannahmen dürfen nicht mehr als allein maßgebliche aktuelle Vertragskette verwendet werden
- technische Evidence muss `Neon Product Specific Schedule -> Databricks MCSA/DPA` als aktuelle Vertragsbeziehung abbilden
- `dpa` bleibt ohne account-spezifische Vertragsbindung offen

Operative Freshness:

- wegen der sehr aktuellen Vertragsumstellung erneute Prüfung spätestens `2026-09-16`
- zusätzlich unmittelbar vor Production Gate

### NEON-2 – Databricks MCSA und DPA

Offizielle Quellen:

`https://www.databricks.com/legal/mcsa`

`https://www.databricks.com/legal/databricks-data-processing-addendum`

Beobachteter Stand:

- das Databricks MCSA bindet den jeweils aktuellen DPA per Verweis für die Verarbeitung personenbezogener Daten ein
- die Databricks-DPA-Seite stellt einen elektronischen Abschluss/Download des DPA bereit
- das Neon Product Specific Schedule ändert einzelne DPA-Regeln speziell für Neon

M5-G-Auswirkung:

- öffentliche Vertragsdokumentation ist vorhanden
- daraus wird **nicht** abgeleitet, dass der konkrete ULC-Betreiberaccount bereits einen bestimmten DPA wirksam abgeschlossen/akzeptiert hat
- vor `dpa = verified` ist deshalb ein account-/vertragsbezogener Nachweis erforderlich

Operative Freshness:

- erneute Prüfung spätestens `2026-09-16`
- zusätzlich unmittelbar vor Production Gate

### NEON-3 – Databricks Subprocessors

Offizielle Quelle:

`https://www.databricks.com/legal/databricks-subprocessors`

Beobachteter Stand:

- `Last Updated: June 9, 2026`
- Liste enthält Databricks Affiliates und Third-Party Subprocessors
- unter den Cloud Service Providern stehen unter anderem AWS, Google, Microsoft und Oracle; bei Cloud Service Providern wird die Location of processing als `Customer Selected` angegeben
- das aktuelle Neon Product Specific Schedule verweist auf diese Liste und ergänzt Grafana Labs für Neon Platform Services

M5-G-Auswirkung:

- der technische Normalizer darf nicht mehr ausschließlich die alte `neon.com/subprocessors`-Darstellung als Vertragswahrheit pinnen
- die relevante Baseline ist der aktuelle Neon Schedule plus die aktuelle Databricks-Liste
- aus der Gesamt-Liste wird nicht automatisch behauptet, dass jeder gelistete optionale/bedingte Dienst tatsächlich ULC-Daten verarbeitet; der reale Dienstbezug muss später geprüft werden

Operative Freshness:

- dynamische Quelle; erneute Prüfung spätestens `2026-09-16`
- zusätzlich unmittelbar vor Production Gate

### NEON-4 – Frankfurt region capability

Offizielle Neon-Quellen:

`https://neon.com/docs/changelog/2026-02-20`

zusätzlich aktuelle Neon-Region-/Produktdokumentation bei Production-Check

Beobachteter Stand:

- Neon bestätigt AWS Europe (Frankfurt) mit Providerkennung `aws-eu-central-1`
- die Region ist aktuell als Neon-Infrastrukturregion vorhanden

M5-G-Auswirkung:

- `aws-eu-central-1` ist der erwartete autoritative Regionwert, **wenn die reale ULC-Produktion auf Neon/AWS Frankfurt angelegt wird**
- die bloße Existenz der Providerregion verifiziert `dataRegion` nicht
- erforderlich bleibt die read-only Provider-Evidence, dass das konkrete ULC-Produktionsprojekt tatsächlich genau dort liegt

Operative Freshness:

- Regionfähigkeit vor Ressourcenanlage nochmals prüfen
- reale Projektregion unmittelbar nach Anlage und erneut vor Production Gate read-only prüfen

### NEON-5 – Encryption / Security baseline

Offizielle Quelle:

`https://neon.com/security`

Beobachteter Stand:

- Neon dokumentiert TLS `1.2+` für Daten in Transit
- Neon dokumentiert AES-256 für gespeicherte Daten
- Key Management erfolgt laut aktueller Security-Seite über AWS KMS bzw. Azure Key Vault abhängig vom verwendeten Cloudprovider

M5-G-Auswirkung:

- belastbare öffentliche Providerfähigkeits-Baseline für Verschlüsselung vorhanden
- `encryption` bleibt trotzdem `open`, bis die tatsächliche ULC-Produktionsresource, der reale Verbindungspfad Cloudflare -> Neon und alle zusätzlichen relevanten Datenpfade read-only geprüft sind

Operative Freshness:

- erneute Prüfung spätestens `2026-10-16`
- zusätzlich unmittelbar vor Production Gate

## Vorbereitete Kriterienmatrix

| Kriterium | Öffentliche Baseline | Was weiterhin fehlt |
|---|---|---|
| `dataRegion` | Cloudflare Processing-Modell + Neon Frankfurt capability bekannt | reale ULC-Cloudflare-Runtime, reales ULC-Neon-Projekt in Frankfurt, vollständige reale Datenflüsse |
| `dpa` | aktuelle Cloudflare-DPA- und Neon/Databricks-Vertragskette identifiziert | account-/vertragsbezogener Nachweis für die tatsächlich verwendeten Betreiberaccounts |
| `encryption` | Provider-Security-Baselines vorhanden | reale ULC-Konfiguration/Binds/Verbindungspfade und Nachweis, dass kein offener unverschlüsselter relevanter Pfad existiert |
| `subprocessors` | aktuelle offizielle Providerlisten/Vertragsreferenzen identifiziert | späterer Dienstbezug, Freshness und Transfer-/Verarbeitungsbewertung für die tatsächlich verwendete ULC-Konfiguration |

## Quellen-Freshness und Drift

Bei jeder Wiederprüfung muss mindestens verglichen werden:

- DPA-/Terms-Version oder `Last Updated`
- Redirect-/Vertragskettenänderung
- Subprozessor-`Last Updated`
- Dienst-/Produktbezug
- Regionbezeichnungen/-IDs
- Security-/Encryption-Aussagen
- Cloudflare Data-Localization-Caveats

Eine Änderung invalidiert nicht automatisch die Architektur, aber sie setzt das betroffene Evidence-Element bis zur Neubewertung fail-closed auf nicht verwendbar.

## Offene account-/ressourcenspezifische Evidenz

Noch nicht vorhanden und daher bewusst offen:

- ULC-Production Cloudflare Worker/Route/Bindings
- ULC-Production Neon project/database/region binding
- ULC-spezifisches GitHub Production Environment
- account-spezifischer Cloudflare DPA-/Vertragsnachweis
- account-spezifischer Neon/Databricks DPA-/Vertragsnachweis
- reale Cloudflare Logging-/Telemetry-Konfiguration
- reale Cloudflare Persistenz-/Binding-Inventur
- reale Cloudflare -> Neon Encryption-/Connection-Konfiguration

Keine dieser Lücken wird durch öffentliche Providerdokumentation maskiert.
