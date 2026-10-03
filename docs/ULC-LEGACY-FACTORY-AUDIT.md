# ULC Linz – Alt-App-/Factory-Audit

Stand: 2026-10-03

## Ziel

Dieser Audit vergleicht die frühere ULC-Linz-App, den heutigen ULC-AppBasis-
Stand und die Wiederverwendbarkeit über die AppBasis-Factory. Die alte App ist
fachliche Referenz, nicht technische Vorlage: React-/Supabase-/RPC-Strukturen
werden nicht ungeprüft portiert.

## Kernergebnis

Heute existieren drei Architekturklassen:

- Plattformfähigkeiten: Identity, Permissions und App-Shell;
- echte Standardmodule: insbesondere `countdown` und `athletes`;
- ULC-interne Fachlogik: aktuell insbesondere der Übungskatalog.

Der Übungskatalog ist fachlich als Vertical Slice bewiesen, aber noch **kein
Factory-Modul**. Er fehlt in `apps/ulc-linz/appbasis.app.json`, besitzt kein
`modules/exercise-catalog/appbasis.module.json`, seine Runtime liegt unter
`apps/ulc-linz/worker/exercise-catalog-*` und seine Tabellen wurden durch
`apps/ulc-linz/migrations/0007_ulc_linz_exercise_catalog.sql` als Teil des
App-Owners `ulc-linz-lifecycle` angelegt.

## Funktionsmatrix

| Bereich | Frühere ULC-App | AppBasis heute | Ziel |
| --- | --- | --- | --- |
| Login / Sessions | vorhanden | Identity vorhanden | Plattform |
| Rollen / Modulrechte | vorhanden | Permissions + ULC-Adapter | Plattform + App-Adapter |
| Dashboard / Navigation | vorhanden | vorhanden | App-Shell |
| Countdown | vorhanden | migriert | Standardmodul |
| Athleten / Gruppen / Trainer | vorhanden | migriert | Standardmodul |
| Übungskatalog Basis | vorhanden | E6A–E6C | Standardmodul-Kandidat |
| Übungs-Import/-Export | XLSX/XML, Vorlage, Export, Vorschau, Review, Protokoll | E6F1 Export/Vorlage; E6F2 Preview | Katalog-Exchange |
| Athleten-Import/-Export | vorhanden | E6F4A Export/Vorlage | Erweiterung von `athletes` |
| Auswahllisten | vorhanden | teilweise fest verdrahtet | Modulkonfiguration |
| Schwierigkeitsgrade | vorhanden | offen | Katalog-Erweiterung |
| Ähnliche Übungen | vorhanden | offen | Katalog-Erweiterung |
| Dublettenwarnung | vorhanden | offen | Katalog-Erweiterung |
| Verwendung / letzte Verwendung | vorhanden | offen | Katalog + Planung |
| private / mehrere Videos | vorhanden | offen | Katalog + Files |
| Trainingsblöcke | vorhanden | fehlt | Standardmodul-Kandidat |
| Trainingsplanung | vorhanden | fehlt | Standardmodul-Kandidat |
| Trainingsdokumentation | vorhanden | Vorarbeit | Standardmodul-Kandidat |
| Trainingsübersicht | vorhanden | fehlt | Reporting/Modul |
| Leistungsregistrierung | vorhanden | fehlt | konfigurierbares Fachmodul |
| Kindertraining / U12 / U14 | vorhanden | teilweise, geparkt | zunächst ULC-spezifisch |
| Benutzerverwaltung | vorhanden | Plattformbasis, UI offen | Plattform/Admin |
| Realtime / Edit-Locks | vorhanden | für neue Module offen | optionale Plattformfähigkeit |

## Import/Export aus der alten App

Der frühere Übungsimport bot bereits:

- Excel-Vorlage mit Beispiel;
- Excel-Export bestehender Übungen;
- XLSX und Excel-XML;
- maximal 5 MB und 1.000 Datenzeilen;
- Kategorien, Unterkategorien, Material, Gruppen und Parameter als Listen;
- Beschreibung, Ziel, Trainerhinweise, Fehler und Video-URL;
- mehrere Materialien, Gruppen und Planungsparameter;
- Erkennung bestehender Übungen über ID oder normalisierten Namen;
- `create`, `update`, `skip`;
- Vorschau mit Fehlern/Warnungen;
- Einzelprüfung vor dem Apply;
- keine Mutation während der Review;
- kontrollierten serverseitigen Apply;
- CSV-Importprotokoll.

Diese Bedienidee bleibt Referenz.

## AppBasis-Vertrag für Import/Export

Import/Export wird nicht als ULC-Datenbank-Sonderpfad gebaut.

1. Export und Import verwenden ein neutrales Exchange-DTO.
2. Parser und UI greifen niemals direkt auf PostgreSQL zu.
3. Der Client liefert keine `organizationId` oder Actor-ID als Scope.
4. Export benötigt View-, Import Edit-Zugriff.
5. Importvorschau mutiert keine Fachdaten.
6. Der finale Import nutzt dieselben Domainvalidatoren wie normales
   Create/Update.
7. Gruppen werden ausschließlich gegen einen serverautorisierten Resolver
   aufgelöst.
8. Fehler/Warnungen sowie `create/update/skip` sind vor Apply sichtbar.
9. Ein Apply liefert ein nachvollziehbares Ergebnis pro Zeile.
10. Dateispalten machen keine internen DB-Namen zum öffentlichen Vertrag.

Noch wird **keine allgemeine Importplattform** in Core erzeugt. Zuerst wird der
Katalog als Vertical Slice umgesetzt, danach `athletes` als zweiter
Verbraucher. Erst dann darf ein kleiner gemeinsamer Workbook-/Tabular-Helper
extrahiert werden.

## Zielvertrag für `exercise-catalog`

Vorgesehen:

- Modul-ID: `exercise-catalog`
- Paket: `@appbasis/exercise-catalog`
- Display Name: `Übungskatalog`
- Capabilities:
  - `exercise-catalog:view`
  - `exercise-catalog:edit`

Der heutige ULC-Permission-Key `exercise_catalog` bleibt bis zur Adoption ein
App-Adapter und ist nicht der generische Modulname.

### Modulverantwortung

Langfristig:

- Übungs-Domain und Validierung;
- Katalog-Persistenz;
- Parameterdefinitionen;
- Favoriten und Archivstatus;
- Exchange-DTOs;
- später Schwierigkeit, Ähnlichkeiten, Dubletten und Nutzungsmetadaten;
- Medienmetadaten über einen öffentlichen Files-/Storage-Vertrag.

### App-Verantwortung

ULC bleibt zuständig für:

- Membership- und Organisationsauflösung;
- Mapping der Rollen auf Modulrechte;
- Navigation und Branding;
- sportartspezifische Presets;
- optionalen Gruppenresolver;
- Integration mit Trainingsblöcken, Planung und Dokumentation.

## Heutige Nicht-Generik

Der aktuelle Katalog ist noch nicht ohne Umbau standardisierbar:

- Tabellen gehören dem App-Owner `ulc-linz-lifecycle`;
- Tabellennamen sind `ulc_linz_exercise_*`;
- die elf sprintorientierten Kategorien sind als SQL-Check fest verdrahtet;
- die 18 Planungsparameter-Keys sind als SQL-Check fest verdrahtet;
- die Gruppenvalidierung ist direkt an den ULC-Athletes-Snapshot gebunden.

Ein Standardmodul benötigt konfigurierbare Kategorien/Parameter und einen
expliziten optionalen Gruppen-/Audience-Resolver.

## Keine stille DB-Ownership-Übernahme

FC6 installiert DB-ownende Module nur dann, wenn deren Zielmarker noch nicht
vorhanden sind. Bereits vorhandene oder teilweise vorhandene Zielmarker werden
absichtlich fail-closed abgewiesen.

Deshalb sind verboten:

- Katalogtabellen ein zweites Mal anlegen;
- bestehende ULC-Tabellen einfach im Modulmanifest beanspruchen;
- eine Modulmigration, die ULC-App-Tabellen direkt verändert;
- eine Appmigration, die künftig Modul-owned Tabellen heimlich verwaltet;
- Daten nur zur bequemeren Modularisierung löschen und neu importieren.

Die reale ULC-Promotion benötigt später einen eigenen, ausführbar geprüften
**Schema-/Ownership-Adoptionsvertrag**. Dieser muss Source-Owner, Source-Schema,
Zielschema, vollständige Datenübernahme, Organisationsgrenzen, IDs,
Favoriten/Gruppen/Parameter, Fail-closed-Verhalten und getrennte Preview-/
Production-Gates beweisen.

Dieser Audit implementiert den Adoption-Mechanismus noch nicht.

## Roadmap

### E6F0 – Audit und Exchange-/Factory-Vertrag

Dieser Audit. Keine Runtime-, Schema- oder Provider-Mutation.

### E6F1 – Export + Importvorlage

Read-only:

- aktuelle Übungen als echte XLSX-Datei exportieren;
- XLSX-Importvorlage mit Beispiel erzeugen;
- stabiler Vertrag `appbasis.exercise-catalog.exchange/v1`;
- getrennte Blätter für Übungen, Gruppen, Parameter, Listen und Hinweise;
- dateiinterner Datensatz-Schlüssel verbindet die Blätter, ohne
  `organizationId` oder Actor-ID offenzulegen;
- bestehende Übungs-ID wird für die spätere Update-Erkennung mitgeführt;
- persönliche Favoriten sind bewusst kein Exchange-Feld;
- aktuelle Trainingsgruppen stammen ausschließlich aus dem
  serverautorisierten Resolver;
- keine allgemeine Workbook-Plattform vor E6F4;
- keine Datenbankmutation und noch kein Datei-Parser.

### E6F2 – Importvorschau

Read-only gegenüber Fachdaten:

- XLSX-v1-Dateien bis 5 MB und 1.000 primäre Übungszeilen einlesen;
- ZIP/OpenXML fail-closed und größenbegrenzt prüfen;
- Zeilen mit der normalen Katalog-Domain normalisieren und validieren;
- bestehende Übung über ID oder bei leerer ID über normalisierten Namen
  erkennen;
- Trainingsgruppen ausschließlich gegen den serverautorisierten Resolver
  auflösen;
- Fehler/Warnungen sowie `create/update/skip` vor jeder Mutation liefern;
- Vorschauzeilen im bestehenden Editor schreibgeschützt prüfbar machen;
- kein Apply-Endpunkt, kein Apply-Button und keine Fachdatenmutation;
- keine allgemeine Workbook-Plattform vor E6F4.

### E6F3 – kontrollierter Import

Write-Slice:

- serverseitige Edit-Autorisierung vor Dateiinspektion;
- Preview-Token bindet XLSX, serverautorisierte Organisation und aktuellen
  Katalog-/Gruppenstand;
- Apply parst und klassifiziert die Datei erneut und lehnt Drift vor dem ersten
  Write mit `409` ab;
- Create/Update verwenden ausschließlich den normalen Katalog-Service und
  damit dieselbe organisationsgebundene Gruppen- und Domainvalidierung;
- unveränderte Zeilen bleiben `skip`; archivierte Datensätze werden nicht
  implizit reaktiviert, deaktiviert oder verändert;
- Ergebnis pro Zeile als `created/updated/skipped/failed`;
- CSV-Importprotokoll aus demselben Ergebnisvertrag;
- der Preview-Token wird nach Apply clientseitig verworfen; Unique-Constraints
  bleiben zusätzliche Create-Dublettenbarriere;
- keine neue Tabelle/Migration und keine allgemeine Importplattform;
- Preview-Mutation und Deploy bleiben eigene Gates.

### E6F4 – zweiter Exchange-Verbraucher

#### E6F4A – Export + Importvorlage

Read-only und bereits im Standardmodul `athletes` verankert:

- stabiler Vertrag `appbasis.athletes.exchange/v1`;
- XLSX-Blätter `Athleten`, `Gruppen`, `Listen`, `Hinweise`;
- bestehende Athleten-ID plus dateiinterner Datensatz-Schlüssel;
- aktive/inaktive Athleten und historische Gruppenzugehörigkeiten im Export;
- Gruppen nur als serverautorisierte Referenzen, keine Gruppenmutation;
- keine Organisations-ID, Actor-ID, Trainer-Identity oder Benutzerkontodaten;
- ULC ist ausschließlich HTTP-/Autorisierungs-/UI-Adapter;
- keine Datenbankmutation, keine Migration.

#### E6F4B – Preview + kontrollierter Apply

Folgeslice:

- XLSX fail-closed lesen und über die öffentliche Athletes-Domain validieren;
- bestehende Athleten primär über ID und bei neuen Datensätzen über einen
  konfliktarmen fachlichen Schlüssel erkennen;
- Gruppen ausschließlich gegen den aktuellen serverautorisierten Snapshot
  auflösen;
- `create/update/skip`, Fehler und Warnungen vor Apply sichtbar machen;
- Apply erneut gegen aktuellen Snapshot prüfen und ausschließlich die
  bestehenden Athletes-Repository-/Domainverträge verwenden;
- Archivstatus und historische Gruppenänderungen nicht implizit erraten;
- Ergebnis pro Zeile plus Importprotokoll.

Erst nach E6F4B wird entschieden, ob die nun real in zwei Fachdomains
bewiesene Low-Level-XLSX-/Tabular-Mechanik in einen kleinen gemeinsamen Helper
extrahiert wird. Eine allgemeine Importplattform bleibt ausdrücklich
außerhalb dieses Gates.

### E6G – Promotion zum Standardmodul

Vor weiteren Katalog-Schemaerweiterungen:

- generischer Modulvertrag;
- generisches Schema;
- keine sprintfesten SQL-Enums;
- öffentliche Domain-/Service-Verträge;
- Factory-Sichtbarkeit;
- isolierte Test-App;
- eigener ULC-Adoption-Gate.

### Danach E6D / E6E

Erst auf geklärtem Modul-/Ownership-Vertrag folgen private Videos,
Schwierigkeitsgrad, Ähnlichkeiten, Dubletten und Nutzungsintelligenz.

## Regel für neue ULC-Module

Vor jeder größeren neuen Fachfunktion wird klassifiziert:

1. **Plattform** – technische Fähigkeit ohne Fachdomain;
2. **Standardmodul** – eigenständige, appübergreifend nutzbare Fachdomain;
3. **App-Adapter** – Rollenmapping, Branding, Navigation, Presets, Integration;
4. **ULC-spezifisch** – tatsächlich vereins-/sportartspezifische Logik.

Standardmodule benötigen eigenen `modules/<id>`-Vertrag, Package,
Capabilities, eigenes DB-Schema sofern persistent, keine direkte Mutation
fremder Owner, Factory-Erkennung und eine isolierte Test-App.

## Einordnung der nächsten Trainingsmodule

- **Trainingsblöcke:** Standardmodul-Kandidat; Definitionen, Varianten,
  Snapshots, Favoriten und Versionierung sind allgemein.
- **Trainingsplanung:** Standardmodul-Kandidat; Pläne, Datum, Gruppen und
  Snapshots sind allgemein.
- **Trainingsdokumentation:** Standardmodul-Kandidat; Soll/Ist und Sessions sind
  allgemein, konkrete Kennzahlen konfigurierbar.
- **Leistungsregistrierung:** konfigurierbares Fachmodul; Leichtathletikfelder
  dürfen nicht als Core modelliert werden.
- **Kindertraining/U12/U14:** zunächst ULC-spezifisch; Generalisierung erst bei
  zweitem realen Verbrauchsfall.

## Abschluss

Der Audit gilt als abgeschlossen, wenn diese Klassifikation und die
E6F1–E6G-Grenzen auf `main` akzeptiert sind.
