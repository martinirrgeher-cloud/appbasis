# M5 – Provider-/Compliance-Evidenz Vorbereitung

## Zweck

Dieses Dokument bereitet die noch offenen M5-Nachweise für **Production Security & Privacy Ready v0.1** vor, ohne einen Providerzustand, Vertrag oder eine konkrete Produktions-App vorzeitig als verifiziert zu markieren.

Es konkretisiert ausschließlich die Evidenzanforderungen für:

- Datenregion
- AVV / DPA
- Verschlüsselung
- Audit-/Security-Logging
- Subprozessoren
- privilegierte Control-Plane-Isolation

Die übrigen M5-Pflichtkriterien bleiben in `M5-EVIDENCE-MATRIX.md` maßgeblich.

## Grundregel

Ein M5-Kriterium darf nur dann `verified` werden, wenn der Nachweis zur **konkreten App und zu den tatsächlich verwendeten Produktionsressourcen** passt.

Nicht ausreichend sind insbesondere:

- gewünschte Zielwerte ohne reale Ressource,
- allgemeine Produkt- oder Marketingdokumentation,
- Nachweise einer anderen App oder Umgebung,
- historische Providerzustände,
- Screenshots oder Dokumente ohne nachvollziehbare Zuordnung,
- Repository-Konfiguration allein, wenn der reale Providerzustand abweichen kann.

Fehlt die notwendige Evidenz, bleibt das Kriterium offen und `productionReady=false`.

## Gemeinsames Evidenzformat

Für jeden Provider-/Compliance-Nachweis sollen mindestens festgehalten werden:

- `criterion`: betroffenes M5-Kriterium
- `app`: konkrete Ziel-App
- `environment`: ausschließlich die relevante Produktionsumgebung
- `providerOrService`: tatsächlich verwendeter Provider bzw. Dienst
- `evidenceClass`: `repository`, `app`, `provider`, `operator` oder `contractDocumentation`
- `observedAt`: Zeitpunkt der tatsächlichen Prüfung
- `source`: nachvollziehbare Quelle oder autoritativer Providerzustand
- `result`: `verified` oder `open`
- `reason`: kurze Begründung
- `validUntilOrReviewAt`: falls der Nachweis altern oder sich ändern kann

Ein einzelner Datensatz darf nur das Kriterium belegen, dessen notwendige Evidenz er vollständig erfüllt.

## 1. Datenregion

### Erforderlich

- konkrete Produktions-App steht fest
- konkrete Produktionsressource steht fest
- autoritativer Providerzustand nennt Region/Standort bzw. die tatsächlich zugesicherte Datenlokation
- Betreiberziel und Providerzustand widersprechen einander nicht
- relevante Datenflüsse werden getrennt betrachtet; aus der Datenbankregion darf keine allgemeine Region aller beteiligten Dienste abgeleitet werden

### Fail-closed

`open`, wenn:

- nur eine Wunschregion dokumentiert ist,
- die Ressource noch nicht existiert,
- der Providerzustand nicht autoritativ geprüft wurde,
- wesentliche personenbezogene Datenflüsse ungeklärt sind.

## 2. AVV / DPA

### Erforderlich

Für jeden tatsächlich personenbezogene Daten verarbeitenden Provider/Dienst:

- aktueller AVV-/DPA-Nachweis
- eindeutige Zuordnung zum verantwortlichen Betreiber
- Abdeckung der tatsächlich eingesetzten Dienste
- Dokumentversion bzw. Stand/Prüfdatum
- dokumentierte Prüfung, ob ergänzende Bedingungen für den konkreten Einsatz erforderlich sind

### Nachweisformat

Mindestens:

- Provider/Dienst
- Dokumentbezeichnung
- Version/Stand
- geprüfter Geltungsbereich
- Quelle/Referenz
- Prüfdatum
- Ergebnis/Restpunkt

### Fail-closed

`open`, wenn ein tatsächlich relevanter Provider nicht abgedeckt oder die Gültigkeit nicht nachvollziehbar ist.

## 3. Verschlüsselung

Die Bewertung muss **at rest** und **in transit** getrennt abdecken.

### Datenbank / persistente Daten

Prüfen:

- Verschlüsselung ruhender Daten laut konkretem Provider-/Produktzustand
- TLS/gesicherte Verbindung für Datenbankzugriffe
- keine Klartext-Credentials im normalen App-Manifest oder Repository
- relevante Backupdaten werden in die Bewertung einbezogen

### Runtime / Transport

Prüfen:

- produktive externe Endpunkte nur über gesicherte Transportwege
- interne privilegierte Verbindungen verwenden den vorgesehenen sicheren Binding-/Service-Pfad
- keine unbeabsichtigten Klartext-Providerbindings oder Secrets

