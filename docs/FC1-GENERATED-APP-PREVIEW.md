# FC1 – generischer Preview-Lifecycle für erzeugte Apps

Stand: 2026-09-18

## Ziel

Der FC1-Preview-Pfad macht eine neu über die AppFactory erzeugte, unterstützte App erstmals als echte Webanwendung in einer eigenen Preview-Umgebung erreichbar.

Der Preview-Lifecycle bleibt strikt von Produktion getrennt. Kein erfolgreicher Preview-Schritt setzt Security & Privacy Ready, Production Ready oder eine finale Release-Freigabe.

## Voraussetzung einer preview-fähigen erzeugten App

Vor Provider-Zugriff validiert der kanonische Preview-Vertrag:

- veröffentlichte `appbasis.app.json`
- persistiertes App-Theme bzw. dessen kanonisch geladener Zustand
- generiertes Workspace-Paket `@appbasis/app-<appId>`
- kanonisches `appbasis.database.json`
- generierter Worker `worker/index.ts`
- generierte Weboberfläche `worker/ui.ts`
- dedizierter Preview-Wrapper `worker/preview.ts`
- Identity als Plattformdienst

Fehlt ein erforderliches Artefakt oder widerspricht es der ausgewählten App, endet der Lifecycle fail-closed vor einem Provider-Write.

## Isolierte Preview-Ziele

Aus der `appId` werden deterministisch eigene Preview-Ziele abgeleitet:

- GitHub Environment: `generated-preview-<appId>`
- Worker: `appbasis-<appId>` (bei langen IDs deterministisch gekürzt und gehasht)
- Hyperdrive: `appbasis-<appId>-preview`
- PostgreSQL-Datenbank: `appbasis_<appId>_preview` mit Unterstrichen statt Bindestrichen; bei langen IDs deterministisch gekürzt und gehasht

Damit darf eine neue App nicht still die Preview-Ressourcen von `tasks-minimal`, Reference oder Produktion wiederverwenden.

## Geschützte Environment-Werte

Das app-spezifische GitHub Environment benötigt für die jeweils verwendeten Operationen:

- `APPBASIS_DATABASE_URL`: direkte authentifizierte Neon-/PostgreSQL-Verbindung auf exakt die abgeleitete Preview-Datenbank
- `CLOUDFLARE_ACCOUNT_ID`
- `CLOUDFLARE_API_TOKEN`
- `APPBASIS_BETTER_AUTH_SECRET` für Worker-Bootstrap und Deploy

Secretwerte werden nicht in Repository-Artefakte geschrieben.

## Operationen

Der Workflow **Generated App Preview Lifecycle** führt absichtlich immer nur eine mutierende Operation aus. Jede Operation benötigt `apply=true`.

1. **hyperdrive**
   - legt ausschließlich das dedizierte Preview-Hyperdrive an bzw. validiert den bereits vorhandenen exakten Zielvertrag.
   - automatisches Provider-Provisioning durch Wrangler bleibt deaktiviert.

2. **migrate**
   - rekonstruiert den erwarteten Datenbankvertrag aus der kanonischen App-Zusammensetzung,
   - vergleicht ihn mit dem veröffentlichten Datenbankmanifest,
   - verlangt die dedizierte Preview-Datenbank,
   - wendet Migrationen atomar nur auf ein leeres Public-Schema an.

3. **bootstrap**
   - verlangt ein bereits korrektes Hyperdrive,
   - erzeugt den dedizierten Worker nur, wenn er nachweislich noch nicht existiert,
   - installiert das geschützte Better-Auth-Secret,
   - führt keine Migration und keine Benutzerprovisionierung aus.

4. **deploy**
   - verlangt den bereits gebootstrappten Worker,
   - validiert den Bundle-Build ohne automatisches Provisioning,
   - synchronisiert das erforderliche Worker-Secret,
   - deployed den Preview-Wrapper,
   - prüft anschließend Health, generierte HTML-/CSP-Oberfläche, fail-closed Session-Grenze und reale Datenbank-Erreichbarkeit.

## Reihenfolge für eine neue echte App

Für die erste neu erzeugte App ist die vorgesehene Reihenfolge:

`hyperdrive → migrate → bootstrap → deploy`

Erst nach erfolgreichem `deploy` gilt die technische Preview als erreichbar. Benutzer-/Rollen-Provisionierung und fachliche Abnahme bleiben eigene nachfolgende Schritte.

## Initialer Preview-Zugang nach dem Deploy

Der initiale Login bleibt bewusst **außerhalb** des vierstufigen FC1-Preview-Lifecycles. Dafür gibt es den getrennten Workflow **Generated App Preview Access Bootstrap**.

Er benötigt im app-spezifischen Environment zusätzlich:

- `APPBASIS_ROOT_ADMIN_PASSWORD` für den technischen Better-Auth-Administrator der Preview-Control-Plane
- `APPBASIS_PREVIEW_USER_TEMPORARY_PASSWORD` für den ersten App-Benutzer

Mit `apply=true`:

- wird der technische Better-Auth-Administrator nur bei leerem bzw. recoverablem Ausgangszustand erstellt,
- wird der App-Benutzer `preview.admin` über den bestehenden Identity-Vertrag provisioniert,
- erhält er ausschließlich die für die aktuell unterstützten generierten Module benötigten AppBasis-Berechtigungen,
- verlangt sein erster Login weiterhin den vorgesehenen Passwortwechsel,
- werden keine Produktionsressourcen oder Produktionsbenutzer verändert.

Die technische Administrator-Identität bleibt von AppBasis-Anwendungsidentitäten getrennt und wird nicht als normaler App-Benutzer verwendet.

## Sicherheitsgrenzen

- keine Wiederverwendung der spezialisierten `generated-tasks-preview`-Umgebung
- keine Reference-Preview-Ressourcen
- keine Produktionsressourcen
- kein `--experimental-provision`
- kein `--experimental-auto-create`
- keine Root-Admin- oder Demo-Benutzer-Credentials im generischen Preview-Workflow
- Preview-Erfolg autorisiert niemals Produktion
