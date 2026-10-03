# AppBasis – Current Gate

Stand: 2026-10-03

Diese Datei ist die operative, chatübergreifende Steuerung für den **aktuell zu
liefernden Gate-Scope**. Sie ersetzt keine Roadmap, ADR oder Security-Grenze.
Volatile PR-, CI-, Review- und Branch-Zustände werden ausschließlich live aus
GitHub abgeleitet.

## Aktuelles Ziel

**ULC-E6F4B – Athleten-XLSX-Importvorschau und kontrollierter Apply.**

ULC-E6C ist abgeschlossen und am 03.10.2026 in der isolierten Preview
einschließlich der kompakten Drei-Punkte-Navigation, Filter-Overlay und des
getrennten Übungseditor-Overlays praktisch abgenommen worden. Vor Medien- oder
Intelligence-Ausbau werden jetzt Alt-App-Funktionsumfang,
Factory-Wiederverwendbarkeit und der künftige Modul-/Exchange-Vertrag
verbindlich geklärt.

Der bisherige U12-Pfad wird bewusst geparkt. ULC-E5A ist auf `main`
abgeschlossen, die additive Schema-v7-Migration wurde in Preview erfolgreich
angewandt, der anschließende Deploy war erfolgreich und ein unabhängiger
read-only Check bestätigte danach `current`. Die noch fehlende
U12-Adminzuordnung und U12-Oberfläche werden erst später fortgesetzt.

Der aktuelle Produktfokus ist der **Übungskatalog**. Grundlage ist der
bewährte frühere ULC-Linz-Katalog, nicht ein neuer Funktionsentwurf. Die
Übernahme erfolgt jedoch auf den heutigen AppBasis-Sicherheits- und
Persistenzvertrag.

ULC-E6A und ULC-E6B sind auf `main` abgeschlossen. Schema v8 wurde am
02.10.2026 in die isolierte ULC-Preview migriert; der anschließende Preview-
Deploy auf demselben Main-Head war erfolgreich. Der geschützte Runtime/API-
Vertrag für Übersicht, Detail, Create/Update, Deaktivierung und Favoriten ist
damit in der Preview aktiv.

E6C liefert jetzt die sichtbare, kompakte mobile Oberfläche auf genau diesem
bestehenden Serververtrag. Der Zielumfang und die Folgeslices sind in
`docs/ULC-EXERCISE-CATALOG.md` festgehalten.

Verbindliche E6C-Grenzen:

- Navigation wird nur sichtbar, wenn der geschützte View-Vertrag erfolgreich
  geladen wurde;
- die mobile Hauptnavigation zeigt höchstens drei direkte, berechtigte Bereiche
  (Priorität Start, Training, Übungen); weitere freigeschaltete Bereiche werden
  unter „Mehr“ aufklappbar zusammengefasst;
- View und Edit bleiben getrennt: reine Leser sehen Details und dürfen
  persönliche Favoriten setzen, aber keine Katalogdaten verändern;
- Suche bleibt dauerhaft kompakt sichtbar; die erweiterten Filter für Kategorie,
  Trainingsgruppe, Material, Favorit, Aktiv/Archiv und vorhandenen Link öffnen
  als mobiles Overlay/Bottom-Sheet statt dauerhaft Seitenfläche zu belegen;
- Detail/Anlegen/Bearbeiten öffnen als klar getrenntes Editor-Overlay mit den
  Bereichen Basis, Anleitung, Gruppen und Parameter; Speichern führt zurück zur
  Katalogliste und ungespeicherte Änderungen werden beim Schließen geschützt;
- aktive und archivierte Übungen werden kompakt mobil dargestellt;
- Detail-/Bearbeitungsansicht enthält Stammdaten, geeignete Trainingsgruppen
  und den kanonischen Planungsparametereditor;
- Anlegen, Bearbeiten und Deaktivieren verwenden ausschließlich die bestehenden
  E6B-Endpunkte;
- Client-Requests enthalten niemals `organizationId` oder Actor-IDs;
- kein `innerHTML`, keine Abschwächung der CSP- oder Serverautorisierung;
- Medien-Upload, ähnliche Übungen, Dublettenwarnung und Nutzungsintelligenz
  bleiben E6D/E6E;
- Preview-/Production-Deployment dieses UI-Slices bleibt ein getrenntes,
  ausdrücklich freizugebendes Gate.

## Aktueller Gate-Scope: ULC-E6F4B

E6F4A ist auf `main` abgeschlossen und wurde am 03.10.2026 auf
`80b69126d2896e9fa78e8b4073341d825ba72c53` erfolgreich in die isolierte
ULC-Preview deployed. Worker-Deploy, Audit-Smoke und Application-DB-Binding
waren grün; keine Migration war erforderlich.

E6F4B vervollständigt `athletes` als zweiten realen Exchange-Verbraucher.

Abnahme:

- fachlicher Parser/Preview/Apply-Vertrag liegt im Standardmodul
  `@appbasis/athletes`, nicht in ULC-spezifischer Persistenzlogik;
- 5 MB / 1.000 Athleten; ZIP/OpenXML fail-closed und größenbegrenzt;
- ID ist primärer Match-Key; bei leerer ID ist
  Vorname+Nachname+Geburtsjahr nur bei exakt einem Treffer zulässig;
- potenzielle Namensdubletten ohne eindeutigen Schlüssel blockieren;
- Trainingsgruppen stammen ausschließlich aus dem aktuellen
  serverautorisierten Snapshot;
- bestehende Gruppenzuordnungen werden nur unverändert als `skip` akzeptiert;
- neue Gruppenzuordnungen dürfen ausschließlich additiv zu aktiven Gruppen
  angelegt werden;
- Änderungen/Schließen vorhandener Historienzeilen sowie Aktiv-/Archivwechsel
  sind fail-closed;
- `POST /api/modules/athletes/import-preview` und `/import-apply` verlangen
  Edit-Recht vor Dateiinspektion;
- Preview mutiert keine Fachdaten;
- Apply parst Datei und Snapshot erneut und bindet beide über einen
  organisationsgebundenen Freshness-Token;
- stale Preview führt vor dem ersten Write zu `409`;
- Writes laufen über die vorhandenen Athletes-Create-/Update-/
  Membership-Verträge;
- Ergebnis je Zeile als `created/updated/skipped/failed` plus CSV-Protokoll;
- Teilmutationen bei nachgelagertem Membership-Fehler werden ausdrücklich als
  solche protokolliert;
- UI nutzt ein separates Import-Overlay mit expliziter Apply-Bestätigung;
- keine neue Tabelle, Migration oder Provider-Mutation;
- keine allgemeine Importplattform in diesem Gate.

Begrenzung: Der Freshness-Token verhindert normale Reruns nach verändertem
Snapshot. Zwei exakt parallele Create-Requests sind ohne fachlichen
Athleten-Unique-Key bzw. verbindungsgebundenen Repository-Lock nicht als global
exactly-once beweisbar. Dafür wird kein unsicherer Pseudo-Lock eingeführt; ein
solcher Persistenz-/Idempotency-Vertrag wäre ein eigenes Gate.

Nach E6F4B ist die Voraussetzung erfüllt, die nun doppelt bewiesene
Low-Level-XLSX-/Tabular-Mechanik auf einen kleinen gemeinsamen Helper zu prüfen.

Details: `modules/athletes/README.md` und
`docs/ULC-LEGACY-FACTORY-AUDIT.md`.


## FC4-Abnahme – abgeschlossen

Für den aktuellen Produktpfad ist reproduzierbar und ausführbar belegt:

1. jedes Standardmodul besitzt einen strikten, maschinenlesbaren Modulvertrag;
2. Modul-ID, Paketname und App-Kompatibilität sind eindeutig;
3. Capability-IDs gehören eindeutig dem Modul;
4. optionales Datenbankschema und Migrationen gehören ausschließlich dem Modul;
5. Modulmanifest, reales Workspace-Paket und reale Migrationen können nicht
   unbemerkt auseinanderlaufen;
6. ein Modul kann über einen kanonischen Scaffolder neu erzeugt werden;
7. der Intervall-Countdown wird über diesen Pfad als erstes neues Modul erzeugt;
8. eine neue Test-App kann das Modul über den normalen Generator konsumieren;
9. CI/Tests bestätigen den vollständigen Vertical Slice auf demselben exakten
   Head.

