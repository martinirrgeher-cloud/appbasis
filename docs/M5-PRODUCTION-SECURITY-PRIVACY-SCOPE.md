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

Die vorhandene Factory-Capability `releaseProduction` bleibt unabhängig davon `false`. M5 fügt weder einen Release-Endpunkt noch einen Release-Button oder Provider-Write hinzu.

## Slice 2 – erster read-only Repository-Evidenzadapter

`tooling/factory-ui/repository-production-readiness-evidence.mjs` nutzt ausschließlich belastbare Repository-Verträge statt einen zweiten Manifest-Verifier zu bauen.

Der bestehende `parseAppDefinition()`-Vertrag erlaubt im normalen `appbasis.app.json` ausschließlich `schemaVersion`, `appId`, `displayName`, `modules` und `platformServices`. Zusätzliche Felder wie Provider-IDs, Datenbankadressen oder Credentials werden abgewiesen. Deshalb darf das M5-Kriterium `secretsOutsideAppManifests` repository-seitig verifiziert werden.

Weitere Kriterien werden nur ergänzt, wenn ihre konkrete **app-spezifische** Aussage durch einen eigenen, eng begrenzten Nachweis tatsächlich belegt ist.

## Slice 3 – sichtbarer read-only Factory-Status

Die Factory-Detailansicht zeigt den bestehenden M5-Snapshot kompakt an:

- `Security & Privacy x/12 geprüft` zeigt ausschließlich den bereits vom gemeinsamen Factory-Snapshot gelieferten Stand,
- fehlende oder inkonsistente Evidenz wird als `nicht verifiziert` angezeigt,
- der M5-Status wird im bestehenden `renderAppDetail(app)`-Lifecycle gerendert; Öffnen und `Aktualisieren` verwenden dadurch denselben Snapshot und denselben ausgewählten App-Zustand,
- es gibt keinen zweiten Snapshot-Request und keinen parallelen M5-App-State,
- auch bei `12/12` wird nur „M5 erfüllt“ angezeigt; die eigentliche Produktionsfreigabe bleibt ein separates gesperrtes Gate,
- der Anzeige-Adapter besitzt keinen Release-/Provider-Write-Pfad.

Damit wird M5 sichtbar, ohne die Trennung zwischen Readiness-Nachweis und späterer ausdrücklicher Produktionsfreigabe aufzuweichen.

## Slice 4 – offene Kriterien direkt benennen

Die bestehende kompakte M5-Zeile nennt bei einem gültigen, noch blockierten Status zusätzlich die tatsächlich offenen Kriterien:

- die Reihenfolge und Labels stammen ausschließlich aus `REQUIRED_PRODUCTION_READINESS_CRITERIA`,
- der Browser vertraut keinen frei gelieferten Labels, sondern verwendet den kanonischen M5-Vertrag,
- ein inkonsistenter oder nicht-kanonischer Snapshot bleibt vollständig `nicht verifiziert`,
- es wird keine zweite Detailansicht, kein zusätzlicher Snapshot-Request und kein zusätzlicher UI-State eingeführt,
- `productionReady` und `releaseProduction` werden dadurch nicht verändert.

Damit kann der Nutzer direkt sehen, welche M5-Nachweise noch fehlen, ohne eine neue Plattform- oder Compliance-Abstraktion einzuführen.

## Slice 5 – kanonisches High-Privacy-Profil

`tooling/factory-ui/high-privacy-profile.mjs` definiert den in Roadmap, Betriebsakte und ADR-011 geforderten strengeren Profilvertrag für Kinder-, Schul- und andere sensible Szenarien.

Der Vertrag erfindet bewusst keine fach- oder rechtsfallspezifischen DSGVO-Regeln. Er bindet ausschließlich bereits beschlossene AppBasis-Sicherheitsgrenzen:

