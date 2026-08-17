# M5-G – ULC Provider & Compliance Plan

Stand: 2026-08-17

## Zweck

Dieser Plan konkretisiert M5-G für die erste reale Ziel-App **ULC Linz** auf Basis der bestätigten Betreiberentscheidung, dass M5 v0.1 ausschließlich **Cloudflare** und **Neon/PostgreSQL** als externe Provider im personenbezogenen Produktivdaten-Scope umfasst.

Er ist ausschließlich Evidence-/Acceptance-Vorbereitung. Er behauptet nicht, dass Datenregion, AVV/DPA, Verschlüsselung oder Subprozessoren bereits verifiziert sind, führt keine Provideränderung aus und setzt kein M5-Kriterium auf `verified`.

## Bestätigter Provider-Scope

Für M5 v0.1 gilt:

- Cloudflare
- Neon/PostgreSQL
- keine zusätzlichen Analytics-Dienste
- keine externen E-Mail-Dienste
- kein Tracking-Dienst
- kein externer Object Storage

GitHub/GitHub Actions bleibt Entwicklungs-/Control-Plane-Infrastruktur und gehört nicht automatisch zum personenbezogenen Produktivdaten-Scope. Sobald dort später personenbezogene Produktivdaten verarbeitet würden, müsste der Scope neu bewertet werden.

Sobald später ein zusätzlicher Dienst personenbezogene Daten verarbeitet, muss der Scope vor Production Ready erweitert und M5-G erneut vollständig bewertet werden.

## Aktuell verifizierte externe Grundlage

Beobachtungsstand: **2026-08-17**. Die folgenden Punkte sind ausschließlich aktuelle offizielle Providergrundlagen. Sie verifizieren noch keine app-spezifischen M5-Kriterien.

### Cloudflare

- Das aktuelle Cloudflare Data Processing Addendum ist Version **6.4**, wirksam seit **2026-04-03**. Es gilt für Cloudflare als Processor/Sub-Processor und enthält Regeln für Subprozessoren und internationale Datentransfers.
- Cloudflare Workers verarbeiten Anfragen ohne Data Localization Suite grundsätzlich über das globale Cloudflare-Netz. Eine echte geographische Begrenzung der TLS-Terminierung und Worker-Ausführung erfordert **Regional Services** auf dem betreffenden Hostnamen.
- Regional Services kann TLS-Terminierung und Worker-Ausführung auf eine konfigurierte Region wie die EU beschränken. Worker-Code und Secrets werden laut Cloudflare trotzdem global verteilt.
- Regional Services regionalisiert **keine ausgehenden Worker-Subrequests** und gilt nicht automatisch für andere Trigger wie Queues oder Cron Triggers. Diese Datenflüsse müssen separat bewertet werden, sobald sie real verwendet werden.
- Die **Customer Metadata Boundary (CMB)** ist die getrennte Funktion für regionalisierte Speicherung von Customer Logs/Traffic-Metadaten. Ohne CMB kann diese Metadatenverarbeitung global erfolgen. Für ein striktes EU-Verarbeitungsmodell reicht Regional Services alleine daher nicht aus.
- Data Localization Suite, Regional Services und Customer Metadata Boundary sind laut aktueller Cloudflare-Dokumentation **Enterprise-only paid**. Dieser Pfad darf weder als vorhanden angenommen noch ohne ausdrückliche Freigabe beschafft werden.
- Die Cloudflare-Subprozessorenliste nennt für Cloudflare Services und die Developer Platform Verarbeitungsstandorte innerhalb und außerhalb des EWR. Eine EU-Worker-Region darf deshalb nicht mit „sämtliche Providerverarbeitung ausschließlich EU“ gleichgesetzt werden.

Offizielle Grundlagen:

- https://www.cloudflare.com/en-gb/cloudflare-customer-dpa/
- https://developers.cloudflare.com/data-localization/
- https://developers.cloudflare.com/data-localization/how-to/workers/
- https://developers.cloudflare.com/data-localization/regional-services/
- https://developers.cloudflare.com/data-localization/metadata-boundary/
- https://developers.cloudflare.com/data-localization/limitations/
- https://www.cloudflare.com/gdpr/subprocessors/cloudflare-services/

