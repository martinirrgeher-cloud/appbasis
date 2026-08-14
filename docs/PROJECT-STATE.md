# AppBasis Projektstand

## Phase

Phase 3D – App Manifest V2 Platform Services

## Ziel

Der vollständige Reference-Vertical-Slice ist als Demo v0.1 bewiesen. Der Fokus liegt jetzt auf der eigentlichen App-Fabrik: konkrete Apps sollen aus kleinen, maschinenlesbaren Definitionen reproduzierbar aufgebaut werden, ohne Auth, Datenbank, Berechtigungen, CI und Deployment jeweils neu zu implementieren.

## Bewiesenes Fundament

- Monorepo mit gepinnter Node-/pnpm-Toolchain, striktem TypeScript, CI und ausführbaren Repository-Verträgen.
- PostgreSQL-Persistenz mit versionierten, eigentümergetrennten Migrationen.
- Better-Auth-basierte Username-Identity mit technischer `.invalid`-Adresse, erzwungenem Erstpasswortwechsel, Sessions und Deaktivierung.
- technischer Root-Admin als getrennte Auth-Administration; keine Vermischung mit fachlichen AppBasis-Rollen.
- serverseitige deny-by-default Permissions mit Capability-IDs, Rollenbundles und individuellen Grants/Revokes.
- erstes reales Standardmodul `tasks` mit PostgreSQL-Repository und vollständigem Create/List/Status-Vertical-Slice.
- mobile-first React-Reference-App und Cloudflare-Worker-API.
- Neon/PostgreSQL-Preview hinter Cloudflare Hyperdrive.
- Hyperdrive-Query-Caching ist für die Reference-Konfiguration bewusst deaktiviert, damit Auth-, Session-, Permission- und Read-after-write-Pfade frische Daten sehen.
- reproduzierbarer manueller Reference-Preview-Deploy mit Health- und authentifiziertem, mutierendem Demo-Smoke.
- Demo-User-Bootstrap und vollständiger automatisierter Demo-v0.1-Akzeptanzpfad: Login, Session, Berechtigung, Task anlegen, direkt wieder lesen, Status ändern und erneut lesen.

## Demo v0.1 – abgeschlossen

Demo v0.1 gilt als technisch abgeschlossen. Der produktive Preview-Pfad hat den vollständigen User-to-Database-Vertical-Slice gegen reales Neon/PostgreSQL erfolgreich bewiesen. Alte technische Root-Admin-Sessions wurden nach erfolgreicher Demo-Abnahme bereinigt; der Demo-User bleibt aktiv.

## App-Fabrik – bewiesene Grundlagen

Jede App unter `apps/` besitzt `appbasis.app.json`. Der V2-Vertrag beschreibt Schema-Version, App-ID, sichtbaren App-Namen, explizit aktivierte Fachmodule und explizit aktivierte Plattformdienste. `verify:apps` prüft Manifestform, Verzeichnisbindung, vorhandene Modul-IDs und zugelassene Plattformdienste fail-closed als Bestandteil von `verify:repo`.

Als erster Manifest-Plattformdienst ist ausschließlich `identity` zugelassen. Andere Paketverzeichnisse werden nicht vorsorglich als Plattformdienste freigegeben. Die Reference-App deklariert `platformServices: ["identity"]` explizit.

`pnpm appbasis:create` erzeugt deterministische App-Skelette ohne Reference-Copy/Paste. Staging, atomare Zielreservierung und `verify:apps` sind gegen konkurrierende Publikation gehärtet; vorhandene Apps werden niemals ersetzt. Plattformdienste werden nur über explizite Generator-Eingaben aktiviert.

## Bewiesener gemeinsamer Identity-Runtime-Vertrag

Der erste tatsächlich app-übergreifend neutrale Teil des Reference-Runtimes liegt in der bereits zuständigen Plattformfähigkeit: `@appbasis/identity/http`.

Der Adapter:

- verwendet ausschließlich Web-Standardtypen `Request` und `Response`,
- kapselt Username-Login, Session-Auflösung und den erzwungenen Passwortwechsel,
- bewahrt den bestehenden Identity-Payload, Cookie-Vertrag sowie die bewiesene HTTP-Fehlerabbildung,
- bleibt unabhängig von Hono, Cloudflare, fachlichen Modulen und App-Permissions,
- wird von der Reference-App als erstem realen Consumer verwendet,
- benötigt keine neue Dependency und keine neue Workspace-Package-Grenze.

Die Reference-App behält weiterhin ihre fachlichen Tasks-Routen, Task-Berechtigungen, Health-/Fallback-Semantik und Hono-Komposition. Damit wurde nur ein bereits belegter neutraler Vertrag extrahiert, nicht vorsorglich ein allgemeines Runtime-Framework gebaut.

## Nächster technischer Meilenstein

Erste zweite lauffähige Mini-App aus dem Generator.

Der nächste Integrations-Slice verbindet Manifest V2 mit dem unabhängig geprüften Generated-Runtime-Template. Die zweite Mini-App muss den Identity-HTTP-Adapter erstmals mit einem zweiten realen Consumer beweisen. Weitere gemeinsame Runtime-Bausteine werden ausschließlich dann extrahiert, wenn dieser zweite Consumer den Bedarf konkret belegt.