- Anwendungsbereich: `children`, `school`, `sensitive-data`,
- Security-/Privacy-Gate bleibt vollständig fail-closed (`all-required`),
- Backup/Restore bleibt vor Produktion Pflicht,
- Zugriff bleibt `deny-by-default`,
- Privilegien folgen `least-privilege`,
- Secrets im normalen App-Manifest sind verboten,
- öffentliche Erreichbarkeit privilegierter Control-Plane-Funktionen ist verboten,
- die konkrete rechtliche/fachliche Zulässigkeit des Einsatzfalls bleibt eine notwendige Betreiberprüfung.

Der Profilvertrag ist tief eingefroren und besitzt eine exakte kanonische Validierung. Änderungen, fehlende Felder oder zusätzliche, nicht freigegebene Anforderungen führen nicht stillschweigend zu einer anderen Profilsemantik.

### Definition ist nicht gleich App-Nachweis

Die Existenz dieses globalen Profilvertrags beweist **nicht**, dass eine konkrete App das Profil ausgewählt, gebunden oder alle zugehörigen Anforderungen erfüllt hat. Deshalb liefert `repository-production-readiness-evidence.mjs` aus der bloßen Profildefinition ausdrücklich **kein** `highPrivacyProfile=true`.

Für das app-spezifische M5-Kriterium bleibt `highPrivacyProfile` fail-closed `open`, bis eine spätere konkrete App-Bindung beziehungsweise ein belastbarer Compliance-/Betreiber-Nachweis existiert. Dieser Slice führt bewusst kein neues Feld in `appbasis.app.json` ein und erfindet keine zweite Konfigurationsschicht ohne realen schreibenden Verbraucher.

Der reale Factory-Snapshot bleibt deshalb nach diesem Slice bei **1/12** app-spezifisch verifizierten M5-Nachweisen:

- `secretsOutsideAppManifests: verified`,
- `highPrivacyProfile: open`,
- alle übrigen zehn Kriterien ebenfalls `open`,
- `productionReady=false` bleibt unverändert,
- `releaseProduction=false` bleibt unverändert.

Der Fortschritt dieses Slices besteht darin, dass der geforderte High-Privacy-Vertrag erstmals kanonisch und maschinenprüfbar definiert ist, ohne daraus unzulässige app-spezifische Readiness abzuleiten.

## Slice 6 – app-spezifische read-only Control-Plane-Evidenzquelle

`.github/workflows/m5-reference-control-plane-evidence.yml` schafft für die bestehende Reference-App eine frische, getrennte Provider-Evidenzquelle für die öffentliche Erreichbarkeit ihres privilegierten Rollen-Administrations-Workers.

Der Workflow:

- läuft ausschließlich manuell, nur erfolgreich von `refs/heads/main` und mit `contents: read`,
- verwendet die bestehende geschützte `reference-preview`-Umgebung,
- verlangt, dass der bereits vorhandene interne Worker `appbasis-reference-role-admin` lesbar existiert,
- verwendet danach den bestehenden fail-closed `reference-role-admin-ingress.mjs`-Vertrag,
- verlangt live `workers.dev=false`, deaktivierte Preview-URLs, keine Custom Domain und keine Worker-Route,
- führt keine Provider-, Secret-, Deployment- oder Produktionsänderung aus.

Die bereits etablierte accountweite Worker-Route-Prüfung bleibt unverändert. Die service-gefilterte Custom-Domain-Abfrage folgt dem dokumentierten Cloudflare-Vertrag für `GET /accounts/{account_id}/workers/domains`: Der Endpoint besitzt keine Paging-Parameter und wird von den offiziellen SDKs als `SinglePage` modelliert; `result_info` sowie dessen Felder sind optional. Deshalb darf fehlendes `result_info` nicht als unvollständige Antwort gewertet werden. Wenn optionale Metadaten vorhanden sind, werden sie weiterhin fail-closed validiert: ein vorhandener service-spezifischer `count` muss exakt zur Ergebnisliste passen, eine vorhandene `page` muss die erste Seite bezeichnen und vorhandene numerische Metadaten müssen kanonische nichtnegative beziehungsweise positive Ganzzahlen sein. `total_pages` wird nicht als service-spezifischer Vollständigkeitsbeweis verwendet, weil Cloudflare ihn als Seitenzahl des gesamten ungefilterten Resultsets beschreibt. Die gefilterten Domain-Einträge selbst müssen weiterhin exakt dem internen Worker zugeordnet sein.

