# M5-G – ULC Provider Evidence Contract

Stand: 2026-08-17

## Zweck

Dieser Vertrag konkretisiert den bereits vorbereiteten M5-G Provider-Evidence-Consumer für `ulc-linz` / `production`.

Er beschreibt ausschließlich normalisierte **read-only Evidence**. Er provisioniert keine Ressourcen, führt keine Deployments aus und verifiziert kein M5-Kriterium allein durch das Vorhandensein öffentlicher Providerdokumentation.

Verbindliche Architekturgrundlage bleibt ADR-022:

- Cloudflare Standard Workers
- `providerModel = standard-workers-global-transient`
- `euOnly = false`
- persistente personenbezogene Primärdaten in der eigenen Neon-Produktivdatenbank in EU / Frankfurt
- keine zusätzlichen Cloudflare-Persistenzdienste für personenbezogene ULC-Daten ohne neue Entscheidung

## Schichten

M5-G trennt strikt drei Schichten:

1. `source evidence`: unveränderte read-only Antworten von Provider-APIs bzw. aktuelle offizielle Provider-/Vertragsquellen
2. `normalized evidence`: kleiner sanitierter, app-spezifischer Vertrag für die Auswertung
3. `criterion result`: ausschließlich `verified` oder `open` je M5-G-Kriterium

Raw-Providerpayloads werden nicht als dauerhafte Factory-Evidence gespeichert. Secretwerte, Tokens, Connection Strings, Cookies und produktive personenbezogene Datensätze dürfen keine Schicht verlassen, in der sie zur Providerkommunikation technisch unvermeidbar sind.

## Normalisierter Snapshot

Der spätere technische Consumer soll semantisch mindestens folgende Struktur erzeugen:

```json
{
  "schemaVersion": 1,
  "application": "ulc-linz",
  "environment": "production",
  "providerModel": "standard-workers-global-transient",
  "euOnly": false,
  "observedAt": "<ISO-8601>",
  "validUntilOrReviewAt": "<ISO-8601>",
  "resourceBinding": {
    "cloudflareProductionRuntimeBound": false,
    "cloudflareProductionRouteBound": false,
    "neonProductionProjectBound": false,
    "neonProductionDatabaseBound": false
  },
  "providers": {
    "cloudflare": {
      "runtimeClass": "standard-workers",
      "bindingsInventoryComplete": false,
      "unexpectedPersonalDataPersistence": null,
      "telemetryInventoryComplete": false
    },
    "neon-postgresql": {
      "regionId": null,
      "regionSource": null,
      "encryptionConfigurationObserved": false
    }
  },
  "legalEvidence": [],
  "dataFlows": [],
  "criteria": {
    "dataRegion": "open",
    "dpa": "open",
    "encryption": "open",
    "subprocessors": "open"
  }
}
```

Die konkrete Implementierung darf zusätzliche interne Felder verwenden, wenn sie für eine sichere Bindung erforderlich sind. Provider-IDs dürfen jedoch nicht in den normalen Factory-UI-Snapshot oder in normale App-Manifeste gelangen.

## Feste Identitätsbindung

Der Normalizer muss vor jeder Kriterienauswertung exakt verlangen:

- `application === "ulc-linz"`
- `environment === "production"`
- `providerModel === "standard-workers-global-transient"`
- `euOnly === false`

Preview-, Reference-, Test- oder fremde App-Evidence ist nicht konvertierbar, sondern ungültig.

## Cloudflare-Feldmapping

Die spätere read-only Cloudflare-Abfrage darf ausschließlich Metadaten für die konkret gebundene ULC-Produktionsruntime lesen.

Normalisiert werden höchstens semantische Aussagen:

- Produktionsruntime eindeutig gebunden: boolean
- Produktionsroute/Hostname eindeutig gebunden: boolean
- Runtimeklasse entspricht Standard Workers: boolean
- vollständiges Binding-Inventar abrufbar: boolean
- unerwartete persistente personenbezogene Cloudflare-Datenpfade vorhanden: `true | false | unknown`
- Logging-/Telemetry-Inventar vollständig: boolean
- Regional Services aktiv: beobachteter Zustand, aber **keine Voraussetzung** für ADR-022
- Customer Metadata Boundary aktiv: beobachteter Zustand, aber **keine Voraussetzung** für ADR-022

Folgende Bindings müssen mindestens inventarisiert werden, soweit real vorhanden oder autoritativ als nicht vorhanden feststellbar:

- Hyperdrive / Datenbankbindung
- KV
- D1
- R2
- Durable Objects
- Queues
- Workflows
- Service Bindings
- sonstige Bindings, die einen zusätzlichen Datenpfad erzeugen können

Unbekannte oder nicht klassifizierbare Bindings lassen `dataRegion` und, soweit relevant, `subprocessors` offen.

## Neon/PostgreSQL-Feldmapping

Die spätere read-only Neon-Abfrage muss die konkrete Produktionsressource autoritativ binden.

Normalisiert werden mindestens:

- ULC-Produktionsprojekt eindeutig gebunden: boolean
- Produktionsbranch/-datenbank eindeutig gebunden: boolean
- autoritative Provider-Region-ID
- Region-Quelle `provider-api`
- relevante Verbindungs-/Encryption-Konfiguration nur als semantische Aussage, niemals als Connection String

Für die bestätigte Zielarchitektur gilt:

- erwartete AWS-Region: `aws-eu-central-1` (Frankfurt), sofern AWS als konkreter Neon-Cloudprovider gewählt wird
- eine Azure-Frankfurt-Region wäre **nicht automatisch äquivalent**; eine Änderung des konkreten Cloudproviders/Regionvertrags muss vor Production explizit bewertet werden
- Hostname-, Projektname- oder lokale Wunschkonfiguration darf eine Provider-Region niemals ersetzen

## Vertrags- und Dokumentevidence

Öffentliche Providerunterlagen werden als veränderliche Baseline behandelt.

Jeder Eintrag in `legalEvidence` benötigt mindestens:

```json
{
  "provider": "cloudflare | neon-databricks",
  "documentType": "dpa | terms | subprocessors | security | region | processing-model",
  "canonicalSource": "<offizielle Quelle>",
  "documentVersionOrUpdatedAt": "<wenn offiziell angegeben>",
  "serviceScope": "<konkreter Dienstbezug>",
  "observedAt": "<ISO-8601>",
  "validUntilOrReviewAt": "<ISO-8601>",
  "accountSpecific": false
}
```

Öffentliche Baseline-Evidence darf `accountSpecific` niemals auf `true` setzen.

### DPA-Evidenz

`dpa = verified` benötigt kumulativ:

1. aktuelle öffentliche Vertrags-/DPA-Baseline für Cloudflare
2. aktuelle öffentliche Vertrags-/DPA-Baseline für Neon/Databricks
3. account-/vertragsbezogenen Nachweis, dass der für ULC verwendete Betreiberaccount tatsächlich unter dem erforderlichen DPA-/Vertragsrahmen steht
4. eindeutigen Dienstbezug zu den tatsächlich verwendeten Services
5. gültige Freshness

Ein veröffentlichter DPA-Text allein verifiziert das Kriterium nicht.

### Subprozessor-Evidenz

`subprocessors = verified` benötigt kumulativ:

1. aktuelle offizielle Cloudflare-Liste für die tatsächlich verwendeten Cloudflare-Services
2. aktuelle für Neon maßgebliche Databricks-Subprozessorliste plus Neon-spezifische Ergänzungen aus dem Product Specific Schedule
3. dokumentierten Dienstbezug der real verwendeten ULC-Komponenten
4. Transfer-/Verarbeitungsmodell konsistent mit ADR-022
5. gültige Freshness

Nicht verwendete optionale Providerprodukte werden nicht künstlich Teil des ULC-Datenpfads. Eine Liste darf aber nicht so gefiltert werden, dass tatsächlich dienstrelevante Subprozessoren verschwinden.

## Verschlüsselungsevidence

`encryption = verified` benötigt zwei Ebenen:

1. **Providerfähigkeit / Vertrag**: aktuelle offizielle Security-/DPA-Evidence zu Transport- und At-Rest-Schutz
2. **reale ULC-Konfiguration**: read-only Nachweis, dass alle tatsächlich relevanten ULC-Datenpfade diese Schutzmechanismen verwenden bzw. keine offene unverschlüsselte Strecke existiert

Providerdokumentation allein reicht nicht. Ebenso reicht eine lokale Wrangler-/Connection-Konfiguration ohne Providerbindung nicht.

## Datenregions-Evidence

`dataRegion = verified` benötigt kumulativ:

- reale Neon-Produktionsressource autoritativ in der bestätigten Frankfurt-Region
- Cloudflare-Modell exakt ADR-022: Standard Workers, globale transiente Verarbeitung akzeptiert, `euOnly = false`
- keine unbekannten zusätzlichen personenbezogenen Persistenzpfade
- vollständige reale Datenflussinventur

