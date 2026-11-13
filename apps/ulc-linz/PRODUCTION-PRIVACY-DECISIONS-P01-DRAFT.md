# ULC Linz – P01 Datenschutz- und Aufbewahrungsentscheidungen (ENTWURF)

**Stand:** 13.11.2026. **Status: NICHT GENEHMIGT; KEIN PRODUKTIVBETRIEB.** Diese fachliche Vorlage ist kein Rechtsgutachten und keine Policy-Aktivierung. Quelle: [Produktiv-Sprint #607](https://github.com/martinirrgeher-cloud/appbasis/issues/607), [Produktionsblocker #483](https://github.com/martinirrgeher-cloud/appbasis/issues/483), `privacy/m5-high-privacy-assessment.json` (Kinder-/Jugenddaten: `high-privacy-required`) und `privacy/athlete-deletion-recovery-policy.json` (35-Tage-Quellautorität, nach Ablauf `deny`).

## Ziel und verbindliche Entscheidungsregel

Die vollständige ULC-Linz-App soll mit echten Vereinsdaten für eine kleine berechtigte Nutzergruppe starten. Dazu braucht der Verein als Verantwortlicher **vorher** eine ausdrücklich beschlossene Datenverarbeitungs-, Lösch-, Aufbewahrungs- und Backup-Regel. Entwicklungstests, grüne CI, ein installierter Production-Contract oder ein abgenommenes UI ersetzen diese Entscheidung nicht. Derzeit dürfen wir daraus weder nachträglich Aufbewahrungsfristen ableiten noch personenbezogene Daten durch bloße Pseudonymisierung als rechtlich unproblematisch behandeln.

**Der Betreiber sollte die Entscheidung zusammen mit dem für Datenschutz zuständigen Vereinsverantwortlichen prüfen.** Ggf. Rechtsberatung/Datenschutzexpertise einholen, insbesondere zu Daten Minderjähriger, Rechtsgrundlagen, Auftragsverarbeitern und Dokumentationspflichten. Die nachfolgenden Empfehlungen sind technische Vorsichtsmaßnahmen, keine Behauptung einer bestimmten gesetzlichen Aufbewahrungsdauer.

## P01-Entscheidungsmatrix

| Datenbereich / Owner | Zweck / Betroffene | Vorschlag für risikoarme technische Behandlung | Vor Aktivierung notwendige Entscheidung |
| --- | --- | --- | --- |
| Athletenstammdaten, Trainer, Gruppen und Kontakte (`athletes`) | Vereinsbetrieb; Personen einschließlich Minderjähriger und Elternkontakte | Nur notwendige Felder; aktiver Zugriff strikt nach Rolle/Gruppe; Deaktivierung von Löschung unterscheiden; Auskunft/Export ermöglichen | Datenumfang, Rechtsgrundlage, wer Zugang hat; Frist nach Austritt; Berichtigung/Erasure; Minderjährigen-/Kontaktkonzept |
| Selbstanmeldung, Anwesenheit und Trainerzuordnung (`ulc-linz` app-owned) | Trainingsorganisation, Teilnahmehistorie, Auswertungen | Persönliche Historie nur so lange speichern wie für festgelegte Zwecke nötig; die vorhandenen `saveSession`/`saveRegistration` und alle Änderungs-/Auditpfade in eine gemeinsame Dateninventur aufnehmen | Frist für Anwesenheit, Anmeldung, Veränderungshistorie, Trainer-Audit; Berechtigung für Statistik und Freitext |
| Trainingsplanung, -dokumentation und Revisionen (`training-plans`, `training-documentation`) | Trainingsvorbereitung und Trainingsnachweis; in Revisionen auch andere Teilnehmer | Revisionsketten nicht unsichtbar weiter personenbezogen aufbewahren; für Dritte Referenzen gezielt entfernen/redigieren, ohne andere Athleten zu schädigen | Wie lange sind Personenbezüge für abgeschlossene Trainings nötig? Behandlung von Drittpersonen, Trainerkommentaren und Nachweiszwecken |
| Übungskatalog und Trainingsblöcke – Stammvorlagen und allgemeine Revisionen | Sportfachliche, teils nicht personenbezogene Vorlagen | Nichtpersonenbezogene Definitionen grundsätzlich unabhängig von Athletendaten behandeln; personenbezogene Notizen aus Revisionen separat bewerten | Sind Vorlage/Revision wirklich personenneutral? Müssen private Kommentare, Besitzer oder Änderungen personenbezogen gelöscht werden? |
| Persönliche Favoriten (`exercise-catalog`, `training-blocks`) | Präferenz einer konkreten Benutzeridentität | Mit Benutzerlöschung getrennt pro Principal entfernen und Wiederherstellung alter Favoriten über Tombstone-/No-Resurrection-Gates absichern | Ob Favoriten bei Austritt sofort oder nach begründeter Frist gelöscht werden, und Umgang mit Restore-/Backupkopien |
| Usage-Events inkl. `source_ref`, `note`, ältere Legacy-Events | Nutzungsstatistik; potenziell Athletenidentität oder Freitext | **Vorsichtshalber personenbezogen behandeln**, wenn eine Zuordnung über Notizen/Referenzen möglich ist. Eindeutig nachgewiesene Eigentümer gesondert löschen; unzuordenbare Alt-Events **nicht blind einem Athleten zuordnen**, aber auch nicht als anonym einstufen. Neue Schreibwege sollen möglichst keine frei identifizierenden Daten in `note` ablegen | Ob personenbezogene historische Usage überhaupt benötigt wird; konkrete Frist; zulässige Bereinigung/Sperrung ungeklärter Legacy-Ereignisse ohne unrichtige Attribution |
| Private Übungsmedien / externe Dateien | Aufgenommene Medien, ggf. Personen erkennbar | Zwei Schritte: autorisierte Löschanforderung und nachweisbarer Storage-Provider-Delete, **erst dann** die Datenbankmetadaten als erledigt markieren. Fehler- und Retrypfad benötigt | Welche Medien dürfen verwendet werden, Storage-Provider/Region/AVV/Zugriff, Entfernungsfrist und Verifikation physischer Löschung |
| Identität, Berechtigungen, Security-/Trainer-Audit | Anmeldung, Missbrauchs-/Zugriffsprüfung | Betriebsnotwendige Audit-Informationen minimieren und von fachlichen Trainingsdaten trennen; eingeschränkte Administratorenzugriffe | Verantwortlicher, Zweck, Zugriff und Frist der Sicherheits-/Änderungsprotokolle, Rollen und Umgang mit gesperrten Konten |
| Backups, Restore-Snapshots und Löschmarkierungen | Wiederherstellung, Verfügbarkeit, Nachweis bereits vollzogener Löschungen | Backupfristen/-zugriffe ausdrücklich festlegen; Restore in Quarantäne halten und **über alle Owner** bereits vollzogene Löschungen erneut durchsetzen, bevor Zugriff/Write freigegeben wird | Backup-Aufbewahrung und Verschlüsselung, regelmäßiger Restore-Test, Re-Deletion-Belege, autoritative Herkunft und Dauer des Minimal-Nachweises nach Ablauf der aktuellen 35 Tage |

## Vier unmittelbar entscheidungsrelevante Punkte

**D1 – Alte Nutzungsnotizen:** Können ältere `training-block`- und `exercise-catalog`-Usage-Events mit `source_ref`/`note` personenbezogene Daten enthalten? Technisch **ja**. Ein nicht verifizierbarer Besitzer beweist **nicht**, dass der Datensatz anonym ist. Empfehlung: bis zur Prüfung keine automatische personenbezogene Erasure-Zuordnung und keine überflüssige zusätzliche Speicherung; abgegrenztes Export-/Inspektionskonzept mit minimalem Zugriff vorbereiten. **Entscheidung offen.**

**D2 – 35-Tage-Löschmarker:** Die aktuelle Athleten-Quellautorität gilt nur bis 35 Tage nach Abschluss. Der derzeitige Produktionsvertrag untersagt einen stillen langfristigen Subject-Ledger oder ein einfaches Weiterverwenden abgelaufener Autorität. Empfehlung: vor Live-Erasure ein minimaldaten- und zweckgebundenes, **atomar** belegbares Folgeentscheid-/Checkpoint-Konzept mit eigener Aufbewahrungsentscheidung prüfen. Bis dahin **keine Live-Nachlaufautomatisierung** und keine falsche Garantie bei abgelaufenen Markern. **Entscheidung offen.**

**D3 – Private Medien:** Eine SQL-Metadatenlöschung entfernt keinen Speichergegenstand. Empfehlung: Storage-Zugriff/Erfolg/Retry/Reconciliation für Medien separat nachweisen; Providervertrag und Datenkategorie prüfen. **Entscheidung offen.**

**D4 – Restore und fremde Datenowner:** Ein wiederhergestelltes altes Backup kann bereits gelöschte Athleten, personenbezogene Notizen, Favoriten oder Dokumentverknüpfungen erneut enthalten. Empfehlung: kein Restore ohne isolierte Datenbank und nachweislich vollständigere Löschautorität; danach alle Owner prüfen und wieder ausführen, inklusive app-owned Anwesenheit/Anmeldung. Leere Markerlisten beweisen keine Vollständigkeit. **Entscheidung offen.**

## Freigabeformular für den Vereinsverantwortlichen (noch nicht unterzeichnet)

- **Verantwortliche Stelle/Vereinsfunktion:** _offen_
- **Datenschutzprüfung der Minderjährigen-/Kontaktverarbeitung:** _offen_
- **Zwecke, Rechtsgrundlagen, Datenumfang:** _offen_
- **Fristen je Tabellenkategorie einschließlich persönlicher Notizen:** _offen_
- **Zugriff/Export/Erasure/Austritt und Freitextkonzept:** _offen_
- **Außerdatenbank-Medien/Provider/Verarbeitung:** _offen_
- **Backup-Verschlüsselung, Retention, Restore und Re-Deletion:** _offen_
- **Entscheidung zur minimalen Löschbeleg-Autorität nach Ablauf der aktuellen 35 Tage:** _offen_
- **Pilotbenutzer und Betriebsverantwortliche:** _offen_
- **Freigabedatum/Entscheider:** _offen_

Nur wenn diese Punkte ausreichend geklärt, technisch überprüfbar umgesetzt und gesondert abgenommen sind, können P02/P03-Implementierungen und spätere `production=ready`-Verträge zur Betreiberfreigabe vorgeschlagen werden. **Diese Datei setzt ausdrücklich weder Policy noch Timer, neue Tabelle, Scheduler oder Go-live in Kraft.**
