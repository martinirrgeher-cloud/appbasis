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
- die bestehende Paketabhängigkeit;
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
eine inkompatible App-Schemaversion und Drift im bestehenden
Datenbank-Ownership-Manifest.

Ein bereits korrekt installiertes Modul ergibt einen deterministischen No-op.

## Nächster Slice

FC5-B implementiert auf Basis exakt dieses Plans die atomare Ausführung. Dabei
müssen mindestens gelten:

- nur der vom Planner ausgewiesene Write-Satz darf verändert werden;
- bestehende fachliche Runtime-Dateien der App werden nicht aus einem
  Neugenerator überschrieben;
- Manifest-/Package-Änderungen und Workspace-Lockfile-Finalisierung werden mit
  Rollback geschützt;
- ein DB-ownendes Modul darf Migrationen nur über seinen verifizierten
  Modulvertrag einbringen;
- Preview, Tests und Produktionsfreigabe bleiben getrennte Gates.

Für `ulc-linz` erfolgt keine Produktionsmutation durch FC5-A.
