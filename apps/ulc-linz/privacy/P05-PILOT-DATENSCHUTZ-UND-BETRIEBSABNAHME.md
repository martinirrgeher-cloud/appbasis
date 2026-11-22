# P05 – Einmalige Datenschutz- und Betriebsabnahme für ULC Linz

**Stand:** 22.11.2026 · **Nur Abstimmungs-/Prüfunterlage. Keine Datenschutzfreigabe, keine Aktivierung und kein Produktiv-Deploy.**

**T02 App-Datenschutzinformation:** [vollständiger, noch nicht freigegebener Nutzer-/Eltern-/Trainerentwurf und Rechtsgrundlagenprüfung](./T02-APP-DATENSCHUTZINFORMATION-ENTWURF.md). Betreiberseitig ist `martin.irrgeher@gmail.com` als App-Datenschutzkontakt bestätigt; der bisherige vorläufige Vereinskontakt gilt nicht mehr für App-Anfragen. T02 erst nach fachlicher/rechtlicher Abnahme und Zustellnachweis als abgeschlossen markieren.

**P06 Neuinstallation/Restore (nur technischer vorbereiteter Stand):** [Vorwärtsmigration v19 und fail-closed Runbook](./P06-RESTORE-V19-CHECKLIST.md). Die neue Migration ist kein automatisches Restore-GO; bestehende 8-Owner-/Provider-/Datenschutzbedingungen bleiben maßgeblich.

**Aktualisierte, rein lesende Belegbasis (22.11.):** [Acht Daten-Owner, 69/69 Tabellen, aktuelle Cloudflare-/Databricks-Neon-Vertragsquellen und nur noch echte Restentscheidungen](./P05-ACHT-OWNER-UND-PROVIDER-FAKTEN-20261122.md). Sie ergänzt die bestehenden Betreiberentscheidungen, ersetzt aber **keine** rechtliche oder operative Freigabe. Keine erneuten Fragen zur bereits bestätigten offiziellen ULC-Kontoverwendung.

## A. Was bereits entschieden und bewiesen ist – nicht erneut abfragen

- **Fachliche Nutzerabgrenzung bestätigt am 22.11.2026:** Die App wird für **Vereinsmitglieder** geführt; Nichtmitglieder und Schnupperteilnehmer werden nicht als Athleten erfasst. Gesetzliche Vertreter können dennoch als Kontaktpersonen Nichtmitglieder sein. Diese Betreiberangabe ist keine automatische Freigabe sämtlicher Verarbeitungszwecke nach Art. 6 Abs. 1 lit. b DSGVO und kein unabhängiger Beleg für technische Registrierungssperren.
- Die persönlich verwalteten Providerkonten werden laut Betreiberbestätigung **offiziell für ULC Linz** verwendet. Diese Entscheidung ist getroffen; formale Dokumentationspflichten sind davon zu unterscheiden. Keine persönlichen Konto-/Kontaktkennungen in diesem Repository veröffentlichen.
- Zweckabhängige fachliche Zielregeln wurden am **14.11.2026** bestätigt. Kanonische Quelle: [P01-Fachentscheidung](./p01-operator-retention-candidate.json). **Keine neue Fristentscheidung und keine Aktivierung** dieser noch inaktiven Datei.
- N03/N04/N05, die existierenden ULC-Anmelde-/Anwesenheits-/Planungstests, echter lokaler HTTP+PostgreSQL-End-to-End-Test, Produktiv-SQL-Readiness Katalog/Blöcke/Doku und privater Worker-Security-Smoke wurden bereits erfolgreich durchgeführt. Sie sollen nicht als komplette Testsuite erneut verlangt werden.
- Produktive DB am 22.11.: **69 Tabellen**, vier vorbereitete Trainingsgruppen, drei Benutzer-/Login-/Mitgliedschaftsdatensätze, **0 Athleten/Trainer/Trainingseinheiten** und **13/13 Freitext-/Revisionszählbereiche mit 0**. Auch in den sechs vormals geprüften Testkopien keine Athleten/Anwesenheit; drei Kopien inzwischen freigegeben gelöscht. Die verbliebenen Auth-/Mitgliedschaftsdaten sind weiterhin personenbezogen.
- Private Medien sind im tatsächlich geprüften Produktions-Worker abgeschaltet (`exerciseCatalogMediaStore=null`). Übungen, Katalog, Blöcke und Dokumentationsmodule sind nicht als Feature aus dem Zielumfang entfernt.
- K2 verschlüsseltes EU-R2-Datenbankbackup + 30-Tage-Lifecycle **manuell PASS**. Erster unabhängiger Cron-Nachweis am **23.11.2026**, 03:19 UTC, noch offen. Die Backupprüfung ist bereits einmalig terminiert; keine zweite Überwachung anlegen.

