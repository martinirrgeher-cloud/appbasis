# M5 – Evidence Matrix

## Zweck

Diese Matrix bereitet die Abarbeitung von **Production Security & Privacy Ready v0.1** vor, ohne offene Kriterien vorzeitig als erfüllt zu markieren.

Grundregel:

- Nur app-spezifische, überprüfbare Evidenz darf ein M5-Kriterium auf `verified` setzen.
- Betreiberentscheidung, globale Definition, Repository-Baustein und realer Providerzustand sind unterschiedliche Evidenzklassen.
- Fehlt die für das konkrete Kriterium notwendige Evidenzklasse, bleibt das Kriterium `open`.
- Die Factory bleibt fail-closed: mindestens ein offenes Pflichtkriterium bedeutet `productionReady=false`.

## Evidenzklassen

### Repository

Stabile, ausführbar prüfbare Verträge im Repository, zum Beispiel Manifestgrenzen oder konkrete Security-Konfigurationen.

### App

Nachweise aus der konkreten App, ihren Modulen, Rollen, Data Scopes und getesteten Laufzeitpfaden.

### Provider

Autoritativer Zustand bei Datenbank-, Runtime-, Domain- oder sonstigen Infrastrukturprovidern.

### Betreiber

Explizite fachliche/organisatorische Entscheidung des verantwortlichen Betreibers, zum Beispiel Aufbewahrung oder Löschung.

### Vertrag/Dokumentation

Externe, aktuelle Vertrags-/Compliance-Unterlagen wie DPA/AVV oder Subprozessorenlisten.

## 12 Pflichtkriterien

| # | Kriterium | Notwendige Evidenz | Darf nicht genügen | Aktueller vorbereiteter Stand |
|---|---|---|---|---|
| 1 | Datenregion | konkrete App + autoritativer Providerzustand + Betreiberziel | bloße gewünschte Region | Für die erste reale Produktiv-App ist als Produktionsdatenbankregion EU/Frankfurt vorgesehen; bis zur konkreten Ressource bleibt das Gate offen. |
| 2 | AVV/DPA | aktueller Vertrag/Dokumentationsnachweis für Betreiber und tatsächlich eingesetzte Provider | allgemeine Aussage, dass ein Provider ein DPA anbietet | offen |
| 3 | Verschlüsselung | konkrete Provider-/Runtime-Konfiguration für at-rest/in-transit und relevante Secret-Grenzen | nur allgemeine Providerprodukt-Dokumentation | offen |
| 4 | Rollen & Rechte | konkrete App-Rollen, serverseitige Durchsetzung, Data Scopes und produktionsnaher Permission-Smoke | bloßes Vorhandensein des Permissions-Moduls | offen |
| 5 | Löschkonzept | bestätigte Betreiberregel + konkrete technische Umsetzung/Prozess + Berechtigungs-/Auditgrenze | nur ein vorgeschlagenes Profil | Betreiberprofile Privat/Verein/Firma sind als Vorschläge vorbereitet; erste App zielt auf Verein. Gate bleibt offen. |
| 6 | Aufbewahrung | bestätigte Betreiberregeln je Datenklasse + umsetzbarer/prüfbarer Lebenszyklus | globale Einheitsfrist für alle Daten | Betreiberprofile vorbereitet; Gate bleibt offen. |
| 7 | Datenexport | konkreter app-spezifischer Exportpfad + Data-Scope-/Berechtigungstests + dokumentiertes Format | nur Beschreibung eines gewünschten Exports | Exportumfang in den Profilvorschlägen fachlich vorbereitet; technische Evidenz offen. |
| 8 | Audit-/Security-Logging | konkrete produktive Ereignisse/Logs, Zugriffsschutz, Aufbewahrung und Prüfung | einzelner vorhandener Audit-Log in einem anderen Slice | offen |
| 9 | Subprozessoren | aktuelle dokumentierte Liste für alle tatsächlich verwendeten Provider/Services | historische oder nicht app-bezogene Liste | offen |
| 10 | High-Privacy-Profil | konkrete App-Bindung + kanonischer High-Privacy-Vertrag + nachgewiesene Erfüllung | Existenz des globalen Profils allein | Globaler Vertrag existiert; für die erste echte Produktiv-App ist High Privacy fachlich gewünscht. App-spezifische Evidenz bleibt offen. |
| 11 | Secrets außerhalb App-Manifeste | bestehender strikter App-Manifestvertrag | Annahme über Provider-Secrets | bereits repository-seitig verifiziert |
| 12 | Privilegierte Control Plane getrennt | konkrete App-/Produktionskonfiguration + autoritativer Runtime/Providerzustand | vorhandener isolierter Worker einer anderen App allein | technische Bausteine vorhanden; app-spezifische Produktions-Evidenz offen |

## Schnellste sichere Abarbeitungsreihenfolge

### Phase A – vor Auswahl der konkreten ersten Produktiv-App vorbereitbar

1. Betreiberprofile und Lösch-/Aufbewahrungs-/Export-Defaults dokumentieren.
2. Datenregion-Ziel und High-Privacy-Ziel festhalten, ohne sie als Evidenz zu werten.
3. DPA-/Subprozessoren-Nachweisformat vorbereiten.
4. Prüfkriterien für Verschlüsselung und Control-Plane-Isolation festlegen.

### Phase B – sobald die konkrete erste Produktiv-App feststeht

1. Betreiberprofil explizit an diese App binden.
2. Rollen/Data Scopes und Exportumfang für diese App konkretisieren.
3. Lösch- und Aufbewahrungsregeln je real verwendeter Datenklasse bestätigen.
4. technische App-Nachweise und Tests implementieren.

### Phase C – sobald konkrete Produktionsressourcen existieren dürfen

Diese Phase beginnt erst nach ausdrücklicher Nutzerfreigabe für die jeweilige externe/produktive Aktion.

1. Datenbankregion autoritativ verifizieren.
2. Verschlüsselungs-/Secret-/Runtime-Konfiguration verifizieren.
3. DPA und Subprozessoren gegen die tatsächlich verwendeten Provider prüfen.
4. Control-Plane-Erreichbarkeit verifizieren.
5. produktionsnahe Rollen-/Permission-/Export-/Audit-Smokes ausführen.
6. Erst bei 12/12 belastbaren Nachweisen `productionReady=true` zulassen.

## Aktueller Policy-Input für die erste reale Produktiv-App

Bereits fachlich entschieden, aber noch **nicht als M5-Evidenz zählbar**:

- Betreiberart: **Verein**
- Produktionsdatenbankregion: **EU / Frankfurt**
- High-Privacy-Profil: **ja**

Die technische App `m3-preview` bleibt davon getrennt und wird nicht automatisch zur ersten realen Vereins-Produktiv-App erklärt.

## Sicherheitsgrenze

Diese Matrix:

- ändert keinen M5-Gate-Code,
- erzeugt keine app-spezifischen Verified-Flags,
- verändert kein `appbasis.app.json`,
- führt keine Provideraktion aus,
- erstellt keine Produktionsressource,
- aktiviert keine Produktionsfreigabe.
