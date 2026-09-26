# AppBasis – Current Gate

Stand: 2026-09-26

Diese Datei ist die operative, chatübergreifende Steuerung für den **aktuell zu
liefernden Gate-Scope**. Sie ersetzt keine Roadmap, ADR oder Security-Grenze.
Volatile PR-, CI-, Review- und Branch-Zustände werden ausschließlich live aus
GitHub abgeleitet.

## Aktuelles Ziel

**FC6 – Datenbank-ownende Module kontrolliert zu bestehenden Apps hinzufügen.**

FC5 ist für den ersten realen persistenzfreien Existing-App-Pfad abgeschlossen:
`ulc-linz + countdown` wurde geplant, atomar im Repository installiert,
fachlich umgesetzt, in einer isolierten Preview abgenommen und anschließend
getrennt gegen den bestehenden Produktionspfad revalidiert.

FC6 schließt jetzt die bewusst verbliebene Lücke für datenbank-ownende Module.
**FC6-A ist abgeschlossen.** Der aktuelle Slice ist
**FC6-B: isolierter inkrementeller Migration-Executor**. Er wird ausschließlich
auf einer isolierten nicht leeren PostgreSQL-Baseline bewiesen; produktive
Datenbank- und Providerwrites bleiben ausgeschlossen.

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

### FC6-B – isolierter inkrementeller Migration-Executor – aktuell

Der FC6-B-Executor konsumiert ausschließlich den FC6-A-Delta-Vertrag. Vor dem
ersten Ziel-DDL muss er:

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

Ein Finding blockiert den aktuellen FC6-Pfad, wenn mindestens eines gilt:

- der Modulvertrag ist nicht deterministisch oder nicht reproduzierbar;
- Paket, Capability, Datenbankbesitz oder Migrationen können vom Manifest
  unbemerkt abweichen;
- der neue Modulpfad kann bestehende Apps oder fremde Modulschemas
  überschreiben;
- Kompatibilität wird nur angenommen statt geprüft;
- eine bestehende Security-/Privacy-/Release-Grenze wird abgeschwächt;
- der unmittelbar benötigte Countdown-Vertical-Slice kann über den
  vorgesehenen Modulpfad nicht sicher erreicht werden.

Nicht gate-blockierend sind zusätzliche Plattformabstraktionen und allgemeines
Hardening ohne konkreten Verbraucher.

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

Der neue aktuelle Pfad ist:

**FC6-A Migration-Delta → FC6-B inkrementeller DB-Executor →
FC6-C Existing-App-Integration → FC6-D isolierter E2E-Beweis.**

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
FC6-Slice oder den unmittelbar folgenden FC6-Vertical-Slice zu erreichen, wird
er zurückgestellt.
