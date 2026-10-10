# FC6 – Database-owning Module Updates für bestehende Apps

Stand: 2026-09-27

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

## FC6-A – read-only Migration-Delta – abgeschlossen

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

Der Slice ist abgeschlossen: der deterministische read-only Plan weist genau
den neuen Modul-Owner samt Root, Schema-Version und vollständiger
Migrationsliste aus und bleibt ohne Repository-/Datenbankwrite.

## FC6-B – isolierter inkrementeller Migration-Executor – abgeschlossen

Erst nach FC6-A wird ein Executor für die **neuen** Modul-Migrationen gegen eine
bereits bestehende Datenbankbasis eingeführt. Der Executor akzeptiert denselben
verifizierten Installationsdelta in zwei Repository-Zuständen: vor der
Repository-Publikation direkt aus dem FC6-A-Plan oder danach aus dem kanonisch
veröffentlichten Target-Manifest. Im veröffentlichten Zustand wird der neue
Modul-Owner exakt gegen den verifizierten Modulvertrag rückgebunden und aus der
Baseline herausgerechnet; ein bloßes `already-installed` gilt daher nicht als
Beweis, dass die Datenbankmigration bereits gelaufen ist.

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
- Target-Migrationen dürfen `REFERENCES` ausschließlich auf Tabellen
  desselben neuen Modul-Owners verwenden; unqualifizierte bzw. explizit
  `public.`-qualifizierte Ziele werden gegen den verifizierten
  Target-Katalogvertrag geprüft. Cross-Owner- und Fremdschema-Referenzen bleiben
  fail-closed, bis ein expliziter öffentlicher Modul-Dependency-Vertrag solche
  Abhängigkeiten maschinenlesbar autorisieren und prüfen kann;
- Tests beweisen explizit eine nicht leere bestehende Baseline.

Der konkrete kleine Nachweisvertrag für FC6-B verwendet keine zweite allgemeine
Migration-History-Tabelle. Stattdessen werden aus der bereits verifizierten
Baseline-Migrationsliste Katalogmarker (Tabellen, Spalten, benannte Constraints
und Indizes) sowie exakte Constraint-Anzahlen je Tabelle und Constraint-Typ
(`PRIMARY KEY`, `UNIQUE`, `CHECK`, `FOREIGN KEY`, `EXCLUDE`) abgeleitet
und innerhalb derselben Transaktion gegen PostgreSQL geprüft. Damit werden auch
fehlende oder zusätzliche unbenannte Constraints als Baseline-Drift erkannt. Der neue Moduldelta muss ebenfalls einen nicht-destruktiven,
verifizierbaren Katalogvertrag besitzen. Bereits vorhandene Zielmarker werden
vor dem ersten DDL als bereits/teilweise angewendet fail-closed abgewiesen.

Für dieselbe App-/Modulkombination serialisiert ein PostgreSQL Advisory Lock die
Prüfung und Ausführung. Damit bleibt der Mechanismus klein und
installationsspezifisch; es entsteht kein zweites allgemeines
Migration-Framework.

Der FC6-B-Katalognachweis unterstützt in diesem Slice bewusst nur die
ausführbar geprüften DDL-Klassen Tabellen, Spalten, Constraints und Indizes.
Bei Constraints werden benannte Constraints zusätzlich namentlich und alle
unterstützten Constraint-Typen tabellenweise exakt gezählt. Mehrere SQL-Kommandos innerhalb einer Migrationsdatei werden einzeln
ausgewertet. Migrationen mit anderen Wirkungsklassen wie Rollen-, Grant-,
Funktions- oder frei programmierbarer DO-Block-Logik werden nicht stillschweigend
ignoriert, sondern bleiben für diesen inkrementellen Pfad fail-closed, bis ein
konkreter Verbraucher dafür einen eigenen überprüfbaren Nachweis benötigt.

## FC6-C – Integration in den Existing-App-Updater – abgeschlossen

Nach bewiesenem Delta- und Execution-Vertrag ersetzt der bisherige FC5-Executor
seine harte Sperre für datenbank-ownende Module gezielt durch den FC6-Vertrag.

Dabei bleibt:

- der Repository-Write-Satz vollständig aus dem Planner abgeleitet;
- `appbasis.database.json` wird nur auf den verifizierten kanonischen
  Zielzustand geändert;
