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
| 5 | Löschkonzept | bestätigte Regeln plus ausführbarer, berechtigungsgeprüfter und auditierter Prozess | Deaktivierung ist nicht Löschung; Ausnahmen sind datenklassenspezifisch; Restore reaktiviert nichts dauerhaft | Betreiberregeln bestätigt; technische Runtime-Evidenz offen |
| 6 | Aufbewahrung | bestätigte Frist je Datenklasse plus prüfbarer Lebenszyklus | fällige Datensätze werden erkannt; dokumentierte Ausnahme blockiert nur die betroffene Klasse | Betreiberfristen bestätigt; technische Runtime-Evidenz offen |
| 7 | Datenexport | app-spezifischer Self-/Managed-Export und separater Organisations-Export | kein Cross-Org-/Fremddatenexport; Rollen-/Scopeprüfung; Audit; dokumentiertes Format | JSON kanonisch, CSV ergänzend bestätigt; technische Umsetzung offen |
| 8 | Audit-/Security-Logging | konkrete ULC-Securityereignisse, Zugriffsschutz und bestätigte Retention | Actor, Aktion, Ziel, Organisation und Zeitpunkt; unberechtigter Logzugriff wird abgewiesen | 12 Monate Retention bestätigt; Ereignisinventar vorbereiten |
| 9 | Subprozessoren | aktuelle Liste für alle tatsächlich verwendeten Provider/Dienste | Dienstzuordnung, Prüfdatum und Reviewzeitpunkt vollständig | Provider-Scope Cloudflare + Neon bestätigt; Evidenzformat vorbereiten |
| 10 | High-Privacy-Profil | konkrete ULC-Bindung plus Erfüllung des kanonischen Profils | fehlender Teilnachweis hält das gesamte Kriterium offen | Prüfliste aus Profil ableiten |
| 11 | Secrets außerhalb App-Manifeste | bestehender Manifest- und Generatorvertrag | keine Providercredentials oder Secretwerte in App-Definition und generiertem Output | bereits repository-seitig belegt; Appbindung prüfen |
| 12 | Privilegierte Control Plane getrennt | autoritativer ULC-Runtime-/Providerzustand für jede privilegierte Komponente | Ressource eindeutig vorhanden; `workers.dev=false`; Preview-URLs aus; keine Custom Domain/Worker Route; erwartete interne Binding-Beziehung; frischer und workflowgebundener Nachweis | Reference-Muster konkret auf reale ULC-Runtime zuschneiden; bis dahin `open` |

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

## M5-H Pflichtfälle – privilegierte Control Plane

Für jede später als privilegiert klassifizierte ULC-Komponente gelten mindestens folgende Acceptance-Fälle:

1. Der Providerzustand identifiziert die erwartete Ressource im erwarteten Account genau einmal.
2. `workers.dev` ist explizit deaktiviert.
3. Preview-URLs sind explizit deaktiviert.
4. Es existiert keine Custom Domain.
5. Es existiert keine öffentliche Worker Route.
6. Optional gelieferte Domain-/Route-Pagination oder Result-Metadaten sind konsistent und lassen kein verborgenes späteres Ergebnis offen.
7. Eine benötigte interne Service-Binding-Beziehung zeigt exakt auf die erwartete privilegierte Ressource; eine öffentliche Ersatzroute wird abgewiesen.
8. Falsche App, falsche Umgebung, falscher Provideraccount oder Reference-/Preview-Evidenz werden nicht akzeptiert.
9. Providerfehler, ungültiges JSON, `success != true`, fehlende Felder oder mehrdeutige Inventare bleiben fail-closed.
10. Ein neuerer fehlgeschlagener oder laufender Evidence-Run darf nicht durch einen älteren erfolgreichen Lauf übergangen werden.
11. Der akzeptierte Evidence-Run ist höchstens 24 Stunden alt und an die aktuell vertrauenswürdige Workflow-Revision gebunden.
12. Solange keine reale ULC-Runtime existiert, bleibt Kriterium 12 `open`.

## Bestätigte Betreiberentscheidungen

Am 2026-08-17 wurden folgende Werte für ULC Linz als Betreiber-Policy bestätigt:

- Mitglieds-/Kontaktstammdaten: 12 Monate nach Austritt/Zweckende, danach löschen oder belastbar anonymisieren.
- Operative Trainings-/Teilnahmedaten: 24 Monate, danach löschen oder irreversibel anonymisieren; rein anonyme/statistische Daten dürfen erhalten bleiben.
- Besonders sensible Zusatzdaten: 90 Tage nach Zweckende; medizinische Diagnosen/Gesundheitsakten werden in v0.1 nicht als normaler App-Datenbestand vorgesehen.
- Audit-/Security-Daten: 12 Monate.
- Backup-Rotation: maximal 35 Tage; Restore darf bereits gelöschte Daten nicht dauerhaft wieder aktivieren.
- Medien: folgen grundsätzlich dem zugehörigen Datensatz; verwaiste Medien werden spätestens nach 30 Tagen entfernt.
- Datenexport: JSON ist der kanonische vollständige Export; CSV darf ergänzend für einfache tabellarische Daten angeboten werden.
- Provider-Scope für M5 v0.1: ausschließlich Cloudflare und Neon/PostgreSQL. Keine zusätzlichen Analytics-, E-Mail-, Tracking- oder externen Storage-Dienste.

Diese Bestätigung ist verbindlicher Policy-Input, aber allein noch keine technische M5-Evidenz.

## Veränderliche Evidenz

Provider-, DPA- und Subprozessoren-Nachweise enthalten zur Laufzeit `observedAt` sowie `validUntilOrReviewAt`. Ein abgelaufener Nachweis fällt automatisch auf `open`; eine frühere Zustimmung oder ein historischer Providerzustand darf Produktion nicht dauerhaft autorisieren. Diese volatilen Werte sind Evidence-Output und werden nicht als dauerhafter Repositoryzustand committed.