**Verbindliche stets aktuelle Übergabe:** [Go-live-Issue #607](https://github.com/martinirrgeher-cloud/appbasis/issues/607). Dieser Text enthält keine eigenen Override-Entscheidungen gegenüber #607.

## B. Aus Nutzer-/Elternsicht – Datenschutzhinweis als ENTWURF

Der nachfolgende Text darf **nicht** ohne Ergänzung und angemessene Prüfung veröffentlicht werden. Der App-Datenschutzkontakt wurde inzwischen bestätigt; konkrete Rechtsgrundlagen und die verbindliche Betroffeneninformation bleiben Gegenstand der Freigabe. Der nachfolgende ältere Kurztext wird durch den verlinkten T02-Vollentwurf als Arbeitsgrundlage ersetzt.

> **Datenschutzinformation zur ULC-Linz-Trainings-App – Entwurf, nicht veröffentlicht**
>
> Verantwortlicher Verein laut veröffentlichtem SPORTUNION-Vereinsverzeichnis: **ULC Linz Oberbank**, Wieningerstraße 11, 4020 Linz, Österreich, ZVR **284674441**. Allgemeine Vereinsadresse: **office@ulc-linz.at**. **Für die App wurde hingegen ausdrücklich `martin.irrgeher@gmail.com` als Datenschutzkontakt bestätigt.** Vereinssitz und ZVR sind öffentlich verifiziert; tatsächliche datenschutzrechtliche Verantwortlichkeit ist vor Veröffentlichung abzugleichen.
>
> Wir nutzen die vereinsinterne App zur Verwaltung berechtigter Benutzer, Athletinnen und Athleten, Trainingsgruppen und Trainer, zur Trainingsplanung, Anmeldung und Anwesenheit, Dokumentation sowie zur Vereinsstatistik. Dabei können Namen, Gruppenzugehörigkeiten, Anmeldungen, Anwesenheiten, Trainingsinhalte, Freitextnotizen und technische Sicherheitsprotokolle verarbeitet werden. Einzelne Daten betreffen Kinder und Jugendliche. Freie Gesundheitsangaben sollen nicht in gewöhnliche Notizfelder eingegeben werden.
>
> Zugriff erhalten nur im Verein berechtigte Benutzer entsprechend ihrer Rolle und Gruppenzuordnung. Für die Technik werden Cloudflare (Anwendungsbetrieb) und Neon/Databricks (Datenbank) eingesetzt. Die aktuell verifizierte Neon-Datenbankregion ist Frankfurt. Für sämtliche Verarbeitungsvorgänge wird **kein ausschließlich europäischer Verarbeitungsort behauptet**. Die verschlüsselten Datenbanksicherungen liegen in einem EU-R2-Backup-Bereich mit der eingerichteten 30-Tage-Regel. Private Fotos oder Videos erkennbarer Minderjähriger sind vorerst nicht freigeschaltet.
>
> Zweckabhängige Speicherzielwerte sind vorgesehen: personenbezogene Vereins-/Zugangs- und Athletendaten grundsätzlich nur während des benötigten Zwecks, bei sachlicher Notwendigkeit maximal 12 Monate nach Austritt; personenbezogene Trainings-/Anmeldungs-/Anwesenheitsdaten maximal 24 Monate ab Trainingstag, soweit der Verein diesen Zweck rechtlich bestätigt; personenbezogene Freitexte nach 90 Tagen überprüfen bzw. entfernen, wenn nicht mehr benötigt; personenbezogene Nutzungsevents höchstens 12 Monate, falls ein gerechtfertigter Statistikzweck besteht. Das sind **fachliche Zielvorgaben und keine Behauptung einer bereits aktiven automatischen Löschung**. Gesetzliche Ausnahmen und frühere berechtigte Löschungen sind gesondert zu beurteilen.
>
> Betroffene bzw. ihre gesetzlichen Vertretungen können sich für Auskunft, Berichtigung, Löschung, Einschränkung, Widerspruch oder weitere anwendbare Datenschutzrechte an den vom Betreiber bestätigten **App-Datenschutzkontakt martin.irrgeher@gmail.com** wenden; die allgemeine Vereinsadresse ist dafür nicht vorgesehen. Eine Beschwerde bei der österreichischen Datenschutzbehörde ist möglich.
>
> **Vor Veröffentlichung zwingend einzutragen/zu prüfen:** die veröffentlichten Vereins-/ZVR-Daten und tatsächliche datenschutzrechtliche Verantwortlichkeit sowie die Zuständigkeit des bestätigten App-Datenschutzkontakts, die je Datenzweck anwendbare DSGVO-Rechtsgrundlage (z. B. konkret geprüfte vertragliche Erforderlichkeit, berechtigtes Interesse oder erforderliche Einwilligung; nicht pauschal behaupten), Informationen für Minderjährige/Eltern, Empfänger/Subprozessoren und etwaige Drittlandtransfers, tatsächliche Speicher- und Löschpraxis, Rechte-/Löschverfahren sowie gegebenenfalls datenschutzbeauftragte Ansprechstelle.

### Öffentliche Vereinsquellen und bestehende Datenschutzseite (22.11.2026)

- [SPORTUNION-Vereinseintrag ULC Linz Oberbank](https://sportunion.at/vereine/ulc-linz-oberbank/): aktueller öffentlich genannter Vereinssitz, allgemeine E-Mail und ZVR-Nr.; ergänzend [Vereinswebsite](https://www.ulc-linz.at/).
- Die [bestehende Datenschutzerklärung der Vereinswebsite](https://www.ulc-linz.at/j/privacy) behandelt nach der heute öffentlich eingesehenen Fassung insbesondere **Google reCAPTCHA und Websiteanalyse**, nicht die Trainings-App, deren Cloudflare-/Neon-Flüsse und Athleten-/Anwesenheits-/Dokumentationsverarbeitung. Deshalb ersetzt sie **keine spezifische App-Betroffeneninformation**. Die bestehenden Website-Rechtsgrundlagen dürfen nicht ohne sachliche Prüfung auf die App übertragen werden.
- Die öffentliche Kontaktinformation ist ein technischer Beleg; **keine neue Vereinsentscheidung oder rechtliche Aktivierung**. Die App-Datenschutzadresse und delegierte Entscheidzuständigkeit wurden vom Betreiber bestätigt; die Zweck-Rechtsgrundlagen, technische Praxis und formale Freigabe bleiben offen.

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
5. **Ausdrücklicher Betreiberfreigabe für das spätere produktive Deployment, den privaten Pilotstart und jede Echtdaten-/Policy-/Retention-Aktivierung** – die bisherigen fachlichen Fristenentscheidungen oder diese Datei ersetzen sie nicht. **Rein technische PR-Merges bleiben dagegen nach den bestehenden Bedingungen in [`AGENTS.md`](../../../AGENTS.md) (CI auf exaktem HEAD, unabhängige Review ohne offene wesentliche Findings und nachgewiesen keine produktiven Merge-/Push-Nebeneffekte) an die technische Projektführung delegiert; dafür keine erneute Einzelzustimmung verlangen.**

**Stop-Regel:** Unbekannte Rechtsgrundlagen, nicht belegte Recoverability, fehlende Anbieterbindung oder ein gesperrter Produktionsvertrag führen weiterhin zu **NO-GO** für personenbezogenen Echtbetrieb. Vorhandene funktionale PASS-Ergebnisse bleiben trotzdem gültig.
