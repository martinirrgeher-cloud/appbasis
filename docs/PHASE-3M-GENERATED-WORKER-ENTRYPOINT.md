# Phase 3M – Generated Worker Entrypoint

## Ziel

Dieser Slice verbindet die generierte PostgreSQL-Anwendungskomposition mit dem bereits getrennt aufgebauten Cloudflare-Deployment-Vertrag. Eine generierte `tasks`-App mit `identity` und `permissions` erhält erstmals einen echten Worker-Entrypoint unter `worker/index.ts`.

## Runtime-Bindings

Der Worker liest ausschließlich Deployment-/Runtime-Bindings:

- `HYPERDRIVE.connectionString`,
- `APPBASIS_BASE_URL`,
- `BETTER_AUTH_SECRET`.

Diese Werte bleiben außerhalb von `appbasis.app.json`. Das Manifest enthält weiterhin weder Provider-IDs noch Datenbankadressen, Secrets oder konkrete Principal-IDs.

Der Entrypoint akzeptiert `env` zunächst als `unknown` und validiert die tatsächlich benötigte Binding-Form zur Laufzeit. Damit wird keine handgeschriebene Cloudflare-`Env`-Deklaration als zweite Source of Truth eingeführt. Ein späterer Deployment-Schritt kann zusätzlich `wrangler types` gegen die ephemeral gerenderte Deployment-Konfiguration laufen lassen.

## Request-Lebenszyklus

- `/api/health` ist eine reine Liveness-Route und benötigt bewusst keine Datenbank- oder Secret-Bindings.
- Jede andere Route verlangt vollständig gültige Runtime-Bindings; fehlende oder ungültige Konfiguration liefert `503 RUNTIME_NOT_CONFIGURED`.
- Pro Request wird genau eine vollständige PostgreSQL-Anwendungskomposition erzeugt.
- Dieselbe Hyperdrive-Verbindung trägt Identity, Permissions und Tasks.
- Die Runtime-Konstruktion ist exception-safe: Wird der PostgreSQL-Client bereits geöffnet und schlägt ein nachgelagerter Konstruktionsschritt fehl, wird der Client vor dem Weiterwerfen des ursprünglichen Fehlers best-effort geschlossen.
- Nach der Request-Verarbeitung wird die request-scoped Runtime best-effort geschlossen. Ein `close()`-Fehler darf weder eine erfolgreiche Antwort noch eine bereits sanitierte Fehlerantwort ersetzen.
- Unerwartete Runtime- und Cleanup-Fehler liefern beziehungsweise protokollieren ausschließlich feste Fehlerkategorien. Weder Antwort noch strukturierter Fehlerlog übernehmen `Error.name`, Fehlermeldungstext, Datenbankadressen oder Secret-Informationen aus dem ursprünglichen Fehler.

Cloudflare empfiehlt für externe PostgreSQL-Verbindungen Hyperdrive und das Erzeugen eines Datenbankclients je Request; Hyperdrive verwaltet den zugrunde liegenden Pool.

## Generator-Vertrag

Für guarded `tasks`-Apps muss `createIdentityRuntimeTemplate` zusätzlich deterministisch erzeugen:

- `worker/index.ts`,
- `test/worker.test.ts`.

Der checked generated Consumer `apps/tasks-minimal` und der Generator werden byte-identisch geprüft. Der Preview-Deployment-Renderer verweist bereits auf exakt `./worker/index.ts`.

## Tests

Der Worker- und Runtime-Test beweisen ohne Cloud-Ressourcen:

1. Liveness ohne Runtime-Erzeugung,
2. fail-closed bei fehlenden Bindings,
3. korrekte Übergabe validierter Bindings an die request-scoped Runtime,
4. Cleanup einer teilweise konstruierten PostgreSQL-Runtime,
5. `close()` nach einem erfolgreichen Request,
6. Erhalt erfolgreicher und bereits sanitierter Fehlerantworten auch bei fehlschlagendem `close()`,
7. generische Fehlerantwort und feste Log-Kategorien ohne Leakage von Fehlermeldung, manipuliertem `Error.name`, Datenbankadresse oder Secret-Information.

## Nicht-Ziele

Dieser Slice:

- erzeugt noch keine Cloudflare- oder Neon-Ressourcen,
- setzt noch keine Secrets,
- führt noch keine Produktionsmigration oder Permission-Provisionierung aus,
- deployed noch keinen Worker,
- baut keine HTTP-Admin-API für Permissions,
- ändert die Manifest-Semantik nicht.

Der nächste sichere Schritt nach sauberem CI/Codex-Review ist die Deployment-Orchestrierung: ephemeral Wrangler-Konfiguration, `wrangler types`/Dry-Run, versionierte Migrationen, separater Permission-Bootstrap und erst danach ein isolierter Preview-Smoke.
