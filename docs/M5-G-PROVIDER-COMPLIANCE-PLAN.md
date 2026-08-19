# M5-G – ULC Provider & Compliance Plan

Stand: 2026-08-19

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

Beobachtungsstand: **2026-08-19**. Die folgenden Punkte sind ausschließlich aktuelle offizielle Providergrundlagen. Sie verifizieren noch keine app-spezifischen M5-Kriterien.

### Cloudflare

- Das aktuelle Cloudflare Data Processing Addendum ist Version **6.4**, wirksam seit **2026-04-03**. Es gilt für Cloudflare als Processor/Sub-Processor und enthält Regeln für Subprozessoren und internationale Datentransfers.
- Cloudflare Workers verarbeiten Anfragen ohne Data Localization Suite grundsätzlich über das globale Cloudflare-Netz. Eine echte geographische Begrenzung der TLS-Terminierung und Worker-Ausführung erfordert **Regional Services** auf dem betreffenden Hostnamen.
- Regional Services kann TLS-Terminierung und Worker-Ausführung auf eine konfigurierte Region wie die EU beschränken. Worker-Code und Secrets werden laut Cloudflare trotzdem global verteilt.
- Regional Services regionalisiert **keine ausgehenden Worker-Subrequests** und gilt nicht automatisch für andere Trigger wie Queues oder Cron Triggers. Diese Datenflüsse müssen separat bewertet werden, sobald sie real verwendet werden.
- Die **Customer Metadata Boundary (CMB)** ist die getrennte Funktion für regionalisierte Speicherung von Customer Logs/Traffic-Metadaten. Ohne CMB kann diese Metadatenverarbeitung global erfolgen.
- Data Localization Suite, Regional Services und Customer Metadata Boundary sind kosten-/vertragsrelevante Zusatzfunktionen und werden für ULC v0.1 gemäß ADR-022 **nicht vorsorglich vorausgesetzt oder beschafft**.
- Die Cloudflare-Subprozessorenliste nennt für Cloudflare Services und die Developer Platform Verarbeitungsstandorte innerhalb und außerhalb des EWR. Standard Workers dürfen deshalb nicht als EU-only dargestellt werden.

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
- Neon verlangt SSL/TLS für Datenbankverbindungen. Die aktuelle Security-Dokumentation beschreibt AES-256 für Data-at-Rest sowie TLS für Datenübertragung.
- Die aktuelle Neon-Vertragsgrundlage ist das **Product Specific Schedule (Neon)**, zuletzt aktualisiert am **2026-08-05**. Neon ist Teil der Databricks Platform; das Schedule verweist auf das jeweils aktuelle Databricks Master Cloud Services Agreement und dessen DPA und ändert diese Verträge für Neon Platform Services gezielt ab.
- Das aktuelle Neon Schedule nennt **Grafana Labs (USA)** zusätzlich zu den auf der Databricks-Subprozessorenliste geführten Subprozessoren. Die frühere Annahme einer eigenständigen statischen Neon-Subprozessorenliste ist deshalb nicht mehr maßgeblich.
- `https://neon.com/subprocessors` verweist auf die Databricks-Subprozessorenstruktur. Die aktuell veröffentlichte Databricks-Liste ist Stand **2026-06-09**.
- Provider-Security-Dokumentation und Neon Schedule liefern eine Verschlüsselungsbaseline; für M5 bleibt trotzdem die konkrete ULC-Produktionsressource und deren tatsächliche Konfiguration maßgeblich.
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
| `dataRegion` | `open` | reale ULC-Produktivressourcen; Neon-Region Frankfurt autoritativ bestätigen; reale Cloudflare-Konfiguration muss ADR-022 entsprechen |
| `dpa` | `open` | account-/vertragsbezogen bestätigen, dass die aktuellen Cloudflare- und Databricks/Neon-Vertrags-/DPA-Bedingungen für die tatsächlich genutzten Dienste gelten |
| `encryption` | `open` | Providerfähigkeiten sind dokumentiert; reale ULC-Verbindungen, Ressourcen und Backup-/Recovery-Pfade müssen app-spezifisch geprüft werden |
| `subprocessors` | `open` | aktuelle Listen zum Freigabezeitpunkt erneut abrufen, tatsächlichen Dienstumfang zuordnen und Transferlage dokumentieren |