FC4 erzeugt noch **keinen** generischen Produktions-Updater für bestehende Apps.

## Abgeschlossener Gate-Scope: FC5

FC5 liefert den kontrollierten Updatepfad für bestehende Apps:

- vorhandene App und Modulversion lesen;
- Kompatibilität vor jeder Änderung fail-closed prüfen;
- geplante Datei-/Manifest-/Dependency-/Migrationsänderungen deterministisch
  ableiten;
- bestehende fachliche App-Erweiterungen nicht überschreiben;
- Preview/Tests vor Produktionsfreigabe;
- Produktionsmigration, Deployment und Release bleiben getrennte,
  ausdrücklich freizugebende Schritte.

Erster realer Verbraucher ist `ulc-linz` mit dem FC4-Countdown-Modul.

### FC5-A – abgeschlossen

Der rein lesende, deterministische Installationsplan ist für
`ulc-linz + countdown` verifiziert. Er prüft App-/Modulversionen,
Kompatibilität, Paket- und Lockfile-Zustand, Datenbank-Ownership und den
minimalen Write-Satz fail-closed, ohne bestehende Appdateien zu verändern.

### FC5-B – abgeschlossen

Der atomare Executor ist auf isolierten Test-Fixtures verifiziert. Er konsumiert
ausschließlich den FC5-A-Plan, serialisiert App-Registry und Workspace-
Publikation, erkennt Drift vor dem ersten Write, finalisiert den Workspace,
publiziert die Appdefinition zuletzt und rollt behandelte Fehler auf den
Eingangszustand zurück. Datenbank-ownende Module bleiben bis zu einem eigenen
Migrations-Ausführungsvertrag fail-closed.

### FC5-C – erster realer ULC-Verbraucher – abgeschlossen

Der verifizierte persistenzfreie Updatezustand wurde für
`ulc-linz + countdown` hergestellt. Der erlaubte produktneutrale Write-Satz
bleibt exakt:

1. `apps/ulc-linz/appbasis.app.json`
2. `apps/ulc-linz/package.json`
3. `pnpm-lock.yaml`

Bestehende ULC-Runtime-, UI-, Security-, M5-/M6- und Datenbankdateien bleiben
unverändert. Nach dem Update muss der FC5-A-Plan für
`ulc-linz + countdown` deterministisch `already-installed` ohne Writes
liefern. Erst nach vollständiger CI sowie ChatGPT- und Codex-Review folgt das
separate ULC-Preview-Gate; Produktion und produktive Datenbankänderungen bleiben
weiterhin ausdrücklich getrennt.

Wichtig: Die bisherige M5-/M6-Produktionsevidenz ist an den zuvor freigegebenen
modullosen ULC-Stand gebunden. Durch die neue `countdown`-Deklaration muss sie
fail-closed offen bleiben, bis Modulscope, Berechtigungen und Produktionsvertrag
in einem späteren getrennten Gate neu geprüft wurden. FC5-C darf diese
Produktionsevidenz nicht stillschweigend hochstufen oder neu baselinen.

### Countdown D1 – echter Domainvertrag – abgeschlossen

Der Countdown besitzt jetzt einen getesteten persistenzfreien Domainvertrag für
Übungen/Durchgänge, Belastung, Pause, Ansageintervalle, `3, 2, 1, Los`, die
letzten fünf Sekunden und `Fertig`.

### Countdown D2 – ULC Runtime + Berechtigung – abgeschlossen

ULC bindet den Countdown als geschützten Runtime-Verbraucher an. Der Server
ermittelt die Mitgliedschaft selbst anhand der authentifizierten Identity und
verlangt aktive Mitgliedschaft, exakt passende Runtime-Rolle und das bestehende
individuelle Modulrecht `ulc-linz:module:countdown:view`. Fehlerhafte
Membership- und Identity-Zustände bleiben fail-closed und werden auditierbar
abgewiesen.

### Countdown D3 – mobile ULC UI – abgeschlossen

D3 liefert den ersten echten mobilen Countdown-Consumer. Die UI wird statisch
und CSP-sicher aus dem Worker ausgeliefert; Login und App-Shell benötigen keine
Datenbankverbindung. Beim Start erzeugt der geschützte Worker aus den
Benutzereinstellungen über `@appbasis/countdown` den normierten Zeitplan und
die Cues. Der Browser führt ausschließlich diesen Plan aus.

Verbindlicher D3-Umfang:

- mobile-first große Countdown-Anzeige,
- `3, 2, 1, Los` vor der ersten Belastung,
- Belastung rot, Pause grün,
- letzte fünf Sekunden sowie konfigurierte Zwischenansagen,
- Sprachausgabe auf Deutsch/Österreich mit deutschem Fallback,
- Pause stoppt Zeit und Sprachausgabe gemeinsam,
- Weiter setzt exakt an der pausierten Stelle fort,
- Reset setzt Ablauf vollständig zurück,
- Einstellungen werden lokal am Gerät gespeichert,
- Wake-Lock wird während eines laufenden Countdowns best-effort gehalten,
- Zugriff wird vor Nutzung über den D2-Vertrag serverseitig geprüft.

### Countdown D4 – isolierte ULC Preview – abgeschlossen

D4 beweist den aktuellen Countdown-Slice zuerst außerhalb der Produktion. Der
Repository-/Workflow-Vertrag bleibt app-spezifisch und nutzt die bestehende
generische Preview-Infrastruktur, ohne die ULC-Produktionsverträge zu verändern.

Verbindliche D4-Grenzen:

- eigener Preview-Worker `appbasis-ulc-linz`,
- eigene Preview-Datenbank `appbasis_ulc_linz_preview`,
- drei getrennte Datenbank-Principals für Migration-Owner, Application-Runtime
  und Security-Log-Runtime,
- der Migration-Owner wird niemals an den Worker gebunden,
- getrennte Hyperdrives `HYPERDRIVE` und `SECURITY_LOG_HYPERDRIVE` verwenden
  ausschließlich die beiden nicht privilegierten Runtime-Principals,
- alle drei Principals zeigen auf dieselbe dedizierte ULC-Preview-Datenbank,
- der Security-Log-Runtime-Principal besitzt keine Datenbankobjekte, keine
  direkten Grants und keinen effektiven Zugriff außerhalb des vorgesehenen
  Ingest-Pfads; er erbt ausschließlich von der frisch im atomaren
  Preview-Migrationslauf erzeugten NOLOGIN-Rolle
  `appbasis_ulc_linz_preview_security_ingest`,
- die produktionsgleich benannten ULC-Security-Rollen erhalten in der
  Preview-Datenbank keine Security-Log-Rechte; die Preview-Ingest-Gruppe hat
  keine Parent-Rollen und außer dem Security-Log-Runtime-Principal keine
  Cluster-Mitglieder,
- Preview-Mutationen sind main-only und benötigen je Operation eine explizite
  `apply`-Freigabe,
- Reihenfolge: `hyperdrives → migrate → bootstrap → deploy`,
- Deployment-Smokes prüfen UI, Session-Grenze, Application-Datenbank-
  Erreichbarkeit und beweisen zusätzlich, dass die erzeugte anonyme
  Countdown-Ablehnung tatsächlich als neuer Security-Event persistiert wurde,
- Produktion, Produktionsdatenbank und bestehende M5/M6-Evidence bleiben
  unverändert.

Der generische Preview-Access-Bootstrap reicht für D4 noch nicht aus: Er kennt
den ULC-spezifischen D2-Vertrag aus aktiver Mitgliedschaft, exakt einer
ULC-Runtime-Rolle und individuellem Countdown-Recht nicht. Ein D4-Preview-Benutzer
wird deshalb erst in einem getrennten nächsten Schritt nach demselben
serverseitigen Zugriffsvertrag provisioniert.

Providerwrites, Preview-Migration, Worker-Bootstrap, Secret-Synchronisierung und
Preview-Deployment bleiben bis zu einer ausdrücklichen Nutzerfreigabe
ungeändert.

Keine dieser Stufen revalidiert automatisch die alte M5/M6-Production-Evidence.

Die D4-Preview wurde am 26.09.2026 einschließlich des ULC-spezifischen
Preview-Zugangs und der echten Benutzerabnahme erfolgreich abgeschlossen. Die
akzeptierte D4-Evidence bleibt separat und ist Voraussetzung für die
anschließende Production-Revalidation.

