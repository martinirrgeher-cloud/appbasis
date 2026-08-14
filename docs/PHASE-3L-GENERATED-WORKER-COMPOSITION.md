# Phase 3L – Generated Worker Composition

## Ziel

Dieser Slice ergänzt die generierte PostgreSQL-Runtime um die fehlende reale Identity-Komposition, ohne Deployment-Providerdaten in das App-Manifest zu verschieben.

Eine generierte App mit `identity`, `permissions` und `tasks` kann damit aus Deployment-/Runtime-Eingaben genau eine PostgreSQL-basierte Anwendungskomposition erstellen:

- Better Auth + AppBasis Identity,
- persistenter read-only `PostgresPermissionStore`,
- persistenter `PostgresTaskRepository`.

## Runtime-Vertrag

Die Better-Auth-/Drizzle-Details bleiben innerhalb von `@appbasis/identity`. Der neue Subpath `@appbasis/identity/postgres-runtime` veröffentlicht für generierte Apps nur einen schmalen Vertrag aus Identity-Service, minimalem SQL-Client und `close()`. Dadurch ziehen generierte Apps weder Better-Auth- noch breite Drizzle-/Fremdtreiber-Typen in ihren eigenen Typecheck.

`createGeneratedPostgresApplicationRuntime` erhält ausschließlich Runtime-/Deployment-Eingaben:

- PostgreSQL connection string,
- öffentliche App-Basis-URL,
- Better-Auth-Secret.

Diese Werte sind ausdrücklich **kein** Bestandteil von `appbasis.app.json`.

Die bestehende `createGeneratedPostgresRuntime(connectionString)` bleibt als schmaler Tasks-/Permissions-Vertrag erhalten, damit der bereits bewiesene persistente Runtime-Pfad nicht unnötig verändert wird.

## Fail-closed

Die vollständige Identity-Runtime wird nicht erzeugt, wenn:

- der PostgreSQL-Connection-String ungültig ist,
- die Basis-URL keine kanonische HTTP(S)-Origin ist,
- das Identity-Secret kürzer als 32 Zeichen, ungetrimmt oder nicht vorhanden ist.

Diese Validierung gehört zum gekapselten Identity-Infrastrukturadapter und wird nicht in jede generierte App dupliziert.

## PostgreSQL-E2E

Der bestehende disposable PostgreSQL-E2E wird erweitert und wendet die bereits versionierten Identity-, Permissions- und Tasks-Migrationen an. Er beweist zusätzlich:

1. die reale Better-Auth-/Identity-Komposition lässt sich gegen dieselbe PostgreSQL-Datenbank erzeugen,
2. eine unbekannte Session wird über die reale Identity-Runtime fail-closed als ungültig behandelt,
3. die normale generierte Hono-App verwendet den vom Identity-Adapter bereitgestellten schmalen SQL-Client auch für persistente Permissions und Tasks,
4. die bereits bestehenden Persistenz-, Idempotenz- und deny-by-default-Beweise bleiben erhalten.

## Nicht-Ziele

Dieser Slice baut bewusst noch nicht:

- keine Cloudflare-Providerkonfiguration,
- keinen Worker-Entry-Point mit konkreten Bindings,
- kein Secret-Management,
- keine Ressourcenanlage,
- keinen echten Preview-Deploy,
- keine HTTP-Admin-API für Permissions,
- keine Änderung der Manifest-Semantik.

Der separate Parallelstrang für den Preview-/Deployment-Vertrag bleibt deshalb datei- und verantwortungsseitig unabhängig.