Ein erfolgreicher Workflow-Lauf ist zunächst **nur eine app-spezifische Evidenzquelle**. Er setzt `privilegedControlPlaneIsolation` im gemeinsamen Factory-Gate nicht automatisch auf `true`. Dafür braucht es einen späteren, eng begrenzten Consumer, der einen hinreichend frischen erfolgreichen Lauf eindeutig an die konkrete App und Zielumgebung bindet. Fehlt diese Bindung oder ist der Providerzustand nicht lesbar, bleibt das Kriterium offen.

Damit bleibt der Factory-Snapshot auf dem Stand dieses Slices trotz der neuen Evidenzquelle bei **1/12**; es wird keine Repository-Wahrheit aus einem vergangenen Providerzustand erfunden.

## Slice 7 – frische Reference-Control-Plane-Evidenz konsumieren

`tooling/factory-ui/reference-control-plane-evidence.mjs` ist der erste reale Consumer der in Slice 6 geschaffenen Provider-Evidenzquelle. Er bleibt bewusst Reference-spezifisch und baut keine allgemeine Evidenzplattform.

Der Consumer:

- gilt ausschließlich für `appId=reference`,
- hält im Repository nur stabile Regeln für App, Repository, Workflow-Name/-Pfad, `main`, `workflow_dispatch` und Freshness,
- speichert **keine** konkrete Workflow-Run-ID, keinen historischen Head-SHA und keinen einmaligen Beobachtungszeitpunkt als Repository-Wahrheit,
- fragt zur Laufzeit bei GitHub ausschließlich den neuesten passenden Run des M5-Reference-Workflows auf `main` ab,
- akzeptiert nur genau einen von der gefilterten GitHub-Abfrage gelieferten neuesten Run,
- verlangt einen gültigen Run-Identifier, `run_attempt=1`, den erwarteten Workflow, `main`, `workflow_dispatch`, einen kanonischen Commit-SHA, das erwartete Repository sowie `completed/success`,
- verwendet `updated_at` des erfolgreichen Runs als tatsächlichen Beobachtungszeitpunkt,
- akzeptiert diesen Reference-spezifischen Providerzustand höchstens **24 Stunden** nach dem Beobachtungszeitpunkt,
- behandelt einen neueren laufenden oder fehlgeschlagenen Run ausdrücklich als `open` und fällt niemals auf einen älteren erfolgreichen Run zurück,
- bleibt bei GitHub-/JSON-/Clock-/Metadatenfehlern vollständig fail-closed.

Die 24-Stunden-Grenze ist eine enge Freshness-Regel für diesen konkreten Reference-Preview-Nachweistyp. Sie ist **keine globale M5-Freshness-Policy** für andere Provider-, Vertrags- oder Betreiber-Evidenzen. Solche Nachweise behalten ihre jeweils passende `validUntilOrReviewAt`-Semantik.

Die Zielumgebung wird nicht durch ein loses String-Feld im Consumer behauptet. Der bestehende ausführbare Workflow-Vertrag pinnt `.github/workflows/m5-reference-control-plane-evidence.yml` auf `environment: reference-preview`, `contents: read`, den Main-Guard und das Verbot von Deploy-/Secret-/Providerwrites. Der Consumer verlangt exakt diesen Workflow-Pfad und dessen aktuellen passenden GitHub-Run.

Für den Factory-Snapshot gilt damit:

