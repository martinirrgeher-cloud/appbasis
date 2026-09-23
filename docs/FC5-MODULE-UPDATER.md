# FC5 – Existing-App Module Updater

Stand: 2026-09-22

## Ziel

FC5 ergänzt AppBasis um einen kontrollierten Updatepfad für bereits bestehende
Apps. Der bestehende `createAppSkeleton()`-Pfad bleibt ausschließlich für neue
Apps zuständig und wird nicht als Updater wiederverwendet.

Erster realer Verbraucher ist `ulc-linz` mit dem in FC4 erzeugten
`countdown`-Modul.

## FC5-A – Read-only Installationsplan

Der erste Slice ist absichtlich rein lesend. Der kanonische Planner

```bash
pnpm appbasis:plan-module-update -- \
  --app-id ulc-linz \
  --module countdown
```

liest und verifiziert vor jeder geplanten Änderung:

- die bestehende Appdefinition einschließlich Schema-Version;
- das bestehende App-Workspace-Paket einschließlich Paketversion;
- den verifizierten Modulvertrag einschließlich Manifest-Version,
  Paketname/Paketversion und optionaler DB-Schema-Version;
- die App/Modul-Kompatibilität;
- die bestehende Paketabhängigkeit und den dazugehörigen Ziel-App-Importer im
  `pnpm-lock.yaml`;
- das bestehende Datenbank-Ownership-Manifest gegen den aus den verifizierten
  Verträgen abgeleiteten Sollzustand.

Der Planner mutiert keine Datei. Er liefert deterministisch den minimalen
Write-Satz für eine spätere Ausführung. Für den ersten ULC-Countdown-Fall sind
das ausschließlich:

1. `apps/ulc-linz/appbasis.app.json`
2. `apps/ulc-linz/package.json`
3. `pnpm-lock.yaml`

`countdown` besitzt `database: null`; daher ist für diesen Installationsfall
keine Änderung am ULC-Datenbankmanifest geplant.

Bereits vorhandene, aber widersprüchliche Zustände werden fail-closed
abgewiesen. Dazu gehören insbesondere eine Modul-Paketabhängigkeit ohne
Moduldeklaration, eine Moduldeklaration ohne kanonische Workspace-Abhängigkeit,
eine inkompatible App-Schemaversion, ein fehlender oder vorauseilender
Lockfile-Eintrag und Drift im bestehenden Datenbank-Ownership-Manifest.

Ein bereits korrekt installiertes Modul ergibt nur dann einen deterministischen
No-op, wenn Appmanifest, `package.json` und der Ziel-App-Importer im
`pnpm-lock.yaml` gemeinsam konsistent sind.

## FC5-B – atomare Ausführung

Der Executor konsumiert ausschließlich den FC5-A-Plan:

```bash
pnpm appbasis:apply-module-update -- \
  --app-id <app-id> \
  --module <module-id>
```

Vor dem ersten Write werden die relevanten App-, Modul- und Workspace-Eingaben
gesnapshottet. Nach der Planung werden App-Registry und Workspace-Publikation
serialisiert; unter den Locks müssen die Snapshots weiterhin byte-identisch
sein. Damit wird eine zwischen Planung und Ausführung eingetretene Änderung
fail-closed erkannt.

Für einen Installationsplan gilt:

- nur der vom Planner ausgewiesene Write-Satz darf verändert werden;
- bestehende fachliche Runtime-Dateien werden nicht neu generiert oder
  überschrieben;
- die neue Workspace-Abhängigkeit wird in der bestehenden `package.json`
  ergänzt, ohne andere Felder zu ersetzen;
- die Workspace-Finalisierung läuft über den bestehenden pnpm-Vertrag und muss
  anschließend den kanonischen Ziel-App-Lockfile-Importer enthalten;
- die Appdefinition wird als Publikationsmarker zuletzt geschrieben;
- schlägt ein Schritt nach Beginn der Mutation fehl, werden Appdefinition,
  Paket, optionales Datenbankmanifest und Lockfile auf die Eingangssnapshots
  zurückgerollt;
- ein bereits vollständig konsistenter Zustand bleibt ein No-op.

FC5-B installiert bewusst noch **keine datenbank-ownenden Module**. Solche
Installationen bleiben fail-closed, bis ein eigener atomarer
Migrations-Ausführungsvertrag existiert. Das unmittelbar benötigte
`countdown`-Modul ist persistenzfrei.

Der FC5-B-Slice beweist den Executor zunächst ausschließlich auf isolierten
Test-Fixtures. Er verändert `ulc-linz` noch nicht und führt weder Preview noch
Produktionsdeployment aus.

## FC5-C – erster realer ULC-Verbraucher

Nach FC5-B wird der verifizierte persistenzfreie Zielzustand erstmals für
`ulc-linz + countdown` hergestellt. Dabei bleibt der Write-Satz exakt auf
`apps/ulc-linz/appbasis.app.json`, `apps/ulc-linz/package.json` und
`pnpm-lock.yaml` begrenzt. Es werden keine bestehenden ULC-Runtime-, UI-,
Security-, M5-/M6- oder Datenbankdateien neu generiert oder überschrieben.

Der erwartete Nachzustand ist vollständig konsistent:

- `appbasis.app.json` deklariert `countdown`;
- `package.json` enthält `@appbasis/countdown: workspace:*`;
- der ULC-Importer im `pnpm-lock.yaml` verweist kanonisch auf
  `link:../../modules/countdown`;
- ein erneuter FC5-A-Plan liefert `already-installed` und einen leeren
  Write-Satz.

Erst nach vollständiger CI sowie Review dieses Zustands folgen ULC-Preview und
Tests. Die kontrollierte Produktionsvorbereitung bleibt davon getrennt.
