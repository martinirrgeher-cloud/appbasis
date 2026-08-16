# M5 – Production Security & Privacy Ready v0.1

## Ziel

Die Factory darf eine App nur dann als `Production Ready` kennzeichnen, wenn sämtliche M5-Pflichtkriterien nachvollziehbar erfüllt sind. Der Gate-Vertrag ist fail-closed: fehlende, unbekannte oder nicht belegte Kriterien ergeben immer `Production Ready = false`.

Dieser vorbereitende Slice erzeugt keine Providerressourcen, verändert keine Produktion, rotiert keine Secrets und führt keine produktive Migration aus.

## Verbindliche Pflichtkriterien

Die aktuelle Roadmap enthält den umfassendsten Pflichtumfang. ADR-011 und Betriebsakte formulieren einen Mindestumfang; die zusätzlichen Roadmap-Punkte konkretisieren bestehende Sicherheitsprinzipien und widersprechen diesem Mindestumfang nicht.

M5 v0.1 verlangt daher alle folgenden Kriterien:

1. Datenregion geklärt
2. AVV/DPA geklärt
3. Verschlüsselung bewertet
4. Rollen/Rechte geprüft
5. Löschkonzept vorhanden
6. Aufbewahrungskonzept vorhanden
7. Datenexport vorhanden oder definiert
8. Audit-/Security-Logging vorhanden
9. Subprozessoren dokumentiert
10. High-Privacy-Profil für sensible Szenarien definiert
11. Secrets/Credentials vom normalen App-Manifest getrennt
12. privilegierte Control-Plane-Funktionen nicht unnötig öffentlich erreichbar

Ein Kriterium darf in v0.1 nicht durch `waived`, `not-applicable` oder einen unbekannten Status umgangen werden. Insbesondere muss ein High-Privacy-Profil als belastbare Policy definiert sein; ob eine konkrete App dieses Profil aktiv benötigt, ist eine spätere App-Entscheidung.

## Vorbereiteter Gate-Vertrag

`tooling/m5-production-security-privacy-readiness.mjs` enthält einen kleinen, providerfreien Evaluator.

Für jedes Pflichtkriterium wird ausschließlich der Status `satisfied` akzeptiert. Zusätzlich ist mindestens ein nichtleerer Eintrag in `evidenceRefs` erforderlich. Diese Referenzen sind Verweise auf Nachweise, nicht die Nachweise selbst.

Wichtig:

- keine Secret-Werte in Evidence-Referenzen
- keine Credentials im normalen App-Manifest
- keine Provider-IDs oder Datenbankadressen als notwendiger Bestandteil des Gate-Vertrags
- keine impliziten Defaults, Waiver oder stillen Ausnahmen
- zusätzliche unbekannte Felder können kein Pflichtkriterium ersetzen

Der Evaluator speichert nichts und entscheidet nicht, wo Evidence dauerhaft liegt. Damit wird noch keine neue Control-Plane-, Datenbank- oder Provider-Abstraktion eingeführt.

### Trust-Grenze

Der Evaluator validiert nur den festen M5-Vertrag, den Status und die Existenz von Evidence-Referenzen. Er beweist nicht selbst, dass ein referenzierter Nachweis fachlich wahr ist.

Darum darf die spätere Factory den Status `satisfied` nur aus einer kontrollierten Factory-/Control-Plane-Quelle übernehmen. Öffentlich oder aus einer normalen App-Runtime gelieferte Payloads dürfen nicht direkt als vertrauenswürdige M5-Evidence verwendet werden. Andernfalls könnte eine App ihr eigenes Production-Ready-Gate selbst bestätigen.

## Bereits automatisierbare und später konkret zu prüfende Punkte

Ein Teil der Kriterien kann später aus bestehenden AppBasis-Verträgen technisch validiert werden, ohne parallele Sicherheitslogik aufzubauen:

- Rollen/Rechte: bestehende Permission- und Role-Admin-Verträge wiederverwenden
- Secrets/Credentials: bestehende Manifest- und Deployment-Grenzen prüfen
- privilegierte Control Plane: bestehende Ingress-/Service-Binding-Grenzen prüfen
- Audit-/Security-Logging: erst an einem realen Audit-Verbraucher konkretisieren; kein allgemeines Audit-Framework auf Vorrat bauen

Compliance-/Organisationspunkte wie AVV/DPA, Subprozessoren, Lösch- oder Aufbewahrungskonzept benötigen nachvollziehbare Evidence und dürfen nicht aus technischen Heuristiken als erfüllt angenommen werden.

## Noch bewusst nicht verdrahtet

Solange M3 und M4 in aktiven Entwicklungssträngen laufen, verändert dieser Prep-Branch bewusst nicht:

- `package.json`
- `.github/workflows/ci.yml`
- Factory-UI oder deren Foundation-Verträge
- App-Manifeste
- Runtime-/Deployment-Verträge
- produktive Providerressourcen

Dadurch bleibt M5 der zulässige Vorbereitungsstrang und kollidiert nicht mit den zwei aktiven Entwicklungssträngen.

## Nächster sicherer M5-Slice

Nach Freiwerden eines aktiven Entwicklungsstrangs:

1. Prep-Branch auf den dann aktuellen `main` synchronisieren.
2. M5-Contract-Test in das verpflichtende Repository-Gate aufnehmen.
3. Factory-Snapshot um einen read-only Production-Readiness-Status erweitern.
4. zunächst nur bestehende, belastbare Verträge als automatische Evidence-Quellen anbinden.
5. fehlende organisatorische Evidence sichtbar als Blocker anzeigen.
6. erst danach einen kontrollierten Produktionsfreigabe-Pfad an das M5-Gate binden.

## DONE bleibt

Dieser Prep-Slice macht M5 nicht DONE.

M5 ist erst DONE, wenn die Factory alle Pflichtkriterien nachvollziehbar prüfen und anzeigen kann und jede fehlende Pflichtinformation die Produktionsfreigabe fail-closed sperrt.
