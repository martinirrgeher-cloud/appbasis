# AppBasis Projektstand

## Phase

Phase 3B – Deterministic App Skeleton Generator

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

## App-Manifest V1

Jede App unter `apps/` besitzt `appbasis.app.json`. Der Vertrag beschreibt aktuell ausschließlich Schema-Version, App-ID, sichtbaren App-Namen und explizit aktivierte Module. `verify:apps` prüft Manifestform, Verzeichnisbindung und vorhandene Modul-IDs fail-closed als Bestandteil von `verify:repo`.

## Aktueller Factory-Slice

`pnpm appbasis:create` erzeugt aus expliziten CLI-Eingaben ein neues App-Skelett unter `apps/<appId>/`.

Der Generator:

- verwendet denselben Manifest-Vertrag wie CI,
- lehnt unbekannte Module vor dem Schreiben ab,
- überschreibt niemals eine vorhandene App,
- erzeugt Dateien zunächst in einem temporären Verzeichnis und benennt dieses erst nach vollständigem Schreiben auf den Zielpfad um,
- erzeugt ausschließlich deterministischen Manifest-/README-Inhalt ohne Secrets oder Provider-Daten,
- kopiert bewusst keine Reference-Runtime.

Das Ergebnis ist in Phase 3B noch kein lauffähiges zweites Frontend, sondern die sichere deklarative und technische Erzeugungsgrenze für den nächsten Factory-Schritt.

## Nächster technischer Meilenstein

Phase 3C – kleinste wiederverwendbare Runtime-Komposition und erste zweite lauffähige Mini-App.

Dafür werden nur diejenigen neutralen Teile aus dem bewiesenen Reference-Vertical-Slice extrahiert, die die zweite App tatsächlich wiederverwenden kann. Erst danach wird der Generator um lauffähige Runtime-Ausgabe erweitert. Damit entsteht keine zweite handkopierte Implementierung von Identity, Datenbank, Permissions, CI oder Deployment.
