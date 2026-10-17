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

E7A5 wurde am 11.10.2026 technisch erfolgreich in der isolierten Preview
abgenommen. Migration, ACL-Reconcile, Runtime-Deploy und Smoke-Prüfungen waren
erfolgreich. Der praktische Paritätsabgleich hat danach den bereits in E7A4
markierten Restpunkt Favoriten-/Nutzungsanzeige bestätigt.

### E7A6 – Favoriten und Nutzungsmetadaten

- persönlicher Favorit pro Organisation, Principal und Trainingsblock;
- Favorit setzen/entfernen mit View-Berechtigung, ohne Blockrevision;
- generischer append-only Nutzungsledger mit Quelle, Referenz und optionaler
  Notiz;
- Übersicht zeigt Favorit, Nutzungsanzahl und letzten Nutzungszeitpunkt;
- die eigentliche Nutzungsbuchung aus einem Trainingsplan wird erst mit E7B
  angeschlossen und in E7A6 nicht simuliert;
- additive Schema-v2-Migration innerhalb des `training-blocks`-Owners;
- persönliche Präferenz- und Nutzungsmetadaten bleiben im normalen
  Datenexport fail-closed ausgeschlossen;
- v1→v2-Preview-Migration und anschließender Runtime-Deploy bleiben getrennte,
  ausdrücklich freizugebende Gates;
- Produktion bleibt unverändert.

## Planung E7B

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

### E7B1 – Standardmodul-Fundament

- neues Standardmodul `training-plans` mit `view/edit`-Capabilities;
- genau ein Plan pro Organisation, Subject und Kalendertag;
- revisionsfähige Planidentität als Basis für späteres optimistisches Speichern;
- Top-Level-Inhalte sind Planblock oder Einzelübung;
- Planblöcke können Übungen enthalten, Einzelübungen dürfen auch außerhalb
  eines Blocks stehen;
- Übungen können aus dem Katalog stammen oder manuell angelegt sein;
- Planwerte für Sätze, Wiederholungen, Menge, Einheit und Kommentar gehören
  dem Plan selbst;
- bei Übernahme einer Blockvorlage werden Block-ID und exakte Blockrevision nur
  als Provenienz gespeichert; Name, Dauer, Notiz, Übungen und Planwerte werden
  als eigener Snapshot kopiert;
- keine Foreign Keys zu `athletes`, `training-blocks` oder
  `exercise-catalog`;
- Anwesenheit bleibt im bestehenden ULC-`training-session`-Bereich und wird
  später im ULC-Adapter nur für Anzeige/Filter zugeliefert;
- noch keine ULC-Adoption, UI, Preview-Migration oder Provideraktion.

### E7B2 – Repository und Service

- In-Memory- und PostgreSQL-Repository für aktuelle Pläne und Revisionen;
- atomare Reads eines Subjects über einen frei wählbaren Datumsbereich als
  Backend-Basis für die spätere Wochenansicht;
- Erstellen genau eines Plans pro Organisation, Subject und Tag;
- optimistisches Speichern mit `expectedRevision` und explizitem
  Konfliktfehler;
- unveränderliche Revisionshistorie und gezielter Zugriff auf alte Revisionen;
- stabile Item-Identitäten bei Umsortierung und Parameteränderung;
- neue Übungen/Blöcke erhalten neue Item-IDs, entfernte IDs werden innerhalb
  derselben Planidentität nicht wiederverwendet;
- Kopieren des aktuellen Plans auf anderes Subject/anderen Tag erzeugt eine
  vollständig unabhängige Plan- und Item-Identität;
- Provenienz zu Blockvorlage und Katalogübung wird beim Kopieren beibehalten,
  Planwerte bleiben aber eigene Snapshots;
- bestehende Zielpläne werden nicht überschrieben, sondern mit
  `TrainingPlanTargetOccupiedError` geschützt;
- parallele Updates werden im PostgreSQL-Adapter über `FOR UPDATE`
  serialisiert;
- zusammengesetzte Reads laufen in `REPEATABLE READ`;
- echte PostgreSQL-18-E2E-Tests decken Revisionen, Kopien,
  konkurrierende Updates, konkurrierende Zielanlage und Parent-FK ab;
- noch keine ULC-Adoption, Anwesenheitszusammenführung, Wochen-UI oder
  Preview-Migration.

### E7B3 – ULC-Adapter und Berechtigungen

- ULC deklariert `training-plans` als Standardmodul und eigenen Datenbankowner;
- die Standard-Capabilities `training-plans:view/edit` werden auf die bereits
  vorhandene ULC-Berechtigung `training_planning:view/edit` abgebildet, ohne
  Rollenrechte zu erweitern;
- Organisation und Actor werden ausschließlich aus authentifizierter Membership
  und serverseitiger Permission-Auflösung übernommen;
- planbare Subjects sind aktive Athleten derselben Organisation;
- Katalog-Provenienz wird beim Erstellen sowie bei neu gesetzten/geänderten
  Übungsreferenzen gegen aktive Standard-Katalogeinträge validiert;
- bestehende Plan-Snapshots bleiben unabhängig vom späteren Katalog-Lifecycle:
  unveränderte Provenienz wird bei normalen Planänderungen und beim Kopieren
  nicht rückwirkend ungültig;
