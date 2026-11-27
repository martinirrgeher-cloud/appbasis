# ULC Linz – T10 einmaliger Betreiberentscheid zum Vereins-Echtbetrieb

**Aktualisierter Vorstartstand: 27.11.2026, geprüfte Referenz `main=0e7639e1ad84a34a1be94b2a4a71cd2c99a9aa93`.**  
**Status: NO-GO für neue Echtdaten bis nachgewiesener Gesamtentscheidung.** Dieses Blatt ist eine kompakte Arbeitsvorlage für die Vereinsbetreiberentscheidung, keine Anbieter-/Rechtsberatung, keine Freigabe und keine neue Datenschutzrichtlinie.

**Einzige operative To-do-Liste:** [GitHub #716](https://github.com/martinirrgeher-cloud/appbasis/issues/716). Technischer ausführlicher Stand: [#607](https://github.com/martinirrgeher-cloud/appbasis/issues/607). Für die tatsächliche Code-/Vertragskonstellation **jeweils den neuesten main-Commit** erneut nachweisen, nicht die hier gedruckte alte SHA verwenden.

## Klarstellung vom 27.11.2026: Vorstart vs. Erstbetrieb

**T07 ist für den vereinbarten begrenzten Pilotbetrieb ABGENOMMEN.** Die geschützte Löschung und Redigierung von strukturierten, aktuellen und zwölf historischen Freitextfeldern ist über [#737](https://github.com/martinirrgeher-cloud/appbasis/pull/737) und [#738](https://github.com/martinirrgeher-cloud/appbasis/pull/738) samt PostgreSQL-E2E, CI und Codex-Review belegt. Die am 27.11. ausdrücklich genehmigte **manuelle Einzelfallbehandlung mit STOP** erfasst ungeklärte JSON-, Trainer-, Actor-, Audit-, Re-Insert- und Alt-Restore-Fälle. Diese werden **nicht** blind gelöscht, und es wird keine universelle achtfach ausgeführte Produktionslöschung behauptet. **T07 nicht ein zweites Mal als Voll-Lösch-Vorstartblocker einfordern**. Separat müssen die tatsächlichen Modul-/App-/Provider-/Rechtsanforderungen vor T10-GO noch bestanden sein.

**Rechts-Nachweisquelle:** Die historische P01-Datei ist ausdrücklich ein 66-Tabellen-Zielentwurf und darf niemals nachträglich als Freigabe für 69 Tabellen umetikettiert werden. Die neue eigenständige `privacy/t10-current-production-legal-decision.json` beschreibt den aktuellen begrenzten Pilotumfang mit `legalApproval=false`, `runtimeActive=false` und einer bis zum echten Betreiberentscheid leeren Entscheidung. Dies ist weder ein juristisches Gutachten noch eine automatische Umsetzung der Retention.\n\n**T10-Read-only-Iststand:** 7 von 19 Repository-Prüfungen erfüllt, 12 offen: drei Modul-Lifecycle-Verträge; drei App-Verträge; eine verbindliche aktuelle 69-Tabellen-Rechtsentscheidung (`privacy/t10-current-production-legal-decision.json`, derzeit `legalApproval=false`; historischer 66-Tabellen-P01-Entwurf bleibt ausdrücklich unverändert); fünf verbleibende Provider-/Datenfluss-/DPA-/Sicherheitsdomänenprüfungen; zwei Anbieter-Kontozuordnungen aus vorhandenen Belegen PASS. Bereits dokumentierte Cloudflare-DPA v6.4/Self-Serve-Vertragskette, EU-R2-30d, Neon/Databricks Standardvertragskette und Screenshot-Kontobindungen anerkennen; **nicht nochmals wahllos einholen**. Zusätzliche Neon-Connector-Leseprüfung vom 27.11.: Produktionsprojekt `appbasis-ulc-linz-production`, Region `aws-eu-central-1`, PG18, History 6h, Default `production`, 69 öffentliche Tabellen, keine automatische Snapshot-Planung. Es sind technische Fakten, **keine** eigene Annahme der DPA und kein Cloudflare-Worker-Datenfluss-/Personenprüfnachweis.


**T06/T08 sind als Vorstart-Auth-/Rollenentzug-/Cleanup-Prüfungen abgeschlossen.** Der beabsichtigte reguläre erste Dokumentations-201/GET wird **ausschließlich in T11 nach T10-GO** geprüft; das Ergebnis darf vorher nicht erfunden oder als zusätzlicher T10-Vorab-Blocker verwendet werden. Dagegen bleiben echte Erasure-/Lifecycle-/Privacy-/DPA-Nachweise **vor** produktiver Verarbeitung erforderlich. Die komplette Arbeitsreihenfolge und noch offenen Gates stehen nur in [Issue #716](https://github.com/martinirrgeher-cloud/appbasis/issues/716). Keine neue Rechts-, Lösch- oder Deployfreigabe durch diese Klarstellung.

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
| 2 | **Datenschutz und Information:** Rechtsgrundlage je Betroffenengruppe (einschließlich Eltern), gültige Notice-Fassung, fachliche Aufbewahrung *und tatsächlich umsetzbare* Notiz-/Audit-/Trainer-/Löschpraxis beschlossen | **OFFEN NUR für eigenständige Rechts-/Veröffentlichungsfreigabe:** P01-Zielfristen, T02-Inhalt und T07 manuelles Löschverfahren samt belegten technischen Löschpfaden fachlich bestätigt. Universal-Erasure und private Minderjährigenmedien gehören **nicht** zum Pilot-GO-Scope; unbekannte Sonderfälle bleiben gesperrt. Es fehlen die verbindliche DSGVO-Zweck-/Betroffenen-/Providerabwägung sowie finale Notice-/Versandfreigabe; keine automatische Löschaktivierung |
| 3 | **Kontrollierte Wiederherstellung:** Neues Backup und Wiederbeschaffung/Zugriffsreaktion vorhanden; ältere Recovery-Zweige und Snapshots bleiben quarantänisiert, keinerlei alte Restore-Promotion vor unabhängigem 8-Owner-Re-Deletion-Beleg | **PILOT-STOP PASS:** T09 verschlüsseltes 30-Tage-EU-R2-Backup und ausnahmsloser Alt-Restore-/Promotions-STOP gelten. Der gesamte historische Backup-/Export-Horizont und achtfacher Restore sind **nicht** als vollständig verifiziert behauptet und daher vom Pilot-Go ausgeschlossen; kein Ingress/Writers auf alte Restores. Gesonderter Neon-Parent-TTL-Folgeauftrag am 20.12.2026 besteht unverändert |
| 4 | **Technischer Start:** Exakter `main`-SHA, alle sechs Produktivmodul-`lifecycle`-Gates, App-`applicationLifecycle/privacy`, Provider-Evidenz und `production-contract --require-ready` tatsächlich erfolgreich. Eigener genehmigter Deploy-/Ingress-Scope mit T11-Checks | **OFFEN:** Genau drei Modulverträge sowie App-Lifecycle/Privacy/Composition sind `blocked`, weil keine lifecyclegebundene vollständige Vertragsabnahme hinterlegt ist. Bestehende T07-Pilotabnahme ist Teilbeleg, **kein globales Modul-`ready`**. Keine Statusänderung allein durch Betreiberunterschrift und kein automatischer Workflowstart |

## Operatives Minimalverfahren während des künftigen Vereinsbetriebs

- **Anfragen und Rechte:** Zuständiger Vereinsadministrator nimmt berechtigte Auskunfts-/Berichtigungs-/Löschanfragen unter `martin.irrgeher@gmail.com` entgegen und protokolliert in einer **nichtöffentlichen** Vereinsakte das Datum, den Datenschutzentscheid, Ausnahmen und den durchgeführten Abschluss. Kein Betroffenenname in GitHub-Tickets.
- **Löschung:** Der vereinbarte **T07-Pilot-Prozess ist freigegeben**: nur gültig autorisierte private Owner-Ausführung über vorhandene geschützte Pfade, Original-35-Tage-Quellmarker, manuelle personenbezogene Ziel- und Ausnahmeprüfung und achtfacher Restnachcheck. Bei mehrdeutigen Texten, Trainer-/Actor-/Auditverweisen oder anderem unverifizierten Inhalt **STOP für diesen Einzelfall**, separater rechts-/technikgeprüfter Weg und Wiedervorlage; keine unautorisierte Direkt-SQL-Löschung, keine Blindlöschung und keine unzulässige Änderung älterer Backups. Dies ist nicht identisch mit einer ausgeführten universellen Acht-Owner-Löschung.
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
