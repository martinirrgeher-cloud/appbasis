# T02 – Veröffentlichung und einmalige Information der Vereinsmitglieder

**Vereinbarter Informationsweg:** Betreiberentscheidung vom 22.11.2026: **(1) vollständigen Datenschutzhinweis dauerhaft in der App abrufbar machen, (2) Trainerinnen und Trainer sowie Erziehungsberechtigte minderjähriger Athleten einmalig per E-Mail informieren.**

**Status: Vorgehen freigegeben – nicht ausgeführt.** Kein Liveversand, keine App-Veröffentlichung, keine personenbezogene Empfängerliste in GitHub. Rechtsgrundlagen, vollständige Anbieter-/Datenflussangaben und reale Aufbewahrungspraxis müssen vorher mit [T02-Hinweisentwurf](./T02-APP-DATENSCHUTZINFORMATION-ENTWURF.md) sowie T01/T03/T04 aus [#716](https://github.com/martinirrgeher-cloud/appbasis/issues/716) abgeglichen werden.

## A. Dauerhaft abrufbar in der App

- **Vollständige finale Fassung**, keine gekürzte oder bloß aus dem öffentlichen GitHub-Draft verlinkte Zwischenfassung.
- **Mobile-First, klarer Einstieg „Datenschutz“** an einem dauerhaft erreichbaren Ort, sinnvollerweise im Hauptmenü bzw. unter Einstellungen/Informationen. Zusätzlich bei Erstnutzung leicht zugänglich; auch für neue berechtigte Benutzer.
- **Vor oder bei erstmaliger Verarbeitung zugänglich**; falls Informationen vor dem Login nötig sind, geeigneter Zugriff ohne aktiven Login mit datensparsamem, rein statischem Hinweis. Nie dafür eine geschützte API oder persönliche Datensätze öffnen.
- **Version, Gültigkeitsdatum, Verantwortlicher und Kontakt** `martin.irrgeher@gmail.com` müssen übereinstimmen. Externe Cloud-/Personendaten nicht in eine öffentliche Repository-Dokumentation kopieren.
- Beim App-Release nur mit genehmigtem Text und separater Deployment-Freigabe. Bestehende mobile Navigation, Anwesenheit, Anmeldung und Trainingsplanung unverändert lassen; nur den neuen Einstieg/Ansicht gezielt prüfen.

**Abnahmenachweis:** URL/Screenshot der veröffentlichten mobilen App-Ansicht + Version/Gültigkeitsdatum + freigegebene Release-SHA, ohne Personen-/Sitzungsdaten. Ein Dokument in einem Draft-PR ist **kein** Nachweis, dass der Hinweis in der App erreichbar ist.

## B. Einmalige E-Mail – Empfänger und Datenschutz

- Trainerinnen und Trainer mit Vereinsaufgaben sowie **Eltern/gesetzliche Vertreter minderjähriger Vereinsathleten** anhand der aktuell autorisierten Vereinskontaktdaten, **nicht aus frei erfundenen oder öffentlich zusammengestellten Verteilern**.
- Volljährige Vereinsmitglieder, Funktionäre und App-Nutzer müssen **ebenfalls Zugang zur Information erhalten**: für sie ist der dauerhafte App-Hinweis bei/ab Erstnutzung vorgesehen; falls die tatsächliche Datenverarbeitung vor dem ersten App-Zugriff beginnt, sind sie rechtzeitig separat zu informieren.
- Eltern können selbst Nichtmitglieder sein; bei Verarbeitung ihrer Kontaktdaten müssen die Informationspflichten eigenständig beachtet werden.
- Vor Versand Empfängergruppen sorgfältig gegen Zuständigkeit und Aktualität prüfen. Bei Massenversand ausschließlich Einzelmails oder **BCC**, keine offenen An-/CC-Listen.
- **Nur eine Erstmitteilung** pro betroffenem Empfängerkreis, mit späteren inhaltlich wesentlichen Änderungen gesondert zu bewerten.
- Vollständige endgültige Datenschutzhinweis-Fassung entweder als passender Anhang (z. B. PDF) oder über den **tatsächlich funktionierenden, freigegebenen dauerhaften App-Link** bereitstellen. Kein Link auf den noch nicht freigegebenen GitHub-Draft als finale Datenschutzinformation.

### Versandvorlage – noch nicht versenden

**Betreff:** ULC Linz – Datenschutzinformation zur Trainings-App

Liebe Trainerinnen und Trainer, liebe Eltern,

wir nutzen für unsere Vereinsmitglieder eine vereinsinterne App zur Trainingsplanung, Anmeldung, Anwesenheit und Dokumentation. Dazu verarbeiten wir die für die jeweilige Vereins- und Trainingsorganisation erforderlichen Daten. Die Informationen zu den konkreten Zwecken, Zugriffsberechtigungen, Speicherfristen und euren Datenschutzrechten findet ihr in unserer Datenschutzinformation zur Trainings-App.

**Datenschutzinformation:** [hier den tatsächlich veröffentlichten und geprüften App-Link zur freigegebenen Fassung einfügen oder die finale Fassung als Anhang beilegen]

Bei Fragen zur Verarbeitung personenbezogener Daten in der App könnt ihr euch an **martin.irrgeher@gmail.com** wenden.

Sportliche Grüße

ULC Linz Oberbank

---

## C. Versand- und Veröffentlichungsprotokoll (nichtöffentlich)

Die folgenden Nachweise werden nach Umsetzung in einer **zugriffsbeschränkten Vereinsakte**, nicht im öffentlichen Repository, erfasst:

| Nachweis | Status |
| --- | --- |
| Rechtlich/fachlich freigegebene Datenschutzinformation (Version, Datum, Freigabeverantwortung) | Offen |
| App-Einstieg und Hinweis tatsächlich freigeschaltet; Link und Release-SHA geprüft | Offen |
| Trainerverteiler aus befugter Vereinsquelle geprüft; Versanddatum und Anzahl dokumentiert | Offen |
| Eltern-/Vertreterverteiler aus befugter Vereinsquelle geprüft; Versanddatum und Anzahl dokumentiert | Offen |
| Volljährige andere Mitglieder/Funktionäre vor oder bei Erhebung informiert | Offen |
| Dokumentierte Beantwortung von Rückfragen und spätere Aktualisierungsmöglichkeit | Offen |

**Kein Versand** aus dieser Dokumentation und keine Nutzung des ChatGPT/Gmail-Kontos ohne gesonderten ausdrücklichen Versandauftrag. Die Betreiberzustimmung vom 22.11.2026 bestätigt die **Methode**, nicht den bereits erfolgten Versand oder die rechtliche App-Datenschutzfreigabe.

**T02-Abschlusskriterium:** Erst bei freigegebener finaler Betroffeneninformation, tatsächlich verfügbarer App-Ansicht und nachweisbarer Erstinformation (bzw. klar begründetem Vorab-Informationsverfahren für die noch nicht gestartete App) darf T02 in #716 als PASS markiert werden. Bis dahin `privacy=blocked` und keine Echtdaten-Verarbeitung aufgrund dieses Dokuments.
