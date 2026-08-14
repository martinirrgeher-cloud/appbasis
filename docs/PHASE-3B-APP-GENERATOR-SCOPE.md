# Phase 3B – Deterministic App Skeleton Generator

## Ziel

AppBasis erhält den ersten echten Erzeugungspfad für eine neue konkrete App-Definition. Der Generator soll noch keine bestehende App kopieren, sondern ausschließlich den bereits versionierten App-Manifest-Vertrag deterministisch und sicher erzeugen.

## Kommando

```text
pnpm appbasis:create -- --app-id checklist --display-name "Checklist" --module tasks
```

`--module` darf mehrfach angegeben oder vollständig weggelassen werden.

## Erzeugtes Ergebnis

Der Generator legt unter `apps/<appId>/` genau zwei Dateien an:

- `appbasis.app.json` – kanonische V1-App-Definition
- `README.md` – expliziter Hinweis, dass es sich in Phase 3B noch um ein Factory-Skelett ohne Runtime-Komposition handelt

Die erzeugten Dateien enthalten keine Zeitstempel, Zufallswerte, Provider-IDs oder Secrets. Gleiche Eingaben erzeugen deshalb inhaltlich dasselbe Ergebnis.

## Sicherheits- und Konsistenzgrenzen

Vor jeder Schreiboperation werden App-ID, Anzeigename und Modul-IDs durch denselben Manifest-Vertrag geprüft, den auch CI verwendet. Zusätzlich gilt:

- unbekannte Module werden vor dem Schreiben abgelehnt,
- ein vorhandenes Zielverzeichnis wird niemals überschrieben,
- Dateien werden zuerst in einem temporären Verzeichnis im Repository, aber bewusst **außerhalb von `apps/`**, vollständig erzeugt,
- dadurch kann ein nach Prozessabbruch verbleibendes Staging-Verzeichnis niemals als App entdeckt werden,
- vor der Veröffentlichung wird pro App-ID ein exklusiver Publikations-Claim außerhalb von `apps/` angelegt,
- der endgültige Pfad `apps/<appId>` wird anschließend mit einem atomaren `mkdir` ohne Ersetzen reserviert; entsteht das Ziel während des Stagings durch einen anderen Prozess, bricht der Generator ab und lässt dieses Ziel unverändert,
- während der kurzen Reservierungsphase erkennt `verify:apps` den **aktiven** Publikations-Claim und behandelt das noch manifestlose Ziel nicht als fertige App,
- `README.md` und zuletzt das bereits vollständig erzeugte `appbasis.app.json` werden erst nach erfolgreicher Zielreservierung veröffentlicht,
- bei einem normalen Fehler werden nur die vom laufenden Generator selbst reservierten unvollständigen Ausgaben sowie sein Staging entfernt,
- ein verwaister oder ungültiger Publikations-Claim wird nicht automatisch gelöscht, sondern fail-closed gemeldet,
- nach abgeschlossener Veröffentlichung greift der normale strenge App-Manifest-Vertrag ohne Ausnahme.

Der Generator erzeugt keine Datenbank, keine Migration, keine Cloud-Ressource, keinen Benutzer und keine Berechtigung.

## Warum noch keine kopierte Runtime

Die Reference-App enthält heute den bewiesenen Vertical Slice, ist aber nicht selbst eine Vorlage. Würde Phase 3B deren Frontend-, Worker- oder Deployment-Dateien einfach kopieren, entstünde bereits bei der zweiten App paralleler Code für Identity, Permissions, Datenbank und Runtime-Komposition.

Darum erzeugt dieser Slice absichtlich nur die deklarative App-Grenze. Wiederverwendbare Runtime-Bausteine werden erst extrahiert, wenn die zweite lauffähige App den konkreten Bedarf belegt.

## Abnahme

Automatisierte Tests beweisen:

1. den expliziten CLI-Vertrag,
2. deterministischen Manifest-Inhalt,
3. Kompatibilität mit `verifyAppDefinitions`,
4. dass ein unterbrochenes Staging-Verzeichnis außerhalb von `apps/` die App-Erkennung nicht beeinflusst,
5. dass ein paralleler `verify:apps`-Lauf eine aktive Veröffentlichung nicht als defekte App wertet,
6. dass ein nach dem Staging entstandenes Zielverzeichnis nicht ersetzt oder gelöscht wird,
7. fail-closed Verhalten bei unbekannten Modulen,
8. Schutz vor Überschreiben bereits vorhandener Apps.

Die Generator-Tests laufen als Bestandteil von `verify:apps` und damit von `verify:repo`.

## Nächster Slice

Phase 3C soll die kleinste tatsächlich wiederverwendbare Runtime-Komposition aus dem bewiesenen Reference-Vertical-Slice extrahieren. Danach kann der Generator erstmals eine zweite lauffähige Mini-App erzeugen, ohne Reference-Dateien oder Core-Funktionen zu duplizieren.