### FC5-D – ULC Production Revalidation nach Countdown – abgeschlossen

Nach D4 wurde der bestehende ULC-Produktionspfad für den durch FC5 hinzugefügten
`countdown`-Scope getrennt neu validiert. Das ist kein erneuter
M6-Meilensteinabschluss, sondern die notwendige Revalidation der zuvor durch
FC5-C bewusst geöffneten Production-Evidence.

Erfolgreich und gemeinsam an Head
`bab8b18fd9e88025a6df0ccbffe8c51b972fe4b3` gebunden sind:

1. M5 Production Evidence – Run `36247785054`
2. kontrollierter workers.dev Pilot-Ingress – Run `36248019506`
3. dedizierter Production-Smoke-Principal – Run `36248085829`
4. Post-Deploy-Smoke – Run `36248243012`

Der dauerhafte FC5-Revalidierungsnachweis akzeptiert diese Runs nur zusammen mit
der bereits akzeptierten D4-Preview und nur solange der kanonische
ULC-Production-Runtime-Vertrag gegenüber dem akzeptierten Head unverändert
bleibt. Eine spätere Runtime-Änderung öffnet den Nachweis wieder fail-closed.

Damit ist der erste persistenzfreie FC5-Updatepfad für
`ulc-linz + countdown` Ende-zu-Ende belegt. Datenbank-ownende Module bleiben
außerhalb dieses Abschlusses und weiterhin fail-closed, bis ihr eigener
atomarer Migrations-Ausführungsvertrag existiert.

Die finale organisatorische Produktionsfreigabe bleibt weiterhin ein separater
ausdrücklicher Schritt und wird durch FC5-D nicht autorisiert.

## Abgeschlossener Gate-Scope: FC6

FC6 erweitert den Existing-App-Updater ausschließlich um den fehlenden sicheren
Pfad für datenbank-ownende Standardmodule.

Die verbindliche Spezifikation liegt in
`docs/FC6-DATABASE-MODULE-UPDATER.md`.

### FC6-A – read-only Migration-Delta – abgeschlossen

Als kleinstes erstes Arbeitspaket wird der bestehende
`module-update-plan.mjs` so erweitert, dass ein datenbank-ownendes Zielmodul
einen deterministischen Migrationsdelta-Vertrag erhält.

Abnahme für FC6-A:

- aktuelle Appdefinition und `appbasis.database.json` müssen kanonisch zum
  Ausgangszustand passen;
- alle vorhandenen DB-Owner bleiben unverändert;
- genau der neue Modul-Owner wird aus dem verifizierten Modulmanifest ergänzt;
- Root, Schema-Version und vollständige Migrationen des neuen Owners werden
  explizit im Plan ausgewiesen;
- Änderungen an bestehenden Ownern, Migrationen oder deren Reihenfolge werden
  fail-closed abgewiesen;
- der Planner bleibt vollständig read-only;
- keine Datenbankverbindung, kein Providerwrite, keine Produktionsänderung.

FC6-A ist auf `main` abgeschlossen. Der Planner liefert für ein
datenbank-ownendes Zielmodul genau einen neuen Owner inklusive Root,
Schema-Version und vollständiger Migrationsliste, ohne Repository- oder
Datenbankwrite.

### FC6-B – isolierter inkrementeller Migration-Executor – abgeschlossen

Der FC6-B-Executor konsumiert den FC6-A-Delta-Vertrag entweder unmittelbar
vor der Repository-Publikation oder rekonstruiert denselben Delta nach der
Publikation aus dem kanonischen Target-Manifest. `already-installed` im
Repository behauptet dabei ausdrücklich keinen bereits migrierten
Datenbankzustand. Vor dem ersten Ziel-DDL muss er:

- direkte PostgreSQL-Verbindung, logische Datenbank und Principal explizit
  verifizieren;
- den vorhandenen App-Baselinevertrag anhand aus den bestehenden Migrationen
  abgeleiteter Katalogmarker prüfen;
- bereits oder teilweise vorhandene Zielmodul-Artefakte fail-closed ablehnen;
- alle neuen Modulstatements in einer einzigen PostgreSQL-Transaktion
  ausführen;
- bei jedem Fehler den vollständigen neuen Moduldelta zurückrollen;
- einen Wiederholungslauf ohne Doppelanwendung fail-closed ablehnen;
- konkurrierende Läufe für dieselbe App-/Modulkombination über einen
  transaktionalen Advisory Lock serialisieren.

Der erste E2E-Beweis verwendet eine nicht leere Identity-Baseline und das reale
`tasks`-Modul. Es gibt weiterhin keinen Produktionsworkflow und keinen
Providerwrite.

FC6-B ist auf `main` abgeschlossen. Der Executor verifiziert die bestehende
Baseline und den Ziel-Delta fail-closed, serialisiert konkurrierende Läufe und
führt ausschließlich den neuen Moduldelta transaktional aus.

### FC6-C – Existing-App-Integration – abgeschlossen

Der bestehende Repository-Updater ersetzt jetzt seine frühere harte Sperre für
datenbank-ownende Module durch den bereits bewiesenen FC6-Vertrag.

Abnahme für FC6-C:

- der Write-Satz bleibt vollständig aus dem FC6-A-Plan abgeleitet;
- bei einem DB-Modul wird `appbasis.database.json` auf exakt den kanonischen
  Zielzustand des Plans geschrieben;
- Paket, Lockfile, Datenbankmanifest und Appdefinition bleiben unter den
  bestehenden Publication-Locks und Drift-Prüfungen;
- bei einem Fehler nach DB-Manifest-Publikation wird der vollständige
  Repository-Ausgangszustand einschließlich DB-Manifest wiederhergestellt;
- die Appdefinition bleibt der letzte Repository-Publikationsmarker;
- FC6-C öffnet keinerlei PostgreSQL-Verbindung und führt keine Migration aus;
- eine erfolgreiche Repository-Installation bedeutet nur
  `databaseMigrationDelta required`, niemals „Migration bereits angewendet“.

FC6-C ist auf `main` abgeschlossen. Der Existing-App-Updater kann den
kanonischen Repository-Zielzustand eines datenbank-ownenden Moduls publizieren,
ohne eine ausgeführte Environment-Migration zu behaupten.

### FC6-D – isolierter Existing-App-End-to-End-Beweis – abgeschlossen

Der abschließende FC6-Slice verbindet die bereits getrennt bewiesenen Verträge
in einer isolierten PostgreSQL-Testumgebung mit dem realen `tasks`-Modul.

Abnahme für FC6-D:

- eine bestehende App startet mit nicht leerer Identity-Baseline und bestehenden
  Daten;
- der read-only Planner liefert exakt den neuen Tasks-Owner und verändert das
  Repository nicht;
- der echte Existing-App-Updater publiziert Paket, Lockfile,
  `appbasis.database.json` und zuletzt die Appdefinition;
- der FC6-B-Executor migriert danach ausschließlich den Tasks-Delta;
- bestehende Identity-Daten bleiben unverändert erhalten;
- ein erneuter Repository-Lauf bleibt No-op und ein erneuter DB-Lauf wird
  fail-closed abgewiesen;
- Baseline-Drift nach Repository-Publikation verhindert jedes Target-DDL;
- eine absichtlich fehlschlagende spätere Target-Anweisung rollt den gesamten
  DB-Delta zurück, obwohl der Repository-Zielzustand bereits publiziert ist;
- vollständige CI und Exact-Head-Review bestätigen denselben Head.

Es gibt weiterhin keinen Produktionsworkflow, keinen Providerwrite und keine
Änderung einer realen Produktapp für diesen Nachweis.

FC6-D ist abgeschlossen. Damit ist der datenbank-ownende Existing-App-Pfad
Ende-zu-Ende auf einer isolierten nicht leeren PostgreSQL-Baseline bewiesen:
Planung, Repository-Publikation, inkrementelle Migration, Bestandserhalt,
Rerun-Schutz, Drift-Abweisung und vollständiger DB-Rollback greifen gemeinsam.

## Abgeschlossener Gate-Scope: ULC-E1

