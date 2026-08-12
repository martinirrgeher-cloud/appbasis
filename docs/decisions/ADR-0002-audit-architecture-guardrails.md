# ADR-0002: Architektur-Leitplanken nach unabhängiger Auditprüfung

- Status: Angenommen
- Datum: 2026-08-12

## Kontext

Ein unabhängiger Architektur-, Sicherheits- und Plattform-Audit bestätigte den grundlegenden AppBasis-Ansatz: eigenständige Apps mit einem gemeinsamen versionierten, fachneutralen Core und optionalen Modulen. Gleichzeitig zeigte der Audit ein wesentliches Langzeitrisiko: AppBasis könnte zu früh zu einem allgemeinen Enterprise-Framework werden, wenn zukünftige Anforderungen vorsorglich abstrahiert und in den Core gezogen werden.

Die folgenden Entscheidungen sind deshalb verbindliche Leitplanken für die weitere Umsetzung.

## Entscheidung 1: Der frühe Core bleibt bewusst klein

Der gemeinsame Core enthält zunächst nur fachneutrale, stabile Grundlagen, die nahezu jede App benötigt oder die als zentrale Sicherheits-/Laufzeitgrenze zwingend gemeinsam sein müssen:

- App-Shell und Modulregistrierung
- zentrale Konfigurationsverträge
- Identity-Grenze
- Authorization-/Permission-Enforcement-Primitives
- Audit-Grundvertrag
- Fehler-, Health- und Connectivity-Grundlagen
- wenige nachweislich stabile UI-Primitives

Nicht automatisch zum Core gehören insbesondere:

- Tasks
- Files
- Notifications
- Workflow/Approvals
- Calendar
- Search
- Reporting
- Realtime/Presence/Locks
- Assets
- SLA
- Custom Fields
- fachliche Import-/Exportlogik

Diese Fähigkeiten können als optionale Module oder spätere Plattformdienste entstehen, sobald reale Anwendungen den gemeinsamen Bedarf belegen.

## Entscheidung 2: Provider-Abstraktionen entstehen nur bei belegtem Bedarf

AppBasis verwendet das Prinzip **abstraction on evidence**.

Bewusst provider-neutral bleibt die Identity-Grenze, weil AppBasis dort einen eigenen öffentlichen Vertrag besitzt und Providerdetails nicht in Apps oder Fachmodule gelangen dürfen.

Für weitere Infrastruktur gilt zunächst der Referenzstack. Es werden nicht vorsorglich universelle Provider-Interfaces für Datenbank, Hosting, Queue, Cron, Realtime oder Deployment gebaut. Eine zusätzliche Abstraktionsschicht wird erst eingeführt, wenn mindestens ein realer zweiter Provider oder ein konkreter Wechselbedarf ihre Kosten rechtfertigt.

Kleine, fachneutrale Grenzen sind dort weiterhin erlaubt, wo sie Sicherheits-, Test- oder Modulgrenzen klar verbessern, ohne eine generische Multi-Provider-Plattform vorzutäuschen.

## Entscheidung 3: Migration Ownership und Compatibility Manifest werden verbindlich

Bevor mehrere echte Standardmodule entstehen, wird ein eindeutiges Ownership-Modell festgelegt:

- Core-Migrationen besitzen ausschließlich Core-Schema.
- Jedes Modul besitzt ausschließlich sein eigenes Schema.
- Die konkrete Fachapp besitzt ihr App-spezifisches Schema.
- Ein Modul verändert Tabellen eines anderen Moduls nicht direkt.
- Schemaübergreifende Änderungen erfolgen über versionierte öffentliche Verträge und koordinierte Migrationen.
- Destruktive Änderungen folgen grundsätzlich einem kontrollierten Expand-Migrate-Contract-Vorgehen statt einer vermeintlich sicheren Down-Migration.

Zusätzlich erhält jede App ein maschinenlesbares Compatibility Manifest. Es soll mindestens die für Upgrade-Entscheidungen relevanten Versionen und Verträge ausdrücken, z. B.:

- Core-Version
- aktive Module und Modulversionen
- Schema-/Migrationstand
- Generator-/Projektformatversion
- relevante Contract-/Capability-Versionen
- deklarierte Kompatibilitätsgrenzen

