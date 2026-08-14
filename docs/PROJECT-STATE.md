# AppBasis Projektstand

## Phase

Phase 3I – Persistent Permissions Runtime

## Ziel

Der vollständige Reference-Vertical-Slice ist als Demo v0.1 bewiesen. Der Fokus liegt jetzt auf der eigentlichen App-Fabrik: konkrete Apps sollen aus kleinen, maschinenlesbaren Definitionen reproduzierbar aufgebaut werden, ohne Auth, Datenbank, Berechtigungen, CI und Deployment jeweils neu zu implementieren.

## Bewiesenes Fundament

- Monorepo mit gepinnter Node-/pnpm-Toolchain, striktem TypeScript, CI und ausführbaren Repository-Verträgen.
- PostgreSQL-Persistenz mit versionierten, eigentümergetrennten Migrationen.
- Better-Auth-basierte Username-Identity mit technischer `.invalid`-Adresse, erzwungenem Erstpasswortwechsel, Sessions und Deaktivierung.
- technischer Root-Admin als getrennte Auth-Administration; keine Vermischung mit fachlichen AppBasis-Rollen.
- serverseitige deny-by-default Permissions mit Capability-IDs, Rollenbundles und individuellen Grants/Revokes.
- erstes reales Standardmodul `tasks` mit PostgreSQL-Repository und vollständigem Create/List/Status-Vertical-Slice.
- `tasks` besitzt mit `@appbasis/tasks` einen öffentlichen Workspace-Modulvertrag; die Reference-App konsumiert das Modul nicht mehr über relative Source-Imports.
- mobile-first React-Reference-App und Cloudflare-Worker-API.
- Neon/PostgreSQL-Preview hinter Cloudflare Hyperdrive.
- Hyperdrive-Query-Caching ist für die Reference-Konfiguration bewusst deaktiviert, damit Auth-, Session-, Permission- und Read-after-write-Pfade frische Daten sehen.
- reproduzierbarer manueller Reference-Preview-Deploy mit Health- und authentifiziertem, mutierendem Demo-Smoke.
- Demo-User-Bootstrap und vollständiger automatisierter Demo-v0.1-Akzeptanzpfad: Login, Session, Berechtigung, Task anlegen, direkt wieder lesen, Status ändern und erneut lesen.

## Demo v0.1 – abgeschlossen

Demo v0.1 gilt als technisch abgeschlossen. Der produktive Preview-Pfad hat den vollständigen User-to-Database-Vertical-Slice gegen reales Neon/PostgreSQL erfolgreich bewiesen. Alte technische Root-Admin-Sessions wurden nach erfolgreicher Demo-Abnahme bereinigt; der Demo-User bleibt aktiv.

## App-Fabrik – bewiesene Grundlagen

Jede App unter `apps/` besitzt `appbasis.app.json`. Der V2-Vertrag beschreibt Schema-Version, App-ID, sichtbaren App-Namen, explizit aktivierte Fachmodule und explizit aktivierte Plattformdienste. `verify:apps` prüft Manifestform, Verzeichnisbindung, vorhandene Modul-IDs und zugelassene Plattformdienste fail-closed als Bestandteil von `verify:repo`.

Als Manifest-Plattformdienste sind `identity` und `permissions` ausdrücklich zugelassen. Andere Paketverzeichnisse werden nicht vorsorglich als Plattformdienste freigegeben. Die Zulassung von `permissions` erweitert nur den deklarativen V2-Vertrag; Permission-Semantik, Rollen, Grants/Revokes und bestehende deny-by-default Regeln bleiben unverändert. Die Reference-App deklariert passend zu ihrer Laufzeit `platformServices: ["identity", "permissions"]`.

**Datenbank ist bewusst kein dritter Manifest-Plattformdienst.** PostgreSQL bleibt Infrastruktur. Der Generator leitet persistente Infrastruktur aus der bereits ausdrücklich gewählten Fach-/Plattform-Komposition ab und fügt sie nur dort hinzu, wo die erzeugte Laufzeit sie tatsächlich benötigt. Damit bleiben App-Manifeste fachlich und plattformbezogen, ohne Provider- oder Persistenzdetails in jede App-Definition zu tragen.

`pnpm appbasis:create` erzeugt deterministische Apps ohne Reference-Copy/Paste. Staging, atomare Zielreservierung und `verify:apps` sind gegen konkurrierende Publikation gehärtet; vorhandene Apps werden niemals ersetzt. Plattformdienste werden nur über explizite Generator-Eingaben aktiviert.

