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

Publikation und Modulverifikation werden über einen Registry-Lock serialisiert;
das Modulmanifest wird erst nach erfolgreicher Workspace-Finalisierung
veröffentlicht. App- und Modul-Generator teilen zusätzlich denselben
Workspace-Publication-Lock, damit pnpm-Lockfile-Snapshot, Finalisierung und
Rollback niemals gegeneinander laufen. Schlägt die Workspace-Finalisierung
fehl, werden reservierter Modulordner und Lockfile auf den Ausgangszustand
zurückgerollt.

## FC4-C – Generator-Verbrauch

Der normale App-Generator akzeptiert `countdown` jetzt als verifiziertes
Standardmodul. Für eine neue Identity+Permissions-App erzeugt er die
Workspace-Abhängigkeit `@appbasis/countdown` und einen ausführbaren Selbsttest,
der den öffentlichen `MODULE_CAPABILITIES`-Vertrag konsumiert. Weil
`countdown` keine Persistenz besitzt, erscheint es nicht als Datenbank-Owner;
die vorhandenen Identity- und Permissions-Owner bleiben davon unberührt.

Der Generatorpfad wird automatisiert mit einer frisch erzeugten
`countdown-test`-App geprüft. Dabei werden Appmanifest, Paketabhängigkeit,
generierter Modulvertrag, deploybarer Identity+Permissions-Worker und
Datenbankmanifest gemeinsam verifiziert. Die
generierte Oberfläche behauptet bei einem deklarierten, aber nicht
UI-spezialisierten Modul nicht mehr fälschlich, es sei kein Fachmodul aktiviert.

## Noch nicht Teil dieses Slices

FC4-A verändert keine bestehende App und insbesondere keine ULC-Produktionsruntime.

Der Intervall-Countdown ist jetzt der erste reale, über diesen Vertrag erzeugte
Fachmodul-Referenzfall. Sein eingecheckter Inhalt wird automatisiert gegen die
kanonische Scaffolder-Ausgabe geprüft und besitzt bewusst keine Persistenz.

Damit ist der FC4-Vertical-Slice vom Modulmanifest über Scaffolder und
Countdown-Referenzmodul bis zum normalen App-Generator geschlossen.

Als nächster Gate-Scope folgt FC5: kontrolliertes Hinzufügen/Aktualisieren eines
Moduls in einer bestehenden App wie `ulc-linz`.

Damit bleibt die bisher verifizierte ULC-M5/M6-Runtime unverändert, bis ein
expliziter Updatepfad existiert.