ULC-E1 stellt nach Abschluss der Plattform- und Update-Gates wieder den realen
ULC-Linz-Produktfluss in den Vordergrund.

Abnahme für ULC-E1:

- nach erfolgreichem Login erscheint eine echte ULC-Startseite statt direkt der
  Countdown-Ansicht;
- die mobile Hauptnavigation unterscheidet mindestens Start, Countdown und
  Einstellungen;
- der vorhandene Countdown bleibt funktional unverändert und nutzt weiterhin
  ausschließlich den bestehenden serverseitigen D2-Berechtigungsvertrag;
- die Startseite zeigt nur tatsächlich verfügbare Funktionen als bedienbare
  Aktionen und erfindet keine Berechtigung für noch nicht migrierte Altmodule;
- die Vereins-App-Shell ist mobile-first und bleibt statisch/CSP-sicher;
- Login, Passwortwechsel, Health und die bestehende Countdown-E2E-/Security-
  Evidence bleiben durch Tests abgesichert;
- keine Datenbankmigration, kein Providerwrite, kein Preview-/Production-
  Deployment in diesem Slice.

ULC-E1 ist auf `main` abgeschlossen. Die ULC-App besitzt wieder eine
mobile Vereins-App-Shell mit Dashboard; Countdown und Einstellungen bleiben
hinter dem bestehenden serverseitigen Zugriffsschutz.

## Abgeschlossener Gate-Scope: ULC-E2A

E2A legt das Stammdatenfundament als Standardmodul `athletes` an.

Abnahme für ULC-E2A:

- Modulmanifest `athletes` mit sichtbarem Namen **Stammdaten**;
- Capabilities `athletes:view` und `athletes:edit`, passend zum bereits
  vorhandenen ULC-Rollenvertrag;
- eigenes Datenbankschema mit ausschließlich modul-eigenen Tabellen für
  Trainingsgruppen, Athleten, Trainer sowie Gruppenmitgliedschaften;
- jede Stammdatenzeile bleibt explizit organisationsgebunden;
- Athleten-Gruppenzuordnungen besitzen Start/Ende für Historie;
- fachlicher TypeScript-Domänenvertrag validiert Namen, Längen, Jahrgang,
  IDs und zeitliche Zuordnungen fail-closed;
- die Migration bleibt mit dem aktuellen FC6-Executor kompatibel und enthält
  insbesondere keine `REFERENCES`-Abhängigkeit auf fremde oder eigene
  Tabellen;
- Benutzerkonten, Eltern-Kind-Verknüpfungen, Realtime, Edit-Locks,
  Import/Export und trainingsspezifische Einstellungen bleiben außerhalb E2A;
- noch kein Write an `apps/ulc-linz`, keine App-/DB-Migration, kein
  Providerwrite und kein Deployment.

ULC-E2A ist auf `main` abgeschlossen. Modulvertrag, Domainvalidierung und
FC6-kompatible Migration sind vollständig grün.

## Abgeschlossener Gate-Scope: ULC-E2B

Abnahme für ULC-E2B:

- `apps/ulc-linz/appbasis.app.json` deklariert zusätzlich `athletes`;
- `apps/ulc-linz/package.json` und der ULC-Lockfile-Importer enthalten
  `@appbasis/athletes` als Workspace-Abhängigkeit;
- `apps/ulc-linz/appbasis.database.json` ergänzt exakt den Owner
  `athletes`, ohne bestehende Owner zu verändern;
- ein isolierter Vorzustand der realen ULC-App wird durch den echten
  `applyModuleUpdate()` in exakt denselben publizierten Zielzustand gebracht;
- der FC6-Migrationsexecutor akzeptiert die reale strukturelle
  Identity-/Permissions-/ULC-Baseline, ohne die bestehende Security-
  Access-Control-Evidence in einen neuen generischen DDL-Vertrag umzudeuten;
- bestehende Identity- und ULC-Lifecycle-Daten bleiben nach der
  Stammdatenmigration unverändert erhalten;
- alle fünf Stammdatentabellen werden erzeugt und sind auf der isolierten
  PostgreSQL-Baseline nutzbar;
- die ULC-Dateninventur klassifiziert den neuen `athletes`-Owner und alle fünf
  Tabellen; personenbezogene Stammdaten bleiben bei Löschung/Aufbewahrung
  ausdrücklich `fail-closed-pending-lifecycle` und erzeugen keine neue
  Production-Evidence;
- Repository-Rerun bleibt No-op und DB-Rerun wird fail-closed abgewiesen;
- keine Runtime/API/UI-Änderung, kein Preview-/Production-DB-Write, kein
  Providerwrite und kein Deployment.

Markerlose historische Baseline-SQL darf ausschließlich über die unten
beschriebene digest-gepinnte Evidence-Datei zugelassen werden. Der Pin gilt für
die vollständig überprüfte historische Migrationsdatei als unveränderliche
Einheit; es gibt keine heuristische Freigabe einzelner SQL-Formen mehr.
Zielmigrationen ohne Katalogmarker bleiben ausnahmslos fail-closed.

ULC-E2B ist auf `main` abgeschlossen. Installation, bestehender
Datenbestand, fünf Stammdatentabellen, Rerun-Schutz und digest-gepinnte
Baseline-Ausnahme sind auf demselben Exact Head durch CI und Review bestätigt.

## Abgeschlossener Gate-Scope: ULC-E2C

Abnahme für ULC-E2C:

- die reale ULC-Worker-Runtime bindet `athletes` als serverseitigen
  Stammdaten-Consumer ein; es entsteht in diesem Slice noch keine UI;
- die Organisation wird für jeden Stammdatenrequest ausschließlich aus der
  authentifizierten, aktiven ULC-Mitgliedschaft des aktuellen Benutzers
  abgeleitet; ein Client kann keine fremde `organizationId` wählen;
- Lesen verlangt `athletes:view`, jede Mutation `athletes:edit`; die
  bestehende kanonische ULC-Rollen-/Principal-Prüfung bleibt maßgeblich und
  inaktive Mitgliedschaften, Rollen-Drift sowie fehlende/revozierte Rechte
  bleiben fail-closed;
- organisationsweite Stammdaten bleiben für die bestehenden Rollen `athlete`
  und `parent` gesperrt; Admin/Trainer benötigen weiterhin den kanonischen
  Rollen- und Capability-Vertrag;
- jede SQL-Operation ist explizit an die serverseitig ermittelte Organisation
  gebunden; referenzierte Athleten, Trainer und Trainingsgruppen müssen vor
  Mitgliedschaftsänderungen derselben Organisation angehören;
- die API deckt Trainingsgruppen, Athleten, Trainer sowie Athleten- und
  Trainer-Gruppenzuordnungen ab und verwendet die bestehenden
  `@appbasis/athletes`-Domänenvalidatoren statt paralleler Validierungslogik;
- neue Stammdaten-IDs werden serverseitig erzeugt; Clientdaten dürfen keine
  Organisation oder fremde IDs als Ownership-Grenze einschleusen;
- personenbezogene Athleten- und Trainerstammdaten erhalten eine explizite
  Lifecycle-Regel: Deaktivierung setzt den serverseitigen Lifecycle-Zeitpunkt,
  aktive Datensätze werden niemals durch Retention gelöscht und deaktivierte
  Datensätze werden nach 12 Kalendermonaten über einen moduleigenen,
  transaktionalen Retention-Pfad einschließlich ihrer Gruppenzuordnungen
  physisch gelöscht;
- die Lifecycle-Regel darf keine Identity-/Permissions- oder
  `ulc-linz-lifecycle`-Tabellen direkt verändern; Account-Lifecycle und
  Stammdaten-Lifecycle bleiben getrennte Owner-Verträge;
- die ULC-Dateninventur darf Löschung und Retention für Stammdaten erst dann
  als verifiziert markieren, wenn Runtime, Deaktivierung und physische Löschung
  automatisiert bewiesen sind; die übergreifende M5-Lifecycle-Evidence bleibt
  jedoch fail-closed, solange ein nach einem Backup erfolgter Stammdaten-Delete
  beim Restore noch nicht über athletes-eigene Löschmarker reproduzierbar
  wiederholt werden kann;
- die normale Datenexport-Evidence bleibt für personenbezogene Stammdaten
  ausdrücklich fail-closed, weil deren Subject-/Account-Zuordnung und Export
  erst in einem späteren Import/Export-Slice umgesetzt werden;
