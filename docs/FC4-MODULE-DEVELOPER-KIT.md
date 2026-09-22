# FC4 – Module Developer Kit

Stand: 2026-09-21

## Ziel

FC4 schafft den kleinsten stabilen Vertrag, auf dem weitere AppBasis-Module
entwickelt und später in bestehende Apps eingespielt werden können. Der
Modulvertrag wird bewusst vor einem generischen Module-Updater eingeführt.

Der erste Verbraucher bleibt der geplante ULC-Linz Intervall-Countdown.

## FC4-A – Modulmanifest und Verifikation

Jedes Standardmodul veröffentlicht künftig im eigenen Modulverzeichnis ein
`appbasis.module.json`.

Schema v1 beschreibt ausschließlich bereits benötigte, stabile Eigenschaften:

- eindeutige `moduleId`
- Anzeigename
- kanonischer Workspace-Paketname `@appbasis/<moduleId>`
- kompatible App-Definitions-Schemaversionen
- stabile, modul-namespacete Capability-IDs
- optionalen modul-eigenen Datenbank-Schema-/Migrationsvertrag

Datenbankeigentum bleibt beim Modul. Ein Modulmanifest darf nur SQL-Migrationen
unter `modules/<moduleId>/migrations/` deklarieren. Manifest, Workspace-Paket
und vollständige SQL-Inventur müssen übereinstimmen; Symlinks in der
Migrationsstruktur werden nicht als Modulbesitz akzeptiert.

Capability-IDs werden nicht zusätzlich als unabhängige zweite Source of Truth im
Paket gepflegt. Das Modul konsumiert die Capability-Liste aus
`appbasis.module.json` und stellt sie als öffentlichen
`MODULE_CAPABILITIES`-Vertrag bereit. Modulspezifische Convenience-Konstanten
müssen exakt dieselben IDs abbilden.

Der Datenbank-Manifest-Renderer übernimmt Modul-Owner direkt aus den bereits
verifizierten `appbasis.module.json`-Verträgen. Es gibt keine separate
Modul-Owner-Registry mehr. Ein Modul mit `database: null` erzeugt bewusst
keinen Datenbank-Owner; bei einem Modul mit Datenbankvertrag werden
SchemaVersion, Modul-Root und vollständige Migrationsliste unmittelbar aus dem
Manifest abgeleitet. App-Verifikation und App-Generator verwenden dieselben
verifizierten Moduldefinitionen.

`tasks` ist der erste bestehende Referenzverbraucher des neuen Vertrags.

## FC4-B – Modul-Scaffolder

Neue Module werden über den kanonischen lokalen Scaffolder erzeugt:

```bash
pnpm appbasis:create-module -- \
  --module-id countdown \
  --display-name "Intervall-Countdown" \
  --capability countdown:view
```

Der Scaffolder erzeugt Manifest, Workspace-Paket, TypeScript-Konfiguration,
öffentlichen `MODULE_CAPABILITIES`-Export und README deterministisch. Capability-
IDs werden sortiert und anschließend durch denselben strikten Modulparser
validiert; fremde Namespaces und Duplikate werden abgewiesen. Bestehende
Modulverzeichnisse werden nie überschrieben.

Für den unmittelbar benötigten Countdown erzeugt FC4-B bewusst
`database: null`. Generische Erzeugung von Modul-Migrationen wird erst ergänzt,
wenn ein realer DB-ownender Modulverbraucher sie benötigt.

Die Workspace-Finalisierung aktualisiert den pnpm-Lockfile. Schlägt sie fehl,
werden neu veröffentlichter Modulordner und Lockfile auf den Ausgangszustand
zurückgerollt.

## Noch nicht Teil dieses Slices

FC4-A verändert keine bestehende App und insbesondere keine ULC-Produktionsruntime.

Noch offen für die folgenden kleinen FC4-Slices:

1. Countdown als erstes neu erzeugtes Modul ohne Persistenz.
2. Generator-Integration für eine neue Test-App.
3. Erst danach FC5: kontrolliertes Hinzufügen/Aktualisieren eines Moduls in
   einer bestehenden App wie `ulc-linz`.

Damit bleibt die bisher verifizierte ULC-M5/M6-Runtime unverändert, bis ein
expliziter Updatepfad existiert.
