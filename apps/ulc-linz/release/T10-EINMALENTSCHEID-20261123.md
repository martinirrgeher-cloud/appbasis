# ULC Linz – T10 einmaliger Betreiberentscheid zum Vereins-Echtbetrieb

**Stand: 23.11.2026, Referenz `main=c4e374a509a4b94b4fb208efef22b8e3a85222f3`.**  
**Status: NO-GO für neue Echtdaten bis nachgewiesener Gesamtentscheidung.** Dieses Blatt ist eine kompakte Arbeitsvorlage für die Vereinsbetreiberentscheidung, keine Anbieter-/Rechtsberatung, keine Freigabe und keine neue Datenschutzrichtlinie.

**Einzige operative To-do-Liste:** [GitHub #716](https://github.com/martinirrgeher-cloud/appbasis/issues/716). Technischer ausführlicher Stand: [#607](https://github.com/martinirrgeher-cloud/appbasis/issues/607). Für die tatsächliche Code-/Vertragskonstellation **jeweils den neuesten main-Commit** erneut nachweisen, nicht die hier gedruckte alte SHA verwenden.

## Bereits abgeschlossen – NICHT wiederholen

- Sechs Zielmodule definiert, drei vollständig `ready` (Countdown, Athleten, Trainingspläne). Für Katalog, Trainingsblöcke und Dokumentation sind Autorisierung + Datenbank **verified**, aber Lifecycle und damit Modulstatus noch **blocked**.
- Mobile/Trainer/N03–N05, tatsächlicher lokaler HTTP/PG-Funktionstest und [privater T08-Remote-Auth-/Revoke-Test](https://github.com/martinirrgeher-cloud/appbasis/actions/runs/45260339171) abgeschlossen; das ist **kein** nachgewiesener persistierender Remote-Doku-POST/GET.
- [T09 automatischer AES-GCM-EU-R2-Backup-Run](https://github.com/martinirrgeher-cloud/appbasis/actions/runs/45178485082) **PASS**, 30-Tage-Aufbewahrung. Ein erfolgreicher neuer Dump **beweist keinen vollständigen älteren 8-Owner-Restore**.
- Code der strukturierten Löschpfade durch [#722](https://github.com/martinirrgeher-cloud/appbasis/pull/722), [#723](https://github.com/martinirrgeher-cloud/appbasis/pull/723) und [#724](https://github.com/martinirrgeher-cloud/appbasis/pull/724) geprüft, gemergt, PostgreSQL-/CI-geprüft. **Diese Löschketten sind bislang nicht im produktiven Betrieb aktiviert**.
- Eigentümerangabe: persönliche Cloudflare-/Neon-Konten werden laut Betreiberentscheidung offiziell für ULC Linz genutzt. Vereinsmitglieder sind die Ziel-Athleten, Elternkontakte können auch Nichtmitglieder betreffen. Nicht erneut nach genereller Kontoverwendung fragen.
- Fachliche Aufbewahrungsziele P01 und privater Datenschutzinformationsweg fachlich bestätigt; `legalApproval=false`, `runtimeActive=false` und tatsächlicher Versand/Livehinweis noch nicht genehmigt/durchgeführt.
- Alte Restore-Promotion **absolut gesperrt**. Private erkennbare Minderjährigenmedien im Worker ausgeschaltet.

## Genau eine fachliche Entscheidung mit vier getrennt prüfbaren Voraussetzungen

| Nr. | Beurteilung für den **begrenzten Echtbetriebsstart** | Aktueller Befund / zu bestätigender Beleg |
|---|---|---|
| 1 | **Anbieter/Verantwortung:** Kontospezifische Cloudflare- und Neon-DPA/AVV, Vertretungs-/Vereinsrolle, EU/Drittland-/Unterauftragsverarbeitung und tatsächliche App-Datenflüsse anhand nichtöffentlicher Kontounterlagen ausreichend belegt | **OFFEN**: Öffentliche Musterbedingungen und bestätigte Kontonutzung allein genügen nicht als vollständiger App-Nachweis. Keine Accountnummern/Verträge/Unterschriften in GitHub veröffentlichen |
| 2 | **Datenschutz und Information:** Rechtsgrundlage je Betroffenengruppe (einschließlich Eltern), gültige Notice-Fassung, fachliche Aufbewahrung *und tatsächlich umsetzbare* Notiz-/Audit-/Trainer-/Löschpraxis beschlossen | **OFFEN**: Nur Zielvorgabe P01. Live-Retention und vollständige 8-Owner-/Freitext-/Medienlöschung noch nicht bewiesen. Keine automatische Löschung allein aufgrund dieses Blattes |
| 3 | **Kontrollierte Wiederherstellung:** Neues Backup und Wiederbeschaffung/Zugriffsreaktion vorhanden; ältere Recovery-Zweige und Snapshots bleiben quarantänisiert, keinerlei alte Restore-Promotion vor unabhängigem 8-Owner-Re-Deletion-Beleg | **PARTIELL:** T09 PASS und Betreiber-STOP beschlossen; Gesamt-Backup-/Exporthorizont, alter achtfacher Restore und längere Löschquellenautorität nicht verifiziert. **STOP gilt unabhängig von Pilotbeschluss** |
| 4 | **Technischer Start:** Exakter `main`-SHA, alle sechs Produktivmodul-`lifecycle`-Gates, App-`applicationLifecycle/privacy`, Provider-Evidenz und `production-contract --require-ready` tatsächlich erfolgreich. Eigener genehmigter Deploy-/Ingress-Scope mit T11-Checks | **OFFEN:** App- und drei Modulverträge sind `blocked`. Keine Statusänderung allein durch Betreiberunterschrift. Kein automatischer Workflowstart aus dieser Datei |

## Operatives Minimalverfahren während des künftigen Vereinsbetriebs

- **Anfragen und Rechte:** Zuständiger Vereinsadministrator nimmt berechtigte Auskunfts-/Berichtigungs-/Löschanfragen unter `martin.irrgeher@gmail.com` entgegen und protokolliert in einer **nichtöffentlichen** Vereinsakte das Datum, den Datenschutzentscheid, Ausnahmen und den durchgeführten Abschluss. Kein Betroffenenname in GitHub-Tickets.
- **Löschung:** Bis zur Freigabe eines gesicherten echten Laufwegs kein direktes SQL-DELETE, keine manuelle Überbrückung durch gewöhnliche App-DB-Rolle. Der vollständige Ausführungsweg muss für **alle betroffenen Owner, personenbezogene Notizfelder, Trainer-/Actor-/Auditverweise und wiederherstellbare Kopien** rechts-/rollen- und zeitlich begrenzt geklärt sein. Vier strukturierte Owner sind dabei nur ein Teil. Keine Wiederholung nach Ablauf des 35-Tage-Quellmarkers aus Vermutung.
- **Backups/Fehler:** T09-Tageslauf auf PASS überwachen; bei Ausfall Datenaufnahme oder Betrieb nach bewertetem Recoveryrisiko begrenzen, Vorfall datensparsam protokollieren. Alte Backups/Neon-Snapshots nie auf die produktive Writer-Bindung promoten, bevor Quarantäne/Schreibsperre, Quellenaktualität, vollständige Re-Deletion und separate Freigabe tatsächlich nachgewiesen sind.
- **Information:** Erst die freigegebene, live erreichbare `/datenschutz`-Fassung samt Version/Datum vor Zugang prüfen, dann bereits vereinbarte einmalige Trainer-/Eltern-/Mitgliederinformation aus autorisierter Vereinsliste (Einzelmail oder BCC) versenden; Nachweis nur intern.
- **Erster echter Fachvorgang:** Nach T10-GO und technisch erfolgreicher T11-Kette kann ein zulässiger regulärer Doku-Schreibvorgang per POST/GET geprüft und als normaler Vereinsdatensatz aufbewahrt werden. Kein zusätzlicher künstlicher Live-Datensatz ohne sicheren Löschweg.

## Einmaliges Entscheidungsergebnis (in nichtöffentlicher Vereinsakte)

**Entscheidung:** `GO` / `NO-GO`, verantwortliche Funktion, Entscheidungsdatum, geprüfte Dokumentreferenzen (ohne Geheimnisse), genehmigter Nutzer-/Daten-/Medien-Scope, akzeptierte verbleibende Risiken, Stop- und Rollbackverantwortung, exakte freizugebende Release-SHA, gesonderte Zustimmung zur produktiven Auslieferung.

**GO nur bei tatsächlich hinreichenden Rechts-/Providerbelegen und nachgewiesen erfüllten technischen Voraussetzungen.** Begrenzter Pilot reduziert Risiko, ersetzt aber nicht die Datenschutzgrundlage oder den erforderlichen Schutz vor unzulässiger Datenwiederherstellung. Bei offenem Vertrag/Löschweg/Composition-Gate: **NO-GO für neue Echtdaten**; keine versteckte Ausnahme und kein Fake-`ready`.

## Automatische, ausschließlich lesende Vorprüfung

```bash
node tooling/ulc-linz-t10-pilot-decision.mjs
# JSON-Bericht; Exit 0 auch wenn NO-GO, weil reine Bestandsaufnahme
node tooling/ulc-linz-t10-pilot-decision.mjs --require-repository-ready
# Exit 1 bei offenen Repo-Vertrags-/Policy-/Providerbedingungen
```

Dieser Check überprüft **nur** die auf dem ausgecheckten Commit dokumentierten JSON-Verträge und Policies. Auch wenn irgendwann alle Repo-Werte `verified` sind, liefert er **niemals** eine Betreiber-/Deploy-/Echtdaten-/Restore-Freigabe. Die unveränderbare Freigabekette bleibt der bestehende M6-Workflow nach separater konkreter Genehmigung.
