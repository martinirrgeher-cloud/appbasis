# M6 – ULC Linz erster Provider-Write: Preflight

## Zweck

Dieser Preflight ist die letzte read-only Grenze **unmittelbar vor** dem ersten externen M6-Write.

Der erste mögliche Write bleibt:

`neon-production-database`

Auch bei vollständig erfolgreichem Preflight gilt weiterhin:

- `providerWriteAllowed = false`
- `executionAuthorized = false`
- `explicitApprovalRequired = true`

Ein erfolgreicher Preflight ist damit nur die technische Voraussetzung, um anschließend eine ausdrückliche Freigabe für den Provider-Write einzuholen.

## Neon-Ziel

ULC Linz v0.1 verwendet als app-spezifischen ersten Produktionsdatenbank-Zielvertrag:

- Projektname: `appbasis-ulc-linz-production`
- Provider: Neon
- Region: `aws-eu-central-1` / Frankfurt
- dedizierte Produktionsressource
- Region muss beim Create **explizit** gesetzt werden
- Provider-Default-Region ist nicht zulässig
- existiert bereits eine gleichnamige oder plausibel kollidierende ULC-Linz-Produktionsressource, wird nicht blind neu erzeugt

Der Preflight akzeptiert nur frische, vollständige Provider-API-Inventarevidence. Das Evidence-Fenster ist auf höchstens 15 Minuten begrenzt.

## Cloudflare-Sicherheitsvertrag für den nachfolgenden Worker-Schritt

Der spätere Produktions-Worker erhält app-spezifisch den Zielnamen:

`appbasis-ulc-linz-production`

Vor bzw. beim ersten Create/Deploy muss gelten:

- `workers.dev = false`
- Preview URLs = false
- kein öffentliches Ingress
- die geschlossene Ingress-Konfiguration wird bereits beim initialen Create oder ersten Deploy angewandt

Damit darf kein Zwischenzustand entstehen, in dem der Produktions-Worker unbeabsichtigt über `workers.dev` oder eine Preview URL erreichbar ist, bevor die kontrollierte Domain-Aktivierung erfolgt.

## Read-only Provider-Evidence

`evaluateUlcLinzM6FirstProviderWritePreflight()` akzeptiert ausschließlich:

- `source = provider-api`
- vollständige Neon-Projektinventur
- Providerbestätigung, dass Frankfurt verfügbar ist
- Providerbestätigung, dass die Create-Methode eine explizite Regionsauswahl unterstützt
- frische Zeitstempel
- keine Secrets, Credentials oder Connection Strings

Die Projektinventur wird im Speicher geprüft, aber nicht in den Ergebnis-Snapshot übernommen.

## Fail-closed-Fälle

Der Preflight blockiert mindestens bei:

- unvollständigem Providerinventar
- nicht autoritativer Quelle
- veralteter Evidence
- zu langem Evidence-Gültigkeitsfenster
- fehlender Frankfurt-Verfügbarkeit
- Create-Mechanismus ohne explizite Regionsauswahl
- bereits vorhandener exakter Produktionsressource
- plausibel kollidierender ULC-Linz-Produktionsressource
- unsicherem Evidence-Inhalt
- zusätzlichen unerwarteten Evidence-Feldern
- Drift zum bestehenden M6-Ausführungsplan oder #155-Resource-Binding-Vertrag

## Kein Provider-Write

Dieser Preflight besitzt keine Create-, Update-, Deploy-, Secret-, Migration- oder Delete-Funktion.

Er kann ausschließlich lesen/validieren und liefert niemals selbst eine Providerfreigabe.