### Neon/PostgreSQL / Databricks

- Neon unterstützt weiterhin **AWS Europe (Frankfurt) / `aws-eu-central-1`**. Diese Region entspricht dem bestätigten ULC-Ziel EU / Frankfurt.
- Neon verlangt SSL/TLS für Datenbankverbindungen. Die aktuelle Security-Dokumentation beschreibt AES-256 für Data-at-Rest sowie TLS 1.2/1.3 für Datenübertragung.
- Die aktuelle Neon-Vertragsgrundlage ist das **Product Specific Schedule (Neon)**, zuletzt aktualisiert am **2026-08-05**. Neon ist Teil der Databricks Platform; das Schedule verweist auf das jeweils aktuelle Databricks Master Cloud Services Agreement und dessen DPA und ändert diese Verträge für Neon Platform Services gezielt ab.
- Das aktuelle Neon Schedule nennt **Grafana Labs (USA)** zusätzlich zu den Databricks-Subprozessoren. Die bisherige Annahme einer eigenständigen statischen Neon-Subprozessorenliste ist deshalb nicht mehr maßgeblich.
- `https://neon.com/subprocessors` verweist aktuell auf die **Databricks Subprocessors**-Liste. Diese Liste ist Stand **2026-06-09**. Für Cloud-Service-Provider wie AWS wird die Verarbeitungsregion bei designated services als kundenabhängig/Customer Selected beschrieben; zugleich existieren weitere Support-/Betriebs-Subprozessoren und Databricks-Affiliates in mehreren Ländern.
- Die Provider-Security-Dokumentation beschreibt verschlüsselte Backups/Recovery-Daten; für M5 bleibt trotzdem die konkrete ULC-Produktionsressource und deren tatsächliche Konfiguration maßgeblich.
- Diese Providergrundlagen beweisen noch nicht, dass eine konkrete ULC-Produktivdatenbank bereits existiert oder tatsächlich in Frankfurt provisioniert wurde.

Offizielle Grundlagen:

- https://neon.com/docs/changelog/2026-02-20
- https://neon.com/docs/security/security-overview
- https://neon.com/security
- https://neon.com/platform-terms
- https://neon.com/subprocessors
- https://www.databricks.com/legal/databricks-subprocessors

## Vorläufiger fail-closed Gate-Stand

| Kriterium | Stand nach Dokumentprüfung | Was für `verified` noch fehlt |
|---|---|---|
| `dataRegion` | `open` | reale ULC-Produktivressourcen; Neon-Region Frankfurt autoritativ bestätigen; Cloudflare-Verarbeitungsmodell für ULC verbindlich entscheiden und konfigurierte Realität prüfen |
| `dpa` | `open` | account-/vertragsbezogen bestätigen, dass die aktuellen Cloudflare- und Databricks/Neon-Vertrags-/DPA-Bedingungen für die tatsächlich genutzten Dienste gelten |
| `encryption` | `open` | Providerfähigkeiten sind dokumentiert; reale ULC-Verbindungen, Ressourcen und Backup-/Recovery-Pfade müssen app-spezifisch geprüft werden |
| `subprocessors` | `open` | aktuelle Listen zum Freigabezeitpunkt erneut abrufen, tatsächlichen Dienstumfang zuordnen und Transferlage dokumentieren |

## Offene Betreiber-/Architekturentscheidung: Cloudflare-Datenregion

Die Projektanforderung `dataRegion` verlangt derzeit **„geklärt“**, nicht automatisch „sämtliche Verarbeitung ausschließlich EU“. Für ULC/High Privacy müssen wir trotzdem ausdrücklich festlegen, welches Verarbeitungsmodell akzeptiert wird.

### Variante A – Standard Workers, kontrollierte globale Transient-Verarbeitung

Technischer Zielzustand:

- persistente personenbezogene Primärdaten ausschließlich in der ULC-Neon-Produktivdatenbank in **EU / Frankfurt**
- Cloudflare Worker bleibt für ULC v0.1 soweit möglich zustandslos bezüglich personenbezogener Fach-/Identity-Daten
- keine zusätzlichen Cloudflare-Persistenzdienste für personenbezogene ULC-Daten in M5 v0.1
- TLS wird verwendet, aber Worker-Ausführung/TLS-Terminierung darf im globalen Cloudflare-Netz stattfinden
- Cloudflare-DPA, internationale Transfermechanismen und Subprozessorenlage werden ausdrücklich als Teil der Compliance-Bewertung dokumentiert
- Logs/Observability werden datenminimiert; keine Secrets und keine unnötigen fachlich/personenbezogenen Inhalte
- `dataRegion` darf erst `verified` werden, wenn dieses globale transiente Verarbeitungsmodell als Betreiber-/Compliance-Entscheidung ausdrücklich akzeptiert und gegen die reale Konfiguration geprüft wurde

Vorteile:

- kein Enterprise-/Data-Localization-Zwang
- entspricht dem bestehenden Cloudflare-Workers-Referenzstack
- geringer Betriebs- und Kostenaufwand

Grenzen:

- keine EU-only-Aussage für TLS-Terminierung/Worker-Ausführung
- ohne CMB keine Zusage, dass Customer Logs ausschließlich in der EU gespeichert werden
- internationale Transfers/Subprozessoren müssen bewusst akzeptiert und dokumentiert werden

### Variante B – Striktere EU-Regionalisierung über Cloudflare Data Localization Suite

Technischer Zielzustand:

- Regional Services für den produktiven ULC-Hostname mit Region EU
- Customer Metadata Boundary auf EU, wenn Customer Logs/Traffic-Metadaten ebenfalls regional gebunden werden sollen
- Neon-Produktivdatenbank in EU / Frankfurt
- reale Konfiguration und Datenflüsse vor Freigabe read-only verifizieren

Vorteile:

- TLS-Terminierung und Worker-Ausführung für den regionalisierten Hostnamen in der EU
- CMB kann Customer Logs/Traffic-Metadaten in der EU halten

Grenzen:

- Enterprise-only paid; Preis/Vertrag muss separat mit Cloudflare geklärt werden
- Worker-Code und Secrets werden weiterhin global verteilt
- ausgehende Worker-Subrequests werden durch Regional Services nicht regionalisiert
- Queues/Cron und spätere zusätzliche Cloudflare-Dienste benötigen jeweils eigene Bewertung
- auch diese Variante bedeutet nicht automatisch, dass sämtliche Cloudflare-/Subprozessorverarbeitung ausschließlich in der EU stattfindet

### Technische Empfehlung für M5 v0.1

**Variante A ist der bevorzugte Default für die erste ULC-v0.1-Produktion, sofern der Betreiber das dokumentierte globale transiente Cloudflare-Verarbeitungsmodell akzeptiert und die konkrete Datenschutz-/Transferbewertung dies trägt.**

Begründung: AppBasis soll keine kostenpflichtige Enterprise-Plattformfunktion vorsorglich einführen, wenn der reale Verbraucher sie nicht zwingend benötigt. Die sensiblen persistenten Daten können in Neon Frankfurt gebunden bleiben; Cloudflare wird für v0.1 möglichst stateless und datenminimiert gehalten.

**Wenn der Betreiber oder eine rechtliche/vertragliche Vorgabe EU-only-TLS-Terminierung/Worker-Ausführung verlangt, ist Variante A nicht ausreichend.** Dann bleibt `dataRegion` fail-closed `open`, bis Variante B oder ein anderer ausdrücklich freigegebener Hostingpfad umgesetzt und verifiziert wurde.

Diese Empfehlung ist noch **keine Grundsatzentscheidung** und ändert den High-Privacy-Vertrag nicht. Eine endgültige Betreiberentscheidung wird anschließend im Entscheidungsregister konsistent festgehalten.

## Zu belegende M5-Kriterien

M5-G liefert bzw. unterstützt autoritative Evidenz für:

1. `dataRegion`
2. `dpa`
3. `encryption`
4. `subprocessors`

Die Kriterien bleiben unabhängig voneinander. Ein erfolgreicher Nachweis eines Kriteriums darf kein anderes Kriterium implizit verifizieren.

