# ULC Linz – Countdown D4 Preview

Stand: 2026-09-24

## Ziel

D4 stellt den in D1–D3 aufgebauten Countdown-Slice zuerst in einer isolierten
ULC-Preview bereit. Diese Preview ist kein Produktionsnachweis und aktualisiert
keine bestehende M5/M6-Evidence.

## Isolierte Ressourcen

Der D4-Vertrag verwendet ausschließlich:

- GitHub Environment: `generated-preview-ulc-linz`
- Worker: `appbasis-ulc-linz`
- Datenbank: `appbasis_ulc_linz_preview`
- Application-Hyperdrive: `appbasis-ulc-linz-preview`
- Security-Log-Hyperdrive: `appbasis-ulc-linz-preview-security-log`

Migration, Application und Security-Log verwenden dieselbe dedizierte
Preview-Datenbank, aber drei getrennte PostgreSQL-Loginrollen. Nur Application
und Security-Log werden über getrennte Cloudflare-Hyperdrives an den Worker
gebunden. Die Migration-Owner-Credentials werden niemals in eine
Runtime-Bindung übernommen. Identische Rollen oder Hyperdrive-IDs werden
fail-closed abgewiesen.

## Geschützte Environment-Werte

Das Environment `generated-preview-ulc-linz` benötigt für die jeweils
verwendeten Operationen:

- `APPBASIS_MIGRATION_DATABASE_URL`: direkte Owner-/Migration-Verbindung zur
  Preview-Datenbank; nur für Migrationen, Runtime-ACL-Reconciliation und
  Audit-Nachweise,
- `APPBASIS_DATABASE_URL`: getrennte, nicht privilegierte
  Application-Runtime-Verbindung zur selben Preview-Datenbank,
- `APPBASIS_SECURITY_LOG_DATABASE_URL`: getrennte, nicht privilegierte
  Security-Event-Ingest-Verbindung zur selben Preview-Datenbank,
- `CLOUDFLARE_ACCOUNT_ID`,
- `CLOUDFLARE_API_TOKEN`,
- `APPBASIS_BETTER_AUTH_SECRET` für Bootstrap und Deploy.

Secretwerte werden nicht in Repository-Artefakte geschrieben.

## Kontrollierter Lifecycle

Der Workflow **ULC Linz D4 Preview** akzeptiert genau eine Operation pro Lauf.
Jede Mutation ist main-only und benötigt `apply=true`.

1. `hyperdrives`
   - validiert alle drei Datenbank-Credentials gemeinsam,
   - verlangt dieselbe dedizierte Preview-Datenbank und drei unterschiedliche Rollen,
   - erzeugt oder reconciled danach ausschließlich die zwei Runtime-Hyperdrives.

2. `migrate`
   - verwendet ausschließlich den getrennten Migration-Owner,
   - verwendet den kanonischen ULC-Datenbankmanifest-Vertrag,
   - wendet ausschließlich Preview-Migrationen auf die dedizierte
     Preview-Datenbank an,
   - reconciled danach die nicht privilegierten Runtime-ACLs, wobei die
     Application-Runtime keinen Zugriff auf das Security-Event-Log erhält.

3. `bootstrap`
   - verlangt beide bereits vorhandenen Hyperdrives,
   - erstellt den Preview-Worker bei Bedarf,
   - bindet beide Hyperdrives und synchronisiert das geschützte
     Better-Auth-Secret.

4. `deploy`
   - validiert das Worker-Bundle ohne automatisches Provisioning,
   - deployed den ULC-Preview-Wrapper,
   - prüft Health, UI/CSP und die geschützte Countdown-Session-Grenze,
   - erzeugt dabei bewusst eine anonyme Countdown-Ablehnung und verlangt
     anschließend einen neuen passenden Datensatz im Security-Event-Log,
   - prüft zusätzlich die Application-Datenbankverbindung.

Vorgesehene Reihenfolge:

`hyperdrives → migrate → bootstrap → deploy`

## Noch getrennt: erster nutzbarer Preview-Zugang

Der generische Preview-Access-Bootstrap unterstützt derzeit nur seinen
generischen Rollen-/Modulvertrag und kann den ULC-D2-Zugriff nicht korrekt
provisionieren.

Ein nutzbarer Countdown-Preview-Benutzer benötigt zusätzlich:

- aktive Zeile in `ulc_linz_membership`,
- exakt eine zum `source_role` passende ULC-Runtime-Rolle,
- das individuelle Recht `ulc-linz:module:countdown:view` für nicht bereits
  rollenberechtigte Rollen,
- den bestehenden erzwungenen Passwortwechsel beim ersten Login.

Dieser Bootstrap bleibt ein eigener D4-Folgeschritt und darf nicht durch eine
Lockerung des D2-Runtime-Vertrags ersetzt werden.

## Freigabegrenze

Dieser Repository-Vertrag autorisiert keine Provider-Mutation. Insbesondere
bleiben ohne ausdrückliche Nutzerfreigabe aus:

- Hyperdrive-Erstellung oder -Reconciliation,
- Preview-Migration,
- Worker-Bootstrap,
- Secret-Synchronisierung,
- Preview-Deployment,
- Preview-Benutzerprovisionierung.

Produktionsressourcen, produktive Datenbanken und Produktions-Secrets sind
außerhalb von D4.