- `reference` erreicht **2/12**, solange der neueste passende Provider-Run erfolgreich und innerhalb des 24-Stunden-Fensters liegt,
- `secretsOutsideAppManifests` und `privilegedControlPlaneIsolation` sind dann `verified`,
- nach Ablauf, bei einem neueren Failure/In-Progress-Run oder bei nicht lesbarer GitHub-Evidenz fällt `reference` automatisch wieder auf **1/12** zurück,
- andere Apps übernehmen diese Reference-Evidenz nicht und bleiben durch diesen Slice unverändert,
- `productionReady=false` bleibt bestehen, weil zehn weitere M5-Kriterien offen sind,
- `releaseProduction=false` und die separate M6-Freigabe bleiben unverändert gesperrt.

Damit wird erstmals eine reale, frische Provider-Evidenz kontrolliert in den gemeinsamen M5-Snapshot übernommen, ohne historischen Providerzustand dauerhaft ins Repository zu schreiben.

## Inventarisierte vorhandene Bausteine

Im Repository existieren bereits technische Bausteine, die spätere M5-Nachweise unterstützen können:

- Rollen-/Permission-Verträge und persistentes Permission-Administration-Audit,
- ein getrennter Reference-Role-Admin-Worker mit eigener Ingress-/Request-Security,
- der Role-Admin-Worker ist nicht über `workers.dev` oder Preview-URLs öffentlich freigegeben,
- normale App-Definitionen enthalten App-ID, Anzeigename, Module und Plattformdienste statt Provider-Credentials,
- ein kanonisches High-Privacy-Profil für Kinder-, Schul- und sensible Szenarien.

Diese Repository-Fakten werden nicht pauschal als app-spezifische Production-Evidenz gewertet. Insbesondere beweist das Vorhandensein eines technischen Bausteins nicht, dass eine konkrete spätere Produktiv-App, deren Providerkonfiguration und deren organisatorische Datenschutzpflichten vollständig geprüft sind.

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
- app-spezifische Bindung/Erfüllung des High-Privacy-Profils,
- konkrete Secret-/Credential-Konfiguration der Produktivumgebung,
- konkrete öffentliche/private Erreichbarkeit aller privilegierten Control-Plane-Funktionen einer späteren Produktiv-App.

Diese Punkte bleiben deshalb im Factory-Gate offen und blockieren Produktion.

## Nächste sichere Slices

1. Weitere echte technische Verträge nur dort über kleine read-only Evidenzadapter anbinden, wo die konkrete M5-Aussage tatsächlich bewiesen wird.
2. Provider-/Policy-Nachweise getrennt und explizit anbinden; fehlende oder nicht prüfbare Nachweise bleiben offen.
3. Eine app-spezifische High-Privacy-Bindung erst mit einem realen Factory-/App-Verbraucher einführen; bis dahin bleibt das M5-Kriterium offen.
4. Rollen/Rechte und privilegierte Control-Plane-Isolation nur dann als M5-Nachweis übernehmen, wenn die konkrete App-/Produktionsaussage aus bestehenden Verträgen belastbar ableitbar ist.
5. Für Datenregion, DPA, Verschlüsselung, Löschung, Aufbewahrung, Export und Subprozessoren keine Repository-Wahrheit erfinden; dafür braucht es reale Provider-/Betreiber-Evidenz.
6. Erst nach vollständiger technischer und organisatorischer Evidenz einen separaten, ausdrücklich freizugebenden Production-Release-Slice planen.

## Sicherheitsgrenze

Slice 7 verändert keine M3-Runtime-, M3-Workflow-, M4-Provider-, App-Manifest-, Generator- oder Produktionsfreigabe-Grundverträge. Er liest ausschließlich den aktuellen GitHub-Workflow-Zustand der bereits vorhandenen Reference-Evidenzquelle und setzt nur das einzelne Kriterium `privilegedControlPlaneIsolation`, wenn alle app-spezifischen, strukturellen und zeitlichen Bedingungen erfüllt sind. Es gibt keinen Providerwrite, kein Deployment, keine Secretänderung und keine Produktionsfreigabe.