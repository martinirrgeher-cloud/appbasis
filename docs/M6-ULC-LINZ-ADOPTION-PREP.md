# M6 – ULC Linz als erste echte Produktiv-App – Vorbereitung

## Entscheidung des Nutzers

Die erste reale Produktiv-App für den AppBasis-End-to-End-Beweis soll die bestehende **ULC Linz Vereinsapp** sein.

Bestehende fachliche Quelle:

- Repository: `martinirrgeher-cloud/ulc-linz`
- Betreiberart: Verein
- Datenschutzprofil: Verein
- High Privacy: ja
- gewünschte Produktionsdatenbankregion: EU / Frankfurt

Diese Festlegung bestimmt den realen Verbraucher für die weitere M5-/M6-Arbeit. Sie ist noch keine Produktionsfreigabe und keine Aussage, dass der heutige ULC-Linz-Providerzustand bereits AppBasis-M5/M6 erfüllt.

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

## Noch nicht entschiedener Übergangspfad

Für die Migration einer bereits existierenden, noch nicht auf AppBasis erzeugten Fremd-App gibt es derzeit keinen expliziten kanonischen AppBasis-Migrationsvertrag. Deshalb wird kein Übergang stillschweigend implementiert.

### Empfohlene Zielrichtung – noch als Architekturentscheidung zu bestätigen

Der risikoärmste Pfad ist:

1. die bestehende ULC-Linz-App bleibt bis zum kontrollierten Cutover unverändert lauffähige Referenz und fachliche Source of Truth,
2. die AppBasis Factory erzeugt eine neue AppBasis-Zielapp für ULC Linz über `createAppSkeleton()`,
3. vorhandene ULC-Fachbereiche werden einzeln inventarisiert und als App-spezifische oder später wiederverwendbare Module eingeordnet,
4. Funktionen werden schrittweise in die AppBasis-Zielapp portiert bzw. gegen AppBasis-Plattformdienste adaptiert,
5. Datenmigration von Supabase/PostgreSQL in die neue eigene AppBasis-Produktionsdatenbank wird getrennt geplant, versioniert, getestet und vor Produktion wiederholbar verifiziert,
6. Auth-, Rollen- und Berechtigungssemantik wird explizit auf AppBasis-Verträge abgebildet; keine stillschweigende Rechteänderung,
7. Preview-Parität und Fach-Smokes werden vor jedem Produktionscutover nachgewiesen,
8. erst nach M4/M5-Gates und ausdrücklicher Nutzerfreigabe erfolgt der kontrollierte Produktionscutover.

Dieser Pfad vermeidet insbesondere:

- Überschreiben des bestehenden ULC-Repositories durch einen Generator,
- Vermischung von Supabase-/Vercel- und AppBasis-Providerverträgen,
- unkontrollierte Produktivdatenmigration,
- stillschweigende Änderungen an Rollen, RLS oder Fachlogik,
- eine zweite Generator- oder Deploymentimplementierung.

## Alternative – In-place-Adoption

Eine direkte technische Umrüstung des bestehenden `ulc-linz`-Repositories auf AppBasis wäre nur mit einem eigenen, vorher definierten und getesteten Migrationsvertrag vertretbar. Dieser Vertrag existiert aktuell nicht. Wegen der vorhandenen produktiven Daten-, Auth-, RLS-, Vercel- und Supabase-Strukturen ist dieser Weg derzeit risikoreicher und nicht der bevorzugte Default.

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