- keine Preview-/Produktionsmigration, kein Providerwrite, kein Deployment und
  keine Revalidierung alter Production-Evidence in E2C.

E2C-A (serverseitige Organisations-/Capability-Grenze und Read-API),
E2C-B (autorisierte Stammdaten-Mutationen) und E2C-C (Deaktivierung plus
12-Monats-Retention im moduleigenen Repository mit isoliertem PostgreSQL-E2E)
sind implementiert. Die Produktionsaktivierung des Retention-Pfads ist bewusst
noch nicht gebunden, weil E2C keine Produktionsmigration ausführt.

Der finale Codex-Review hat einen echten P1 gefunden: Stammdaten, die nach dem
Backup durch Retention gelöscht wurden, könnten bei einem späteren Restore
wieder erscheinen. E2C erweitert deshalb nicht nachträglich die Restore-
Architektur. Stattdessen bleibt die M5-Lifecycle-/Restore-Evidence ausdrücklich
fail-closed. Das athletes-eigene Delete-Marker-/Restore-Replay wird als
separater unmittelbar folgender Slice abgegrenzt.

Der zulässige Re-Review fand anschließend eine **andere Prüfklasse**:
Deployment-Sequencing. Weil E2C ausdrücklich keine Produktionsmigration
durchführt, darf der bestehende geschützte Produktions-Lifecycle vor dem
Athletes-Schema-Deployment weder Athletes-Tabellen noch neue Grants
voraussetzen. Dieses Finding wird als abgegrenztes E2C-Abschlussarbeitspaket
behandelt: die vorzeitige Produktionsbindung wird auf den bereits deployten
Main-Vertrag zurückgesetzt; die moduleigene Retention-Implementierung und ihre
isolierten PostgreSQL-Beweise bleiben erhalten. Für dieses Arbeitspaket gibt
es keinen weiteren Codex-Patch-Loop; Abschlusskriterium sind ChatGPT
Diff-/Architektur-/Security-Prüfung plus Exact-Head-CI.

ULC-E2C ist auf `main` abgeschlossen. Runtime/API, serverseitige
Organisations-/Capability-Grenzen, Deaktivierung und die moduleigene
12-Monats-Retention sind implementiert und isoliert bewiesen. Produktive
Retention-Aktivierung und Restore-Reconciliation bleiben getrennt.

## Abgeschlossener Gate-Scope: ULC-E2D

Abnahme für ULC-E2D:

- das Modul `athletes` erhält genau eine neue owner-eigene Migration für
  minimale Löschmarker; keine Tabelle eines anderen Owners wird verändert;
- Marker enthalten nur Entitätstyp, Entity-ID, Organisation,
  Abschlusszeitpunkt und `purge_after`; Name, Kontakt-, Jahrgangs- oder
  Notizdaten werden niemals in Löschmarkern gespeichert;
- die Marker-Retention beträgt exakt 35 Tage und bleibt damit innerhalb des
  bestehenden bestätigten Restore-/Backupfensters;
- die physische 12-Monats-Retention schreibt den Löschmarker und löscht
  Stammdaten plus Gruppenzuordnungen in demselben PostgreSQL-Statement;
  Marker-Konflikte oder inkonsistente Zustände bleiben fail-closed;
- ein autoritativer Read-Pfad liefert ausschließlich noch gültige Marker und
  validiert deren Form sowie das exakte 35-Tage-Fenster fail-closed;
- ein Restore-Replay löscht ausschließlich die im Marker bezeichnete
  Athlete-/Trainer-Entität innerhalb derselben Organisation, entfernt deren
  moduleigene Gruppenzuordnungen und persistiert denselben Marker im Restore;
- bestehende exakte Marker sind idempotent; falsche Organisation,
  widersprüchlicher Marker oder Marker+Live-Entity-Kombination blockieren den
  Restore statt zu raten;
- ein isolierter PostgreSQL-E2E-Test beweist mindestens:
  Löschung auf der autoritativen Quelle, Restore einer älteren Kopie,
  Wiederlöschung per Marker, Idempotenz, Organisationsgrenze und
  35-Tage-Ablauf;
- `m5-data-inventory.json` klassifiziert den neuen Marker als
  `minimal-delete-reconciliation-state`; die übergreifende M5-
  Restore-Evidence bleibt bis zur späteren produktiven Migration/Aktivierung
  ausdrücklich fail-closed;
- der bestehende produktive Lifecycle-/Restore-Workflow bleibt in E2D auf dem
  heute deployten Schema gepinnt und darf die neue Athletes-Tabelle noch nicht
  voraussetzen;
- keine Preview-/Produktionsmigration, kein Providerwrite, kein Deployment und
  keine Revalidierung alter Production-Evidence in E2D.

Scope-Freeze für E2D: blockierend sind Datenwiederbelebung nach Restore,
personenbezogene Daten im Löschmarker, Cross-Organization-Delete,
nicht-atomare Marker/Lösch-Sequenzen, Abschwächung des bestehenden
Restore-Fail-closed-Vertrags oder eine vorzeitige Produktionsbindung.
Nicht gate-blockierend bleiben UI, Import/Export, Realtime, Edit-Locks,
Benutzer-/Eltern-Verknüpfungen und die spätere Produktionsmigration.

ULC-E2D ist auf `main` abgeschlossen. Athletes-eigene Löschmarker,
35-Tage-Retention und organisationsgebundenes Restore-Replay sind auf dem
Merge-Commit `7e0c3426146ca8d3b275ed4e0500ed4d64a7a588` durch Pre- und
Post-Merge-CI bestätigt. Eine Produktionsaktivierung wurde nicht durchgeführt.

## Abgeschlossener Gate-Scope: ULC-E3A

Abnahme für ULC-E3A:

- die mobile Hauptnavigation erhält einen Bereich **Stammdaten**, der nur nach
  erfolgreicher serverseitiger `athletes:view`-Prüfung bedienbar wird;
- das Dashboard zeigt Stammdaten als echten verfügbaren Vereinsbereich, ohne
  andere noch nicht migrierte Altmodule vorzutäuschen;
- Stammdaten laden ausschließlich über
  `GET /api/modules/athletes/masterdata`;
- die Oberfläche zeigt Athleten, Trainer und Trainingsgruppen getrennt und
  mobile-first an;
- Athleten, Trainer und Trainingsgruppen können über die bestehenden
  serverseitig geschützten E2C-POST-Routen angelegt werden;
- nach erfolgreicher Mutation wird der aktuelle Organisations-Snapshot neu
  geladen; Clientdaten enthalten keine `organizationId`;
- Rendering personenbezogener Daten erfolgt über DOM-`textContent`/
  Element-Erzeugung, nicht über untrusted `innerHTML`;
- fehlende View-/Edit-Berechtigung, ungültige Eingaben und API-Fehler bleiben
  verständlich sichtbar und umgehen keine Servergrenze;
- Countdown, Login, Passwortwechsel und bestehende App-Shell bleiben
  funktional unverändert;
- noch keine Gruppenzuordnungs-UI, kein Bearbeiten/Deaktivieren bestehender
  Datensätze, keine Preview-/Produktionsmigration, kein Providerwrite und kein
  Deployment.

ULC-E3A wurde zusätzlich auf der isolierten ULC-Preview praktisch bestätigt:
inkrementelle Athletes-Migration, Runtime-ACL-Reconciliation, Worker-Deploy,
UI-Smoke und Datenbank-Binding waren erfolgreich. Produktion blieb unverändert.

## Abgeschlossener Gate-Scope: ULC-E3B

Abnahme für ULC-E3B:

- bestehende Athleten-/Trainer-Gruppenzuordnungen werden aus dem bereits
  organisationsgebundenen Snapshot sichtbar dargestellt;
- neue Athleten-Gruppenzuordnungen nutzen ausschließlich
  `POST /api/modules/athletes/masterdata/athlete-group-memberships`;
- neue Trainer-Gruppenzuordnungen nutzen ausschließlich
  `POST /api/modules/athletes/masterdata/trainer-group-memberships`;
- auswählbar sind clientseitig nur aktive Personen und aktive Gruppen; der
  Server bleibt die autoritative Validierungs- und Organisationsgrenze;
