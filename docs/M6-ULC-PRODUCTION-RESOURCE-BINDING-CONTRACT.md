# M6 – ULC Production Resource Binding Contract

Stand: 2026-08-18

## Zweck

Dieser Vertrag konkretisiert den **ersten realen M6-Verbraucher** für die spätere ULC-Linz-Produktionsressourcenbindung, ohne bereits eine Produktionsressource anzulegen, zu verändern, zu migrieren, zu deployen oder freizugeben.

Er verbindet drei bereits feststehende Grenzen:

1. die kanonisch generierte ULC-Runtime muss deploybar sein,
2. reale Produktionsressourcen werden als getrennte M6-Infrastrukturaktionen bereitgestellt und gebunden,
3. M5-G liest danach ausschließlich read-only Evidence gegen genau diese gebundenen Ressourcen.

Der Vertrag ist **keine allgemeine Multi-App-Provider-Orchestrierung**. Eine spätere Verallgemeinerung gehört zu FC1 und darf erst aus dem real bewiesenen ersten Produktionspfad abgeleitet werden.

## Verbindliche Architekturgrundlagen

- `createAppSkeleton()` bleibt der einzige Generator-/Publikationspfad für neue Apps.
- Die konkrete ULC-Komposition lautet `identity + permissions`, zunächst ohne Fachmodule.
- Die deploybare Runtime verwendet `worker/index.ts` als Worker-Entrypoint und die bestehende PostgreSQL-Identity-/Permissions-Komposition.
- ULC v0.1 verwendet Standard Cloudflare Workers mit globaler Transient-Verarbeitung und ausdrücklich `euOnly = false`.
- Persistente personenbezogene Primärdaten gehören in eine eigene Neon-Produktionsdatenbank in **EU / Frankfurt**.
- Provider-IDs, Datenbankadressen, Connection Strings und Secretwerte bleiben außerhalb von `appbasis.app.json`, `appbasis.database.json` und normalen Factory-Snapshots.
- Provisionierung, Resource Binding, Evidence, Migration, Deployment und Release bleiben getrennte Verantwortungen.

## Der erste konkrete M6-Ressourcensatz

Für `application = ulc-linz` und `environment = production` werden später genau folgende Ressourcenklassen benötigt:

### Neon

- eigenes Neon-Projekt für ULC-Produktion,
- autoritative Region `aws-eu-central-1` / Frankfurt,
- eindeutiger Produktionsbranch,
- eindeutige Produktionsdatenbank innerhalb dieses Projekts,
- direkte PostgreSQL-Verbindungsdaten ausschließlich als geschützte Control-Plane-/Deployment-Secrets.

### Cloudflare

- eigener Standard Cloudflare Worker für ULC-Produktion,
- eigener Produktionshostname / eigene Domain-Route,
- kontrollierte Datenbankbindung für die ULC-Produktionsdatenbank,
- `APPBASIS_BASE_URL` passend zum tatsächlichen Produktionsorigin,
- `BETTER_AUTH_SECRET` als geschütztes Secret,
- keine zusätzliche personenbezogene Persistenz über KV, D1, R2, Durable Objects oder andere Cloudflare-Speicher ohne neue Entscheidung.

Der Vertrag legt **keinen** konkreten Worker-Namen, Hyperdrive-Namen, Hostnamen, Domainnamen, Provider-ID oder Secretwert im Repository fest. Diese Werte entstehen erst beim ausdrücklich freigegebenen realen M6-Durchlauf.

## Runtime-Vertrag vor Resource Binding

Bevor irgendeine Produktionsressource mit ULC gebunden werden darf, muss der zu bindende Runtime-Stand nachweisbar folgende Eigenschaften besitzen:

- kanonischer Generatorpfad `createAppSkeleton()` / `createIdentityRuntimeTemplate()`,
- deploybarer `worker/index.ts`-Entrypoint,
- PostgreSQL-Identity-Runtime aus dem bestehenden Identity-Vertrag,
- bestehender `PostgresPermissionStore`, keine zweite Permission-Implementierung,
- `/api/health` benötigt keine DB-/Secret-Bindings,
- alle übrigen Requests schlagen bei fehlenden oder ungültigen Runtime-Bindings fail-closed fehl,
- Runtime-/Providerfehler dürfen keine Connection Strings, Providerantworten oder Secrets in Antworten oder Logs übernehmen,
- keine Fachmodulroute wird erfunden, solange kein Fachmodul installiert ist.

Ein fehlender oder nicht CI-verifizierter deploybarer Runtime-Vertrag blockiert die Resource-Bindung.

## Phasen des ersten Produktionspfads

### Phase 0 – Read-only Preflight

Erlaubt ohne Providerwrite:

- GitHub-Live-State und Exact-Head-CI prüfen,
- vorhandene Providerressourcen read-only inventarisieren,
- sicherstellen, dass keine bestehende Preview-/Reference-/Restore-Ressource als ULC-Produktion wiederverwendet wird,
- Providerfähigkeit und Region prüfen,
- Kosten-/Planabhängigkeiten prüfen,
- benötigte Secret-Namen und geschützte Environment-Grenzen bestimmen,
- Domain-/Hostname-Anforderung bestimmen, ohne einen Namen zu erfinden.

Ergebnis ist nur `readyForExplicitResourceApproval = true|false`; es entsteht keine Produktionsressource.

### Phase 1 – Leere Produktionsressourcen bereitstellen

Diese Phase ist eine externe, schreibende M6-Aktion und benötigt unmittelbar davor eine frische ausdrückliche Nutzerfreigabe.

Zulässiger Umfang der ersten Freigabe kann klein gehalten werden:

1. leeres Neon-Produktionsprojekt in `aws-eu-central-1` anlegen,
2. eindeutigen Produktionsbranch/-datenbankzustand herstellen,
3. leeren Cloudflare-Produktionsworker bzw. die minimal notwendige Runtime-Zielressource anlegen,
4. falls für die gewählte DB-Anbindung erforderlich, die konkrete Cloudflare-DB-Binding-Ressource anlegen,
5. noch **keine** personenbezogenen Produktionsdaten einspielen,
6. noch **keine** produktiven Migrationen ausführen,
7. noch **keinen** öffentlichen Nutzertraffic freigeben.

Diese Freigabe autorisiert ausschließlich die konkret benannten Ressourcenwrites. Sie autorisiert keine spätere Migration, kein Deployment und keinen Release.

### Phase 2 – Geschütztes Resource Binding

Nach Existenz der leeren Ressourcen werden ihre realen Identitäten außerhalb der App-Manifeste an `ulc-linz / production` gebunden.

Geschützte Bindungsdaten dürfen enthalten:

- autoritative Neon-Projekt-/Branch-/Datenbank-IDs,
- autoritative Cloudflare-Account-/Worker-/Binding-IDs,
- konkreten Produktionshostname,
- Secret-Referenznamen,
- Zeitstempel und Provider-Metadaten.

Sie dürfen **nicht** enthalten:

- Tokens,
- API Keys,
- Passwörter,
- vollständige Connection Strings,
- Auth-Cookies,
- produktive Request-/Response-Bodies,
- personenbezogene Produktionsdatensätze.

Normale App-Manifeste und Factory-Snapshots erhalten aus dieser Schicht ausschließlich semantische Readiness-/Evidence-Signale.

### Phase 3 – Read-only M5-G Evidence

Erst nach Phase 2 darf M5-G die reale ULC-Produktionskonfiguration read-only prüfen.

Pflichtnachweise bleiben getrennt:

- `dataRegion`,
- `dpa`,
- `encryption`,
- `subprocessors`.

Für `dataRegion` muss mindestens gelten:

