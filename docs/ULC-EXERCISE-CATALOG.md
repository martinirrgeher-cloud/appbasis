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
- mehrere externe Video-/Weblinks mit Hauptlink sowie optional private
  Videoablage über einen konfigurierten Object Store;
- Schwierigkeitsgrad, ähnliche Übungen, Dublettenwarnung sowie
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
  `main` und in Preview deployt, ohne Importmutation. E6H erweitert diesen
  Vertrag kompatibel auf v2 um `Erweiterungen` für Schwierigkeit, zusätzliche
  Video-Links und Ähnlichkeiten; v1 bleibt importierbar;
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
  fail-closed. Der historische Adoptionsvertrag bleibt bewusst auf Schema v2
  und die ersten zwei Zielmigrationen gepinnt, auch wenn das aktuelle
  Standardmodul inzwischen Schema v3 besitzt;
- E6G-C3B: eigener preview-gebundener Executor für
  `generated-preview-ulc-linz` / `appbasis_ulc_linz_preview`. Der
  historische v2-Adoptionslauf führt weiterhin exakt die zwei geprüften
  Baseline-Migrationen und den anschließenden insert-only Copy-/Verify-Lauf in
  einer einzigen `REPEATABLE READ`-Transaktion aus. Die additive
  Schema-v3-Paritätsmigration bleibt davon getrennt. Der reale Apply ist
  ausschließlich manuell, main-only und explizit freizugeben;
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

### ULC-E6H – Funktionsparität zur früheren Katalogvariante

Auf dem adoptierten Standardmodul ergänzt E6H die im Alt-App-Abgleich noch
fehlenden Katalogfunktionen:

- Excel-XML zusätzlich zu XLSX im Importpfad;
- konfigurierbare Schwierigkeitsstufen mit ULC-Preset und Filter;
- ähnliche Übungen sowie serverseitige Dubletten-Kandidaten vor dem Speichern;
- Verwendungsledger mit Anzahl, Verlauf und letzter Verwendung;
- mehrere externe Video-/Weblinks je Übung; der erste Link ist der Hauptlink;
- optionale private Videoablage über den Runtime-Object-Store mit geschützter
  Auslieferung, Löschen und einem ULC-Limit von 100 MB pro Video;
- additive Standardmodul-Migration v3; der historische E6G-Adoptionsvertrag
  bleibt davon unverändert.

Der Preview-Rollout für E6H ist ein eigener, main-only und explizit
freizugebender Gate-Pfad. Er setzt den bereits abgeschlossenen
Standardmodul-Cutover voraus, prüft die bestehende Source-Write-Quiescence,
wendet ausschließlich die additive v3-Migration an, vergibt die benötigten
Runtime-DML-Rechte auf den neuen Paritätstabellen und deployed danach erneut
den Standardmodul-Entrypoint mit dem dedizierten, vorab angelegten
Preview-R2-Bucket für private Übungsvideos. Dieser Bucket ist auf die
Cloudflare-R2-Jurisdiction `eu` festgelegt; der Worker-Binding setzt daher
`jurisdiction: "eu"`. Der Worker-Deployment-Token benötigt dafür bewusst
keine R2-Management-Rechte. Vor dem E6H-Deploy wird außerdem das
`BETTER_AUTH_SECRET` des isolierten Preview-Workers aus dem geschützten
GitHub-Environment-Secret synchronisiert, damit lokal erzeugte
Impersonation-Sessions und die laufende Preview garantiert denselben
Signaturschlüssel verwenden. Dies kann ältere Preview-Sessions ungültig
machen; Produktion bleibt unverändert. Nach dem Deploy führt derselbe Gate-Pfad einen
echten Live-Smoke über den geschützten Preview-Worker aus: temporäre
Admin-Impersonation ohne Passwortänderung, privates MP4 hochladen, Listenstatus,
vollständigen Download, Byte-Range-Download und anschließendes Löschen. Das
Löschen entfernt zuerst die Datenbank-Metadaten und danach das deterministisch
adressierte R2-Objekt. Schlägt die Objektlöschung nach erfolgreicher
Metadatenlöschung fehl, kann derselbe DELETE-Aufruf gefahrlos wiederholt werden
und bereinigt das verwaiste Objekt ohne eine wieder sichtbare Metadatenzeile zu
erzeugen. Der Live-Smoke prüft deshalb zusätzlich einen zweiten idempotenten
DELETE. Das Smoke-Objekt wird auch bei Folgefehlern bestmöglich bereinigt. Der
generische D4-Deploypfad wird dafür bewusst nicht verwendet, damit die Preview
nicht auf den Legacy-Entrypoint zurückgesetzt werden kann. Produktion bleibt von
diesem Ablauf unberührt.

Die Verwendungsdaten können bereits erfasst und angezeigt werden. Eine
automatische Ableitung aus Trainingsblöcken oder Trainingsplänen ist noch
nicht möglich, solange diese Module nicht auf den neuen Standardmodulpfad
migriert sind. Historische Übungssnapshots bleiben deshalb Aufgabe dieser
späteren Planungsmodule.

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
