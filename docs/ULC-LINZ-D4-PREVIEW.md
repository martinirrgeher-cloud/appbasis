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

Application und Security-Log verwenden dieselbe dedizierte Preview-Datenbank,
aber unterschiedliche PostgreSQL-Loginrollen und unterschiedliche
Cloudflare-Hyperdrives. Identische Rollen oder Hyperdrive-IDs werden
fail-closed abgewiesen.

## Geschützte Environment-Werte

Das Environment `generated-preview-ulc-linz` benötigt für die jeweils
verwendeten Operationen:

- `APPBASIS_DATABASE_URL`: direkte authentifizierte Neon-/PostgreSQL-Verbindung
  zur Preview-Datenbank für die Application-Runtime und Migrationen,
- `APPBASIS_SECURITY_LOG_DATABASE_URL`: direkte Verbindung zur selben
  Preview-Datenbank mit einer getrennten Loginrolle für Security-Event-Ingest,
- `CLOUDFLARE_ACCOUNT_ID`,
- `CLOUDFLARE_API_TOKEN`,
- `APPBASIS_BETTER_AUTH_SECRET` für Bootstrap und Deploy.

Secretwerte werden nicht in Repository-Artefakte geschrieben.

## Kontrollierter Lifecycle

Der Workflow **ULC Linz D4 Preview** akzeptiert genau eine Operation pro Lauf.
Jede Mutation ist main-only und benötigt `apply=true`.

1. `hyperdrives`
   - validiert zuerst beide Datenbank-URLs gemeinsam,
   - verlangt dieselbe dedizierte Preview-Datenbank und unterschiedliche Rollen,
   - erzeugt oder reconciled danach die zwei getrennten Hyperdrives.

2. `migrate`
   - verwendet den kanonischen ULC-Datenbankmanifest-Vertrag,
   - wendet ausschließlich Preview-Migrationen auf die dedizierte
     Preview-Datenbank an.

3. `bootstrap`
   - verlangt beide bereits vorhandenen Hyperdrives,
   - erstellt den Preview-Worker bei Bedarf,
   - bindet beide Hyperdrives und synchronisiert das geschützte
     Better-Auth-Secret.

4. `deploy`
   - validiert das Worker-Bundle ohne automatisches Provisioning,
   - deployed den ULC-Preview-Wrapper,
   - prüft Health, UI/CSP, Session-Grenze und die
     Application-Datenbankverbindung.

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
