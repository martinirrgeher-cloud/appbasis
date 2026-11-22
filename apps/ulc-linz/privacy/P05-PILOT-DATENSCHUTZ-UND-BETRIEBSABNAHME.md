# P05 – Einmalige Datenschutz- und Betriebsabnahme für ULC Linz

**Stand:** 22.11.2026 · **Nur Abstimmungs-/Prüfunterlage. Keine Datenschutzfreigabe, keine Aktivierung und kein Produktiv-Deploy.**

## A. Was bereits entschieden und bewiesen ist – nicht erneut abfragen

- Die persönlich verwalteten Providerkonten werden laut Betreiberbestätigung **offiziell für ULC Linz** verwendet. Diese Entscheidung ist getroffen; formale Dokumentationspflichten sind davon zu unterscheiden. Keine persönlichen Konto-/Kontaktkennungen in diesem Repository veröffentlichen.
- Zweckabhängige fachliche Zielregeln wurden am **14.11.2026** bestätigt. Kanonische Quelle: [P01-Fachentscheidung](./p01-operator-retention-candidate.json). **Keine neue Fristentscheidung und keine Aktivierung** dieser noch inaktiven Datei.
- N03/N04/N05, die existierenden ULC-Anmelde-/Anwesenheits-/Planungstests, echter lokaler HTTP+PostgreSQL-End-to-End-Test, Produktiv-SQL-Readiness Katalog/Blöcke/Doku und privater Worker-Security-Smoke wurden bereits erfolgreich durchgeführt. Sie sollen nicht als komplette Testsuite erneut verlangt werden.
- Produktive DB am 22.11.: **69 Tabellen**, vier vorbereitete Trainingsgruppen, drei Benutzer-/Login-/Mitgliedschaftsdatensätze, **0 Athleten/Trainer/Trainingseinheiten** und **13/13 Freitext-/Revisionszählbereiche mit 0**. Auch in den sechs vormals geprüften Testkopien keine Athleten/Anwesenheit; drei Kopien inzwischen freigegeben gelöscht. Die verbliebenen Auth-/Mitgliedschaftsdaten sind weiterhin personenbezogen.
- Private Medien sind im tatsächlich geprüften Produktions-Worker abgeschaltet (`exerciseCatalogMediaStore=null`). Übungen, Katalog, Blöcke und Dokumentationsmodule sind nicht als Feature aus dem Zielumfang entfernt.
- K2 verschlüsseltes EU-R2-Datenbankbackup + 30-Tage-Lifecycle **manuell PASS**. Erster unabhängiger Cron-Nachweis am **23.11.2026**, 03:19 UTC, noch offen. Die Backupprüfung ist bereits einmalig terminiert; keine zweite Überwachung anlegen.

