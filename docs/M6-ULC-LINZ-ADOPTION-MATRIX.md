# M6 – ULC Linz Übernahmematrix

Stand der fachlichen Quelle: `martinirrgeher-cloud/ulc-linz` auf Commit `682ed5d37e7206f7fa521e5dab40f840cc303f0b`.

Diese Matrix ist Vorbereitung für die erste echte AppBasis-Produktiv-App. Sie verändert weder das bestehende ULC-Linz-Produktivsystem noch Providerressourcen. Sie ist keine Produktionsfreigabe und kein M5-/M6-Evidenznachweis.

## Verbindlicher Übergangspfad

Beschlossen ist:

1. Die bestehende ULC-Linz-App bleibt bis zum kontrollierten Cutover unverändert produktiv und fachliche Source of Truth.
2. Die AppFactory erzeugt eine **neue AppBasis-Zielapp ULC Linz** über `createAppSkeleton()`.
3. Kein In-place-Umbau des bestehenden Supabase-/Vercel-Produktionssystems.
4. Kein erneutes Ausführen des Generators auf der bestehenden ULC-App.
5. Funktionen, Daten, Rollen und Medien werden schrittweise übernommen bzw. gegen AppBasis-Verträge adaptiert.
6. Kein bestehendes fachliches Verhalten wird stillschweigend entfernt oder vereinheitlicht.
7. Produktionscutover erst nach Preview-Parität, M4/M5-Gates und ausdrücklicher Nutzerfreigabe.

## Klassifikation

Die Matrix verwendet drei Zielklassen:

- **AppBasis-Plattform übernehmen**: bestehende ULC-Sonderlösung wird nicht als Fachmodul konserviert, sondern auf einen vorhandenen oder konkret benötigten AppBasis-Plattformvertrag abgebildet.
- **ULC-Fachmodul portieren**: reale ULC-Fachlogik bleibt als ULC-spezifischer Verbraucher erhalten. Eine spätere Wiederverwendung wird erst nach einem zweiten echten Verbraucher abstrahiert.
- **App-Shell / Support**: bleibt Teil der konkreten App bzw. nutzt gemeinsame Design-/Navigation-/Support-Verträge, ohne daraus jetzt ein neues Plattformmodul zu erfinden.

## Plattform- und Querschnittsbereiche