- aktive Athleten/Trainer können ausschließlich über die bestehenden
  organisationsgebundenen Deaktivierungsendpunkte deaktiviert werden;
- Deaktivierung erfordert eine explizite Benutzerbestätigung und lädt danach
  den aktuellen Snapshot neu;
- Clientmutationen enthalten weiterhin keine `organizationId`;
- personenbezogene Werte werden weiterhin ausschließlich über sichere
  DOM-Erzeugung/`textContent` gerendert;
- Login, Countdown und E3A-Anlegen bleiben unverändert funktionsfähig;
- keine neue Datenbankmigration, kein Providerwrite, kein Preview-/Production-
  Deployment in diesem Repository-Slice.

ULC-E3B ist auf `main` abgeschlossen. Die bestehende UI nutzt weiterhin
ausschließlich die bereits autorisierten E2C-Mutationsendpunkte; eine
Preview-Neuauslieferung ist davon getrennt.

## Abgeschlossener Gate-Scope: ULC-E3C

Abnahme für ULC-E3C:

- das Athletes-Modul definiert validierte Update-Inputs für Athleten, Trainer
  und Trainingsgruppen;
- Updates ändern ausschließlich editierbare Fachfelder und niemals ID,
  Organisation oder Lifecycle-Status;
- Repository-Updates wiederholen die Organisationsgrenze in SQL und mutieren
  ausschließlich aktive Datensätze;
- fehlende, inaktive oder organisationsfremde Ziele liefern keinen
  erfolgreichen Updatezustand;
- die ULC-Runtime exponiert die Update-Methoden ausschließlich hinter
  `athletes:edit`;
- Update-Requests verwenden vollständige Feldsätze; unbekannte oder fehlende
  Felder werden fail-closed abgewiesen;
- ID kommt ausschließlich aus dem validierten URL-Pfad; `organizationId`
  bleibt im Browser verboten;
- die bestehende mobile Anlegeoberfläche wird für aktive Datensätze in einen
  Bearbeiten-/Speichern-/Abbrechen-Modus überführt;
- personenbezogene Werte werden weiterhin ausschließlich über DOM-Eigenschaften
  und `textContent` verarbeitet, nicht über untrusted `innerHTML`;
- Gruppenzuordnung, Deaktivierung, Login und Countdown bleiben unverändert
  funktionsfähig;
- keine Datenbankmigration, kein Providerwrite und kein
  Preview-/Production-Deployment in diesem Repository-Slice.

ULC-E3C ist zusätzlich auf der isolierten ULC-Preview mit dem aktuellen
`main`-Commit deployed worden. Post-Merge-CI und Preview-Deploy waren
erfolgreich; eine Datenbankmigration war für E3C nicht erforderlich.

## Abgeschlossener Gate-Scope: ULC-E4A

ULC-E4A ist auf `main` abgeschlossen. Die ULC-App besitzt ein gemeinsames,
app-eigenes Trainingsschema für `kindertraining`, `u12` und `u14`; Domain,
Generator, Manifest und Privacy-Inventur sind synchron. Die isolierte
Preview-Migration besitzt zusätzlich einen eigenen inkrementellen
`training-upgrade`-Pfad. Produktion blieb unverändert.

## Abgeschlossener Gate-Scope: ULC-E4B

ULC-E4B ist auf `main` abgeschlossen. Die Kindertraining-Runtime leitet die
Organisation serverseitig aus der authentifizierten Mitgliedschaft ab,
erzwingt getrennte View-/Edit-Capabilities, erzeugt den datumswirksamen
Teilnehmer-Snapshot über den öffentlichen Athletes-Vertrag und speichert
Trainingseinheit plus vollständige Anwesenheit atomar.

## Abgeschlossener Gate-Scope: ULC-E4C

ULC-E4C ist auf `main` abgeschlossen und praktisch in Preview verifiziert:
Training-Migration und Deploy liefen erfolgreich; der Preview-Smoke bestätigte
die ausgelieferte Kindertraining-Oberfläche, Runtime-Verdrahtung, fail-closed
Authentifizierung und das Application-DB-Binding.

## Abgeschlossener Gate-Scope: ULC-E4D

ULC-E4D ist auf `main` abgeschlossen und in Preview ausgerollt. Der
PostgreSQL-E2E beweist stale-update- und parallel-create-Konflikte fail-closed;
der Preview-Deploy bestätigte die ausgelieferte Kindertraining-Oberfläche,
Runtime-Verdrahtung und das Application-DB-Binding.

## Abgeschlossener Gate-Scope: ULC-E4D.5 Compact UI

ULC-E4D.5 ist auf `main` abgeschlossen, in Preview ausgerollt und praktisch
gesichtet. Die kompakte mobile Darstellung bleibt die aktuelle visuelle
Baseline für die folgenden ULC-Slices.

## Abgeschlossener Gate-Scope: ULC-E4E-A / E4E-A2 Trainer-Identity-Link + Audit

Abnahme für ULC-E4E-A/E4E-A2:

- die bestehende app-eigene `ulc_linz_membership` bleibt der kanonische
  Identity↔ULC-Subject-Vertrag; es wird keine parallele Mapping-Tabelle
  eingeführt;
- für aktive Memberships mit `source_role='trainer'` darf
  `subject_id` auf die zugehörige `appbasis_trainer.id` gesetzt werden;
- der Athletes-Core und sein Trainer-Datenmodell bleiben unverändert;
- nur ein aktiver ULC-Admin der eigenen Organisation darf
  Trainer↔Identity-Verknüpfungen lesen oder ändern;
- die Admin-Grenze wird zusätzlich über den bestehenden kanonischen
  ULC-Rollen-/Permission-Vertrag verifiziert; ein Trainer mit
  `athletes:edit` allein darf keine Benutzerkonten zuordnen;
- der neue Admin-Endpunkt bestimmt die Organisation ausschließlich
  serverseitig aus der eingeloggten Identity; der Browser/Client sendet keine
  `organizationId`;
- gelistet werden ausschließlich aktive, nicht gesperrte Benutzerkonten mit
  aktiver ULC-Trainer-Membership in derselben Organisation;
- eine Verknüpfung darf nur auf einen aktiven Trainer derselben Organisation
  zeigen;
- ein Trainer darf nicht gleichzeitig zwei aktiven Identities zugeordnet
  sein; eine weiterhin aktive Bindung liefert einen expliziten Konflikt;
- eine alte Trainer-Bindung darf beim Re-Link nur dann atomar freigegeben
  werden, wenn das bisherige Benutzerkonto gesperrt/gelöscht oder die
  Membership inaktiv ist; die alte Membership erhält dabei einen
  app-eigenen detachten Subject-Marker statt weiter die Trainer-ID zu halten;
- fehlende/fremde Identity- oder Trainer-Ziele failen geschlossen;
- bestehende Verknüpfungen dürfen idempotent erneut gesetzt werden;
- E4E-A verändert noch nicht die Kindertraining-Gruppensicht und enthält noch
  keine UI für die Zuordnung; diese Wirkung bleibt E4E-B/E4E-C;
- die fachliche Zuordnung verwendet weiterhin ausschließlich den bestehenden
  `subject_id`-Vertrag; E4E-A2 ergänzt jedoch genau eine app-eigene
  Audit-Migration `0005_ulc_linz_trainer_identity_audit.sql`;
- jede erfolgreiche Zuordnung persistiert im selben PostgreSQL-Statement einen
  append-only Auditdatensatz mit authentifiziertem Admin-Principal,
  Organisation, Ziel-Identity, vorherigem Subject und neuem Subject;
- der Preview-Anwendungs-DB-Principal darf auf der Trainer-Identity-Audit-Tabelle
  effektiv nur SELECT/INSERT und auf deren Identity-Sequenz nur USAGE besitzen;
  UPDATE/DELETE/TRUNCATE/REFERENCES/TRIGGER/MAINTAIN sowie Sequence-SELECT/UPDATE
  müssen fail-closed ausgeschlossen und automatisiert verifiziert sein;
- das atomare Freigeben einer gesperrten/gelöschten/inaktiven Alt-Bindung
  erzeugt zusätzlich einen eigenen Auditdatensatz für die detach-Änderung;
- ein fehlgeschlagenes oder ungültiges Re-Link darf weder die Alt-Bindung
  verändern noch einen erfolgreichen Auditdatensatz erzeugen;
