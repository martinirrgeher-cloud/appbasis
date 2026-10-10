# ULC Linz – Trainingsblöcke

## Ziel

Trainingsblöcke sind wiederverwendbare inhaltliche Vorlagen zwischen
Übungskatalog und konkreter Trainingsplanung. Sie enthalten noch keinen Termin,
keine Anwesenheit und keinen Athleten-Tagesplan.

Das Modul wird von Beginn an als echtes AppBasis-Standardmodul
`training-blocks` aufgebaut. ULC Linz liefert seine bestehenden
Trainingsgruppen als Audience-Resolver und den bereits adoptierten
`exercise-catalog` als Übungsquelle.

## Fachliche Referenz aus der früheren ULC-App

Die frühere App hatte bereits einen eigenständigen Trainingsblock-Bereich mit
folgenden für die Parität verbindlichen Eigenschaften:

- eigenständige Blockvorlagen;
- alphabetische bzw. gruppierte Übersicht mit auf-/zuklappbaren Blöcken;
- genau eine Trainingsgruppe je ULC-Block;
- Dauer darf zunächst leer bleiben;
- Übungen werden aus dem Übungskatalog hinzugefügt;
- dieselbe Übung darf mehrfach in einem Block vorkommen;
- die Übungsansicht zeigt Kataloginformationen wie Kategorie/Unterkategorie,
  Schwierigkeit, Ziel, Beschreibung, Trainerhinweise, typische Fehler,
  Material, Planungsparameter und Videos;
- konkrete Blockwerte für Parameter überschreiben die Katalog-Standardwerte,
  ohne den Katalog selbst zu verändern;
- optimistisches Speichern ohne klassischen Save-Button;
- Versionen/Snapshots und Vergleich früherer Blockstände;
- Favoriten-/Nutzungsinformationen in der Übersicht;
- Blockvorlagen können später in die Trainingsplanung übernommen werden.

Die frühere separate Gruppenverwaltung innerhalb des Blockbereichs wird
**nicht** dupliziert. AppBasis besitzt Trainingsgruppen bereits im
`athletes`-Standardmodul; ULC referenziert diese serverautorisiert.

## Architekturgrenzen

### Trainingsblock

Wiederverwendbare Vorlage:

- Name;
- eine ULC-Trainingsgruppe/Audience;
- optionale geplante Dauer;
- optionale Blocknotiz;
- sortierte Übungsvorkommen;
- je Übungsvorkommen optionale Notiz;
- je Übungsvorkommen konkrete Parameter-Overrides;
- aktiver/archivierter Lifecycle;
- revisionsfähige Historie.

### Trainingseinheit

Die bereits vorhandene ULC-`training-session`-Logik bleibt getrennt. Sie
modelliert konkretes Datum, Trainingsgruppe, Zustand und Anwesenheit.

### Trainingsplanung

Kommt in E7B. Die alte Planung arbeitete pro Athlet/Woche/Tag mit einer
7-Tage-Leiste, Anwesenheitsstatus, Blöcken und Übungen. Eine Blockvorlage wird
dort als eigenständiger Planinhalt übernommen; spätere Änderungen der Vorlage
dürfen einen bereits geplanten Tag nicht still verändern.

### Trainingsdokumentation

Kommt nach der Planung. Soll/Ist-Werte, Status, Bewertung/Kommentar und
gegebenenfalls Medien gehören nicht in den Trainingsblock.

## Standardmodul-Vertrag

- Modul-ID: `training-blocks`
- Paket: `@appbasis/training-blocks`
- Capabilities:
  - `training-blocks:view`
  - `training-blocks:edit`
- eigener Datenbankowner;
- keine Foreign Keys in `athletes` oder `exercise-catalog`;
- Organisation kommt ausschließlich aus dem serverautorisierten App-Kontext;
- Audience-/Exercise-IDs sind opaque Referenzen und werden am App-Adapter gegen
  die jeweiligen öffentlichen Modulverträge validiert.