| Bereich heute | Zielklasse | Ziel in AppBasis | Kritische Abhängigkeiten | Migration / Nachweis |
|---|---|---|---|---|
| Supabase Auth + `AuthContext` | AppBasis-Plattform übernehmen | AppBasis Identity/Auth | Sessions, Profile, Passwort-/Recovery-Flows, Organisationskontext | Benutzerbestand inventarisieren; Passwort-/Session-Portabilität nicht voraussetzen; expliziten Account-Migrations-/Einladungsprozess definieren; Login-/Session-/Password-Smokes |
| Organisations-/Membership-Kontext | AppBasis-Plattform übernehmen | eigene ULC-Organisation in AppBasis-Zielapp, Benutzer/Rollen app-spezifisch | `organizationId`, Membership, Profile | 1:1-Zuordnung der produktiven Organisation; IDs/Referenzen migrationssicher abbilden; keine stille Mehrmandanten-Semantikänderung |
| Rollen & Modulrechte | AppBasis-Plattform übernehmen | AppBasis Permissions/Capabilities, deny-by-default | Rollen `admin`, `trainer`, `athlete`, `parent`; Modulrechte view/edit | Rollenmatrix gegen bestehende ULC-Semantik abbilden; Negative-Smokes Pflicht |
| Benutzerverwaltung | AppBasis-Plattform + ULC-Consumer | gemeinsame Role-/User-Administration nutzen; ULC-spezifische Verknüpfungen erhalten | User ↔ Athlet/Trainer, Audit, Einladungen, Rechte | bestehende Funktionen inventarisieren; keine parallele neue Rollenverwaltung bauen |
| RLS/RPC-Security | Plattformersatz + Fachlogik-Port | bestehende fachliche Sicherheitssemantik in AppBasis-Server-/Permission-Verträge überführen | zahlreiche Supabase RPCs und RLS/Policies | pro Fachslice Autorisierung explizit testen; alte RLS/RPC-Namen sind Quelle, nicht Zielvertrag |
| Collaboration / Edit Locks / Realtime | zunächst ULC-spezifischer Capability-Consumer | sichere Konfliktsperre/Realtime nur soweit für ULC benötigt | Edit-Lock-Token, `expectedUpdatedAt`, Realtime Refresh | Verhalten und Race-Szenarien erhalten; erst bei zweitem Verbraucher gemeinsame Plattformabstraktion erwägen |
| Supabase Storage | konkret benötigte Plattformfähigkeit | eigener Object Storage der ULC-App | Videos/Medien, signierte URLs, Upload/Resume | Bucket-/Objektinventar, Checksums, Zugriffsregeln, Migration und Restore-Smoke; M4 umfasst Storage für ULC |
| PWA / mobile Shell | App-Shell / Support | AppBasis Design System + PWA-Shell konsumieren | Mobile Navigation, Service Worker, responsive UI | visuelle/funktionale Parität; keine freie CSS-Sonderplattform abstrahieren |
| Dashboard | App-Shell / ULC-Consumer | ULC-Startansicht auf AppBasis Shell | aggregierte Fachlesemodelle | nach Kernmodulen portieren; Dashboard darf keine verdeckte Daten-/Rechteumgehung einführen |
| Hilfe | App-Shell / Support | ULC-Hilfeinhalt erhalten, gemeinsame Shell verwenden | statische Hilfetexte/Route | Read-only-Parität, keine M6-Blockade für Plattformabstraktion |
| Simulation / View-as | Security-sensitiver ULC-Consumer | nur übernehmen, wenn AppBasis-Rechte-/Auditgrenzen gleichwertig sind | simulierte Userkontexte, Write-Guard | getrennte Security-Prüfung; Simulation darf nie Rechte erweitern oder Writes maskieren |

## Fachmodule