- manuelle Übungen ohne Katalogreferenz bleiben zulässig;
- Standard-Repository/Service werden in die ULC-Runtime über einen App-Adapter
  verdrahtet;
- Trainingsplandaten bleiben im Datenschutz-/Exportvertrag bis zu einem eigenen
  Lifecycle-Vertrag ausdrücklich fail-closed;
- noch keine Trainingsplan-HTTP-API, Wochen-UI, Anwesenheitszusammenführung,
  Blockvorlagen-Rückspeicherung, Preview-Migration oder Provideraktion.

### E7B4 – Wochenoberfläche und Autosave

- neue ULC-HTTP-Oberfläche für Trainingsplanung mit serverseitig abgeleiteter
  Organisation und Actor; Client-Scope wie `organizationId` wird nicht
  akzeptiert;
- Bootstrap liefert ausschließlich Berechtigung und aktive planbare Athleten;
- Wochenabfrage akzeptiert genau Athlet + Montag und liefert Montag bis Sonntag;
- Trainingspläne können über dieselbe ULC-Oberfläche angelegt und mit
  `expectedRevision` optimistisch aktualisiert werden;
- 409-Konflikte oder konkurrierendes erstmaliges Anlegen werden niemals still
  überschrieben, sondern sperren Autosave bis zum expliziten Neuladen;
- Wochenansicht ist auf Mobilgeräten horizontal kompakt und auf großen
  Bildschirmen als echte 7-Spalten-Woche dargestellt;
- Tagesbearbeitung erfolgt im Overlay und unterstützt manuelle Top-Level-
  Übungen, manuelle Blöcke mit Übungen, Reihenfolge, Sätze, Wiederholungen,
  Menge, Einheit, Kommentare, Dauer und Notizen;
- bestehende Katalog-/Block-Provenienz wird beim Bearbeiten unverändert
  mitgeführt, E7B4 bietet aber bewusst noch keinen Picker für Katalogübungen
  oder Blockvorlagen;
- strukturelle Änderungen sind während eines laufenden Autosaves gesperrt,
  Texteingaben dürfen weiterlaufen; nach dem Save werden neue Server-Item-IDs
  ohne Verlust späterer Texteingaben zurückgeführt;
- Wochen-/Athletenwechsel verwirft schmutzige oder konfliktbehaftete Entwürfe
  nicht still;
- noch keine Anwesenheitsanzeige/-filter, Blockvorlagen-Übernahme/-Rückspeicherung,
  Preview-Migration, Deployment oder Provideraktion.

### E7B5 – Anwesenheitsanzeige und Filter

- Anwesenheit bleibt im bestehenden ULC-`training-session`-Owner;
- die Wochenplanung liest Statuswerte ausschließlich read-only für den
  ausgewählten Athleten und dieselbe Woche;
- Tageskarten zeigen kompakte Statuswerte und bieten lokale Filter;
- mehrere Einheiten an einem Tag bleiben getrennte Attendance-Einträge.

### E7B6 – Blockvorlagen übernehmen

- aktive, aktuell adoptierbare ULC-Blockvorlagen werden über den
  Trainingsplan-Adapter serverseitig angeboten;
- die Planung liest die exakte aktuelle Vorlagenrevision und kopiert Name,
  Dauer, Notiz, Übungen und effektive Parameterwerte in einen neuen Planblock;
- `sourceBlockId` und `sourceBlockRevision` bleiben Provenienz; der
  übernommene Planblock ist danach ein unabhängiger Snapshot;
- neue Provenienz wird beim ersten Speichern serverseitig gegen die aktuelle
  Vorlage und ihren exakten Snapshot geprüft;
- spätere Vorlagenänderungen oder Archivierung machen bestehende Planblöcke
  nicht rückwirkend ungültig;
- Rückspeichern eines Planblocks als neue Vorlage bleibt ein eigener Folgeslice.

### E7B7 – Planblock als neue Blockvorlage speichern

- gespeichert wird ausschließlich ein serverseitig gelesener Block aus der
  aktuell gespeicherten Planrevision;
- der Write benötigt gleichzeitig Bearbeitungsrecht für Trainingsplanung und
  Blockvorlagen in derselben Organisation und für denselben Actor;
- Save-back erzeugt immer eine neue Blockidentität mit Revision 1 und
  aktualisiert eine vorhandene Quellvorlage niemals implizit;
- nur aktive Katalogübungen können zurückgespeichert werden; manuelle Übungen
  bleiben bewusst nicht als wiederverwendbare Vorlage exportierbar;
- strukturierte Planwerte werden nur bei eindeutiger Katalogparameter-Zuordnung
  zurückgeführt; Freitext wird nicht als versteckte Parameterquelle geparst;
- nach erfolgreichem Anlegen steht die neue Vorlage sofort wieder im
  Trainingsplan-Picker zur Verfügung.

Nach E7B7 bleiben insbesondere die Nutzungsmetadaten der tatsächlich
übernommenen Quellvorlage und die isolierte Preview-Abnahme als fachliche
E7B-Folgeslices offen.