Für `identity` konsumiert der Generator den separat geprüften Generated-Runtime-Template-Baustein. Alle Runtime-Dateien werden vor dem Manifest publiziert; `appbasis.app.json` wird bewusst zuletzt sichtbar. Ohne gewählten Identity-Dienst bleibt das erzeugte App-Skelett deklarativ.

Generierte Workspace-Apps werden vor erfolgreicher Publikation mit der gepinnten pnpm-Version finalisiert. Dabei werden Lockfile und lokale Workspace-Links aktualisiert. Die Finalisierung ist zeitlich begrenzt und fail-closed; bei einem Fehler werden Ziel-App und Lockfile auf den vorherigen Zustand zurückgesetzt, bevor der gemeinsame Registry-Lock freigegeben wird.

## Bewiesener gemeinsamer Identity-Runtime-Vertrag

Der erste tatsächlich app-übergreifend neutrale Teil des Runtimes liegt in der bereits zuständigen Plattformfähigkeit: `@appbasis/identity/http`.

Der Adapter:

- verwendet ausschließlich Web-Standardtypen `Request` und `Response`,
- kapselt Username-Login, Session-Auflösung und den erzwungenen Passwortwechsel,
- bewahrt den bestehenden Identity-Payload, Cookie-Vertrag sowie die bewiesene HTTP-Fehlerabbildung,
- bleibt unabhängig von Hono, Cloudflare, fachlichen Modulen und App-Permissions,
- wird von der Reference-App als erstem realen Consumer verwendet,
- wird von `apps/minimal` als unabhängigem zweiten realen Consumer verwendet,
- benötigt keine allgemeine Runtime-Package-Grenze.

Für den reinen serverseitigen Zugriffsschutz gibt es zusätzlich den schmalen öffentlichen Subpath `@appbasis/identity/access`. Er stellt `assertIdentityActionAllowed` bereit, ohne dass generierte Apps den breiten Identity-Root-Export und dessen serverseitige Better-Auth-/Drizzle-Abhängigkeiten in ihren isolierten Typecheck ziehen müssen.

## Zweite generierte Mini-App

`apps/minimal` ist eine eigenständige Workspace-App mit `modules: []` und `platformServices: ["identity"]`. Sie enthält die vom Generator erzeugte Hono-Komposition und eigene Runtime-Tests für Health und Sign-in über den gemeinsamen Identity-HTTP-Adapter.

Dieser Slice beweist die Kette Manifest V2 → Generator → Generated Runtime → zweiter ausführbarer Identity-App-Consumer.

## Öffentlicher Tasks-Modulvertrag

`modules/tasks` ist als `@appbasis/tasks` ein echtes Workspace-Paket mit öffentlichem Root-Export. Domain, In-Memory-Repository, PostgreSQL-Repository, bestehende Migrationen und fachliches Verhalten bleiben unverändert. Die Reference-App verwendet ausschließlich diesen öffentlichen Paketvertrag; direkte Imports aus `modules/tasks/src` wurden entfernt.

Das Tasks-Modul veröffentlicht außerdem seine stabile fachliche Capability-ID über `TASK_CAPABILITIES.manage = "tasks:manage"`. Die Permission-Engine bleibt generisch und kennt keine Tasks-Semantik; die fachliche Capability wird erst bei der App-Komposition in eine Permission-Capability überführt.

## Generierte autorisierte Tasks-Laufzeit

`apps/tasks-minimal` wird durch den Produktionsgenerator aus `modules: ["tasks"]` und `platformServices: ["identity", "permissions"]` erzeugt. Das generierte Workspace-Paket konsumiert `@appbasis/identity`, `@appbasis/permissions` und `@appbasis/tasks` als echte Workspace-Dependencies.

Der Generator erzeugt fachliche Tasks-HTTP-Routen nur dann, wenn sowohl das Fachmodul `tasks` als auch die Plattformdienste `identity` und `permissions` ausdrücklich deklariert sind. `tasks` zusammen mit `identity` ohne `permissions` bleibt weiterhin bei Health- und Identity-Routen; unbekannte Runtime-Module und Plattformdienste werden fail-closed abgewiesen.

Die generierten Tasks-Routen lösen die aktuelle Identity serverseitig auf, blockieren eingeschränkte Identity-Zustände und prüfen danach deny-by-default die Capability `tasks:manage`. Der generierte App-Test beweist mindestens die drei Sicherheitszustände: keine Session → 401, Session ohne Capability → 403 und berechtigter Principal → Task anlegen und lesen. Das Tasks-Modul selbst beweist weiterhin den Statuswechsel über seinen öffentlichen Repository-Vertrag.

