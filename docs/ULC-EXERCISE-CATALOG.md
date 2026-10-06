# ULC Linz – Übungskatalog

## Ziel

Der Übungskatalog wird die gemeinsame fachliche Grundlage für spätere
Trainingsblöcke, Trainingsplanung und Trainingsdokumentation. Die Umsetzung
orientiert sich am bewährten früheren ULC-Linz-Katalog, wird aber auf den
aktuellen AppBasis-Vertrag mit serverseitiger Organisation, Permission Store
und app-eigener PostgreSQL-Persistenz übertragen.

## Produktumfang

Der vollständige Zielumfang umfasst:

- Übungen anlegen, bearbeiten und deaktivieren statt historisch zu löschen;
- sprintorientierte Kategorien und freie Unterkategorien;
- Trainingsziel, Beschreibung, Trainerhinweise und typische Fehler;
- Material;
- geeignete Trainingsgruppen;
- flexible Planungsparameter mit Standardwert, Minimum, Maximum, Schrittweite
  und Pflichtfeld;
- persönliche Favoriten;
- Suche und Filter nach Kategorie, Unterkategorie, Material, Gruppe, Video,
  Favorit und Aktivstatus;
- externer Video-/Weblink und später privater Video-Upload;
- später Schwierigkeitsgrad, ähnliche Übungen, Dublettenwarnung,
  Verwendungsübersicht und letzte Verwendung.

## Kanonische Kategorien

1. Aufwärmen & Lauf-ABC
2. Beschleunigung
3. Maximalgeschwindigkeit
4. Schnelligkeitsausdauer
5. Start & Reaktion
6. Technik
7. Plyometrie
8. Kraft
9. Stabilisation
10. Regeneration
11. Sonstiges

## Vorbereitete Planungsparameter

- Sätze
- Wiederholungen
- Distanz
- Gewicht
- Dauer
- Zielzeit
- Intensität
- Pause
- Serienpause
- Anlauf
- fliegende Distanz
- Kontakte
- Widerstand
- Höhe
- Tempo
- Untergrund
- Startposition
- Zusatzhinweis

## Umsetzungsslices

### ULC-E6A – Domain- und Persistenzfundament

- kanonische Kategorie- und Parameterverträge;
- app-eigene PostgreSQL-Tabellen für Übungen, Parameter, Gruppeneignung und
  Favoriten;
- organisationsgebundene IDs und keine Cross-Owner-Foreign-Keys in das
  Athletes-Modul;
- Normalisierung und Validierung für Namen, Texte, Links, Parameter und
  Gruppenzuordnungen;
- Deaktivieren statt Löschen;
- noch keine sichtbare UI.

### ULC-E6B – geschützte Runtime/API

- eigener Modulschlüssel `exercise_catalog`;
- serverseitige View-/Edit-Capabilities;
- Organisation ausschließlich aus der authentifizierten Membership;
- Übersicht, Detail, Anlegen, Bearbeiten, Deaktivieren und Favorit;
- Gruppeneignung wird gegen den serverautorisierten Athletes-Snapshot geprüft.

### ULC-E6C – kompakte mobile UI


**Mobile UX-Präzisierung:** Die Katalogseite bleibt auf Suche, Filteraktion und
Liste reduziert. Erweiterte Filter öffnen als Overlay/Bottom-Sheet. Anlegen,
Anzeigen und Bearbeiten einer Übung erfolgen in einem eigenen, auf Smartphones
bildschirmfüllenden Editor-Overlay mit getrennten Bereichen für Basis,
Anleitung, Gruppen und Planungsparameter. Nach erfolgreichem Speichern kehrt die
Ansicht zur Liste zurück; ein Schließen mit ungespeicherten Änderungen verlangt
eine Bestätigung.

- Navigation nur bei Berechtigung sichtbar;
- Suche und Filter;
- kompakte Übungsliste mit Schnellinfos;
- Detail-/Bearbeitungsansicht;
- Parametereditor;
- Archivansicht.

### ULC-E6F – Import/Export und Factory-Vorbereitung

Vor dem Medien-/Intelligence-Ausbau wird der heutige Katalog gegen die frühere
ULC-App und die Factory-Verträge abgeglichen.

- E6F0: Alt-App-/Factory-Audit und portabler Exchange-Vertrag – auf
  `main` abgeschlossen;
- E6F1: read-only XLSX-Export und XLSX-Importvorlage mit stabilem
  `appbasis.exercise-catalog.exchange/v1`-Vertrag über die Blätter
  `Übungen`, `Gruppen`, `Parameter`, `Listen` und `Hinweise`; auf
  `main` und in Preview deployt, ohne Importmutation;
- E6F2: read-only XLSX-Importvorschau mit 5-MB-/1.000-Übungen-Grenze,
  OpenXML-/ZIP-Prüfung, Domainnormalisierung, ID-/Namensabgleich,
  serverautorisierter Gruppenauflösung, Fehlern/Warnungen und
  `create/update/skip`; jede Zeile kann schreibgeschützt im bestehenden
  Übungseditor geprüft werden;
- E6F3: kontrollierter Apply mit serverseitigem Preview-Token, erneuter
  XLSX-/Katalogprüfung unmittelbar vor dem ersten Write, `409` bei Drift,
  Create/Update ausschließlich über den normalen Katalog-Service,
  Ergebnis je Zeile und CSV-Importprotokoll; keine Schemaänderung;
