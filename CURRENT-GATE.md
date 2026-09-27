# AppBasis – Current Gate

Stand: 2026-09-27

Diese Datei ist die operative, chatübergreifende Steuerung für den **aktuell zu
liefernden Gate-Scope**. Sie ersetzt keine Roadmap, ADR oder Security-Grenze.
Volatile PR-, CI-, Review- und Branch-Zustände werden ausschließlich live aus
GitHub abgeleitet.

## Aktuelles Ziel

**ULC-E2B – Stammdaten kontrolliert in ULC Linz installieren.**

ULC-E2A ist abgeschlossen. Der aktuelle Slice publiziert das datenbank-ownende
Modul `athletes` über den kanonischen Existing-App-Zielzustand in
`ulc-linz` und beweist denselben Zustand mit dem echten FC6-Updater sowie dem
inkrementellen PostgreSQL-Executor auf einer isolierten Kopie der realen
ULC-Baseline. Runtime/API, Stammdaten-UI, Preview und Produktion bleiben
weiterhin getrennt.

FC5 ist für den ersten realen persistenzfreien Existing-App-Pfad abgeschlossen:
`ulc-linz + countdown` wurde geplant, atomar im Repository installiert,
fachlich umgesetzt, in einer isolierten Preview abgenommen und anschließend
getrennt gegen den bestehenden Produktionspfad revalidiert.

FC6 schließt die bewusst verbliebene Lücke für datenbank-ownende Module.
**FC6-A, FC6-B, FC6-C und FC6-D sind abgeschlossen.** Der vollständige Pfad
verbindet read-only Delta-Plan, echten Repository-Updater und inkrementellen
PostgreSQL-Executor auf einer nicht leeren isolierten Baseline. Produktive
Datenbank- und Providerwrites bleiben weiterhin ausgeschlossen.

Der nach FC6 eröffnete Produkt-Scope ist ULC-E1. Er wurde aus dem realen
ULC-Linz-Bedarf abgeleitet und erweitert bewusst nur die sichtbare App-Shell;
weitere fachliche Bereiche bleiben bis zu ihrem eigenen Vertical Slice außen vor.

FC4 ist für den aktuellen Produktpfad abgeschlossen: Modulvertrag,
Modul-Scaffolder, der persistenzfreie Intervall-Countdown und der normale
Generator-Verbrauch durch eine neue Countdown-Test-App sind reproduzierbar
abgedeckt. Der unmittelbare reale Produktverbraucher bleibt die ULC-Linz
Vereins-App.

Der direkte Umbau einer bestehenden generierten App ist ausdrücklich **nicht**
der Updatepfad. Bestehende Apps werden erst verändert, wenn der reproduzierbare
FC5-Modul-Installations-/Updatevertrag vorhanden ist.

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

## Aktueller Gate-Scope: FC6

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

## Aktueller Gate-Scope: ULC-E2B

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

Die Baseline-Katalogprüfung darf bereits vorhandene, separat abgesicherte
nicht-strukturelle `GRANT`-/`REVOKE`-/Rollen-/Function-DDL überspringen.
Diese Ausnahme gilt ausschließlich für den bestehenden Baselinevertrag.
Strukturelles DDL in solchen Blöcken und sämtliche Zielmodul-DDL ohne
Katalogmarker bleiben fail-closed.

Nach E2B folgt ULC-E2C: serverseitige Stammdaten-Runtime/API mit
Organisationsgrenze und `athletes:view`/`athletes:edit`. Dabei muss auch
der personenbezogene Stammdaten-Lifecycle für Löschung/Aufbewahrung aus dem
E2B-Fail-closed-Status heraus explizit gelöst werden.

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

Ein Finding blockiert den aktuellen ULC-E2B-Pfad, wenn mindestens eines gilt:

- der publizierte ULC-Zielzustand weicht vom echten Updater-Ziel ab;
- bestehende DB-Owner, Appmodule oder Workspace-Abhängigkeiten werden außerhalb
  des geplanten `athletes`-Deltas verändert;
- die reale ULC-Baseline kann nicht strukturell verifiziert werden;
- die Baseline-Ausnahme akzeptiert strukturelles DDL oder wird auf
  Zielmigrationen angewendet;
- bestehende Identity-/ULC-Lifecycle-Daten gehen durch die Migration verloren;
- Rerun-, Drift- oder Transaktionsgrenzen des FC6-Pfads werden abgeschwächt;
- Preview, Produktion oder Provider werden in E2B mutiert.

Nicht gate-blockierend sind Runtime/API/UI, Realtime,
Benutzerverknüpfungen und Import/Export; sie folgen nach E2B.

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

**ULC-E1 Vereins-App-Shell & Dashboard → ULC-E2A Stammdaten-Fundament →
ULC-E2B kontrollierte ULC-Installation → ULC-E2C Stammdaten-Runtime/API.**

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
