# M6 – ULC Linz als erste echte Produktiv-App – Vorbereitung

## Entscheidung des Nutzers

Die erste reale Produktiv-App für den AppBasis-End-to-End-Beweis ist die bestehende **ULC Linz Vereinsapp** als fachliche Ausgangsbasis.

Bestehende fachliche Quelle:

- Repository: `martinirrgeher-cloud/ulc-linz`
- Betreiberart: Verein
- Datenschutzprofil: Verein
- High Privacy: ja
- gewünschte Produktionsdatenbankregion: EU / Frankfurt

Diese Festlegung bestimmt den realen Verbraucher für die weitere M5-/M6-Arbeit. Sie ist noch keine Produktionsfreigabe und keine Aussage, dass der heutige ULC-Linz-Providerzustand bereits AppBasis-M5/M6 erfüllt.

## Verbindlich beschlossener Übernahmepfad

Die bestehende ULC-Linz-Produktiv-App wird **nicht in-place auf AppBasis umgebaut**.

Stattdessen gilt verbindlich:

1. die bestehende ULC-Linz-App bleibt bis zum kontrollierten Cutover unverändert lauffähige Referenz und fachliche Source of Truth,
2. die AppBasis Factory erzeugt eine **neue AppBasis-Zielapp für ULC Linz** über den bestehenden `createAppSkeleton()`-Pfad,
3. vorhandene ULC-Fachbereiche werden einzeln inventarisiert und als App-spezifische oder später wiederverwendbare Module eingeordnet,
4. Funktionen werden schrittweise in die AppBasis-Zielapp portiert bzw. gegen AppBasis-Plattformdienste adaptiert,
5. Datenmigration von Supabase/PostgreSQL in die neue eigene AppBasis-Produktionsdatenbank wird getrennt geplant, versioniert, getestet und vor Produktion wiederholbar verifiziert,
6. Auth-, Rollen- und Berechtigungssemantik wird explizit auf AppBasis-Verträge abgebildet; keine stillschweigende Rechteänderung,
7. Datei-/Medienmigration wird als eigener Datenpfad behandelt; vorhandene Supabase-Storage-Inhalte werden nicht implizit mit der Datenbankmigration gleichgesetzt,
8. Preview-Parität und Fach-Smokes werden vor dem Produktionscutover nachgewiesen,
9. erst nach M4/M5-Gates und ausdrücklicher Nutzerfreigabe erfolgt der kontrollierte Produktionscutover.

Der In-place-Umbau des bestehenden `ulc-linz`-Repositories ist damit für den ersten M6-Produktionsbeweis **ausgeschlossen**.

## Aktueller technischer Ausgangspunkt der bestehenden ULC-Linz-App

Die bestehende ULC-Linz-App ist derzeit eine eigenständige Anwendung mit einem anderen Plattformvertrag als AppBasis. Der bestehende Repository-Vertrag nennt insbesondere:

- React
- TypeScript
- Vite
- React Router
- Supabase / PostgreSQL / Auth
- Playwright
- Vercel

Damit darf die bestehende Supabase-/Vercel-Laufzeit nicht stillschweigend als AppBasis-Produktionsumgebung umgedeutet werden.

## Bereits vorhandene Fachbereiche

Im bestehenden ULC-Linz-Repository existieren bereits reale Fach- und Plattformbereiche, darunter:

- Athleten
- Auth
- Zusammenarbeit
- Countdown
- Dashboard
- Datenimport
- Dropdown-/Stammdateneinstellungen
- Übungskatalog
- Gruppentraining
- Gruppentraining-Statistik
- Hilfe
- Kindertraining
- Kindertraining-Statistik
- Leistungsgruppen-Anmeldung
- Simulation
- Trainingsblöcke
- Trainingsdokumentation
- Trainingsübersicht
- Trainingsplanung
- Trainingseinheit
- Benutzerverwaltung

Diese vorhandene Implementierung ist ein realer fachlicher Verbraucher und soll beim AppBasis-Ausbau wiederverwendet bzw. kontrolliert überführt werden, statt die Fachlogik neu zu erfinden.

## Datei-/Medienpfad ist für ULC Linz bereits real

ULC Linz verwendet bereits Datei-/Medienfunktionen, insbesondere:

- Video-Upload im Übungskatalog,
- Medien-Upload in der Trainingsdokumentation,
- bestehende Supabase-Storage-Backup- und Restore-Skripte.

Damit greift die M4-Regel „Object Storage Backup/Restore, sobald Apps Dateien verwenden“ bereits für die erste reale ULC-Linz-Zielapp. Der spätere AppBasis-Dateispeicher benötigt daher vor der ULC-Produktionsfreigabe einen verifizierten Backup-/Restore-Pfad.

## Verbindliche AppBasis-Grenzen

Für die Übernahme bleiben die bestehenden AppBasis-Entscheidungen maßgeblich:

- Neue App-Erzeugung läuft ausschließlich über `createAppSkeleton()`.
- Es darf keine zweite Generatorimplementierung entstehen.
- Bestehende Apps werden nicht durch erneute Generierung überschrieben.
- Spätere Modulinstallation in bestehende AppBasis-Apps verwendet den getrennten Modulmanager-/Updater-Pfad.
- Jede echte App besitzt eine eigene Produktionsdatenbank.
- Preview und Produktion bleiben getrennt.
- M5 bleibt all-required und fail-closed.
- M6 benötigt M1–M5 DONE, eigene Produktionsressourcen, kontrollierte Migrationen, Post-Deploy-Smoke und ausdrückliche Nutzerfreigabe.

Dieser ULC-spezifische Übernahmepfad ergänzt diese Verträge, ohne einen allgemeinen Migrationsmechanismus für beliebige Fremd-Apps vorwegzunehmen. Ein solcher allgemeiner Vertrag darf gemäß ADR-012 erst aus realem Bedarf und den Erfahrungen dieses Consumers abgeleitet werden.

## Warum dieser Pfad gewählt wurde

Der beschlossene Pfad vermeidet insbesondere:

- Überschreiben des bestehenden ULC-Repositories durch einen Generator,
- Vermischung von Supabase-/Vercel- und AppBasis-Providerverträgen,
- unkontrollierte Produktivdatenmigration,
- stillschweigende Änderungen an Rollen, RLS oder Fachlogik,
- Vermischung von Datenbank- und Datei-/Medienmigration,
- eine zweite Generator- oder Deploymentimplementierung.

## Nächster sicherer Vorbereitungsschritt

Vor einer Implementierung wird eine ULC-Linz-Übernahmematrix erstellt. Für jeden vorhandenen Fachbereich wird getrennt erfasst:

- heutige Route/Funktion
- heutige Daten-/Tabellenabhängigkeiten
- Auth-/RLS-/Rollenabhängigkeiten
- Dateien/Object Storage
- Ziel: App-spezifisch oder wiederverwendbares AppBasis-Modul
- notwendige AppBasis-Plattformdienste/Capabilities
- notwendige Datenmigration
- Preview-/Acceptance-Smoke
- Datenschutz-/Aufbewahrungsrelevanz

Die Matrix ist zunächst reine Vorbereitung. Sie verändert weder das ULC-Linz-Produktivsystem noch AppBasis-Produktionsressourcen.