- PostgreSQL-E2E muss Same-Organization-Link, Readback, Doppelbelegung,
  Fremdorganisation, ungültiges Re-Link ohne Seiteneffekt, deaktivierte Trainer
  und die vollständige Audit-Historie abdecken;
- der Code-Slice führt keinen Preview-/Production-Write und kein Deployment
  aus. Nach Merge ist wegen `0005` zuerst ein separater Preview-`migrate`
  und danach ein Preview-`deploy` erforderlich.

E4E-A/E4E-A2 ist auf `main` abgeschlossen; Migration `0005` und der
anschließende Preview-Deploy wurden erfolgreich ausgeführt.

## Abgeschlossener Gate-Scope: ULC-E4E-B Trainer-Gruppenbegrenzung

ULC-E4E-B ist auf `main` abgeschlossen. Die Kindertraining-Runtime begrenzt
Trainer serverseitig auf ihre persistierten Gruppenzuordnungen; Admins bleiben
organisationsweit berechtigt. Der Code-Slice benötigte keine Migration. Ein
Preview-Deploy bleibt weiterhin eine gesondert freizugebende Mutation.

## Abgeschlossener Gate-Scope: ULC-E4E-C Administrative Trainer-Benutzerzuordnung

Abnahme für ULC-E4E-C:

- die bestehende geschützte API `/api/admin/trainer-identities` bleibt die
  einzige Schreib- und Leseschnittstelle für Trainer↔Benutzer-Zuordnungen;
- die UI wird im bestehenden Stammdaten-Bereich der Trainer ergänzt und führt
  keine neue Navigation oder parallele Administrationslogik ein;
- die Benutzerzuordnung wird erst nach einem ausdrücklichen Klick auf
  „Verwalten“ geladen; normale Logins und das bloße Öffnen der Stammdaten
  erzeugen dadurch keine automatischen Admin-Denials im Security-Log;
- die UI sendet ausschließlich `identityId` und `trainerId`; Organisation,
  Admin-Principal und Berechtigungsumfang bleiben vollständig serverseitig;
- die vom Server gelieferten aktiven Trainer-Benutzer werden mit ihrer
  aktuellen Trainer-Zuordnung angezeigt;
- auswählbar sind nur aktive Trainer aus dem bereits serverautorisierten
  Stammdaten-Snapshot;
- eine bestehende Zuordnung wird bei Auswahl des Benutzerkontos im Formular
  vorausgewählt, sofern der Trainer noch aktiv und sichtbar ist;
- nach erfolgreichem POST wird die serverseitige Liste erneut geladen, damit
  auch atomare stale-detach-/Re-Link-Effekte korrekt dargestellt werden;
- 403, 404, 409 und ungültige Eingaben werden im UI eindeutig behandelt;
  Konflikte dürfen nicht als erfolgreicher Save erscheinen;
- dynamische Benutzer- und Trainerdaten werden ausschließlich über DOM-
  Konstruktion und `textContent` gerendert; keine HTML-Injektion;
- UI-Sichtbarkeit ist keine Sicherheitsgrenze: die bestehende Admin-Prüfung,
  Organisationsbindung, Konfliktlogik und Audit-Persistenz bleiben unverändert
  serverseitig wirksam;
- E4E-C benötigt keine Migration und verändert weder Athletes-Core noch
  Identity-, Membership-, Audit- oder Kindertraining-Datenmodell;
- der Code-PR führt keinen Preview-/Production-Write und kein Deployment aus.
  Eine praktische Sichtung erfolgt erst nach separater Deploy-Freigabe.

## Abgeschlossener Gate-Scope: ULC-E4E-D Trainer-Testkonten und stabile Gruppenzuordnung

ULC-E4E-D beseitigt die beiden Blocker aus der praktischen E4E-Prüfung:
wiederholbare Trainer↔Gruppen-Zuordnungen und administrativ erzeugbare
Trainer-Testkonten.

Abnahme für ULC-E4E-D:

- Trainer↔Gruppen-Zuordnungen bleiben auf aktive Trainer und Gruppen derselben
  Organisation begrenzt und sind bei identischer Wiederholung idempotent;
- ein erfolgreicher Stammdaten-Write darf nicht als fehlgeschlagen erscheinen,
  nur weil das anschließende Neuladen der Liste scheitert;
- das Anlegen eines Trainer-Benutzers erfolgt ausschließlich über den neuen
  geschützten POST-Endpunkt `/api/admin/trainer-users`;
- der Endpunkt verlangt sowohl eine gültige Identity-Session als auch die
  bestehende ULC-Admin-Autorisierung; Organisation, Actor, Runtime-Rolle und
  Berechtigungsumfang werden niemals vom Client übernommen;
- Benutzer werden über den bestehenden Identity-/Better-Auth-
  Provisionierungsvertrag mit temporärem Passwort angelegt; der erste Login
  bleibt durch `mustChangePassword` auf den Passwortwechsel beschränkt;
- der ausgewählte aktive Trainer wird über die bestehende auditierte
  Trainer↔Identity-Bindelogik verknüpft;
- neue Trainer-Testkonten erhalten ausschließlich die Runtime-Rolle
  `ulc-linz:trainer` sowie Kindertraining `view`/`edit`; Admin- oder
  Benutzerverwaltungsrechte werden nicht vergeben;
- vorhandene widersprüchliche Membership-, Trainer- oder Permission-Zustände
  werden nicht still überschrieben, sondern fail-closed als Konflikt behandelt;
- Wiederholungen nach einem Teilfehler müssen auf bereits korrekten
  Zwischenzuständen weiterlaufen können, ohne Berechtigungen zu verbreitern;
- die Benutzeranlage bleibt im bestehenden, erst durch „Verwalten“ geladenen
  Trainer-Adminbereich; es entsteht keine neue Hauptnavigation;
- die bestehende Trainerliste zeigt weiterhin die zugeordneten Gruppen aus dem
  serverautorisierten Stammdaten-Snapshot;
- die neue Identity-Provisionierung speichert Owner, administrativen Actor und
  Reason bereits in der vorbereiteten Identity-Operation; dafür wird die
  additive Identity-Schema-Version 3 mit Migration
  `0002_appbasis_identity_provisioning_audit.sql` benötigt;
- der Code-PR führt weiterhin weder Preview-/Production-Write noch Deployment
  aus. Migration und Deployment bleiben gesonderte Freigabe-Gates.

E4E-D-Preview-Gate nach dem Code-Merge, jeweils auf `main`:

1. Read-only Inspect der dedizierten ULC-Preview (erwartet: fehlende
   `identity`-Schema-v3-Migration oder bereits `current`).
2. Separat und ausdrücklich freigegeben: `migrate` mit `apply=true`;
   bei bestehender E4E-A2-Baseline ausschließlich
   `0002_appbasis_identity_provisioning_audit.sql`, transaktional durch
   den isolierten Preview-Migration-Principal.
3. Read-only Inspect muss anschließend `current` ergeben. Ohne
   diesen Nachweis dürfen `bootstrap` und `deploy` keine Provider-/Runtime-Writes ausführen.
4. Separat und ausdrücklich freigegeben: Preview-`deploy` mit `apply=true`,
   gefolgt von den bestehenden Audit-/Runtime-Smokes.
5. Praktische Abnahme: Admin-Anlage von Trainer A und Trainer B mit
   temporären Zugangsdaten, erzwungener Passwortwechsel, individuelle
   Trainer↔Gruppen-Sicht, Negativfall gruppenfremde Daten und Konflikttest.

Keine Preview-Migration, kein Preview-Deployment und keine
Produktionsmutation werden allein durch diesen Code-PR ausgelöst.

E4E-D ist für den weiteren Produktpfad abgeschlossen: Admin-Anlage von
Trainer A/B, Pflichtpasswortwechsel und getrennte Gruppensicht wurden in der
isolierten Preview bestätigt. Der zusätzlich vorgeschlagene manuelle
Doppelbelegungsversuch wurde nicht als eigener Pass zurückgemeldet; die
serverseitige Doppelbelegungs-/Konfliktlogik und gruppenfremde Scope-Denials
bleiben jedoch automatisiert fail-closed abgedeckt.

## Abgeschlossener Gate-Scope: ULC-E5A U12 Runtime/API

