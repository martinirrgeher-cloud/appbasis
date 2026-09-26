# FC6 – Database-owning Module Updates für bestehende Apps

Stand: 2026-09-26

## Ausgangslage

FC5 hat den kontrollierten Existing-App-Updatepfad für ein persistenzfreies
Modul vollständig bewiesen. Der reale Verbraucher `ulc-linz + countdown`
durchlief Planung, atomare Repository-Aktualisierung, Runtime/UI, isolierte
Preview und getrennte Production-Revalidation.

Für datenbank-ownende Module besteht danach noch eine bewusst gesetzte
Fail-closed-Grenze:

- `module-update-plan.mjs` kann bereits erkennen, dass sich
  `appbasis.database.json` durch ein neues Modul ändern würde;
- `apply-module-update.mjs` verweigert solche Installationen ausdrücklich;
- der vorhandene generische Migration-Executor ist für initiale Migrationen auf
  einem leeren `public`-Schema ausgelegt und darf deshalb nicht blind für eine
  bereits bestehende, befüllte App-Datenbank wiederverwendet werden.

FC6 schließt genau diese Lücke. Es ist **kein** allgemeiner Schema-Updater und
kein automatischer Produktionsrelease.

## Ziel

Ein bestehendes AppBasis-Projekt soll ein datenbank-ownendes Standardmodul
kontrolliert hinzufügen können, ohne:

- bestehende Owner oder deren Migrationen umzuschreiben,
- fremde Schemas zu verändern,
- Repository-Publikation mit einer Datenbankmigration gleichzusetzen,
- eine Produktionsmigration oder einen Release automatisch zu autorisieren.

Der erste Beweis erfolgt ausschließlich auf isolierten Fixtures bzw. einer
isolierten PostgreSQL-Testumgebung mit einem realen datenbank-ownenden
Standardmodul. Keine produktive ULC-Datenbank wird für den FC6-Vertragsaufbau
verändert.

## Verbindliche Architekturgrenze

Repository-Update und Datenbankmigration sind zwei getrennte Transaktionsräume.
FC6 versucht ausdrücklich **keine vorgetäuschte verteilte Atomizität** zwischen
Git-Dateien und PostgreSQL.

Stattdessen gilt:

1. Der Repository-Plan beschreibt deterministisch den gewünschten Zielzustand
   und den exakten Migrationsdelta-Vertrag.
2. Repository-Dateien werden weiterhin nur über den kontrollierten
   Existing-App-Updater verändert.
3. Eine Datenbankmigration ist ein eigener, ausdrücklich auszuführender
   Environment-Schritt.
4. Produktion/Deployment bleiben gesperrt, solange die für den Zielstand
   erforderliche Migrationsevidenz nicht vorliegt.
5. Ein Repository-Erfolg allein bedeutet niemals
   `productionMigrationsApplied=true`.

## FC6-A – read-only Migration-Delta

Der bestehende Modulplan wird um einen kanonischen Migrationsdelta-Vertrag für
datenbank-ownende Module ergänzt.

Der Delta-Vertrag muss fail-closed beweisen:

- aktuelle Appdefinition und aktuelles Datenbankmanifest sind vor der Planung
  kanonisch konsistent;
- das Zielmodul besitzt einen verifizierten Modulvertrag;
- alle bereits vorhandenen Datenbank-Owner bleiben byte-/semantisch
  unverändert;
- genau der neue Modul-Owner wird ergänzt;
- dessen Root, Schema-Version und vollständige Migrationsliste stammen
  ausschließlich aus `appbasis.module.json`;
- keine Migration eines bestehenden Owners wird ergänzt, entfernt,
  umsortiert oder ersetzt;
- der Planner führt keinerlei Datenbankzugriff oder Write aus.

Der erste Slice endet mit einem deterministischen read-only Plan und Tests.

## FC6-B – isolierter inkrementeller Migration-Executor

Erst nach FC6-A wird ein Executor für die **neuen** Modul-Migrationen gegen eine
bereits bestehende Datenbankbasis eingeführt.

Verbindliche Grenzen:

- direkter PostgreSQL-Zielvertrag; kein Hyperdrive als Migration-Credential;
- Zielidentität muss vor dem ersten SQL-Statement verifiziert sein;
- die erwartete bestehende Baseline muss nachweisbar zum Ausgangsvertrag der App
  passen; unbekannter oder widersprüchlicher DB-Zustand wird abgewiesen;
- ausgeführt werden ausschließlich die im FC6-A-Delta enthaltenen
  Migrationen des neuen Owners;
- bestehende Owner-Migrationen werden nicht erneut abgespielt;
- alle Statements eines Installationsdeltas laufen in **einer**
  PostgreSQL-Transaktion;
- SQL mit eigener Transaction-Control bleibt verboten;
- ein Fehler rollt den vollständigen DB-Delta zurück;
- ein erneuter Lauf muss entweder als eindeutig bereits angewendet erkannt oder
  fail-closed abgewiesen werden; Doppelanwendung ist nicht zulässig;
- Tests beweisen explizit eine nicht leere bestehende Baseline.

Der konkrete Mechanismus zur belastbaren Erkennung des angewendeten
Migrationsstands wird innerhalb FC6-B als kleiner ausführbarer Vertrag
festgelegt; es wird kein zweites allgemeines Migration-Framework aufgebaut.

## FC6-C – Integration in den Existing-App-Updater

Nach bewiesenem Delta- und Execution-Vertrag darf der bisherige FC5-Executor
seine harte Sperre für datenbank-ownende Module gezielt ersetzen.

Dabei bleibt:

- der Repository-Write-Satz vollständig aus dem Planner abgeleitet;
- `appbasis.database.json` wird nur auf den verifizierten kanonischen
  Zielzustand geändert;
- Workspace und Appdefinition behalten die bisherigen Locks,
  Drift-Prüfungen und Rollback-Regeln;
- die Appdefinition bleibt Repository-Publikationsmarker und wird zuletzt
  geschrieben;
- eine erfolgte Repository-Installation behauptet **nicht**, dass irgendeine
  konkrete Preview-/Produktionsdatenbank bereits migriert wurde.

## FC6-D – Preview-/E2E-Beweis

Der erste vollständige Beweis verwendet ein isoliertes Existing-App-Fixture und
ein reales datenbank-ownendes Standardmodul, bevorzugt den bereits vorhandenen
`tasks`-Modulvertrag.

Abnahme:

1. bestehende App mit bereits vorhandenem nicht leerem Basisschema;
2. read-only Installations- und Migrationsdelta;
3. Repository-Update auf den neuen kanonischen Datenbankmanifest-Zustand;
4. isolierte inkrementelle PostgreSQL-Migration;
5. positive Funktions-/Schema-Prüfung;
6. Failure-Injection mit vollständigem DB-Rollback;
7. Wiederholung/Drift fail-closed;
8. vollständige CI und Exact-Head-Review.

Kein realer Produktverbraucher wird allein für die Abnahme künstlich mit einem
nicht benötigten Modul erweitert.

## Nicht Teil von FC6

- kein generisches Upgrade beliebiger bestehender Modul-Schema-Versionen;
- keine destruktive Datenmigration ohne konkreten realen Bedarf;
- keine allgemeine Expand-Migrate-Contract-Engine;
- keine automatische Produktionsmigration;
- keine automatische Preview-/Production-Provisionierung;
- keine Änderung der ULC-Linz-Produktionsdatenbank;
- kein automatischer Release oder Public-Ingress;
- keine neue Provider-Abstraktion.

## Abschlusskriterium

FC6 ist abgeschlossen, wenn ein datenbank-ownendes Standardmodul reproduzierbar
zu einer bestehenden App hinzugefügt werden kann und der dazugehörige
inkrementelle DB-Delta auf einer nicht leeren isolierten PostgreSQL-Baseline
transaktional, idempotent/fail-closed und mit vollständiger automatisierter
Evidence ausgeführt werden kann.

Produktionsmigration, Deployment und Release bleiben danach weiterhin eigene,
ausdrücklich freizugebende Schritte.
