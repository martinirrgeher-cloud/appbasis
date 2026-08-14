# AppBasis Projektstand

## Phase

Phase 3A – App Manifest Foundation

## Ziel

Der vollständige Reference-Vertical-Slice ist als Demo v0.1 bewiesen. Der Fokus wechselt damit vom Nachweis einzelner Plattformfähigkeiten zur eigentlichen App-Fabrik: konkrete Apps sollen künftig aus kleinen, maschinenlesbaren Definitionen reproduzierbar aufgebaut werden, ohne Auth, Datenbank, Berechtigungen, CI und Deployment jeweils neu zu implementieren.

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

## Aktueller Factory-Slice

Jede ausführbare App erhält eine kleine Datei `appbasis.app.json`. Der V1-Vertrag beschreibt zunächst ausschließlich:

- Schema-Version,
- stabile App-ID,
- sichtbaren App-Namen,
- explizit aktivierte Module.

`verify:apps` prüft diesen Vertrag fail-closed und ist Bestandteil von `verify:repo`. Die Reference-App deklariert aktuell nur das bereits bewiesene Modul `tasks`.

Provider-IDs, Secrets, Deployment-Ziele, Benutzer, Berechtigungen, Navigation und frei definierbare Konfiguration gehören bewusst noch nicht in den Manifest-Vertrag. Solche Felder werden erst bei belegtem Generator- oder Zweit-App-Bedarf ergänzt.

## Nächster technischer Meilenstein

Phase 3B – erster deterministischer App-Generator.

Ziel ist eine zweite minimale App, die aus dem AppBasis-Manifest bzw. einer kleinen Generator-Eingabe erzeugt wird. Der Erfolg ist nicht eine zweite handgebaute Demo, sondern der Nachweis, dass die bestehende Plattform wiederverwendet wird und keine parallelen Implementierungen von Identity, Datenbank, Permissions, CI oder Deployment entstehen.
