# M5 – Production Security & Privacy Ready v0.1

## Ziel

M5 bildet in der AppBasis Factory einen fail-closed Production-Readiness-Zustand ab. Eine App ist nur dann `productionReady=true`, wenn **jedes** erforderliche Security-/Privacy-Kriterium explizit belegt ist.

Dieser Slice implementiert **keine Produktionsfreigabe**, keine Provideränderung und keine allgemeine Compliance-Plattform.

## Pflichtkriterien

Der Factory-Vertrag führt genau diese M5-Kriterien:

1. Datenregion
2. AVV/DPA
3. Verschlüsselung
4. Rollen & Rechte
5. Löschkonzept
6. Aufbewahrung
7. Datenexport
8. Audit-/Security-Logging
9. Subprozessoren
10. High-Privacy-Profil
11. Secrets/Credentials außerhalb normaler App-Manifeste
12. privilegierte Control-Plane-Funktionen nicht unnötig öffentlich

Fehlt für mindestens ein Kriterium ein expliziter Nachweis, bleibt `productionReady=false`.

## Slice 1 – Factory-lokales fail-closed Gate

`tooling/factory-ui/production-readiness.mjs` ist bewusst klein und Factory-lokal:

- alle Pflichtkriterien sind explizit und stabil benannt,
- nur der exakte boolesche Wert `true` gilt für ein Kriterium als verifiziert,
- fehlende Werte, `false`, Strings und andere truthy Werte bleiben offen,
- unbekannte zusätzliche Felder können kein Pflichtkriterium ersetzen,
- erst wenn alle Pflichtkriterien verifiziert sind, ergibt die reine Gate-Funktion `productionReady=true`.

`tooling/factory-ui/model.mjs` hängt diesen Status an jede App im Factory-Snapshot. Aktuell wird absichtlich **noch keine Production-Evidenz eingespeist**. Deshalb stehen alle Apps im realen Factory-Snapshot auf:

- `status: blocked`
- `productionReady: false`
- `verifiedCount: 0`

Die vorhandene Factory-Capability `releaseProduction` bleibt unabhängig davon `false`. Dieser Slice fügt weder einen Release-Endpunkt noch einen Release-Button oder Provider-Write hinzu.

## Inventarisierte vorhandene Bausteine

Im Repository existieren bereits technische Bausteine, die spätere M5-Nachweise unterstützen können:

- Rollen-/Permission-Verträge und persistentes Permission-Administration-Audit,
- ein getrennter Reference-Role-Admin-Worker mit eigener Ingress-/Request-Security,
- der Role-Admin-Worker ist nicht über `workers.dev` oder Preview-URLs öffentlich freigegeben,
- normale App-Definitionen enthalten App-ID, Anzeigename, Module und Plattformdienste statt Provider-Credentials.

Diese Repository-Fakten werden in diesem Slice **nicht** automatisch als app-spezifische Production-Evidenz gewertet. Insbesondere beweist das Vorhandensein eines technischen Bausteins nicht, dass eine konkrete spätere Produktiv-App, deren Providerkonfiguration und deren organisatorische Datenschutzpflichten vollständig geprüft sind.

## Bewusst weiterhin offen

Noch nicht technisch oder organisatorisch für eine konkrete Produktiv-App belegt sind insbesondere:

- tatsächliche Produktions-Datenregion,
- gültiger AVV/DPA-Stand,
- konkrete Verschlüsselungs-/Providerkonfiguration,
- produktive Rollen-/Rechteprüfung,
- Löschkonzept,
- Aufbewahrungsregeln,
- Datenexport-Prozess,
- vollständiger produktiver Audit-/Security-Logging-Nachweis,
- aktuelle Subprozessoren,
- High-Privacy-Profil,
- konkrete Secret-/Credential-Konfiguration der Produktivumgebung,
- konkrete öffentliche/private Erreichbarkeit aller privilegierten Control-Plane-Funktionen.

Diese Punkte bleiben deshalb im Factory-Gate offen und blockieren Produktion.

## Nächste sichere Slices

1. Für echte, bereits vorhandene technische Verträge kleine read-only Evidenzadapter ergänzen, ohne App-Manifeste um Providerdetails oder Secrets zu erweitern.
2. Provider-/Policy-Nachweise getrennt und explizit anbinden; fehlende oder nicht prüfbare Nachweise bleiben offen.
3. Den M5-Status in der Factory-Oberfläche sichtbar machen, ohne eine Produktionsfreigabe zu aktivieren.
4. Erst nach vollständiger technischer und organisatorischer Evidenz einen separaten, ausdrücklich freizugebenden Production-Release-Slice planen.

## Sicherheitsgrenze

Dieser Slice verändert keine M3-Runtime-, M3-Workflow-, App-Manifest-, Generator-Grund- oder gemeinsame Security-Foundation-Verträge. Er führt keine Produktionsfreigabe und keine externe Provideraktion aus.