## Verbindliche Cloudflare-Entscheidung gemäß ADR-022

Für **ULC Linz v0.1** ist das Verarbeitungsmodell bereits entschieden:

- **Standard Cloudflare Workers**,
- kontrollierte globale transiente Verarbeitung,
- ausdrücklich **nicht EU-only**,
- persistente personenbezogene Primärdaten in der eigenen Neon-Produktionsdatenbank in **EU / Frankfurt**,
- Cloudflare soweit möglich zustandslos bezüglich personenbezogener Fach-/Identity-Daten,
- keine zusätzlichen Cloudflare-Persistenzdienste für personenbezogene ULC-Daten ohne neue Bewertung,
- Regional Services / Customer Metadata Boundary sind **keine v0.1-Voraussetzung** und werden nicht vorsorglich beschafft.

Diese Entscheidung verifiziert `dataRegion` noch nicht. Das Kriterium bleibt bis zur realen, app-spezifisch gebundenen Production-Evidence `open`.

### Gewähltes Modell – Standard Workers, kontrollierte globale Transient-Verarbeitung

Technischer Zielzustand:

- persistente personenbezogene Primärdaten ausschließlich in der ULC-Neon-Produktivdatenbank in **EU / Frankfurt**
- Cloudflare Worker bleibt für ULC v0.1 soweit möglich zustandslos bezüglich personenbezogener Fach-/Identity-Daten
- keine zusätzlichen Cloudflare-Persistenzdienste für personenbezogene ULC-Daten in M5 v0.1
- TLS wird verwendet, Worker-Ausführung/TLS-Terminierung darf im globalen Cloudflare-Netz stattfinden
- Cloudflare-DPA, internationale Transfermechanismen und Subprozessorenlage werden ausdrücklich als Teil der Compliance-Bewertung dokumentiert
- Logs/Observability werden datenminimiert; keine Secrets und keine unnötigen fachlich/personenbezogenen Inhalte
- `dataRegion` darf erst `verified` werden, wenn die reale Konfiguration exakt diesem Zielvertrag entspricht und vollständig read-only belegt ist

Vorteile:

- kein vorsorglicher Enterprise-/Data-Localization-Zwang
- entspricht dem bestehenden Cloudflare-Workers-Referenzstack
- geringer Betriebs- und Kostenaufwand

Grenzen:

- keine EU-only-Aussage für TLS-Terminierung/Worker-Ausführung
- ohne zusätzliche Regionalisierung keine Zusage, dass sämtliche Cloudflare-Metadatenverarbeitung ausschließlich in der EU erfolgt
- internationale Transfers/Subprozessoren müssen bewusst akzeptiert und dokumentiert werden

### Nicht gewählte spätere Alternative – striktere EU-Regionalisierung

Regional Services plus gegebenenfalls Customer Metadata Boundary bleiben eine **spätere Alternative**, falls eine rechtliche, vertragliche oder fachliche EU-only-Anforderung entsteht.

Eine solche Änderung würde:

- ADR-022 neu öffnen,
- die reale Datenfluss-/Privacy-Bewertung ändern,
- plan-/kosten-/vertragsrelevante Providerfunktionen betreffen,
- eine ausdrückliche Nutzerfreigabe vor jedem Providerwrite verlangen.

Sie wird in M5 v0.1 nicht vorsorglich umgesetzt.

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
- tatsächliches Standard-Workers-Modell ohne EU-only-Fehlbehauptung

Keine Reference-, Preview- oder fremde App-Ressource darf als ULC-Evidenz wiederverwendet werden.

### Datenregion

Cloudflare-Evidenz darf nur dann zu `dataRegion` beitragen, wenn der ADR-022-Zielvertrag und die reale Konfiguration übereinstimmen.

Die Evidence muss ausdrücklich festhalten:

- `providerModel = standard-workers-global-transient`,
- `euOnly = false`,
- keine unerwarteten zusätzlichen personenbezogenen Persistenzpfade,
- vollständiges reales Binding-/Telemetry-/Datenflussinventar.