Das Manifest beschreibt strukturellen Projektzustand. Volatile GitHub-Zustände wie aktueller PR-, CI- oder Reviewstatus werden nicht darin gespiegelt.

## Entscheidung 4: Permissions V1 bleibt bewusst einfach

Das erste AppBasis-Berechtigungsmodell besteht aus:

- stabilen Capability-IDs
- Rollen als Bündel von Capabilities
- individuellen Grants
- individuellen Revokes
- klar definierten Data Scopes
- verbindlicher serverseitiger Durchsetzung

Version 1 enthält ausdrücklich keine eigene Policy-DSL, keine allgemeine ABAC-Engine und keine frei programmierbare Regelmaschine. Komplexere Regeln werden erst eingeführt, wenn reale Anwendungen zeigen, dass Capability + Rolle + Scope nicht ausreichen.

## Entscheidung 5: Account Recovery bleibt administrativ einfach, aber stark abgesichert

Standardmäßig ist kein verpflichtendes Vier-Augen-Prinzip für jeden Passwort-Reset vorgesehen. Ein entsprechend berechtigter Administrator darf einen temporären Zugang erzeugen.

Verbindliche Sicherheitsanforderungen dafür sind:

- eigene starke Capability für Recovery/Reset
- Auditierung der Aktion
- dokumentierter Grund/Reason
- sofortiger Widerruf bestehender Sessions
- temporäre Credentials mit begrenzter Gültigkeit
- erzwungener Passwortwechsel beim nächsten Login
- niemals Anzeige oder Wiederherstellung eines bestehenden Passworts
- Rate Limiting und Missbrauchsschutz

Ein Vier-Augen-Prinzip bleibt als optionale zusätzliche Policy für besonders sensible Apps oder privilegierte Accounts möglich, ist aber kein globaler AppBasis-Zwang.

## Zusätzliche Prozessleitplanke: GitHub ist die technische Source of Truth

Agentenmeldungen wie „fertig“, lokale Commits oder lokal erfolgreiche Tests sind kein Abschlussnachweis.

Ein technischer Arbeitsschritt gilt erst dann als verifiziert, wenn der relevante Zustand unabhängig über GitHub feststellbar ist. Der Zielzustand für automatisierte Handoffs ist mindestens:

1. erwartete Work-ID bzw. Änderung ist einem Remote-Commit zugeordnet,
2. Remote-Branch/PR enthält genau diesen Commit,
3. CI/Required Checks sind für genau diesen SHA erfolgreich,
4. der Code-Review bezieht sich auf genau diesen SHA,
5. keine blockierenden Review-Findings sind offen,
6. Mergeability und Release-Gates sind erfüllt.

ChatGPT und Automatisierung sollen diese Zustände selbst lesen. Der Nutzer soll nur bei echten fachlichen, sicherheitsrelevanten, kostenrelevanten oder irreversiblen Entscheidungen eingreifen müssen.

## Konsequenzen

- AppBasis baut weniger Plattformfunktionen auf Vorrat und beweist neue Grundlagen bevorzugt in vollständigen Vertical Slices.
- Geplante Fähigkeiten werden nicht verworfen, sondern erst dann abstrahiert, wenn ihr gemeinsamer Nutzen belegt ist.
- Die langfristige Roadmap bleibt umfangreich, aber Core-Aufnahme ist kein Default.
- Zwei deutlich unterschiedliche reale Apps sollen früh als Architekturbeweis dienen, bevor weitere Muster verallgemeinert werden.
- Generator, Updater und Control Plane werden stufenweise aufgebaut; ein kleiner reproduzierbarer Scaffolder darf deutlich früher entstehen als ein vollständiger Provisioner.

## Nicht entschieden in diesem ADR

Dieser ADR entscheidet nicht die konkrete Phase-2A-Identity-Konsistenzlösung. Vor dem Abschluss des Meilensteins **Phase 2A – Persistence + Identity Foundation** wird separat technisch geprüft, ob Better Auth und AppBasis-State sauber an einer gemeinsam kontrollierten PostgreSQL-Transaktion teilnehmen können. Nur wenn das nicht praktikabel ist, soll eine kleine Identity-spezifische durable Reconciliation eingesetzt werden. Eine allgemeine Saga-Engine ist dafür ausdrücklich nicht vorgesehen.
