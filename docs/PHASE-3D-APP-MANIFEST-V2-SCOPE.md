# Phase 3D – App Manifest V2 Platform Services

## Ziel

Der App-Manifest-Vertrag enthält die Informationen, die konkrete Apps für ihre bewiesenen AppBasis-Fähigkeiten benötigen: aktivierte Fachmodule und ausdrücklich gewählte Plattformdienste. Provider- und Persistenzinfrastruktur bleibt davon getrennt.

## Vertrag V2

Jede ausführbare App unter `apps/<appId>/` besitzt `appbasis.app.json` mit genau diesen Feldern:

- `schemaVersion`: exakt `2`
- `appId`: stabiler technischer Bezeichner; entspricht dem Verzeichnisnamen
- `displayName`: sichtbarer, getrimmter App-Name
- `modules`: eindeutige Liste aktivierter Fachmodule
- `platformServices`: eindeutige Liste explizit aktivierter Plattformdienste

Der V2-Vertrag ersetzt V1 fail-closed. Alte V1-Manifeste werden nicht stillschweigend hochgestuft.

## Bewiesene Plattformdienste

V2 akzeptiert aktuell ausschließlich:

- `identity`
- `permissions`

`identity` steht für die bewiesene Identity-Fähigkeit einschließlich des öffentlichen HTTP-Adapters `@appbasis/identity/http`.

`permissions` steht für die bewiesene serverseitige deny-by-default Capability-Fähigkeit aus `@appbasis/permissions`. Die Zulassung dieses zweiten Service erweitert den ursprünglichen Phase-3D-Vertrag bewusst, ohne Rollen-, Grant-/Revoke- oder Permission-Semantik zu verändern.

Andere vorhandene Paketverzeichnisse werden dadurch nicht automatisch zu Manifest-Plattformdiensten. Insbesondere ist `database` **kein** Manifest-Plattformdienst: PostgreSQL bleibt Runtime-/Deployment-Infrastruktur und wird vom Generator nur dann verdrahtet, wenn die gewählte Fach-/Plattform-Komposition Persistenz tatsächlich benötigt.

## Generatorvertrag

`appbasis:create` akzeptiert den wiederholbaren Parameter:

```text
--platform-service identity
--platform-service permissions
```

Plattformdienste werden nie implizit aktiviert. Ohne Parameter entsteht `platformServices: []`.

Der Generator bleibt fail-closed: Die Freigabe einer Service-ID im Manifest bedeutet nicht automatisch, dass fachliche HTTP-Routen erzeugt werden. Tasks-Routen entstehen nur aus der ausdrücklich bewiesenen Kombination `tasks` + `identity` + `permissions`. Persistente Infrastruktur wird daraus abgeleitet und nicht als zusätzliche Manifest-Service-ID verlangt.

## Sicherheitsgrenzen

Unverändert bleiben:

- Staging außerhalb von `apps/`
- atomare Zielreservierung
- gemeinsamer Registry-Lock mit `verify:apps`
- kein Überschreiben bestehender Apps
- fail-closed Prüfung unbekannter Module und Plattformdienste
- keine Secrets, Provider-IDs, Datenbankadressen, Benutzer, Rollen oder Cloud-Ressourcen im Manifest

## Reference-App

Die Reference-App deklariert passend zu ihrer bewiesenen Laufzeit:

```json
"platformServices": ["identity", "permissions"]
```

Ihre PostgreSQL-/Hyperdrive-Infrastruktur bleibt außerhalb des Manifests. Damit stimmen deklarierte Plattformfähigkeiten und tatsächliche Runtime überein, ohne Infrastrukturdetails zum App-Vertrag zu machen.

## Aktueller Factory-Beweis

Für `tasks-minimal` erzeugt die autorisierte Komposition geschützte Tasks-Routen. Die persistente Variante ergänzt automatisch die PostgreSQL-Runtime-Infrastruktur und wird in CI gegen echtes PostgreSQL geprüft. Der Manifest-Vertrag selbst bleibt dabei unverändert auf den fachlichen und plattformbezogenen Angaben.