- reale Neon-Produktion ist autoritativ `aws-eu-central-1`,
- Cloudflare-Modell ist `standard-workers-global-transient`,
- `euOnly = false`,
- keine unbekannten zusätzlichen personenbezogenen Persistenzpfade existieren,
- App-/Environment-Bindung ist eindeutig `ulc-linz / production`.

Öffentliche Providerdokumentation allein reicht weiterhin nicht als Account-/Resource-Evidence.

### Phase 4 – M5/M4-Gates schließen

Erst wenn M5 vollständig `productionReady=true` und Backup/Recovery für die konkrete Produktionsdatenbank belastbar gebunden ist, darf der erste Produktionspfad in Richtung Migration/Deploy weitergehen.

Die bloße Existenz leerer Produktionsressourcen hebt kein M5-/M6-Gate auf.

### Phase 5 – Produktionsmigration / Deploy / Smoke

Produktive Migrationen, Secretinstallation, Worker-Deployment, Domain-/Route-Aktivierung und Post-Deploy-Smoke sind spätere getrennte M6-Aktionen.

Vor dem ersten externen Write dieser Phase muss erneut:

- aktueller GitHub-/Providerzustand gelesen werden,
- M4/M5/M6-Gates geprüft werden,
- Wirkung und Risiko erklärt werden,
- eine **frische ausdrückliche Nutzerfreigabe** für genau diese Aktion vorliegen.

### Phase 6 – Produktionsfreigabe

Readiness oder ein erfolgreicher Deploy autorisieren keinen Nutzertraffic und keine Produktionsfreigabe.

Die tatsächliche Freigabe bleibt eine eigene, frische Entscheidung unmittelbar vor dem Release.

## Technischer Binding-Input für den späteren Consumer

Der technische Consumer soll Providerreads **nicht selbst provisionieren**. Er erhält einen geschützten Raw-Evidence-Snapshot aus der Control Plane und validiert ihn fail-closed.

Minimaler Inputvertrag:

```json
{
  "schemaVersion": 1,
  "application": "ulc-linz",
  "environment": "production",
  "observedAt": "<ISO-8601>",
  "runtime": {
    "entrypoint": "./worker/index.ts",
    "providerModel": "standard-workers-global-transient",
    "euOnly": false
  },
  "neon": {
    "projectBound": true,
    "branchBound": true,
    "databaseBound": true,
    "region": "aws-eu-central-1",
    "regionSource": "provider-api"
  },
  "cloudflare": {
    "accountBound": true,
    "workerBound": true,
    "hostnameBound": true,
    "databaseBindingBound": true,
    "bindingInventoryComplete": true,
    "telemetryInventoryComplete": true,
    "unexpectedPersonalDataPersistence": false
  }
}
```

Der reale geschützte Raw-Snapshot darf zusätzlich Provider-IDs zur eindeutigen Zuordnung enthalten. Der normalisierte Consumer-Output darf sie nicht in den normalen Factory-/M5-Snapshot übernehmen.

## Normalisierter, secrets-freier Binding-Output

Der spätere Consumer soll höchstens semantische, nicht-sensitive Bindungsinformationen weiterreichen:

```json
{
  "schemaVersion": 1,
  "application": "ulc-linz",
  "environment": "production",
  "observedAt": "<ISO-8601>",
  "runtimeContractVerified": true,
  "productionDatabaseBound": true,
  "productionWorkerBound": true,
  "productionHostnameBound": true,
  "databaseBindingBound": true,
  "providerModel": "standard-workers-global-transient",
  "euOnly": false,
  "neonRegion": "aws-eu-central-1",
  "scopeComplete": true
}
```

Dieser Output ist **keine** M5-G-Verifizierung. Er ist lediglich die eindeutig gebundene Ressourcengrundlage, auf der der bestehende M5-G-Evaluator seine vier Kriterien getrennt bewerten kann.