- E6F4: zweiter Exchange-Verbraucher `athletes` als Grundlage für eine
  mögliche spätere gemeinsame Workbook-Hilfe;
- E6G: Promotion des bewiesenen Katalog-Vertical-Slices zum echten
  Factory-Standardmodul vor weiteren Schemaerweiterungen;
- E6G-A/B: generischer Modul-/Domainvertrag sowie eigenständig konsumierbare
  Repository-/Service-Domain und isolierte Test-App – auf `main`
  abgeschlossen;
- E6G-C1: read-only ULC-Adoptionsvertrag mit gepinntem Source-/Target-Schema,
  vollständigem Mapping für Übungen, Parameter, Gruppen/Audiences und
  Favoriten sowie fail-closed Vorbedingungen für die spätere Datenkopie;
- E6G-C2: isolierter PostgreSQL-Beweis der tatsächlichen Copy-/Verify-
  Operation. Der Executor ist auf `isolated-proof` und dediziert benannte
  `appbasis_e6g_c2_*`-Testdatenbanken beschränkt, sperrt die Zieltabellen vor
  dem ersten Transaktions-Snapshot und kopiert in einer `REPEATABLE READ`-
  Transaktion ausschließlich insert-only in leere Zieltabellen. Er prüft
  Orphans, Zielschlüssel, Gesamt-/Organisations-
  Zeilenzahlen sowie vollständige bidirektionale Feldgleichheit. Ein
  Concurrency-Test beweist zugleich, dass ein konsistenter Snapshot noch keine
  Cutover-Freshness ist; `runtimeCutoverEligible` bleibt false;
- E6G-C3A: kanonische Repository-Adoption des Standardmoduls. ULC deklariert
  jetzt `exercise-catalog`, dessen Workspace-Paket und dessen eigenen
  Datenbankowner; C1 akzeptiert den veröffentlichten Zielzustand weiterhin
  fail-closed und ein read-only Preview-Readiness-Plan rekonstruiert über FC6
  genau die zwei ausstehenden Zielmigrationen; auf `main` abgeschlossen;
- E6G-C3B: eigener preview-gebundener Executor für
  `generated-preview-ulc-linz` / `appbasis_ulc_linz_preview`. Die zwei
  Standardmodul-Migrationen und der anschließende insert-only Copy-/Verify-Lauf
  werden in einer einzigen `REPEATABLE READ`-Transaktion ausgeführt, sodass
  ein später Copy-/Verify-Fehler auch das neue Zielschema zurückrollt. Der
  reale Apply ist ausschließlich manuell, main-only und explizit freizugeben;
- Runtime-Cutover und Produktion bleiben weiterhin getrennte Freigaben. C3B
  quiesziert Source-Writes ausdrücklich noch nicht und setzt
  `runtimeCutoverEligible` weiterhin auf false. Vor einem Runtime-Switch
  müssen Source-Writes quiesziert und die vollständige Source→Target-
  Gleichheit unter diesem Guard erneut geprüft werden.

Der bisherige ULC-Runtimepfad ist weiterhin app-eigen: Runtime und Source-Migration liegen unter `apps/ulc-linz`; der Repository-
Zielzustand enthält zusätzlich den neuen Standardmodulowner. Die bestehenden
`ulc_linz_exercise_*`-Tabellen bleiben weiterhin Eigentum des ULC-Owners und
werden nicht umetikettiert. Die Datenübernahme in
`appbasis_exercise_catalog_*` bleibt ein eigener Preview-/Cutover-Pfad.

Siehe `docs/ULC-LEGACY-FACTORY-AUDIT.md`.

### ULC-E6D – Medien

- externe Links;
- private Videoablage;
- mehrere Videos je Übung;
- Hauptvideo;
- Upload vom Smartphone mit Größenlimit und Fortschritt.

### ULC-E6E – Katalogintelligenz

- organisationsbezogene Schwierigkeitsgrade;
- ähnliche Übungen;
- Dublettenwarnung;
- Verwendungsübersicht in Trainingsblöcken und Trainingsplänen;
- letzte Verwendung;
- historische Snapshots in späteren Planungsmodulen.

## Berechtigungen

Der bestehende Rollenvertrag enthält `exercise_catalog` im
Leistungstrainer-Profil. Seit E6B werden View und Edit serverseitig getrennt
durchgesetzt; E6C erhält zusätzlich das bereits autorisierte Edit-Flag, damit
reine Leser keine schreibenden Oberflächenelemente sehen. Der Admin bleibt
organisationsweit autorisiert.

## Geparkter U12-Pfad

ULC-E5A ist technisch abgeschlossen und in der isolierten Preview auf Schema v7
ausgerollt. Die U12-Adminzuordnung und U12-Oberfläche werden auf ausdrücklichen
Produktwunsch vorerst nicht weitergeführt. Der bestehende E5A-Vertrag bleibt
unverändert und wird später wieder aufgenommen.

## Sicherheitsgrenzen

- Clientdaten enthalten niemals `organizationId`;
- UI-Sichtbarkeit ersetzt keine serverseitige Autorisierung;
- Gruppenzuordnungen referenzieren Athletes-IDs logisch, nicht über
  Cross-Owner-Foreign-Keys;
- historische Übungsdaten werden später durch Snapshots in Trainingsblöcken
  und Trainingsplänen geschützt;
- keine Preview- oder Produktionsmutation ohne separates Gate.