### Fail-closed

`open`, wenn nur allgemeine Providerdokumentation vorliegt oder die konkrete Produktionskonfiguration nicht geprüft wurde.

## 4. Audit-/Security-Logging

### Erforderlich

Für die konkrete App sind mindestens zu bewerten:

- sicherheitsrelevante Rollen-/Permission-Änderungen
- privilegierte Administration
- relevante Auth-/Security-Ereignisse
- Zugriffsschutz auf Logs/Auditdaten
- vorgesehene Aufbewahrung passend zum bestätigten Betreiberprofil
- Nachvollziehbarkeit von Actor, Aktion, Ziel und Zeitpunkt, soweit fachlich erforderlich

Repository-Auditbausteine anderer Slices sind nur technische Vorbedingungen. M5-Evidenz entsteht erst durch die konkrete App-/Produktionsbindung.

### Fail-closed

`open`, wenn wesentliche privilegierte Aktionen nicht nachvollziehbar sind oder Aufbewahrung/Zugriffsschutz ungeklärt bleiben.

## 5. Subprozessoren

### Erforderlich

Für alle tatsächlich verwendeten Provider/Dienste mit relevanter Datenverarbeitung:

- aktuelle Subprozessorenliste bzw. gleichwertiger Nachweis
- Stand/Prüfdatum
- Zuordnung zu den konkret eingesetzten Diensten
- dokumentierte offene Punkte bei Änderungen oder unklarer Abdeckung

### Änderungsregel

Da Subprozessorenlisten veränderlich sind, muss der Nachweis ein `validUntilOrReviewAt` oder einen vergleichbaren Review-Zeitpunkt erhalten. Ein historischer Nachweis darf nicht dauerhaft als aktuell gelten.

### Fail-closed

`open`, wenn die Liste fehlt, veraltet ist oder nicht zu den tatsächlich verwendeten Diensten passt.

## 6. Privilegierte Control Plane getrennt

### Erforderlich

Für jede privilegierte Control-Plane-Komponente der konkreten Produktion:

- keine unnötige öffentliche Route
- keine unnötige öffentliche Custom Domain
- öffentliche Preview-/Development-Ingress-Pfade deaktiviert, soweit für diese Komponente nicht erforderlich
- nur erwartete Service Bindings
- nur erwartete Secrets/Environment-Bindings
- privilegierter Pfad ist aus der normalen öffentlichen App-Runtime nicht direkt erreichbar
- tatsächlicher Providerzustand wird nach dem Deployment erneut geprüft

Der bestehende Reference-Admin-Worker ist ein Architekturbeleg, aber **keine** app-spezifische Produktions-Evidenz für eine andere App.

### Bereits vorhandenes ausführbares Referenzmuster

Für die reale App `reference` existiert bereits der manuelle Workflow `.github/workflows/m5-reference-control-plane-evidence.yml`.

Er ist absichtlich:

- `workflow_dispatch`-only,
- an `refs/heads/main` gebunden,
- mit `contents: read` minimal berechtigt,
- auf die bestehende `reference-preview`-Umgebung beschränkt,
- read-only gegenüber Cloudflare,
- ohne Deployment-, Secret-, Rollback- oder sonstige Providerwrites.

Der Workflow verifiziert am autoritativen Providerzustand, dass der bereits erzeugte interne Role-Administration-Worker existiert und keinen öffentlichen Ingress besitzt.

Dieser Lauf ist **nur Evidenz für den konkret geprüften Reference-Verbraucher und dessen Umgebung**. Er darf weder `privilegedControlPlaneIsolation` noch ein anderes M5-Kriterium für `ulc-linz` oder eine spätere App automatisch verifizieren. Für jede eigenständige App ist derselbe Evidenztyp erneut gegen deren tatsächliche Runtime-/Providerressourcen zu erbringen.

Der Workflow ist damit ein ausführbares Muster, kein globaler M5-Pass.

### Fail-closed

`open`, wenn Repository-Soll und realer Providerzustand nicht übereinstimmen, die Erreichbarkeit nicht autoritativ geprüft wurde oder nur Evidenz einer anderen App vorliegt.

## Phase-A-Ergebnis

Mit diesem Dokument sind die **Prüf- und Nachweisformate** für die oben genannten Kriterien vorbereitet. Dadurch wird noch kein Kriterium verifiziert.

Der nächste reale Schritt für diese Kriterien beginnt erst, wenn:

1. die konkrete erste Produktiv-App feststeht,
2. ihre tatsächlich verwendeten Provider/Dienste feststehen,
3. produktive Ressourcen mit ausdrücklicher Nutzerfreigabe erzeugt bzw. geprüft werden dürfen.

Bis dahin bleibt M5 fail-closed.
