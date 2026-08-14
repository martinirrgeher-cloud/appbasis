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

V2 akzeptiert zunächst ausschließlich:

- `identity`

`identity` steht für die bereits bewiesene Identity-Fähigkeit einschließlich des öffentlichen HTTP-Adapters `@appbasis/identity/http`.

Andere vorhandene Paketverzeichnisse werden dadurch nicht automatisch zu Manifest-Plattformdiensten. Eine neue Service-ID wird erst zugelassen, wenn ein konkreter App-Slice ihren wiederverwendbaren Vertrag belegt.

## Generatorvertrag

`appbasis:create` akzeptiert zusätzlich den wiederholbaren Parameter:

```text
--platform-service identity
```

Plattformdienste werden nie implizit aktiviert. Ohne Parameter entsteht `platformServices: []`.

Der Generator bleibt in diesem Slice ein sicherer deklarativer Publisher. Die Runtime-Erzeugung wird als separater, unabhängig geprüfter Template-Baustein entwickelt und erst nach dessen eigener Abnahme integriert.

## Sicherheitsgrenzen

Unverändert bleiben:

- Staging außerhalb von `apps/`
- atomare Zielreservierung
- gemeinsamer Registry-Lock mit `verify:apps`
- kein Überschreiben bestehender Apps
- fail-closed Prüfung unbekannter Module und Plattformdienste
- keine Secrets, Provider-IDs, Benutzer, Rollen oder Cloud-Ressourcen im Manifest

## Reference-App

Die Reference-App wird auf V2 migriert und deklariert explizit:

```json
"platformServices": ["identity"]
```

Das ändert keine bestehende Runtime-, Session-, Permission-, Datenbank- oder Deployment-Semantik.

## Nächster Schritt

Nach unabhängiger Abnahme des Generated-Runtime-Templates werden Manifest V2 und Runtime-Template im Generator verbunden. Eine zweite lauffähige Mini-App muss anschließend `@appbasis/identity/http` als zweiten realen Consumer verwenden.