Fehlen Regional Services/CMB ist unter ADR-022 **kein Fehler**. Eine spätere reale Aktivierung solcher Funktionen wäre dagegen Teil des Providerzustands und müsste neu bewertet werden.

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

Für Neon müssen die zum Prüfzeitpunkt gültigen Databricks/Neon-Vertrags-/Datenschutzunterlagen und die aktuelle Databricks-Subprozessorenliste **plus Neon-Schedule-Ergänzungen** gegen den real genutzten Dienstumfang geprüft werden. Der Evidence-Output hält Prüfzeitpunkt und Reviewzeitpunkt fest; veränderliche Providerinformationen werden nicht als dauerhafte Wahrheit eingefroren.

## Datenfluss-Inventar

Vor `verified` muss für ULC v0.1 ein kleines, app-spezifisches Datenfluss-Inventar vorliegen:

| Datenfluss | Quelle | Ziel | personenbezogen | Pflichtnachweis |
|---|---|---|---|---|
| Browser → ULC Runtime | Benutzergerät | Cloudflare Runtime | ja | TLS / Zielbindung / ADR-022-Verarbeitungsmodell |
| ULC Runtime → Produktiv-DB | Cloudflare Runtime | Neon/PostgreSQL | ja | TLS / DB-Zielbindung / Region |
| CI/Control Plane → Provider APIs | geschützte CI-/Admin-Grenze | Cloudflare/Neon | primär technische Metadaten, privilegiert | Secret-Grenze / Audit / Least Privilege |
| Backup/Recovery | Neon/PostgreSQL | providerseitige Recovery-Kopien | ja | Verschlüsselung / Retention / Restore-Grenze |
| Cloudflare Logs/Telemetry | Cloudflare Runtime | tatsächlich aktivierte Telemetry-Ziele | potentiell personenbezogene Metadaten | Datenminimierung / vollständiges Inventar / Retention / Providerbewertung |

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
- die reale Cloudflare-Konfiguration widerspricht ADR-022 oder kann nicht vollständig bestimmt werden
- Standard Workers werden fälschlich als EU-only dokumentiert
- DPA-/AVV- oder Subprozessoren-Nachweis fehlt, ist veraltet oder nicht dem Dienstumfang zuordenbar
- Transport- oder At-Rest-Verschlüsselung kann für einen relevanten Datenpfad nicht belegt werden
- Credentials oder Secretwerte gelangen in Manifest, Repository oder normalen Factory-Snapshot
- Preview-/Reference-Evidenz wird als Produktionsnachweis verwendet
- Providerantworten oder Metadaten sind unvollständig bzw. widersprüchlich
- Evidence-Freshness ist überschritten

## Technische Reihenfolge

1. ADR-022 als festen ULC-v0.1-Zielvertrag konsumieren; das Cloudflare-Modell nicht erneut entscheiden.
2. Reale ULC-Produktionsressourcen nach ausdrücklicher Freigabe eindeutig binden; keine Ressource vorab erfinden.
3. Read-only Provider-/Konfigurationsevidenz gegen genau diese Ressourcen erfassen.
4. Aktuelle DPA-/AVV- und Subprozessorenunterlagen für exakt die tatsächlich verwendeten Provider/Dienste prüfen.
5. Datenfluss-Inventar gegen reale Runtime/Bindings bestätigen.
6. Vier M5-G-Kriterien getrennt auswerten; fehlende Teilnachweise bleiben `open`.
7. Factory-Gate erst nach app-spezifischer, frischer Evidenz aktualisieren.
8. Vollständige Exact-Head-CI und ChatGPT-Diff-/Architektur-/Security-Prüfung.
9. Finalen Codex-Review gemäß der Codex-sparsamen Strategie nur auf einem tatsächlich finalen Integrationshead durchführen.

## Produktionsgrenze

Dieser Plan autorisiert weder das Anlegen einer Cloudflare- noch einer Neon-Produktionsressource. Produktive Ressourcen, kostenpflichtige Cloudflare-Regionalisierungsfunktionen, produktive Datenbankänderungen, Secrets, Deployments und Produktionsfreigaben benötigen weiterhin eine separate ausdrückliche Zustimmung.