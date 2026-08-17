# M5 – ULC Acceptance Matrix

Stand: 2026-08-17

## Grundregel

Nur der exakte boolesche Nachweis `true` aus einer zur konkreten ULC-Zielumgebung passenden Evidenzquelle darf ein Kriterium verifizieren. Fehlende, veraltete, fremde oder nur geplante Evidenz bleibt `open`.

| # | Kriterium | Pflichtnachweis für ULC | Mindest-Acceptance | Vorbereitung |
|---:|---|---|---|---|
| 1 | Datenregion | autoritativer Zustand der konkreten Produktionsdatenbank plus Betreiberziel EU/Frankfurt | Ressource und Region stimmen exakt; andere/fehlende Region bleibt offen | Providerabfrage und Evidenzformat vorbereiten |
| 2 | AVV/DPA | aktueller Nachweis für jeden tatsächlich personenbezogene Daten verarbeitenden Dienst | Betreiber, Dienstumfang, Dokumentstand und Prüfdatum vollständig | Providerinventar und Prüfliste vorbereiten |
| 3 | Verschlüsselung | konkrete at-rest- und in-transit-Konfiguration inklusive Backups und Secret-Grenzen | TLS erzwungen; keine Credentials im Manifest/Repository; Backupverschlüsselung belegt | Prüfpunkte je Ressourcentyp vorbereiten |
| 4 | Rollen & Rechte | ULC-Rollen, Modulrechte, Organisationsgrenze und Self-/Managed-Scope in realer Runtime | positive Rollenfälle; Cross-Org, unbekannte Capability, inaktive Membership und letzter-Admin-Negativfälle | Testfälle vollständig spezifizieren |
| 5 | Löschkonzept | bestätigte Regeln plus ausführbarer, berechtigungsgeprüfter und auditierter Prozess | Deaktivierung ist nicht Löschung; Ausnahmen sind datenklassenspezifisch; Restore reaktiviert nichts dauerhaft | Zustände und Datenklassen festlegen |
| 6 | Aufbewahrung | bestätigte Frist je Datenklasse plus prüfbarer Lebenszyklus | fällige Datensätze werden erkannt; dokumentierte Ausnahme blockiert nur die betroffene Klasse | Fristenentscheidung vorbereiten |
| 7 | Datenexport | app-spezifischer Self-/Managed-Export und separater Organisations-Export | kein Cross-Org-/Fremddatenexport; Rollen-/Scopeprüfung; Audit; dokumentiertes Format | Felder und JSON/CSV-Vertrag definieren |
| 8 | Audit-/Security-Logging | konkrete ULC-Securityereignisse, Zugriffsschutz und bestätigte Retention | Actor, Aktion, Ziel, Organisation und Zeitpunkt; unberechtigter Logzugriff wird abgewiesen | Ereignisinventar vorbereiten |
| 9 | Subprozessoren | aktuelle Liste für alle tatsächlich verwendeten Provider/Dienste | Dienstzuordnung, Prüfdatum und Reviewzeitpunkt vollständig | Evidenzformat vorbereiten |
| 10 | High-Privacy-Profil | konkrete ULC-Bindung plus Erfüllung des kanonischen Profils | fehlender Teilnachweis hält das gesamte Kriterium offen | Prüfliste aus Profil ableiten |
| 11 | Secrets außerhalb App-Manifeste | bestehender Manifest- und Generatorvertrag | keine Providercredentials oder Secretwerte in App-Definition und generiertem Output | bereits repository-seitig belegt; Appbindung prüfen |
| 12 | Privilegierte Control Plane getrennt | autoritativer ULC-Runtime-/Providerzustand | kein unnötiger öffentlicher Ingress; erwartete Bindings/Secrets; frischer Nachweis | Reference-Muster auf ULC-Ziel zuschneiden |

## Rollen-/Scope-Pflichtfälle

1. Admin verwaltet Rollen und Modulrechte ausschließlich im eigenen Verein.
2. Kindertrainer bearbeitet Kindertraining/U12/U14, aber keinen nicht zugewiesenen Leistungsbereich.
3. Leistungstrainer bearbeitet nur zugewiesene Module; `training_overview` bleibt read-only.
4. Athlete bearbeitet nur zulässige eigene Fachpfade.
5. Parent liest nur zulässig verknüpfte Kinderpfade und besitzt dort kein Schreibrecht.
6. Cross-Organization-Zugriff wird unabhängig von Rolle oder Modulrecht verweigert.
7. Fehlende aktive Mitgliedschaft wird deny-by-default abgewiesen.
8. Unbekannte Rolle, Capability oder Scope-Kombination wird abgewiesen.
9. Self-/Managed-Verknüpfungen dürfen keine fremde Organisation überbrücken.
10. Der letzte aktive Administrator kann nicht entfernt oder herabgestuft werden.

## Betreiberentscheidungen vor technischer Umsetzung

Folgende vorbereitete Vereinswerte müssen bestätigt oder begründet angepasst werden:

- Mitglieds-/Kontaktstammdaten: Ziel 12 Monate nach Austritt/Zweckende
- operative Trainings-/Teilnahmedaten: Ziel 24 Monate, danach löschen/anonymisieren
- besonders sensible Zusatzdaten: Ziel 90 Tage nach Zweckende
- Audit-/Security-Daten: Ziel 12 Monate
- Backup-Rotation: maximal 35 Tage
- Medien: eigene Zweck-, Ownership- und Löschregel

Die Bestätigung ist Policy-Input, aber allein noch keine technische Evidenz.

## Veränderliche Evidenz

Provider-, DPA- und Subprozessoren-Nachweise erhalten `observedAt` sowie `validUntilOrReviewAt`. Ein abgelaufener Nachweis fällt automatisch auf `open`; eine frühere Zustimmung oder ein historischer Providerzustand darf Produktion nicht dauerhaft autorisieren.