## Cloudflare – erforderliche Evidenz

### Ressourcenbindung

Der Nachweis muss an die konkrete ULC-Zielumgebung gebunden sein und mindestens eindeutig bestimmen:

- Account/Zielumgebung
- öffentliche ULC-Runtime
- gegebenenfalls privilegierte ULC-Control-Plane-Komponenten
- tatsächlich verwendete Bindings und externen Datenflüsse
- für Variante B zusätzlich Regional-Services-/CMB-Zustand

Keine Reference-, Preview- oder fremde App-Ressource darf als ULC-Evidenz wiederverwendet werden.

### Datenregion

Cloudflare-Evidenz darf nur dann zu `dataRegion` beitragen, wenn der akzeptierte Zielvertrag und die reale Konfiguration übereinstimmen.

Für Variante A muss die Evidenz ausdrücklich festhalten, dass Cloudflare-Verarbeitung **nicht als EU-only** behauptet wird.

Für Variante B müssen Regional Services und – sofern für das Profil verlangt – Customer Metadata Boundary autoritativ für die reale ULC-Zielumgebung bestätigt werden.

### Verschlüsselung

Für jeden tatsächlich genutzten Cloudflare-Datenpfad muss getrennt belegt werden:

- Transportverschlüsselung
- Verschlüsselung persistenter Providerdaten, soweit solche Daten dort überhaupt gespeichert werden
- Secret-Grenze außerhalb normaler App-Manifeste und Repositorydaten

Eine allgemeine Providerbeschreibung ohne Bindung an den verwendeten Dienst reicht nicht aus.

### AVV/DPA und Subprozessoren

Der Nachweis muss die zum Prüfzeitpunkt gültige Vertrags-/Dokumentversion und die für den tatsächlich verwendeten Cloudflare-Dienst relevante Subprozessorenlage erfassen. Historische Dokumente oder nicht mehr aktuelle Listen verifizieren M5 nicht dauerhaft.

## Neon/PostgreSQL – erforderliche Evidenz

### Zielressource und Datenregion

Für die spätere ULC-Produktivdatenbank muss autoritativ belegt werden:

- exakte ULC-Produktivdatenbank bzw. Projekt-/Branch-Zuordnung
- tatsächliche Produktionsregion
- Übereinstimmung mit dem bestätigten Ziel **EU / Frankfurt**

Preview-/Testdatenbank und Produktionsdatenbank werden getrennt bewertet. Eine Preview-Region beweist die Produktionsregion nicht.

### Verschlüsselung

Für die konkrete ULC-Produktivdatenbank müssen mindestens belegt werden:

- verschlüsselte Verbindung zur Datenbank
- Verschlüsselung persistenter Daten beim Provider
- Verschlüsselungs-/Schutzstatus von Backups bzw. providerseitigen Recovery-Kopien, soweit für die verwendete Neon-Konfiguration relevant
- keine Datenbank-Credentials in App-Manifest, Repository oder normalem Factory-Snapshot

### AVV/DPA und Subprozessoren

Für Neon müssen die zum Prüfzeitpunkt gültigen Databricks/Neon-Vertrags-/Datenschutzunterlagen und die aktuelle Subprozessorenliste gegen den real genutzten Dienstumfang geprüft werden. Der Evidence-Output hält Prüfzeitpunkt und Reviewzeitpunkt fest; veränderliche Providerinformationen werden nicht als dauerhafte Wahrheit eingefroren.

## Datenfluss-Inventar

Vor `verified` muss für ULC v0.1 ein kleines, app-spezifisches Datenfluss-Inventar vorliegen:

| Datenfluss | Quelle | Ziel | personenbezogen | Pflichtnachweis |
|---|---|---|---|---|
| Browser → ULC Runtime | Benutzergerät | Cloudflare Runtime | ja | TLS / Zielbindung / akzeptiertes Regionalmodell |
| ULC Runtime → Produktiv-DB | Cloudflare Runtime | Neon/PostgreSQL | ja | TLS / DB-Zielbindung / Region |
| CI/Control Plane → Provider APIs | geschützte CI-/Admin-Grenze | Cloudflare/Neon | primär technische Metadaten, privilegiert | Secret-Grenze / Audit / Least Privilege |
| Backup/Recovery | Neon/PostgreSQL | providerseitige Recovery-Kopien | ja | Verschlüsselung / Retention / Restore-Grenze |
| Cloudflare Logs/Analytics | Cloudflare Runtime | Cloudflare Telemetry | potentiell personenbezogene Metadaten | Datenminimierung / CMB-Zustand falls verwendet / Retention |

