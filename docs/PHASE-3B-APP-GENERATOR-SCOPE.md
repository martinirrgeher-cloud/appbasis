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
- nur die kurze Veröffentlichungsphase und `verify:apps` teilen denselben exklusiven App-Registry-Lock,
- ein aktiver Lock wird von der Gegenoperation nur begrenzt abgewartet; ein verwaister oder ungültiger Lock führt fail-closed zum Abbruch,
- `verify:apps` überspringt **niemals** eine Manifest-Prüfung: Es wartet gegebenenfalls auf eine laufende Veröffentlichung und scannt danach wieder vollständig den normalen strengen Zustand,
- der endgültige Pfad `apps/<appId>` wird unter dem Lock mit einem atomaren `mkdir` ohne Ersetzen reserviert; entsteht das Ziel während des Stagings durch einen anderen Prozess, bricht der Generator ab und lässt dieses Ziel unverändert,
- erst nach erfolgreicher Zielreservierung werden `README.md` und zuletzt das bereits vollständig erzeugte `appbasis.app.json` veröffentlicht,
- bei einem normalen Fehler werden nur die vom laufenden Generator selbst reservierten unvollständigen Ausgaben sowie sein Staging entfernt,
- nach erfolgreicher Veröffentlichung wird der Registry-Lock freigegeben und jede nachfolgende Verifikation sieht ausschließlich den vollständigen App-Zustand.

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
5. dass ein paralleler `verify:apps`-Lauf während einer Veröffentlichung blockiert und erst nach Abschluss den vollständigen Zustand streng prüft,
6. dass ein nach dem Staging entstandenes Zielverzeichnis nicht ersetzt oder gelöscht wird,
7. fail-closed Verhalten bei unbekannten Modulen,
8. Schutz vor Überschreiben bereits vorhandener Apps.

Die Generator-Tests laufen als Bestandteil von `verify:apps` und damit von `verify:repo`.

## Nächster Slice

Phase 3C soll die kleinste tatsächlich wiederverwendbare Runtime-Komposition aus dem bewiesenen Reference-Vertical-Slice extrahieren. Danach kann der Generator erstmals eine zweite lauffähige Mini-App erzeugen, ohne Reference-Dateien oder Core-Funktionen zu duplizieren.
