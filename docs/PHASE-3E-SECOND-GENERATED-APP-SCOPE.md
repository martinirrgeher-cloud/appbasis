# Phase 3E – Second Generated App

## Ziel

Manifest V2 und der unabhängig geprüfte Generated-Runtime-Template-Baustein werden erstmals im Generator verbunden. Eine zweite lauffähige Mini-App muss anschließend den gemeinsamen Identity-HTTP-Vertrag als echter zweiter Consumer belegen.

## Generatorvertrag

`appbasis:create` erzeugt weiterhin zunächst vollständig außerhalb von `apps/` in einem Staging-Verzeichnis.

Wenn das Manifest `platformServices: ["identity"]` enthält, ergänzt der Generator die Dateien aus `createIdentityRuntimeTemplate`. Ohne `identity` werden keine Runtime-Dateien implizit erzeugt.

Die Publikation bleibt fail-closed:

- Zielverzeichnis atomar reservieren,
- generierte Runtime vollständig publizieren,
- `appbasis.app.json` zuletzt publizieren,
- gemeinsamer Registry-Lock mit `verify:apps`,
- bestehende App-Verzeichnisse niemals ersetzen,
- bei Fehlern unvollständige Reservierungen vollständig entfernen.

Damit kann App-Discovery keine Manifestdatei beobachten, bevor die zugehörige generierte Runtime vollständig vorhanden ist.

## Zweiter Consumer

`apps/minimal` ist der zweite reale Consumer von `@appbasis/identity/http`.

Die App besitzt bewusst:

- `modules: []`,
- `platformServices: ["identity"]`,
- ein eigenes Workspace-Paket `@appbasis/app-minimal`,
- einen kleinen Hono-Runtime-Einstieg,
- Health-, Sign-in-, Session- und Required-Password-Change-Routen,
- eigene TypeScript- und Vitest-Verträge.

Die Identity-Routen verwenden ausschließlich den gemeinsamen Adapter aus `@appbasis/identity/http`. Es gibt keine Imports aus der Reference-App und keine Abhängigkeiten zu Tasks oder Permissions.

## Was dieser Slice beweist

- Manifest V2 steuert die explizite Runtime-Auswahl.
- Der Generator kann aus einer kleinen App-Definition eine ausführbare Workspace-App erzeugen.
- `@appbasis/identity/http` ist nicht nur eine Reference-Extraktion, sondern von zwei unabhängigen Apps verwendbar.
- Die Runtime-Erzeugung benötigt weiterhin kein allgemeines Runtime-Framework.

## Nicht Teil dieses Slices

- neue Plattformdienste neben `identity`,
- Datenbank-Provisionierung für die zweite App,
- Permission-Komposition,
- Fachmodule in `apps/minimal`,
- Deployment-Konfiguration der zweiten App,
- weitere Shared-Runtime-Abstraktionen ohne belegten zweiten Bedarf.

## Nächster Architekturpunkt

Nach diesem Nachweis dürfen neue gemeinsame Runtime-Bausteine nur aus konkreter Doppelverwendung von Reference und zweiter App entstehen. Der nächste Factory-Slice sollte deshalb einen echten Fachmodul-Consumer oder eine weitere klar belegte Plattformfähigkeit hinzufügen, statt vorsorglich ein allgemeines Framework aufzubauen.
