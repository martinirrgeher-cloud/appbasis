# ULC Linz – T10 einmaliger Betreiberentscheid zum begrenzten Echtbetrieb

**Technischer Stand 28.11.2026:** Ausgangs-`main` nach [PR #740](https://github.com/martinirrgeher-cloud/appbasis/pull/740) `2b2daec2e6cea29dac67667551df4cf1c70aa5a8`; [PR-CI](https://github.com/martinirrgeher-cloud/appbasis/actions/runs/46122660389) **3/3 PASS**, Codex **0 Findings**, [Main-CI](https://github.com/martinirrgeher-cloud/appbasis/actions/runs/46122947340) **3/3 PASS**. Vor einer echten Freigabe den aktuellen `main`-SHA erneut lesen. **T10 aktuell NO-GO; kein Deploy, Ingress oder neue Echtdatenfreigabe.**

**Operative Quelle und Statushistorie:** [Issue #716](https://github.com/martinirrgeher-cloud/appbasis/issues/716). Es gibt **genau zwölf ursprüngliche Pakete**: T01–T09 PASS im vereinbarten begrenzten Pilot-Scope; T10 ist das einzige aktive Paket, danach T11 Echtbetriebsstart und T12 Betriebsübergabe. Keine neuen Projektpakete und keine Wiederholung bestandener T06/T07/T08/T09-/Handytests.

## Was im technischen T10 bereits PASS ist

- Die **sechs** ULC-Pilotmodule sind in der T10-Read-only-Prüfung technisch nachgewiesen. Die zuvor blockierten Lifecycle-Nachweise von Übungskatalog, Trainingsblöcken und Dokumentation sind ausschließlich in der **ULC-App-spezifischen** geschützten Pilotkette SHA-verankert. Die **globalen Modulverträge für andere Apps bleiben `blocked`**.
- ULC-App `applicationLifecycle=verified`, `dataExport=verified`; `production-protected.ts` erzwingt geschützte Katalog-/Block-Usage-/Doku-Schreibwege, Actor- und DB-Guards, **private Medien AUS** und **Alt-Restore-Promotion STOP**. Keine Aktivierung des Standard-/Legacy-Writers.
- `retention.runtimeActive=false` ist **korrekt für die Vorstartphase**, kein fehlender Produktivtest. Nur-lesender Neon-Iststand: 69 Tabellen, wirksame Datenbank-Schutztrigger; App-Rolle kann keine Quell-Löschmarker schreiben.
- Cloudflare-Produktionskonto-/Worker-Zuordnung und Neon-Produktionsprojekt-/Kontozuordnung mit vorhandenen datierten Quellen nachgewiesen. EU-R2-Tagesbackup und 30-Tage-Präfixregel T09 PASS; Neon Frankfurt/6h History nachgewiesen. Alte Neon-Kopien bleiben gesperrt, Parent-TTL-Folgeauftrag am 20.12.2026 bleibt unverändert.

**Stand der 19 internen Prüffelder nach PR #740:** **11 PASS / 8 offen** (sechs Module, zwei App-Querschnittsfelder, predeployment-safe, zwei Provider-Kontozuordnungen PASS). Diese 19 Prüffelder sind **keine Arbeitspakete**. Der Bericht ist eine Repository-Nachweiskontrolle, kein Betreiber-GO.

## Bereits vorhandene Datenschutz-/Anbieterbelege – nicht neu abfragen

Die am 27.11.2026 geklärten Punkte sind datensparsam in [#716](https://github.com/martinirrgeher-cloud/appbasis/issues/716) erfasst und seit diesem PR als **Source-Coverage mit expliziten Grenzen** in [M5-Inventar](../privacy/m5-provider-compliance-inventory.json) strukturiert:

| Bereich | Bestehender Nachweis | Zulässige Aussage / Grenze |
| --- | --- | --- |
| Cloudflare-Konto | [Konto-/Worker-Screenshots](https://github.com/martinirrgeher-cloud/appbasis/issues/716#issuecomment-7220724216) | Offiziell für ULC genutztes Betreiberkonto belegt; Rechnungsprofil allein ist kein juristischer Vereinsvertragsnachweis |
| Cloudflare-Vertrag | [Self-Serve-Vertrag/DPA v6.4](https://github.com/martinirrgeher-cloud/appbasis/issues/716#issuecomment-7220775604) | Standardvertraglicher DPA-Einbeziehungsweg und Subprozessorenliste geklärt; keine EU-only- oder besondere Kontovertragsbehauptung |
| R2 | [EU-/30d-Konfiguration](https://github.com/martinirrgeher-cloud/appbasis/issues/716#issuecomment-7220882117) | Exakter Backup-Präfix bestätigt, **nicht** sämtliche Exporte, Neon-Zweige oder Provider-Kopien |
| Neon-Konto/Region | [Frankfurt/Projekt](https://github.com/martinirrgeher-cloud/appbasis/issues/716#issuecomment-7220919708), [Billing/Verträge](https://github.com/martinirrgeher-cloud/appbasis/issues/716#issuecomment-7220996997) | Produktionsprojekt und öffentliche Databricks/Neon-Vertragskette nachgewiesen; individuelle Vertragsannahme/Sonderbedingungen nicht belegt |
| Neon-Restore | [Vier Branches/Snapshot/History](https://github.com/martinirrgeher-cloud/appbasis/issues/716#issuecomment-7220942153) | 6h History, Backup-Parent ohne angezeigten Ablauf; deshalb absoluter Alt-Restore-Promotion-STOP |
| Datenschutz und T07 | [T02-Hinweis](../privacy/T02-APP-DATENSCHUTZINFORMATION-ENTWURF.md), [T07-Betriebsanweisung](../privacy/T07-LOESCHPRAXIS-BETRIEBSANWEISUNG-20261127.md) | Mitglieder/Eltern/Trainer, Informationsweg und manuelle Löschpraxis fachlich beschlossen; Sonderfälle gesperrt; **keine** automatische rechtsverbindliche T10-Freigabe |

## Genau die noch offenen T10-Nachweise

1. **App `privacy` und `app.status`:** bleiben `blocked` bis der aktuelle 69-Tabellen-Rechts-/Provider-Scope hinreichend belegt ist und die geschützte App-Komposition wirklich bestanden hat. Nicht die globalen drei Modulverträge auf `ready` setzen.
2. **Aktueller Betreiber-Rechtsentscheid:** `privacy/t10-current-production-legal-decision.json` bleibt `legalApproval=false`, `decision=null`. Das frühere 66-Tabellen-P01 ist nur eine Zielvorgabe. Erforderlich ist **eine** echte, in der nichtöffentlichen Vereinsakte dokumentierte aktuelle Entscheidung für Zwecke, Mitglieder, minderjährige Personen/Eltern, Rollen, Aufbewahrung, Drittlandrisiken und den genau beschränkten sechsmoduligen Scope. Kein erfundener privater Aktenverweis, keine pauschale Zustimmung aus einem Chat-`weiter`.
3. **Fünf Provider-Evidenzfelder**: sechs tatsächliche Datenfluss-Belege (ein Aggregatcheck), M5-Datenregion, DPA-Geltung, vollständige Verschlüsselungsgrenze, relevante Unterauftragsverarbeiter. Die vorhandenen Cloudflare-/Neon-/R2-/DPA-Quellen **sind bereits kartiert**. Die noch auf `open` stehenden Felder sind kein Anlass für eine erneute Grundsatzrunde, aber ebenso wenig Beweis einer individuellen Neon-Vertragsannahme oder realer Transfer-/Recovery-Pfade. Nur einen tatsächlich belegten Anspruch auf `verified` setzen.

**Wichtig zur Vorstart-/Echtbetriebsgrenze:** Der erste echte, berechtigte Dokumentations-`POST/GET` bleibt **einmalig T11**. Vor T11 kann kein Live-Nutzungsdatenfluss simuliert als nachgewiesener Echtbetrieb gelten; Code-/Rollen-/Source-Nachweise ersetzen keine DPA-Entscheidung. Ein unbekannter Live-Flow wird am T11-Ingress fail-closed behandelt. Umgekehrt darf ein erst in T11 möglicher Test nicht wieder als neue T06/T08-Vorstart-Aufgabe eingefordert werden.

## Nur ein Betreiberentscheid, danach ein kontrollierter Start

Für die **einmalige** T10-Entscheidung wird in einer **nichtöffentlichen Vereinsakte** dokumentiert: verantwortliche Funktion, Entscheidungsdatum, Zweck-/Rechtsgrundlagenabwägung inklusive Eltern, einschlägiger Cloudflare-/Neon-Vertrags- und Transferrahmen, aktuelle 69-Tabellen-/Aufbewahrungsentscheidung, bestätigter begrenzter Nutzer- und Medien-Scope, akzeptierte Rest-Risiken, der aktuelle geprüfte `main`-SHA und `GO` oder `NO-GO`. GitHub enthält **nur** einen datensparsamen Verweis, keine persönlichen Konten-/Kinder-/Vertragsunterlagen. Wenn die spezifischen Nachweise nicht reichen, bleibt `NO-GO`.

**Erst nach tatsächlichem T10-GO und separat konkreter Deploy-/Ingressfreigabe folgt T11:** geschützter privater Worker, sechs Module nur für berechtigten Vereinskreis, `/datenschutz` vor Zugang live, einmaliger echter berechtigter Doku-`POST/GET`, Rechte-/Schreibkontrolle, einmalige Eltern-/Trainer-/Mitgliederinformation. Bei Fehlern Zugang sperren, keine Security-Gates umgehen. **T12:** Admin-/Backup-/Fehlerverantwortung und tatsächliche Übergabe dokumentieren.

## Read-only Kontrollkommando

```bash
node tooling/ulc-linz-t10-pilot-decision.mjs
node tooling/ulc-linz-t10-pilot-decision.mjs --require-repository-ready
```

Der zweite Befehl scheitert berechtigt bei offenen Repository-Voraussetzungen; **auch ein späteres PASS erteilt nie automatisch Betreiber-, Echtdaten- oder Deploymentfreigaben**. Keine SQL-Löschung, keine Retention-Aktivierung, kein Neon-/Cloudflare-/R2-/Worker-/Secrets-/Ingress-Änderungsrecht durch dieses Dokument.
