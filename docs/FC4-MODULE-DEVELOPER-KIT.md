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

Solange der bestehende Datenbank-Manifest-Renderer noch eine interne
Modul-Owner-Registry benötigt, wird diese bei jeder strikten
Modulverifikation ausführbar gegen `appbasis.module.json` geprüft.
SchemaVersion, Root und vollständige Migrationsliste dürfen nicht driften.
App-Verifikation und App-Generator verwenden nur so verifizierte
Moduldefinitionen. Der folgende Scaffolder-Slice muss diesen Vertrag
automatisieren, statt eine zweite manuelle Pflege einzuführen.

`tasks` ist der erste bestehende Referenzverbraucher des neuen Vertrags.

## Noch nicht Teil dieses Slices

FC4-A verändert keine bestehende App und insbesondere keine ULC-Produktionsruntime.

Noch offen für die folgenden kleinen FC4-Slices:

1. Modul-Scaffolder auf Basis dieses Manifests.
2. Countdown als erstes neu erzeugtes Modul ohne Persistenz.
3. Generator-Integration für eine neue Test-App.
4. Erst danach FC5: kontrolliertes Hinzufügen/Aktualisieren eines Moduls in
   einer bestehenden App wie `ulc-linz`.

Damit bleibt die bisher verifizierte ULC-M5/M6-Runtime unverändert, bis ein
expliziter Updatepfad existiert.
