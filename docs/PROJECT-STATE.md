# AppBasis Projektstand

## Phase

Phase 3F – First Generated Module Consumer

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

Als Manifest-Plattformdienste sind `identity` und `permissions` ausdrücklich zugelassen. Andere Paketverzeichnisse werden nicht vorsorglich als Plattformdienste freigegeben. Die Zulassung von `permissions` erweitert nur den deklarativen V2-Vertrag; Permission-Semantik, Rollen, Grants/Revokes und bestehende Runtime-Verhalten bleiben unverändert. Die Reference-App deklariert bis zur separaten Runtime-Integration weiterhin `platformServices: ["identity"]`.

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
- benötigt keine neue Dependency und keine allgemeine Runtime-Package-Grenze.

Die Reference-App behält weiterhin ihre fachlichen Tasks-Routen, Task-Berechtigungen, Health-/Fallback-Semantik und Hono-Komposition. `apps/minimal` besitzt bewusst keine Fachmodule und keine Permission-Abhängigkeit. Damit ist die Wiederverwendbarkeit des Identity-HTTP-Vertrags durch zwei unterschiedliche Apps belegt, ohne vorsorglich ein allgemeines Runtime-Framework zu bauen.

## Zweite generierte Mini-App

`apps/minimal` ist eine eigenständige Workspace-App mit `modules: []` und `platformServices: ["identity"]`. Sie enthält die vom Generator erzeugte Hono-Komposition und eigene Runtime-Tests für Health und Sign-in über den gemeinsamen Identity-HTTP-Adapter.

Dieser Slice beweist die Kette Manifest V2 → Generator → Generated Runtime → zweiter ausführbarer Identity-App-Consumer.

## Öffentlicher Tasks-Modulvertrag

`modules/tasks` ist als `@appbasis/tasks` ein echtes Workspace-Paket mit öffentlichem Root-Export. Domain, In-Memory-Repository, PostgreSQL-Repository, bestehende Migrationen und fachliches Verhalten bleiben unverändert. Die Reference-App verwendet ausschließlich diesen öffentlichen Paketvertrag; direkte Imports aus `modules/tasks/src` wurden entfernt.

Damit besitzt das erste Fachmodul eine belastbare Consumer-Grenze, ohne seine Logik in Core, Identity oder ein allgemeines Runtime-Paket zu verschieben.

## Erster generierter Fachmodul-Workspace-Consumer

`apps/tasks-minimal` wird durch denselben Produktionsgenerator aus `modules: ["tasks"]` und `platformServices: ["identity"]` erzeugt. Das generierte Workspace-Paket enthält `@appbasis/tasks` als echte Workspace-Dependency und beweist den Modulvertrag in seinem eigenen App-Test gemeinsam mit dem bestehenden Identity-Runtime-Vertrag.

Der Generated-Runtime-Template-Baustein unterstützt dabei bewusst nur das bereits bewiesene Modul `tasks`; unbekannte Runtime-Modulverdrahtungen werden fail-closed abgewiesen.

Dieser Slice erzeugt **keine** ungeschützten Tasks-HTTP-Routen. Der generierte Worker bleibt auf Health und Identity beschränkt, solange für fachliche HTTP-Aktionen kein ausdrücklich freigegebener serverseitiger Permission-Vertrag in der generierten App-Komposition vorhanden ist. Damit ist die Factory-Abhängigkeit und der unabhängige App-Consumer bewiesen, aber noch nicht die autorisierte generierte Tasks-HTTP-Laufzeit.

## Nächster technischer Meilenstein

Der nächste Factory-Slice ist die autorisierte Runtime-Komposition eines generierten Fachmoduls. `permissions` ist dafür nun als zweiter Manifest-V2-Plattformdienst ausdrücklich freigegeben. Der folgende Integrationsschritt muss die bestehende deny-by-default Permission-Engine serverseitig mit Identity und dem Tasks-Modul verbinden; erst dann dürfen generierte Tasks-HTTP-Routen entstehen.