- Workspace, Datenbankmanifest und Appdefinition behalten die bisherigen Locks,
  Drift-Prüfungen und Rollback-Regeln;
- schlägt die Publikation nach dem DB-Manifest-Write fehl, wird auch das
  Datenbankmanifest auf den exakten Ausgangszustand zurückgesetzt;
- die Appdefinition bleibt Repository-Publikationsmarker und wird zuletzt
  geschrieben;
- FC6-C baut keine PostgreSQL-Verbindung auf und führt keinerlei Migration aus;
- der im Plan enthaltene `databaseMigrationDelta` bleibt die explizite
  Anforderung an den späteren Environment-Schritt;
- eine erfolgte Repository-Installation behauptet **nicht**, dass irgendeine
  konkrete Preview-/Produktionsdatenbank bereits migriert wurde.

Der Slice ist abgeschlossen, sobald der Existing-App-Updater diesen Vertrag für
ein DB-ownendes Fixture reproduzierbar publiziert, den bisherigen
persistenzfreien Pfad unverändert lässt und einen Fehler nach DB-Manifest-
Publikation vollständig zurückrollt.

## FC6-D – isolierter Existing-App-E2E-Beweis – abgeschlossen

Der vollständige Beweis verwendet ein isoliertes Existing-App-Fixture mit
nicht leerer Identity-Baseline und das reale datenbank-ownende Standardmodul
`tasks`. Entscheidend ist, dass Repository-Publikation und DB-Migration nicht
mehr durch Test-Hilfsmanipulationen simuliert, sondern über die echten
FC6-C- bzw. FC6-B-Executors hintereinander ausgeführt werden.

Abnahme:

1. bestehende App mit bereits vorhandenem nicht leerem Basisschema und
   vorhandenen Identity-Daten;
2. read-only Installations- und Migrationsdelta ohne Repositorywrite;
3. echter Existing-App-Updater publiziert den kanonischen Repository-Zielstand;
4. isolierter inkrementeller PostgreSQL-Executor migriert ausschließlich den
   neuen Tasks-Owner;
5. positive Schema- und Bestandserhaltungsprüfung;
6. erneuter Repository-Lauf ist No-op, erneuter DB-Lauf fail-closed;
7. Baseline-Drift nach Repository-Publikation verhindert Target-DDL;
8. Failure-Injection nach erfolgreicher Repository-Publikation beweist
   vollständigen DB-Rollback;
9. vollständige CI und Exact-Head-Review.

Kein realer Produktverbraucher wird allein für die Abnahme künstlich mit einem
nicht benötigten Modul erweitert.

FC6-D schließt den Gate ab: dieselbe isolierte Existing-App-Baseline durchläuft
den read-only Planner, den echten Repository-Updater und anschließend den
inkrementellen PostgreSQL-Executor. Positive Installation, Bestandserhalt,
Repository-No-op, DB-Rerun-Abweisung, Baseline-Drift und transaktionaler
Failure-Rollback sind gemeinsam automatisiert belegt.

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

**FC6 ist abgeschlossen.** Ein datenbank-ownendes Standardmodul kann
reproduzierbar zu einer bestehenden App hinzugefügt werden und der zugehörige
inkrementelle DB-Delta wird auf einer nicht leeren isolierten
PostgreSQL-Baseline transaktional, idempotent/fail-closed und mit
automatisierter Evidence ausgeführt.

Produktionsmigration, Deployment und Release bleiben weiterhin eigene,
ausdrücklich freizugebende Schritte.
### PostgreSQL-Defaultnamen bei Primary-Key-Ersatz

Der Katalogbeweis darf einen von PostgreSQL automatisch erzeugten Primary-Key-
Namen nur dann ableiten, wenn derselbe Target-Migrationsplan die Tabelle mit
einem **unbenannten** Primary Key erzeugt und der kanonische, ungekürzte Name
exakt `<tabelle>_pkey` lautet. Abweichende oder wegen der 63-Byte-Grenze
gekürzte Namen werden nicht geraten und bleiben fail-closed. Damit kann ein
späterer, explizit benannter Composite-Primary-Key sicher als Ersatz bewiesen
werden, ohne die allgemeine Constraint-Prüfung zu lockern.