Standard Workers werden niemals als EU-only gewertet.

## Datenflussvertrag

Mindestens erwartete Flüsse:

1. Browser -> Cloudflare ULC Production Runtime
2. Cloudflare ULC Production Runtime -> Neon/PostgreSQL Production
3. geschützte CI/Control Plane -> Cloudflare API für read-only Evidence
4. geschützte CI/Control Plane -> Neon API für read-only Evidence
5. Neon-interne Backup-/Recovery-Verarbeitung, soweit Bestandteil des verwendeten Dienstes
6. Cloudflare Logs/Telemetry, soweit real aktiviert

Jeder weitere reale Provider-/Persistenz-/Telemetry-Pfad erweitert den Scope fail-closed.

## Freshness

Es gibt weiterhin kein universelles Maximalalter.

Der technische Vertrag unterscheidet mindestens:

- dynamische Subprozessorlisten: kurze Reviewfrist
- Provider-/Security-Dokumentation: mittlere Reviewfrist
- versionierte DPA-/Terms-Texte: Reviewfrist bis zur nächsten geplanten Prüfung, aber zwingend erneut unmittelbar vor Production Gate
- reale Resource-/Binding-Evidence: kurzlebig und erneut unmittelbar vor Production Gate

`validUntilOrReviewAt` ist pro Evidence-Eintrag verpflichtend. Fehlt die Frist oder ist sie überschritten, ist die Evidence nicht verwendbar.

## Sanitization

Der Normalizer muss bekannte sensitive Feldklassen ausdrücklich verwerfen und zusätzlich fail-closed reagieren, wenn unbekannte sensible Inhalte auftauchen.

Mindestens verboten im normalisierten Output:

- API-/Access-/Bearer-Tokens
- Authorization-Header
- Cookies / Sessionwerte
- Secretwerte
- Datenbankpasswörter
- Connection Strings mit Credentials
- private Schlüssel
- produktive Request-/Response-Bodies
- Benutzer-, Mitglieds-, Athleten- oder Kontaktdatensätze

Der spätere Test muss sowohl bekannte Feldnamen als auch verschachtelte sensitive Fixture-Felder abdecken.

## Kriterienisolierung

Jedes Kriterium wird unabhängig berechnet.

- `dataRegion = verified` darf `dpa`, `encryption` oder `subprocessors` nicht beeinflussen
- `dpa = verified` darf keine technische Konfiguration implizieren
- `encryption = verified` darf keinen Regionnachweis implizieren
- `subprocessors = verified` darf keinen DPA-Abschluss implizieren

Unbekannte zusätzliche Felder oder truthy Werte zählen niemals als Nachweis.

## Fixture-Vertrag für den späteren technischen Slice

Der Implementierungsslice soll ohne Providerwrites zuerst reine Fixtures verwenden.

Mindestens:

1. vollständige syntaktisch valide Baseline, aber ohne reale Ressourcenbindung => alle vier Kriterien `open`
2. falsche App => reject
3. falsches Environment => reject
4. `euOnly=true` bei Standard Workers => reject
5. Neon `aws-eu-central-1`, aber nur Preview-Ressource => `dataRegion=open`
6. Neon Produktionsresource mit anderer Region => `dataRegion=open`
7. unbekannte Neon-Region => `dataRegion=open`
8. zusätzlicher unbekannter Cloudflare-Persistenzpfad => `dataRegion=open`, relevante weitere Kriterien offen
9. veraltete Subprozessorliste => `subprocessors=open`
10. öffentliche DPA-Baseline ohne account-spezifischen Vertragsnachweis => `dpa=open`
11. Provider-Security-Doku ohne reale Konfiguration => `encryption=open`
12. vollständige reale Konfiguration + gültige Providerfähigkeit => nur dann `encryption=verified`
13. fehlendes `observedAt` => reject/open
14. abgelaufenes `validUntilOrReviewAt` => jeweilige Evidence unbrauchbar
15. Secret-/Credential-Feld im Raw-Fixture => normalisierter Output darf es nicht enthalten; bei nicht sicher sanitizierbarer Payload fail-closed
16. ein Kriterium verified, drei andere open => exakt diese Trennung bleibt erhalten

## Noch nicht verifizierbar

Solange reale ULC-Produktionsressourcen und account-spezifische Vertragsnachweise fehlen, bleiben formal zwingend offen:

- `dataRegion`
- `dpa`
- `encryption`
- `subprocessors`

Dieser Vertrag erhöht die technische Vorbereitung, nicht den formalen Production-Ready-Status.