Abnahme für E5A:

- U12 nutzt für Sitzungen und Anwesenheit ausschließlich das bestehende
  app-eigene `ulc_linz_training_session`-/
  `ulc_linz_training_attendance`-Schema mit `module_id='u12'`;
- eine neue app-eigene Migration ergänzt ausschließlich
  `ulc_linz_training_module_group`: pro Organisation genau eine Gruppe je
  `kindertraining`/`u12`/`u14` und eine Gruppe höchstens für ein Modul;
  es entstehen keine Foreign Keys in das Athletes-Modul;
- U12 besitzt eigene Endpunkte `/api/modules/u12` und
  `/api/modules/u12/session`; der Client kann keine Organisation vorgeben;
- View/Edit werden über die bereits vorhandenen
  `ulc-linz:module:u12:view`-/`edit`-Capabilities serverseitig erzwungen;
- Admins bleiben organisationsweit; Trainer werden – sofern sie U12-Rechte
  besitzen – auf ihre persistierten Trainer↔Gruppen-Zuordnungen begrenzt;
- gruppenfremde Ziele liefern keinen Datenhinweis und werden wie beim
  Kindertraining fail-closed behandelt;
- Teilnehmer-Snapshot, Revision-/Konfliktschutz und vollständige
  Anwesenheitsmenge verwenden denselben bewiesenen Trainingsvertrag, bleiben
  aber durch `module_id='u12'` fachlich vom Kindertraining getrennt;
- U12 darf bestehende Kindertraining-Sessions weder lesen noch überschreiben;
- ohne explizite U12-Modul↔Gruppen-Zuordnung liefert U12 keine Trainingsgruppe;
  die Zuordnung selbst wird erst in einem folgenden Admin-Slice beschreibbar;
- bestehende Trainer-Testkonten erhalten in E5A **keine** neuen Rechte;
  Berechtigungsverwaltung und U12-UI bleiben eigene Folgeslices;
- der Code-PR führt keine Preview-/Production-Mutation und kein Deployment aus;
  die isolierte Preview benötigt nach Merge separat die additive Schema-v7-
  Migration, bevor ein späterer U12-Deploy freigegeben werden kann.

## Architektur- und Sicherheitsgrenzen

- Core bleibt fachneutral und klein.
- Fachmodule ändern keine Tabellen anderer Module.
- `createAppSkeleton()` bleibt der Pfad für **neue** Apps und wird nicht als
  Updater für bestehende Apps missbraucht.
- Bis der FC5-Updater reproduzierbar verifiziert ist, werden bestehende
  ULC-Runtime- und M5/M6-Evidence-Verträge nicht nur für einen einzelnen
  Fachslice manuell umgebaut oder neu gepinnt.
- Permissions bleiben serverseitig; UI-Sichtbarkeit ist keine
  Sicherheitsgrenze.
- Keine neue allgemeine Policy-/ABAC-Engine.
- Keine Provider-Abstraktion ohne realen zweiten Bedarf.
- Keine Produktivdeployments, Providerwrites, Secret-Rotationen oder
  produktiven DB-Mutationen ohne ausdrückliche Nutzerfreigabe.

## Scope-Freeze für Review und Implementierung

Ein Finding blockiert den aktuellen ULC-E5A-Pfad, wenn mindestens eines gilt:

- U12 verwendet einen anderen Session-/Attendance-Persistenzpfad als den
  bereits akzeptierten gemeinsamen Trainingskern oder die neue Migration greift
  in Tabellen eines anderen Owners ein;
- U12 kann Kindertraining-/U14-Sessions lesen oder überschreiben;
- Organisation oder Modul-ID werden aus Clientdaten übernommen statt serverseitig
  festgelegt;
- U12 umgeht die kanonische Identity-/Permission-Prüfung;
- ein Trainer kann ohne explizite U12-Capability oder außerhalb seiner
  Trainer↔Gruppen-Zuordnung U12-Daten lesen oder schreiben;
- gruppenfremde Ziele verraten Daten, statt fail-closed zu bleiben;
- der Revision-/Teilnehmer-Snapshot-Vertrag wird gegenüber Kindertraining
  gelockert;
- der Code-PR erweitert bestehende Trainerberechtigungen oder führt Preview-/
  Production-Writes ohne gesonderte Freigabe aus.

Nicht gate-blockierend sind weitere visuelle Feinarbeiten, zusätzliche
Trainer-Berechtigungsprofile, Sondertrainings, Statistik, Import/Export,
Realtime/Edit-Locks und U12/U14.

## E2B-Prozessfinding: Baseline-Ausnahme

Die wiederholten Review-Findings zur heuristischen Erkennung historischer
Access-Control-Blöcke werden nicht weiter mit einer wachsenden SQL-Denylist
behandelt. Die Heuristik ist für E2B verworfen.

Markerlose historische Baseline-Migrationen dürfen nur noch über eine
app-spezifische Evidence-Datei zugelassen werden. Jede Ausnahme bindet exakt
einen bestehenden App-Migrationspfad an den überprüften SHA-256-Inhalt. Die
Ausnahme gilt ausschließlich im Baseline-Katalogvertrag; Zielmigrationen
erhalten keine Ausnahme. Jede Byte-Änderung der gepinnten Migration macht den
FC6-Plan fail-closed und verlangt eine neue ausdrückliche Prüfung.

Für ULC-E2B ist ausschließlich
`apps/ulc-linz/migrations/0003_ulc_linz_security_event_access.sql`
als bereits separat evidenzierte historische Access-Control-Migration gepinnt.
Damit werden keine neuen SQL-Formen anhand unvollständiger Regex-Heuristiken
freigeschaltet.

## Loop-Grenze

Für einen Arbeitspfad gilt:

1. Implementierung
2. vollständige CI
3. ChatGPT Diff-/Architektur-/Security-Prüfung
4. gebündelte Korrektur
5. Exact-Head-CI PASS
6. ein finaler Codex-Review
7. bei echtem Finding: genau ein gebündelter Fix + Exact-Head-CI + ein Re-Review

Kommt danach ein weiteres Finding derselben expandierenden Prüfklasse, wird
nicht blind weitergepatcht. Das Finding wird gegen diesen Gate-Vertrag
klassifiziert und entweder als neues abgegrenztes Arbeitspaket behandelt oder
zurückgestellt.

## Nächste Produktfolge

Der persistenzfreie FC5-Pfad bleibt abgeschlossen:

**FC5 Existing-App-Updater → Countdown D1–D3 → ULC Preview D4 →
ULC Production Revalidation.**

Der FC6-Pfad ist abgeschlossen:

**FC6-A Migration-Delta → FC6-B inkrementeller DB-Executor →
FC6-C Existing-App-Integration → FC6-D isolierter E2E-Beweis.**

Der neue Produktpfad ist:

**ULC-E1 Vereins-App-Shell & Dashboard → ULC-E2A–E2D Stammdaten →
ULC-E3A–E3C Stammdaten-UI/Lifecycle → ULC-E4A gemeinsames Trainingsfundament →
ULC-E4B–E4E-D Kindertraining inkl. Trainer-Identity/Scope-Abnahme →
ULC-E5A U12 Runtime/API.**

Der abgeschlossene FC4-Pfad bleibt die Referenz:
**Modulvertrag → Modul-Scaffolder → Countdown-Modul → Generator-Test-App.**

FC6 verändert keine reale Produktapp nur für einen Testfall. Ein realer
Produktverbraucher folgt erst bei tatsächlichem Bedarf. Produktionsmigration,
Deployment und Release bleiben weiterhin getrennte ausdrückliche Gates.

## Arbeitsstart in jedem neuen Chat / jeder neuen Session

Vor Änderungen gilt überall dieselbe Reihenfolge:

1. `CURRENT-GATE.md` lesen
2. `AGENTS.md` lesen
3. GitHub Live-State vollständig prüfen
4. nur die für den aktuellen Gate-Entscheid relevanten ADRs/Roadmap-Abschnitte
   prüfen
5. kleinstes Arbeitspaket bis zum nächsten echten Gate ausführen

Wenn ein vorgeschlagener Schritt nicht notwendig ist, um den aktuellen
Gate-Slice oder den unmittelbar folgenden Produkt-Vertical-Slice zu erreichen,
wird er zurückgestellt.
