# Phase 3D – App Manifest V2 Platform Services

## Ziel

Der App-Manifest-Vertrag erhält genau die zusätzliche Information, die der nächste reale Factory-Slice benötigt: welche bewiesenen AppBasis-Plattformdienste eine konkrete App zur Laufzeit verwenden soll.

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

`identity` steht für die bereits bewiesene Identity-Fähigkeit einschließlich des öffentlichen HTTP-Adapters `@appbasis/identity/http`.

`permissions` steht für die bereits bewiesene serverseitige deny-by-default Capability-Fähigkeit aus `@appbasis/permissions`. Die spätere Zulassung dieses zweiten Service erweitert den ursprünglichen Phase-3D-Vertrag bewusst, ohne Rollen-, Grant-/Revoke- oder Permission-Semantik zu verändern.

Andere vorhandene Paketverzeichnisse werden dadurch nicht automatisch zu Manifest-Plattformdiensten. Eine neue Service-ID wird erst zugelassen, wenn ein konkreter App-Slice ihren wiederverwendbaren Vertrag belegt.

## Generatorvertrag

`appbasis:create` akzeptiert den wiederholbaren Parameter:

```text
--platform-service identity
--platform-service permissions
```

Plattformdienste werden nie implizit aktiviert. Ohne Parameter entsteht `platformServices: []`.

Der Generator bleibt fail-closed: Die Freigabe einer Service-ID im Manifest bedeutet nicht automatisch, dass fachliche HTTP-Routen erzeugt werden. Solche Routen entstehen erst in einem separat geprüften Runtime-Slice, der alle dafür benötigten Plattformdienste serverseitig zusammensetzt.

## Sicherheitsgrenzen

Unverändert bleiben:

- Staging außerhalb von `apps/`
- atomare Zielreservierung
- gemeinsamer Registry-Lock mit `verify:apps`
- kein Überschreiben bestehender Apps
- fail-closed Prüfung unbekannter Module und Plattformdienste
- keine Secrets, Provider-IDs, Benutzer, Rollen oder Cloud-Ressourcen im Manifest

## Reference-App

Die Reference-App wurde auf V2 migriert und deklariert zunächst explizit:

```json
"platformServices": ["identity"]
```

Die spätere Manifest-Zulassung von `permissions` ändert diesen bestehenden App-Manifest-Eintrag nicht automatisch. Eine Reference-Umstellung erfolgt erst gemeinsam mit der separat geprüften Permission-Runtime-Komposition, damit deklarierter Vertrag und tatsächliche Laufzeit übereinstimmen.

## Nächster Schritt

Nach der Zulassung von `permissions` als zweitem V2-Plattformdienst wird die autorisierte generierte Fachmodul-Runtime separat integriert. Für Tasks gilt dabei: Identity auflösen, bestehende deny-by-default Permission-Engine serverseitig prüfen und erst danach fachliche HTTP-Aktionen ausführen.