Nicht vorhandene Datenflüsse werden nicht künstlich ergänzt. Neue reale Dienste oder Trigger erweitern das Inventar fail-closed.

## Freshness

Provider-, Vertrags- und Subprozessoren-Evidenz ist veränderlich. Der spätere Evidence-Output benötigt mindestens:

- `observedAt`
- Dokument-/Konfigurationsreferenz
- konkrete App-/Umgebungsbindung
- `validUntilOrReviewAt`

Die konkrete Reviewfrist darf nicht pauschal erfunden werden. Sie wird pro Evidenztyp festgelegt und muss spätestens vor Production Gate erneut geprüft werden.

Abgelaufene, nicht abrufbare, widersprüchliche oder nicht eindeutig ULC-gebundene Evidenz fällt fail-closed auf `open`.

## Fail-closed-Fälle

M5-G bleibt offen, wenn mindestens einer dieser Fälle eintritt:

- ein tatsächlich verwendeter Provider/Dienst fehlt im Inventar
- Produktionsressource oder Zielumgebung ist nicht eindeutig identifizierbar
- Neon-Produktionsregion kann nicht autoritativ als EU / Frankfurt bestätigt werden
- Cloudflare-Verarbeitungsmodell ist für ULC/High Privacy nicht verbindlich entschieden oder stimmt nicht mit der realen Konfiguration überein
- Variante A wird verwendet, aber fälschlich als EU-only dokumentiert
- Variante B wird verlangt, aber Regional Services/CMB sind nicht eindeutig belegt
- DPA-/AVV- oder Subprozessoren-Nachweis fehlt, ist veraltet oder nicht dem Dienstumfang zuordenbar
- Transport- oder At-Rest-Verschlüsselung kann für einen relevanten Datenpfad nicht belegt werden
- Credentials oder Secretwerte gelangen in Manifest, Repository oder normalen Factory-Snapshot
- Preview-/Reference-Evidenz wird als Produktionsnachweis verwendet
- Providerantworten oder Metadaten sind unvollständig bzw. widersprüchlich
- Evidence-Freshness ist überschritten

## Technische Reihenfolge

1. Reale ULC-Runtime im Repository herstellen.
2. Read-only Provider-/Compliance-Inventar an die ULC-App binden, ohne offene Kriterien vorzeitig zu verifizieren.
3. Cloudflare-Regionalmodell als Betreiberentscheidung festlegen.
4. Später tatsächlich verwendete Cloudflare- und Neon-Produktionsressourcen eindeutig binden; keine Ressource vorab erfinden.
5. Read-only Provider-/Konfigurationsevidenz erfassen.
6. Aktuelle DPA-/AVV- und Subprozessorenunterlagen für exakt diese beiden Provider prüfen.
7. Datenfluss-Inventar gegen reale Runtime/Bindings bestätigen.
8. Vier M5-Kriterien getrennt auswerten; fehlende Teilnachweise bleiben `open`.
9. Factory-Gate erst nach app-spezifischer, frischer Evidenz aktualisieren.
10. Vollständige Exact-Head-CI und ChatGPT-Diff-/Architektur-/Security-Prüfung.
11. Finalen Codex-Review gemäß aktueller Sammelstrategie später nachholen; bis dahin kein Merge final-review-pflichtiger technischer Consumer.

## Produktionsgrenze

Dieser Plan autorisiert weder das Anlegen einer Cloudflare- noch einer Neon-Produktionsressource. Produktive Ressourcen, kostenpflichtige Cloudflare-Enterprise-/Data-Localization-Funktionen, produktive Datenbankänderungen, Secrets, Deployments und Produktionsfreigaben benötigen weiterhin eine separate ausdrückliche Zustimmung.
