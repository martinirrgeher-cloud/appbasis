# AppBasis Projektstand

## Phase

Phase 3G – Generated Authorized Tasks Runtime

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

Als Manifest-Plattformdienste sind `identity` und `permissions` ausdrücklich zugelassen. Andere Paketverzeichnisse werden nicht vorsorglich als Plattformdienste freigegeben. Die Zulassung von `permissions` erweitert nur den deklarativen V2-Vertrag; Permission-Semantik, Rollen, Grants/Revokes und bestehende deny-by-default Regeln bleiben unverändert. Die Reference-App deklariert jetzt passend zu ihrer bereits bestehenden Laufzeit `platformServices: ["identity", "permissions"]`.

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

Die Reference-App behält ihre bestehenden fachlichen HTTP-Semantiken und prüft weiterhin sowohl die allgemeine Demo-App-Nutzung als auch `tasks:manage`; lediglich die stabile Tasks-Capability wird jetzt aus dem Tasks-Modulvertrag bezogen. Damit ändert sich die bestehende Reference-Berechtigungswirkung nicht.

## Nächster technischer Meilenstein

Der nächste Factory-Slice ist nicht eine weitere vorsorgliche Abstraktion, sondern ein persistenter generierter Vertical-Slice: die generierte Tasks-App soll mit derselben autorisierten Runtime-Komposition gegen echtes PostgreSQL laufen. Zielbeweis ist Manifest → Generator → Identity → Permission → Tasks → PostgreSQL mit Create/List/Statusänderung. Danach folgt die reproduzierbare Deployment-Komposition für eine unabhängig deploybare generierte App.