| ULC-Modul | Route heute | Ziel | Abhängigkeiten | Storage | Datenmigration | Acceptance-Smoke vor Cutover |
|---|---|---|---|---|---|---|
| Athleten, Trainer & Gruppen | `/module/athletes` | **ULC-Fachmodul portieren**; fachliche Grundlage für mehrere Trainingsmodule | Organisation, Rollen/Rechte, User-Verknüpfungen, Edit Locks | nein | Athleten, Kontakte, Trainer, Gruppen, Gruppen-Zuordnungen, User-Verknüpfungen | Listen laden; Athlet/Trainer/Gruppe anlegen/ändern; Gruppenbezug; unerlaubter Write verweigert |
| Kindertraining | `/module/kindertraining` + Statistik | **eigenes ULC-Fachmodul** | Athleten/Gruppen/Trainer, Rollen, Session-/Attendance-Logik | nein | Trainingseinheiten, Anwesenheit, Trainer, Notiz, Environment/Sondertraining | Konfiguration laden; Termin laden; Anwesenheit speichern; Statistik; Sondertraining; Parent read-only; unberechtigter Zugriff denied |
| U12 | `/module/u12` + Statistik | **eigenes ULC-Fachmodul**, trotz gemeinsamer neutraler Trainingsbasis | gemeinsame Training-Session-Technik, eigene Route/Erweiterungspunkte | nein | U12-spezifische Gruppenzuordnung und Trainingseinheiten | gleicher Grundsmoke wie Kindertraining plus eigene Modulberechtigung |
| U14 | `/module/u14` + Statistik | **eigenes ULC-Fachmodul**, trotz gemeinsamer neutraler Trainingsbasis | gemeinsame Training-Session-Technik, eigene Route/Erweiterungspunkte | nein | U14-spezifische Gruppenzuordnung und Trainingseinheiten | gleicher Grundsmoke wie Kindertraining plus eigene Modulberechtigung |
| Leistungsgruppen-Anmeldung | `/module/performance_registration` | **ULC-Fachmodul portieren** | Athleten/Gruppen, Rollen, Wochen-/Deadline-Logik | nein | Anmeldungen, Gruppenparameter, Wochenstatus | Athlet meldet kommt/kommt nicht/unsicher; Trainerübersicht; Deadline-/Late-Regeln; Rechte |
| Übungskatalog | `/module/exercise_catalog` | **ULC-Fachmodul portieren**; später möglicher Mehrfachverbraucher | Dropdown/Stammdaten, Rollen, Upload, Import, Planung/Blöcke | **ja: `exercise-videos`** | Übungen, Kategorien/Parameter, Favoriten/Metadaten, Storage-Pfade | CRUD; Filter; Parameter; Video hochladen/lesen/löschen; Permission denied; Storage-Referenz konsistent |
| Trainingsblöcke | `/module/training_blocks` | **ULC-Fachmodul portieren** | Übungskatalog, Parameter, Rollen | indirekt über Übungen | Blöcke, Versionen, Übungszuordnungen | Block CRUD; Übung einbinden; Version/Compare; Rechte |
| Trainingsplanung | `/module/training_planning` | **ULC-Fachmodul portieren** | Athleten/Gruppen, Übungskatalog, Trainingsblöcke | indirekt | Pläne, Tage/Abschnitte/Übungen/Parameter | Plan anlegen/ändern; Import aus Vorlage/Quelle; Reihenfolge/Parameter; Rechte |
| Trainingsplan-Übersicht | `/module/training_overview` | **ULC-Fachmodul portieren** | Planung, Anmeldung, Athleten/Gruppen | nein | überwiegend Lesemodell plus fachliche Referenzen | Wochenübersicht stimmt mit Planung/Anmeldung; Rollen-/Scope-Filter korrekt |
| Trainingsdokumentation | `/module/training_documentation` | **ULC-Fachmodul portieren** | Planung, Übungen, Athleten/Gruppen, Edit Locks, Statistik | **ja: `training-documentation-media` + Zugriff auf `exercise-videos`** | Sessions, Ist-Daten, Bewertungen/RPE, Sets/Parameter, Medienmetadaten und Storage-Pfade | Plan → Session; Soll/Ist; Bewertung; Autosave/Lock; Medienupload; Statistik; Athlet/Trainer-Rechte |
| Auswahllisten | `/module/dropdown_settings` | zunächst **ULC-Fach-/Konfigurationsconsumer** | Übungskatalog/Planung | nein | Kategorien, Unterkategorien, Material/Parameterwerte und weitere Dropdownwerte | Liste CRUD; abhängige Auswahl in Übung/Planung sichtbar; Rechte |
| Datenimport/-export | `/module/data_import` | **ULC-Fachmodul portieren**, nicht als generische Plattformabstraktion starten | Athleten, Übungen, Dropdownwerte, Transaktionen/Berechtigungen | ggf. erzeugte/hochgeladene Dateien nur falls real genutzt | bestehende Importregeln; keine Altdaten neu interpretieren | Excel/strukturierter Import für Übungen/Athleten; Fehler/Partial-Failure korrekt; Exportformat prüfen; unberechtigter Import denied |
| Benutzerverwaltung | `/module/user_management` | **AppBasis-Plattform konsumieren + ULC-Verknüpfungen adaptieren** | Identity, Permissions, Athlet/Trainer-Verknüpfung, Audit | nein | Benutzer-/Membership-Metadaten und Links; Auth getrennt behandeln | Einladung/Erstellung; Rolle/Rechte; Deaktivierung; Verknüpfung; Audit; deny-by-default |
| Intervall-Countdown | `/module/countdown` | **kleines ULC-Fach-/Utility-Modul** | nahezu keine persistente Fachabhängigkeit, aber Modulrecht | nein | voraussichtlich keine Kernmigration; tatsächlichen Bestand prüfen | Timer, Belastung/Pause, Sprachansage, Mobile-Verhalten, Permission |

## Nicht als eigenständige Module behandeln

Folgende Bereiche sind für die Übernahme relevant, aber sollen nicht durch die Migration künstlich zu neuen Fachmodulen werden:

- Login / Registrierung / Passwort-Reset → Identity
- `ProtectedRoute` → serverseitige AppBasis-Auth-/Permission-Grenzen plus UI-Gating
- `NoAccess` / Connection Error → App-Shell
- Navigation / Bottom Navigation → AppBasis Design-/Navigation-Vertrag
- allgemeine Error Boundary → App-Shell
- Diagnostics → Betriebs-/Supportfähigkeit, nicht ungeprüft als eigenes Plattformprodukt

## Abhängigkeitscluster und empfohlene Portierreihenfolge

### Slice U0 – Zielapp + Plattformbindung

- neue AppBasis-Zielapp ULC Linz über `createAppSkeleton()`
- zunächst keine produktiven Providerressourcen
- Verein + High Privacy als app-spezifische M5-Zielentscheidung binden, aber erst mit echter Evidenz als verifiziert werten
- Identity-/Permissions-/Organisationsabbildung definieren
- Preview-/Testdatenbank separat

### Slice U1 – Stammdatenfundament

- Athleten
- Trainer
- Gruppen
- User-Verknüpfungen
- Rollen-/Permission-Smokes

**Warum zuerst:** Fast alle Trainings- und Planungsmodule hängen daran. Dieser Slice prüft zugleich reale personenbezogene Vereinsdaten und das High-Privacy-/Permission-Modell.

### Slice U2 – Kindertraining als erster echter Fach-Vertical-Slice

- Kindertraining
- Statistik
- Parent/Kindertrainer-Rechte
- Attendance-/Session-Write

**Warum:** echter produktiver Verbraucher mit minderjährigen Athleten, Rollen, Schreibpfad, Statistik und High-Privacy-Relevanz. Damit wird AppBasis an einem realen statt künstlichen Fachfall geprüft.

U12 und U14 folgen danach als getrennte Fachmodule auf gemeinsamer neutraler Technik; keine erzwungene fachliche Vereinheitlichung.

### Slice U3 – Leistungsgruppen

- Performance Registration
- Wochenübersicht
- Athlet/Leistungstrainer-Rechte

### Slice U4 – Übungskatalog + Object Storage

- Übungskatalog
- Dropdownwerte
- `exercise-videos`
- Storage Backup/Restore/Permission-Smoke

### Slice U5 – Planungskette

- Trainingsblöcke
- Trainingsplanung
- Trainingsübersicht

### Slice U6 – Dokumentation + Medien

- Trainingsdokumentation
- Edit Locks / Konfliktschutz
- `training-documentation-media`
- Statistik
- kompletter Storage-Restore-Smoke

### Slice U7 – Import/Export, Countdown, Dashboard, Hilfe und Restparität

- Datenimport/-export
- Countdown
- Dashboard
- Hilfe
- PWA-/Mobile-Parität
- verbleibende UX-/Supportfunktionen

## Datenmigration – getrennte Arbeitsstränge innerhalb der späteren Umsetzung

Die Datenmigration darf nicht als ein unstrukturierter `pg_dump`-Cutover betrachtet werden, weil die heutige App Supabase Auth, RLS, RPCs und Storage mit der Fachlogik verzahnt.

Für jede Datenklasse wird vor Migration dokumentiert:

- Quelltabellen/-views/-RPC-Semantik
- Zieltabellen und Ownership
- Primär-/Fremdschlüssel und ID-Erhalt oder Mapping
- Organisationszuordnung
- personenbezogene/sensible Felder
- Retention-/Deletion-Klasse
- Rollen-/Scope-Auswirkung
- Migrationsreihenfolge
- Validierungsqueries/Fingerprints
- Rollback-/Wiederholbarkeit

### Mindest-Reihenfolge der produktiven Datenmigration