## Umsetzungsslices

### E7A1 – Standardmodul-Fundament

- Modulmanifest und Paket;
- revisionsfähiges Modulschema;
- Blockidentität getrennt von nummerierten Revisionen;
- genau ein optionaler generischer Audience-Verweis pro Revision;
- optionale Dauer;
- sortierte Übungsvorkommen mit eigener Item-ID, sodass dieselbe Übung mehrfach
  vorkommen kann;
- sortierte Parameter-Overrides pro Übungsvorkommen;
- technische Payload-Grenzen von höchstens 200 Übungsvorkommen pro Block und
  50 Overrides pro Übungsvorkommen;
- Domainnormalisierung und Grenztests;
- noch keine ULC-Adoption, Runtime, UI, Preview-Migration oder Provideraktion.

### E7A2 – Repository/Service und Versionsvertrag

- atomare Create-/Update-Operationen;
- jedes fachliche Update erzeugt eine neue unveränderliche Revision;
- Optimistic-Concurrency-Vertrag gegen den zuletzt gelesenen Stand;
- Listenansicht lädt nur aktuellen Stand, Historie erst bei Bedarf;
- Revisionen einzeln lesen und vergleichen;
- Deaktivieren statt historisch löschen;
- In-Memory- und PostgreSQL-Beweis.

### E7A3 – ULC-Adapter und Berechtigungen

- Modul in ULC deklarieren;
- `training-blocks:view/edit` auf ULC-Rollen abbilden;
- vorhandene aktive Trainingsgruppen aus `athletes` serverseitig auflösen;
- ULC verlangt genau eine gültige Gruppe je Block;
- Übungsreferenzen gegen den Standard-`exercise-catalog` prüfen;
- keine clientseitige `organizationId` oder Actor-ID.

### E7A4 – mobile Oberfläche und Autosave

- kompakte gruppierte/alphabetische Übersicht;
- Blöcke auf-/zuklappbar;
- Editor als eigenes mobiles Overlay;
- Übungsauswahl aus dem Katalog inklusive Info-Ansicht;
- mehrfaches Hinzufügen derselben Übung;
- Drag/Reorder bzw. gleichwertige mobile Reihenfolgefunktion;
- Parameterwerte mit Katalogstandard als Ausgangswert und Block-Override;
- optimistisches Autosave ohne Save-Button, mit sichtbarem
  gespeichert/speichert/Fehler-Zustand;
- Konflikt bei paralleler Änderung wird nicht still überschrieben;
- Versionen/Snapshots und Vergleich;
- Favoriten-/Nutzungsanzeige als Paritäts-Folgeschritt innerhalb E7A.

### E7A5 – isolierte Preview-Abnahme

- Modulmigration ausschließlich nach separater Freigabe;
- ULC-Preview-Adoption und Deployment getrennt;
- praktische Prüfung gegen den Alt-App-Zielumfang;
- Produktion bleibt ein eigenes späteres Gate.

## Spätere Planung E7B

Die alte Trainingsplanung bleibt Referenz für den nächsten Bereich:

- Athlet/Woche/Tag;
- Kalenderwoche und 7-Tage-Leiste;
- Anwesenheitsstatus und Filter;
- Blockhierarchie klar von Übungen getrennt, Blöcke einklappbar;
- Übungen aus Katalog oder manuell;
- Sätze, Wiederholungen, Menge, Einheit und Kommentar;
- Blöcke/Übungen ergänzen, umsortieren und Parameter anpassen;
- Plan auf andere Person/anderen Tag übertragen;
- kopierte Pläne danach unabhängig bearbeiten;
- Überschreiben bestehender Zielpläne geschützt;
- Blockvorlage in einen Tag übernehmen und Planblock optional wieder als
  Vorlage speichern.

Diese Planungsfunktionen werden nicht in E7A vorgezogen.
