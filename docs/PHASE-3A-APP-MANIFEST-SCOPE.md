# Phase 3A – App Manifest Foundation

## Ziel

AppBasis erhält den ersten kleinen, maschinenlesbaren Vertrag für eine konkrete App-Konfiguration. Damit wird die bereits in der Architektur vorgesehene Ebene „konkrete App-Konfiguration“ erstmals ausführbar geprüft und kann in einem späteren Slice als Eingabe für einen Generator dienen.

## Vertrag V1

Jede ausführbare App unter `apps/<appId>/` besitzt eine Datei `appbasis.app.json` mit genau diesen Feldern:

- `schemaVersion`: aktuell exakt `1`
- `appId`: stabiler technischer Bezeichner; muss dem Verzeichnisnamen entsprechen
- `displayName`: sichtbarer, getrimmter App-Name
- `modules`: eindeutige Liste aktivierter Modul-IDs

Eine Modul-ID ist nur gültig, wenn ein gleichnamiges Top-Level-Verzeichnis unter `modules/` existiert.

## Bewusste Grenzen

Der V1-Vertrag enthält ausdrücklich noch keine:

- Provider- oder Cloud-Ressourcen-IDs
- Secrets oder Zugangsdaten
- Deployment-Ziele
- Datenbank-Verbindungsdaten
- Benutzer, Rollen oder individuelle Berechtigungen
- UI-Navigation oder Seitenbeschreibung
- frei definierbare Konfigurationsobjekte
- automatische Verdrahtung von Modulen

Diese Informationen werden nicht vorsorglich in den Vertrag aufgenommen. Neue Felder entstehen erst, wenn der nächste reale Factory-Slice sie benötigt und ihr Verhalten durch eine zweite App oder einen konkreten Generatorpfad belegt ist.

## Prüfung

`verify:apps` prüft fail-closed:

1. unter `apps/` existiert mindestens eine App,
2. jedes App-Verzeichnis besitzt `appbasis.app.json`,
3. das Manifest enthält ausschließlich die V1-Felder,
4. `schemaVersion`, IDs und Anzeigename sind gültig,
5. `appId` entspricht dem App-Verzeichnis,
6. Modul-IDs sind eindeutig,
7. jedes aktivierte Modul existiert unter `modules/`.

Die Prüfung ist Teil von `verify:repo` und blockiert damit CI und Releases bei Vertragsdrift.

## Reference-App

Die bestehende Reference-App deklariert sich als `reference` und aktiviert das bereits bewiesene Modul `tasks`. Dieser Slice ändert keine Runtime-, Identity-, Permission-, Datenbank- oder HTTP-Semantik.

## Nächster Slice

Phase 3B soll den Manifest-Vertrag als Eingabe für einen ersten deterministischen Generator verwenden. Der Generator soll zunächst eine zweite minimale App-Struktur erzeugen und dabei beweisen, dass vorhandene AppBasis-Grundlagen wiederverwendet werden, statt Auth, Datenbank, Permissions, CI oder Deployment neu zu implementieren.