## Fail-closed-Regeln des Binding-Consumers

Der spätere technische Consumer muss mindestens blockieren bei:

- falscher App oder falschem Environment,
- unbekannter Schema-Version,
- Preview-/Reference-/Restore-Ressource statt ULC-Produktion,
- fehlender oder nicht autoritativ gelesener Neon-Region,
- Neon-Region ungleich `aws-eu-central-1`,
- `euOnly = true` für das Standard-Workers-Modell,
- fehlendem deploybaren Runtime-Entrypoint,
- fehlender eindeutiger Worker-/Hostname-/DB-Bindung,
- unvollständigem Cloudflare-Binding- oder Telemetry-Inventar,
- zusätzlicher nicht freigegebener personenbezogener Cloudflare-Persistenz,
- unbekannten Providerpfaden,
- Secret-/Credential-/Connection-String-Feldern im normalisierten Output,
- mehrdeutiger Ressourcenidentität,
- veralteter oder fehlender Beobachtungszeit.

Kein Fehlerfall darf automatisch eine fehlende Ressource erzeugen oder reparieren.

## Erste externe Freigabe – Mindestinhalt

Bevor Phase 1 tatsächlich ausgeführt wird, muss der Nutzer mindestens konkret sehen:

- **Neon:** welche ULC-Produktionsressource angelegt wird und dass die Region `aws-eu-central-1 / Frankfurt` sein muss,
- **Cloudflare:** welche Worker-/DB-Binding-Ressource angelegt oder gebunden werden soll,
- **Domain:** welcher konkrete Produktionshostname verwendet werden soll,
- **Kosten:** welche Provideroptionen Kosten verursachen oder einen bezahlten Plan voraussetzen können,
- **Secrets:** welche Secret-Namen benötigt werden und dass ihre Werte außerhalb des Repositories bleiben,
- **Datenwirkung:** dass die Ressourcen zunächst leer bleiben und noch keine personenbezogenen Produktionsdaten migriert werden,
- **Releasewirkung:** dass Ressourcenerstellung weder Deploy noch Produktionsfreigabe autorisiert.

Eine allgemeine frühere Zustimmung zu „weitermachen“ ersetzt diese konkret benannte externe Freigabe nicht.

## Aktuelle technische Blocker vor Phase 1

Solange die folgenden Punkte nicht real aufgelöst sind, bleibt Phase 1 blockiert:

1. kein eindeutig gebundenes ULC-Produktions-Neon-Projekt in Frankfurt vorhanden,
2. kein eindeutig gebundener ULC-Produktions-Cloudflare-Worker vorhanden,
3. kein bestätigter konkreter Produktionshostname vorhanden,
4. kein sicherer Provider-Write-Pfad darf eine Neon-Region nur erraten oder aus einem Namen ableiten,
5. der konkret verwendete Cloudflare-DB-Binding-/Planvertrag muss vor Erstellung auf aktuelle Kosten-/Planabhängigkeiten geprüft werden.

Diese Blocker verhindern **nicht** die technische Vorbereitung des Binding-Consumers, wohl aber echte externe Providerwrites.

## Exit-Kriterien dieses Vertrags

Der Vorbereitungsschritt ist abgeschlossen, wenn:

- der erste reale M6-Ressourcensatz eindeutig beschrieben ist,
- die deploybare Runtime als Voraussetzung feststeht,
- leere Ressourcenerstellung von Datenmigration/Deploy/Release getrennt ist,
- der geschützte Raw-Binding-Input feststeht,
- der secrets-freie normalisierte Output feststeht,
- M5-G weiterhin ausschließlich read-only konsumiert,
- alle relevanten Fail-closed-Fälle definiert sind,
- die konkrete externe Freigabegrenze vor Providerwrites explizit bleibt,
- keine Providerressource, kein Secret, keine produktive DB und kein Deployment durch diesen Vertrag verändert wurde.
