# ULC Linz – T10 einmaliger Betreiberentscheid zum begrenzten Echtbetrieb

**Technischer Referenzumfang (28.11.2026):** [PR #740](https://github.com/martinirrgeher-cloud/appbasis/pull/740) führt den ausschließlich ULC-gebundenen geschützten sechsmoduligen App-Lifecycle-Nachweis ein. **Volatile PR-/Main-SHAs, CI-Ergebnisse und Reviews ausschließlich live in GitHub sowie im zentralen [Issue #716](https://github.com/martinirrgeher-cloud/appbasis/issues/716) prüfen**, nicht aus diesem Dokument übernehmen. **Betreiber-T10-GO vom 28.11.2026 ausdrücklich dokumentiert; technische Freigabeverträge erst nach CI/Review als abgeschlossen werten. T11-Deployment, Ingress und neue Echtdaten sind NICHT freigegeben.**

**Operative Quelle und Statushistorie:** [Issue #716](https://github.com/martinirrgeher-cloud/appbasis/issues/716). Es gibt **genau zwölf ursprüngliche Pakete**: T01–T09 PASS im vereinbarten begrenzten Pilot-Scope; T10 ist das einzige aktive Paket, danach T11 Echtbetriebsstart und T12 Betriebsübergabe. Keine neuen Projektpakete und keine Wiederholung bestandener T06/T07/T08/T09-/Handytests.

## Was im technischen T10 bereits PASS ist

- Die **sechs** ULC-Pilotmodule sind in der T10-Read-only-Prüfung technisch nachgewiesen. Die zuvor blockierten Lifecycle-Nachweise von Übungskatalog, Trainingsblöcken und Dokumentation sind ausschließlich in der **ULC-App-spezifischen** geschützten Pilotkette SHA-verankert. Die **globalen Modulverträge für andere Apps bleiben `blocked`**.
- ULC-App `applicationLifecycle=verified`, `dataExport=verified`; `production-protected.ts` erzwingt geschützte Katalog-/Block-Usage-/Doku-Schreibwege, Actor- und DB-Guards, **private Medien AUS** und **Alt-Restore-Promotion STOP**. Keine Aktivierung des Standard-/Legacy-Writers.
- `retention.runtimeActive=false` ist **korrekt für die Vorstartphase**, kein fehlender Produktivtest. Nur-lesender Neon-Iststand: 69 Tabellen, wirksame Datenbank-Schutztrigger; App-Rolle kann keine Quell-Löschmarker schreiben.
- Cloudflare-Produktionskonto-/Worker-Zuordnung und Neon-Produktionsprojekt-/Kontozuordnung mit vorhandenen datierten Quellen nachgewiesen. EU-R2-Tagesbackup und 30-Tage-Präfixregel T09 PASS; Neon Frankfurt/6h History nachgewiesen. Alte Neon-Kopien bleiben gesperrt, Parent-TTL-Folgeauftrag am 20.12.2026 bleibt unverändert.

**Die 19 internen Prüffelder sind keine Arbeitspakete.** Ihre aktuellen PASS-/OPEN-Zählwerte sind ausschließlich live in [Issue #716](https://github.com/martinirrgeher-cloud/appbasis/issues/716) und der Repository-Prüfung zu lesen, nicht als dauerhafter Status in diesem Dokument zu führen. Der Bericht ist eine Repository-Nachweiskontrolle, kein Betreiber-GO.

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

## T10-GO dokumentiert und technische Abschlussbedingungen

1. **App-Privacy und Gesamtstatus:** das ausdrückliche Betreiber-GO wird in einem zusammenhängenden Integrations-PR mit SHA-gebundener T02-/T07-/M5-/Runtime-Evidenz als ULC-app-spezifisches `privacy=verified` und `app.status=ready` eingebunden. Nur nach finalem CI/Review/Main-Prüfung als T10-Technik-PASS anerkennen. Die drei globalen generischen Modulverträge bleiben `blocked`; kein T11-Deployment wird automatisch gestartet.
2. **Aktueller 69-Tabellen-Betreiber-Rechtsentscheid:** `privacy/t10-current-production-legal-decision.json` dokumentiert die **ausdrückliche** Betreibererklärung vom 28.11.2026 mit `legalApproval=true`, `runtimeActive=false` und der datensparsamen Aktenreferenz `private:ulc-linz/t10-operator-go-2026-11-28`. Die konkrete Originalerklärung ist in der nicht geteilten privaten Betreiberakte festgehalten; keine private Dokument-URL oder gefälschte Signatur im öffentlichen Repository. Der 66-Tabellen-P01-Entwurf bleibt historisch/unfreigegeben. Die T10-Freigabe erstreckt sich nicht auf T11-Echtdatenverarbeitung, Retention-Automatik, private Medien oder Alt-Restore-Promotion.
3. **Provider/Standort-/Vorstart-Nachweise:** die Standardvertrags-/DPA-Einbeziehung, Baseline-Verschlüsselungsmaßnahmen, Subprozessorlisten, Neon Frankfurt/EU-R2 sowie Cloudflare global sind nur in ihren **dokumentierten tatsächlichen Grenzen** kontobezogen `verified`. Alle sechs tatsächlichen Datenfluss-Status sind weiterhin `open`; ausschließlich ihre Vorstart-Architektur, administrativen Readbacks und Recovery-STOPs sind belegbar. Kein EU-only-Nachweis oder automatischer echter T11-Datenfluss-PASS.

**Wichtig zur Vorstart-/Echtbetriebsgrenze:** Der erste echte, berechtigte Dokumentations-`POST/GET` bleibt **einmalig T11**. Vor T11 kann kein Live-Nutzungsdatenfluss simuliert als nachgewiesener Echtbetrieb gelten; Code-/Rollen-/Source-Nachweise ersetzen keine DPA-Entscheidung. Ein unbekannter Live-Flow wird am T11-Ingress fail-closed behandelt. Umgekehrt darf ein erst in T11 möglicher Test nicht wieder als neue T06/T08-Vorstart-Aufgabe eingefordert werden.

## Ein Betreiberentscheid dokumentiert; danach kontrollierter T11-Start mit gesonderter Freigabe

Der Betreiber hat die ausdrückliche GO-Erklärung **„Ich erteile das t10-go“** am 28.11.2026 nach Nennung des kleinen privaten Vereins-Scope, der Eltern-/Minderjährigenbelange, möglicher globaler Cloudflare-/Drittlandverarbeitung und der geltenden T07-STOP-Löschpraxis erteilt. Die vollständige Akte ist nichtöffentlich. Der Repository-Entscheid verweist nur datensparsam darauf, ohne eine gesonderte Unterschrift oder die unabhängige Prüfung der Vereinsvertretungsmacht zu fingieren. Die abschließende technische T10-Integration muss **exakte HEAD-SHA, CI, unabhängiges Review und Main-Push-CI** bestehen; vor diesem Abschluss kein T11-Start.

**Erst nach tatsächlichem T10-GO und separat konkreter Deploy-/Ingressfreigabe folgt T11:** geschützter privater Worker, sechs Module nur für berechtigten Vereinskreis, `/datenschutz` vor Zugang live, einmaliger echter berechtigter Doku-`POST/GET`, Rechte-/Schreibkontrolle, einmalige Eltern-/Trainer-/Mitgliederinformation. Bei Fehlern Zugang sperren, keine Security-Gates umgehen. **T12:** Admin-/Backup-/Fehlerverantwortung und tatsächliche Übergabe dokumentieren.

## Read-only Kontrollkommando

```bash
node tooling/ulc-linz-t10-pilot-decision.mjs
node tooling/ulc-linz-t10-pilot-decision.mjs --require-repository-ready
```

Der zweite Befehl ist die **streng nur lesende T10-Repository-Abnahme** und muss nach der letzten Integration PASS ergeben. Selbst ein PASS bestätigt **keine T11-Deploy-/Ingress-/Echtdatenfreigabe** und authentifiziert den tatsächlichen Vereinsbeschluss nicht selbstständig. Keine SQL-Löschung, keine Retention-Aktivierung, kein Neon-/Cloudflare-/R2-/Worker-/Secrets-/Ingress-Änderungsrecht durch dieses Dokument.