Die Reference-App behält ihre bestehenden fachlichen HTTP-Semantiken und prüft weiterhin sowohl die allgemeine Demo-App-Nutzung als auch `tasks:manage`; lediglich die stabile Tasks-Capability wird aus dem Tasks-Modulvertrag bezogen. Damit ändert sich die bestehende Reference-Berechtigungswirkung nicht.

## Generierte PostgreSQL-Infrastruktur

Für die persistente autorisierte Tasks-Komposition fügt der Produktionsgenerator automatisch `@appbasis/database` als Runtime-Infrastruktur hinzu, ohne `database` in `platformServices` einzutragen. Die generierte Datei `worker/postgres.ts` erstellt aus einer PostgreSQL-Verbindungsadresse einen echten `PostgresTaskRepository` und besitzt einen expliziten Close-Lifecycle.

Generierte Consumer verwenden dafür den schmalen Subpath `@appbasis/database/postgres-runtime`. Der bestehende breitere `@appbasis/database/node-runtime`-Vertrag für interne Identity-/Administrationspfade bleibt unverändert. Damit zieht der isolierte Typecheck einer generierten App nicht die optionalen Drizzle-Adaptertypen für fremde Datenbanksysteme mit hinein; die strikte TypeScript-Prüfung bleibt vollständig aktiv und `skipLibCheck` bleibt aus.

Der Generator erzeugt außerdem einen eigenen PostgreSQL-E2E-Vertrag für `tasks-minimal`. Dieser migriert das Tasks-Schema, führt eine berechtigte Task-Erstellung über die generierte HTTP-Route aus, schließt die Runtime, öffnet eine neue Runtime gegen dieselbe Datenbank und beweist anschließend Lesen, Statusänderung und erneutes Lesen über eine weitere Runtime-Instanz. Die verpflichtende PostgreSQL-CI führt diesen generierten E2E zusätzlich zu den bestehenden Identity- und Reference-PostgreSQL-Tests aus.

Damit ist der persistente Factory-Pfad Manifest → Generator → autorisierte Tasks-HTTP-Runtime → echtes PostgreSQL reproduzierbar geprüft, ohne die Datenbank zum deklarativen App-Plattformdienst zu machen.

## Persistente Permission-Runtime

`@appbasis/permissions` besitzt zusätzlich zum bestehenden `InMemoryPermissionStore` einen `PostgresPermissionStore`, der exakt denselben read-only `PermissionStore`-Vertrag implementiert. Die bestehende Auswertungslogik `can`/`assert` bleibt unverändert: unbekannte Capabilities und unbekannte Principals werden abgelehnt, direkte Grants erlauben, Revokes haben Vorrang und Rollen liefern ihre zugeordneten Capabilities.

Die Permission-Persistenz besitzt einen eigenen migrationsverantwortlichen Bereich unter `packages/permissions/migrations`. Der zentrale Migrationsvertrag registriert damit drei getrennte Owner (`identity`, `permissions`, `tasks`) und vier Migrationen. Die Permission-Tabellen speichern bekannte Capabilities, Rollen, Rollen-Capabilities, Principals, Principal-Rollen sowie individuelle Grants und Revokes.

Ein realer PostgreSQL-E2E erzeugt pro Lauf eine zufällige disposable Testdatenbank, migriert dort das Permission-Schema und beweist Rolle, Direkt-Grant, Revoke-Priorität sowie deny-by-default gegen den echten `PostgresPermissionStore`. Die verpflichtende PostgreSQL-CI führt diesen Test zusätzlich zu Identity, Reference-Tasks und dem generierten Tasks-Runtime-E2E aus.

Dieser Slice führt bewusst **keinen** neuen Manifest-Plattformdienst und keine neue Permission-Semantik ein. Ebenso bleibt die bestehende Reference-Laufzeit vorerst unverändert; der PostgreSQL-Store schafft die persistente Runtime-Grenze, die eine unabhängig deploybare generierte App im nächsten Schritt benötigt.

## Nächster technischer Meilenstein

Der nächste Factory-Slice ist die reproduzierbare Deployment-Komposition für eine unabhängig deploybare generierte App: Identity-Runtime, persistente Permissions und Tasks-Persistenz aus der Deployment-Umgebung binden, Health und geschützte Tasks-Routen in einer echten generierten Worker-Entrypoint-Komposition starten und anschließend einen automatisierten Smoke gegen eine isolierte Preview-Umgebung beweisen. Dabei sollen keine Provider-IDs, Secrets oder Infrastrukturdetails in das App-Manifest verschoben werden.