1. Organisation und nicht-authentifizierende Profile/Referenzen
2. Rollen-/Membership-Zuordnung und Benutzer-Mapping
3. Athleten, Kontakte, Trainer, Gruppen
4. Kindertraining/U12/U14/Leistungsanmeldungen
5. Übungskatalog + Dropdown-/Parameter-Stammdaten
6. Trainingsblöcke und Planung
7. Trainingsdokumentation und Statistikkern
8. Medienmetadaten
9. Storage-Objekte mit Hash-/Count-Verifikation
10. finale Referenz-/Integritätsprüfung

Auth-Credentials, aktive Sessions oder Provider-spezifische Tokens werden **nicht als automatisch portabel angenommen**. Für Identitäten wird vor dem Cutover ein expliziter, getesteter Migrations-/Einladungs-/Passwortprozess festgelegt.

## Object Storage – M4/M6 Pflicht für ULC Linz

Die aktuelle ULC-App besitzt mindestens zwei reale Medienbereiche:

- `exercise-videos`
- `training-documentation-media`

Der bestehende ULC-Code besitzt bereits einen Supabase-Storage-Backupmechanismus mit Bucket-/Objektinventar, Download und SHA-256-Prüfsummen. Diese Implementierung ist wertvolle Quelle für Anforderungen, wird aber nicht automatisch zum AppBasis-Storagevertrag.

Vor ULC-Produktionsfreigabe müssen deshalb zusätzlich zum DB-Restore nachgewiesen sein:

- Ziel-Object-Storage ist app-eigen
- alle erwarteten Buckets/Namespaces vorhanden
- Objektanzahl und relevante Metadaten plausibel
- Prüfsummen/Integrität nach Migration bzw. Restore geprüft
- Zugriffe rollen-/app-spezifisch geschützt
- Übungsvideo abrufbar
- Trainingsdokumentationsmedium abrufbar
- fehlender/unberechtigter Zugriff denied
- DB-Metadaten und Storage-Objektpfade konsistent
- Restore-Prozess dokumentiert und real getestet

## Rollenabbildung – Startpunkt

Der heutige ULC-Stand kennt mindestens diese Rollen:

- `admin`
- `trainer`
- `athlete`
- `parent`

Zusätzlich existieren konkrete Berechtigungsvorlagen:

- Kindertrainer
- Leistungstrainer
- Athlet
- Elternteil

Diese Vorlagen sind **fachliche Source of Truth für die Migration**, aber kein Grund, dieselben Implementierungsdetails in AppBasis zu duplizieren. Ziel ist dieselbe oder restriktivere effektive Berechtigung auf den AppBasis-Permission-Verträgen.

## Cutover-Gate für die bestehende ULC-Produktiv-App

Die alte ULC-Produktion wird erst ersetzt, wenn mindestens gilt:

- alle für den aktuellen Produktivbetrieb benötigten Funktionen sind übernommen oder vom Nutzer ausdrücklich als nicht mehr benötigt freigegeben
- Preview-Parität gegen die bestehende App ist dokumentiert
- produktive Datenmigration ist wiederholbar getestet
- DB- und Object-Storage-Restore sind real getestet
- Identity-/Rollen-/Permission-Smokes sind grün
- High-Privacy-M5 ist app-spezifisch vollständig grün
- eigene Produktionsdatenbank, eigener Worker, eigene Domain und eigene Benutzer/Berechtigungen sind vorbereitet
- Post-Deploy-Smoke ist definiert
- Nutzer erteilt die ausdrückliche Produktionsfreigabe

Keine dieser Vorbereitungen ist bereits eine Freigabe zum Abschalten oder Verändern der bestehenden Supabase-/Vercel-Produktion.

## Architekturentscheidungen, die aus dieser Matrix noch NICHT abgeleitet werden

Bewusst offen bleiben bis zum realen Verbraucher-Slice:

- generischer Object-Storage-Providervertrag für alle Apps
- allgemeines Realtime-/Edit-Lock-Modul
- generischer Excel-Import-/Export-Baukasten
- allgemeines Vereinsmodul
- gemeinsame Training-Domain für andere Sportarten/Vereine
- allgemeine Legacy-App-Migrationsplattform

Diese Abstraktionen dürfen erst entstehen, wenn der ULC-Slice oder ein zweiter echter Verbraucher sie konkret benötigt.
