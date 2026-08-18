# M5-G – ULC Provider-/Compliance-Evidence Final Integration

Stand: 2026-08-18

## Zweck

Dieser Slice bringt die heute technisch umsetzbare M5-G-Grenze für ULC Linz auf den aktuellen gemeinsamen Runtime-/C/D/F-Stand, ohne reale Produktionsressourcen zu erfinden oder Providerwrites auszuführen.

Verbindlich bleibt ADR-022:

- Cloudflare Standard Workers mit kontrollierter globaler transienter Verarbeitung
- ausdrücklich nicht EU-only
- persistente personenbezogene Primärdaten in einer eigenen Neon-Produktivdatenbank in EU / Frankfurt
- keine zusätzlichen Cloudflare-Persistenzdienste für personenbezogene ULC-Daten ohne neue Entscheidung

M5-G umfasst weiterhin genau vier getrennte Kriterien:

- `dataRegion`
- `dpa`
- `encryption`
- `subprocessors`

## Integrierte Verträge

Der finale technische Pfad verbindet drei bereits vorhandene Verantwortungen:

1. `m5-provider-compliance-inventory.json` definiert den app-spezifischen Provider- und Datenfluss-Scope.
2. `ulc-linz-m6-production-resource-binding.mjs` bindet spätere reale Production-Evidence an den exakten deploybaren ULC-Runtime-Vertrag, dedizierte Cloudflare-/Neon-Ressourcen und Frankfurt.
3. `ulc-linz-m5-provider-evidence.mjs` bewertet Datenregion, DPA, Verschlüsselung und Subprozessoren getrennt und freshness-basiert.

`ulc-linz-m5-provider-bound-evidence.mjs` ist der kanonische gebundene M5-G-Produktions-Evidence-Pfad für den späteren Factory-Consumer. Er akzeptiert die beiden Evidence-Schichten nur gemeinsam.

## Fail-closed Bindung

Production-Evidence wird nur abgeleitet, wenn:

- beide Evidence-Schichten `ulc-linz` + `production` betreffen,
- beide `standard-workers-global-transient` und `euOnly=false` tragen,
- beide dasselbe `observedAt` und `validUntilOrReviewAt` besitzen,
- der Resource-Binding-Consumer den exakten aktuellen Runtime-Digest bestätigt,
- Production Worker, Hostname, Datenbank und Datenbank-Binding bestätigt sind,
- die Neon-Region autoritativ Frankfurt ist,
- die Compliance-Evidence dieselbe Neon-Region trägt,
- Cloudflare als `standard-workers` beobachtet ist,
- der Compliance-Snapshot vollständige Produktionsressourcenbindung enthält.

Fehlt oder widerspricht einer dieser gemeinsamen Nachweise, liefert der gebundene Consumer `{}`. Ein einzelner plausibler Compliance-Snapshot kann damit keinen Produktionsnachweis mehr ohne exakte Runtime-/Resource-Bindung erzeugen.

Sind die gemeinsamen Bindungen gültig, bleiben die vier Kriterien weiterhin unabhängig: ein veralteter Subprozessor-Nachweis öffnet beispielsweise nicht automatisch Datenregion, DPA oder Verschlüsselung und schließt diese auch nicht unnötig, sofern deren eigene Evidence gültig bleibt.

## Generator-/Runtime-Grenze

Der deploybare `identity + permissions` Worker bleibt über den kanonischen `createAppSkeleton()`-/Runtime-Generatorpfad erzeugbar. Die geprüften Dateien

- `apps/ulc-linz/worker/index.ts`
- `apps/ulc-linz/worker/postgres.ts`
- `apps/ulc-linz/test/worker.test.ts`

bleiben byte-identisch zum kanonischen Generatorvertrag.

Der Resource-Binding-Digest umfasst die tatsächlich ausführungsrelevanten Dateien:

- `worker/app.ts`
- `worker/index.ts`
- `worker/postgres.ts`

Damit erzwingt jede relevante Runtimeänderung neue Resource-Binding-Evidence.

## Bewusst weiterhin offen

Dieser Repository-Slice behauptet keine reale M5-G-Erfüllung. Die vier Kriterien bleiben für eine echte Produktionsfreigabe fail-closed offen, solange insbesondere nicht real und aktuell belegt sind:

- konkrete dedizierte ULC-Neon-Produktionsressource in Frankfurt,
- konkrete ULC-Cloudflare-Produktionsruntime, Route/Hostname und Datenbankbindung,
- vollständiges reales Cloudflare Binding-/Telemetry-Inventar,
- reale Verschlüsselungskonfiguration,
- aktuelle account-/dienstbezogene DPA-/Vertragsevidence,
- aktuelle Subprozessor-/Transfer-Evidence,
- Freshness und app-/environment-genaue Zuordnung dieser Evidence.

Die vorhandenen Tests verwenden ausschließlich Fixtures. Fixture-Erfolg ist kein Produktionsnachweis.

## Sicherheits-/Architekturgrenze

Nicht enthalten:

- kein Provider-API-Write
- kein Neon-Projekt-/Branch-/DB-Create
- kein Cloudflare Worker-/Domain-/Hyperdrive-Create
- keine kostenpflichtige Regionalisierung
- kein Secret
- kein Deployment
- keine produktive Migration
- keine Produktionsfreigabe
- keine generische Provider-Compliance-Plattform
- keine EU-only-Behauptung für Standard Workers

Der spätere reale Evidence-Reader bleibt eine geschützte Control-Plane-/CI-Funktion und wird nicht in die öffentliche App-Runtime verschoben.

## Review-Gate

Vor Codex:

1. vollständige Exact-Head-CI,
2. ChatGPT-Diff-/Architektur-/Security-Review,
3. erkannte Findings gebündelt korrigieren,
4. vollständige Exact-Head-CI auf dem tatsächlichen finalen Head.

Danach ist genau ein finaler Codex-Review auf diesem unveränderten Head offen.