**Verbindliche stets aktuelle Übergabe:** [Go-live-Issue #607](https://github.com/martinirrgeher-cloud/appbasis/issues/607). Dieser Text enthält keine eigenen Override-Entscheidungen gegenüber #607.

## B. Aus Nutzer-/Elternsicht – Datenschutzhinweis als ENTWURF

Der nachfolgende Text darf **nicht** ohne Ergänzung und angemessene Prüfung veröffentlicht werden. Kontaktdaten, konkrete Rechtsgrundlagen und verbindliche Betroffeneninformation sind unbekannt und werden nicht erfunden.

> **Datenschutzinformation zur ULC-Linz-Trainings-App – Entwurf, nicht veröffentlicht**
>
> Verantwortlicher Verein: **ULC Linz** – [vollständige Vereinsbezeichnung, Anschrift und gültige Kontaktadresse ergänzen].
>
> Wir nutzen die vereinsinterne App zur Verwaltung berechtigter Benutzer, Athletinnen und Athleten, Trainingsgruppen und Trainer, zur Trainingsplanung, Anmeldung und Anwesenheit, Dokumentation sowie zur Vereinsstatistik. Dabei können Namen, Gruppenzugehörigkeiten, Anmeldungen, Anwesenheiten, Trainingsinhalte, Freitextnotizen und technische Sicherheitsprotokolle verarbeitet werden. Einzelne Daten betreffen Kinder und Jugendliche. Freie Gesundheitsangaben sollen nicht in gewöhnliche Notizfelder eingegeben werden.
>
> Zugriff erhalten nur im Verein berechtigte Benutzer entsprechend ihrer Rolle und Gruppenzuordnung. Für die Technik werden Cloudflare (Anwendungsbetrieb) und Neon/Databricks (Datenbank) eingesetzt. Die aktuell verifizierte Neon-Datenbankregion ist Frankfurt. Für sämtliche Verarbeitungsvorgänge wird **kein ausschließlich europäischer Verarbeitungsort behauptet**. Die verschlüsselten Datenbanksicherungen liegen in einem EU-R2-Backup-Bereich mit der eingerichteten 30-Tage-Regel. Private Fotos oder Videos erkennbarer Minderjähriger sind vorerst nicht freigeschaltet.
>
> Zweckabhängige Speicherzielwerte sind vorgesehen: personenbezogene Vereins-/Zugangs- und Athletendaten grundsätzlich nur während des benötigten Zwecks, bei sachlicher Notwendigkeit maximal 12 Monate nach Austritt; personenbezogene Trainings-/Anmeldungs-/Anwesenheitsdaten maximal 24 Monate ab Trainingstag, soweit der Verein diesen Zweck rechtlich bestätigt; personenbezogene Freitexte nach 90 Tagen überprüfen bzw. entfernen, wenn nicht mehr benötigt; personenbezogene Nutzungsevents höchstens 12 Monate, falls ein gerechtfertigter Statistikzweck besteht. Das sind **fachliche Zielvorgaben und keine Behauptung einer bereits aktiven automatischen Löschung**. Gesetzliche Ausnahmen und frühere berechtigte Löschungen sind gesondert zu beurteilen.
>
> Betroffene bzw. ihre gesetzlichen Vertretungen können sich für Auskunft, Berichtigung, Löschung, Einschränkung, Widerspruch oder weitere anwendbare Datenschutzrechte an [Vereinskontakt ergänzen] wenden. Eine Beschwerde bei der österreichischen Datenschutzbehörde ist möglich.
>
> **Vor Veröffentlichung zwingend einzutragen/zu prüfen:** vollständige Verantwortlichen- und Kontaktangaben, die je Datenzweck anwendbare DSGVO-Rechtsgrundlage (z. B. konkret geprüfte vertragliche Erforderlichkeit, berechtigtes Interesse oder erforderliche Einwilligung; nicht pauschal behaupten), Informationen für Minderjährige/Eltern, Empfänger/Subprozessoren und etwaige Drittlandtransfers, tatsächliche Speicher- und Löschpraxis, Rechte-/Löschverfahren sowie gegebenenfalls datenschutzbeauftragte Ansprechstelle.

## C. Einmaliger Go-live-Entscheid statt mehrerer Mikrofreigaben

| Gate | Beleg / bereits erledigt | Noch erforderlich für echtes GO |
| --- | --- | --- |
| Betreiberkonten | Offizielle ULC-Nutzung und Vertragsgeltung laut Betreiber bestätigt; nicht erneut einholen | Kontospezifische Vereinbarungs-/DPA-/Subprozessoren- und Datenflussreferenzen datensparsam in Betreiberunterlagen eindeutig zuordnen. Anbietertexte alleine sind kein App-Nachweis. |
| Privacy-Zweck & Elterninformation | P01-Fristen fachlich beschlossen, alle 69 Tabellen durch separaten P05-Deltavorschlag erfasst | Rechtmäßigkeit je Zweck und Betroffeneninformation prüfen/ergänzen; `legalApproval=false` und `runtimeActive=false` bis rechts-/fachlich legitimem Aktivierungsentscheid belassen. |
| Modul-Sicherheit | Produktive SQL-Rollen/Trigger, lokaler Auth-/HTTP-E2E und privater Worker-Security-Smoke PASS | Katalog/Block `lifecycle=blocked`, Doku `authorization/lifecycle=blocked`; bei erforderlichem produktivem HTTP-Beleg nur **einen eng begrenzten synthetischen geschützten Remote-Nachweis**, nicht erneut gesamte Mobiltests. |
| Acht Daten-Owner / Löschung | P03/P04-Offline-/PostgreSQL-Tests und 13/13 produktive Freitext-/Revisionszählungen 0 | Vollständige Wiederherstellung nur in Quarantäne, **neuere** gültige Löschbelege aller 8 Owner, sichere Re-Deletion einschließlich Revisionen/Notizen und Provider-Medien, Restdatennachweis und explizite Freigabe vor Wiederanbindung. Null-Trainingsdaten sind hierfür kein Beweis. |
| Backuphorizont | Externes K2-R2 30 Tage PASS; drei ältere Restore-Branches entfernt; zwei verbleibende Testbranches bis 19.12. befristet; manueller Snapshot endet 05.12. | Parent der finalen 51→69-Probe kann wegen Neon-Kind-Abhängigkeit erst nach Child-Ablauf befristet werden; gesicherter Folgeauftrag für 20.12. eingerichtet. Weitere Provider-/Download-/Exportkopien und deren Löschfristen unabhängig erfassen. 35-Tage-Quellautorität mit `postExpiryRetry=deny` **nicht still verlängern**. |
| Tägliche Sicherung | Manuelles K2-Backup/Upload/Lifecycle PASS | Der erste eigenständige GitHub-`schedule`-Lauf des richtigen K2-Workflows am 23.11. muss PASS sein. |
| Free-Plan-Risiko | Neon-Produktionsbranch `protected=false`, Protected Branches im Free-Plan nicht verfügbar | Risiko, Zugriffsumfang und Recoveryverfahren für den eng geschützten Start ausdrücklich bewerten; **kein** ungefragtes Tarifupgrade. |
| Kontrakt & Start | Aktuelle App-`status=blocked`, `applicationLifecycle/privacy=blocked`; private Medien gesperrt | Erst nach tatsächlichen Nachweisen exakte Evidenz-Pins und `require-ready` auf festem Release-SHA prüfen, danach gesondert freigegebener privater Start. **Kein Fake-PASS**. |

## D. Betreiberentscheidung – nur noch tatsächlich fehlende Felder

Für den abschließenden einen Go/No-Go-Entscheid genügt ein ausgefüllter Nachweis mit:

1. **Vereinsverantwortlichem/Funktion, Datum, Rechtsgrundlagen und freigegebener Eltern-/Trainerinformation** – in nichtöffentlicher Vereinsakte, nicht in GitHub mit personenbezogenen Daten.
2. **Kontospezifischer Dokumentreferenz** für Cloudflare/Neon (ohne Zugangsdaten), tatsächlichen Providereinstellungen/Datenflüssen und einer vollständigen Übersicht weiterer Backups/Exporte.
3. **Entscheidung zur betrieblichen Freigabe des Lösch-/Restore-Prozesses** einschließlich Acht-Owner-Replay und 35-Tage-Grenze; gesperrte Minderjährigenmedien ausdrücklich beibehalten.
4. **Technischem Releasebeleg**: konkrete freizugebende Commit-SHA, Module/ACL, ein erforderlicher privater Remote-Schreibnachweis, erfolgreicher geplanter K2-Lauf, `require-ready` und Risikofreigabe.
5. **Ausdrücklicher Betreiberfreigabe von Merge/Deployment und eng geschütztem Pilot** – die bisherige Zustimmung zu fachlichen Fristen oder diese Datei ersetzt sie nicht.

**Stop-Regel:** Unbekannte Rechtsgrundlagen, nicht belegte Recoverability, fehlende Anbieterbindung oder ein gesperrter Produktionsvertrag führen weiterhin zu **NO-GO** für personenbezogenen Echtbetrieb. Vorhandene funktionale PASS-Ergebnisse bleiben trotzdem gültig.
