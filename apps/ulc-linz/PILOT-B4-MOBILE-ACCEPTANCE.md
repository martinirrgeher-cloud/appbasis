# ULC Linz – B4: Kompakte Handy-Abnahme vor dem privaten Vereins-Pilot

**Stand: 16.11.2026 – Testvorbereitung, keine Live-Freigabe.** Anwendung für ca. 30 Vereinsnutzer. Ziel: mit einem zusammenhängenden Praxisdurchlauf die **bereits entwickelten** Module gegen echte Bedienabläufe abnehmen, ohne neue Architektur, zusätzliche Module oder lange K2-Sonderaudits.

## 1. Sofort gültige Betriebsgrenzen

- **Nur bisherige isolierte Preview**: `https://appbasis-ulc-linz.martin-irrgeher.workers.dev/`. Für diese Abnahme ausschließlich **synthetische Athleten, fiktive Kontakte und Testbenutzer** verwenden, ausdrücklich **keine realen Kinder-/Vereinsdaten**.
- **B3 nicht als erledigt markieren**: Die zum Commit `73473c5e38a7e15982993f3ec347f526441f0768` gehörende Preview-Aktualisierung ist durch GitHub Actions `Queued` ohne Jobs blockiert (Run `43940894792`). Nicht parallel deployen oder B3-Flag aktivieren. `APPBASIS_ULC_PILOT_TRAINING_WRITE_GUARD=disabled` beibehalten.
- Während der Sperre dürfen die **bestehenden Funktionen** mit synthetischen Testdaten geprüft werden. B3-geschützte 403/409-Livetests erst **nach** separatem Preview-Deploy, `/api/health/b3-guard-preflight` = `READY` und kontrollierter Aktivierung. Sie sind **nicht** Teil der sofort möglichen B4-Abnahme.
- Bereits automatisierte Tests sind Belege für **Teilfunktionen**, keine End-to-End-Handyabnahme und keine Produktionsfreigabe. Kein Datenbank-/Provider-Schema ändern, keine Merges/Deployments im Rahmen von B4.

## 2. Ein kleiner Testdatensatz statt vieler Einzeltests

- **Admin:** bestehender technischer Preview-Admin, keine echten Vereinsbenutzer.
- **Trainer U12/U14/Kinder:** ein fiktiver Trainer mit eindeutigen Gruppenzuordnungen, bei Bedarf ein zweiter zum Rollentest.
- **Selbstanmeldung:** ein fiktiver Athlet in IRG mit Testberechtigung; optional eine Test-Proxy-/Elternrolle, nur falls bereits eingerichtet.
- **Athleten:** drei eindeutig fiktive Personen, zwei in einer Nachwuchsgruppe und eine in IRG; ein Athlet zusätzlich mit fiktivem Kontakt. Keine Gesundheitsdaten, Fotos oder echten Telefonnummern.
- **Training:** je ein Testtermin U12, U14, Kindertraining und IRG; U12 mit zwei Inhalten, einer Notiz und einem zugeordneten Trainer.
- **Messung:** vor Testbeginn mobil angemeldet, Datum/Gruppen kalibrieren, einmal warm laden. Langsame Seitenwechsel nur dokumentieren, wenn im normalen Gebrauch störend (reproduzierbar, Kontext/ungefähre Sekunden notieren); keine neuen Mikro-Performance-Gates.

## 3. B4-Abnahme in drei zusammenhängenden Durchläufen

`PASS` bedeutet **vorhandene Daten nach Seitenwechsel/Neuladen wieder lesbar** und keine unberechtigte Sicht/Änderung. `FAIL` braucht nur Modul, Kurzbefehl, erwartetes/echtes Verhalten, Gerät und falls vorhanden Screenshot – **ohne personenbezogene Daten**.

| ID | Rolle / Weg | Genau eine praktische Handlung | PASS-Bedingung |
| --- | --- | --- | --- |
| A01 | Admin → Start/Login | Anmelden, Hauptmenü öffnen, abmelden und erneut anmelden | Keine 503; richtige Rolle/Menüpunkte; Gast bekommt keine geschützten Inhalte |
| A02 | Admin → Stammdaten → Athleten | Fiktiven Athleten mit Gruppe und einem Testkontakt anlegen; danach ändern | Gruppe/Kontakt bleiben nach Neuaufruf erhalten, kein Duplikat |
| A03 | Trainer → U12 → Athlet hinzufügen | In U12 über „+ Athlet“ Testathleten anlegen und mit X/Zurück schließen | Rückkehr **direkt zur U12-Anwesenheit**, nicht zu den Stammdaten |
| A04 | Admin → Benutzerverwaltung | Bestehende **Testrolle** (z. B. Trainer/Funktionär) ansehen, Berechtigung gezielt ändern, dann zurückstellen | Nur zugeordnete Module sichtbar; keine technische Admin-Eskalation |
| A05 | Admin → Übungen/Blöcke/Doku | Eine Testübung finden, Trainingsblock nach Gruppe/Kategorie filtern, bestehende Trainingsdoku öffnen | Navigierbar und bearbeitbar **nur mit Berechtigung**; Filter und Einträge bleiben konsistent |
| T01 | Trainer → U12 | Anwesenheit ändern, zwei von max. fünf Inhalten zuordnen, Notiz/Traineranwesenheit ergänzen; Ansicht wechseln und zurück | Hintergrundspeichern blockiert Navigation nicht; alle Änderungen nach Neuladen erhalten |
| T02 | Trainer → U14 | Eigenen Termin/Anwesenheit mit zwei Testathleten bearbeiten | Dieselben wesentlichen Funktionen wie U12, aber keine Vermischung mit U12-Daten |
| T03 | Trainer → Kindertraining | Bei eingestelltem Dienstag über „Nächstes Training“/Pfeil wechseln, Anwesenheit ändern | **Ein** Sprung zum nächsten erlaubten Trainingstag; keine fremden Wochentage; gespeicherte Daten bleiben |
| T04 | Trainer → Statistik | Nach Training, Athlet, Kategorie **und Trainer** gruppieren; vorhandenen CSV-Export prüfen | Nur Gruppendaten, sinnvolle Zählung, CSV korrekt und nicht vor geladenem Report freigegeben |
| T05 | Trainer → Trainingsplanung | Testplan ändern und ohne Speichern-Button navigieren; zurückkommen | Autosave bzw. klare noch-offene/Fehler-Rückmeldung; keine stillen Datenverluste |
| S01 | IRG-Testathlet → Selbstanmeldung | Für einen erlaubten Tag selbst anmelden, Seite neu laden und wieder abmelden | Eigene Anmeldung persistiert, unzulässige Kalendertage nicht als zulässig dargestellt |
| S02 | IRG → Anmeldefrist / Proxy | Fristüberschreitung oder gesperrten Tag prüfen; Proxy nur mit bereits autorisierter Testrolle | Keine unzulässige Anmeldung möglich; keine fremden Athleten auswählbar |
| F01 | Trainer → Offline/Netzfehler / Abmelden | **Nur bei fiktivem Testtermin:** Verbindung vor einem noch nicht gesendeten Entwurf kurz deaktivieren und wiederherstellen; bei offenem oder fehlgeschlagenem Speichervorgang Abmelden versuchen | Entwurf sichtbar; kein heimliches doppeltes POST; bei unbestätigtem Ergebnis blockiert Abmelden mit klarer Meldung bis zur Prüfung; bei normalem Entwurf bleibt Autosave erhalten |

**Umfang bewusst begrenzt:** 13 Checks, keine zweite Abnahme bereits geprüfter Detailoptionen, kein verpflichtender Volltest aller Rollenvarianten oder langfristiger Performance-Benchmarks.

## 4. Bereits vorhandene automatisierte Teilbelege (auf `main` statisch geprüft)

| Bereich | Vorhandene Tests | Nicht damit bewiesen |
| --- | --- | --- |
| U12/U14/Kinder Parität & Date Navigation | `youth-attendance-parity.test.ts`, `kids-training-calendar-navigation.test.ts`, `u12-athlete-return.test.ts` | Tatsächliche Handybedienung und reale Netzwerkzeiten |
| Verlässliches Speichern / Offline / Navigation / Abmelden | `p07-background-attendance-navigation.test.ts`, `youth-network-reliability-g02.test.ts`, `youth-autosave-notes.test.ts`; **neu in diesem Branch:** `b4-signout-pending-attendance.test.ts` | Echte End-to-End-Sitzung mit Unterbrechung; neuer B4-Code/Test noch ohne CI |
| Trainer-Anwesenheit / Statistik / CSV | `youth-trainer-attendance.test.ts`, `youth-statistics-a042.test.ts`, `u12-statistics-export.test.ts` | Fachliche Plausibilitätsabnahme anhand Testterminen |
| IRG / Kalender / Fristen / Proxy | `self-registration-calendar-service.test.ts`, `self-registration-service.test.ts`, `registration-calendar.postgres.e2e.test.ts` | Reale Bedienberechtigung einer Testathletenrolle |
| Athleten / Rollen / Funktionsprofile | `athlete-complete-create.test.ts`, `user-admin-access-roles.test.ts`, `trainer-identity.postgres.e2e.test.ts` | Bedienablauf von Anlage bis Rechtwechsel |
| Trainingsplanung / Übungskatalog / Blöcke / Doku | `training-plans-autosave.test.ts`, `training-plans-offline-failclosed.test.ts`, `exercise-catalog-ui.test.ts`, `training-block-filters-ui.test.ts`, `training-documentation-ui.test.ts` | Gleichzeitige Nutzbarkeit mit einer echten Testrolle |
| B3 Sicherheit | `p03-live-training-session-actor-permission.postgres.e2e.test.ts`, `pilot-training-write-guard.test.ts` | **Aktivierter** Schreibschutz auf dem live deployten Worker; B3 ist getrennt BLOCKED |

**Bewertung:** In den Kernbereichen sind bereits Tests vorhanden. Es fehlt kein neues Testframework. Die wesentliche Lücke sind **geschäftliche End-to-End-Szenarien mit unterschiedlichen Rollen**, erst die obigen 13 Handychecks schließen sie für B4.

## 5. Ein gemeinsames Ergebnis statt 13 Freigaberunden

Ergebnisse gesammelt zurückmelden, z. B. `A01–A05 PASS; T01 FAIL (nach Neuladen Notiz fehlt); T02–T05 PASS; S01–S02 PASS; F01 PASS`. **Bei jedem FAIL nur die eine konkrete Abweichung** mit Screenshot/kurzer Reproduktion liefern. Keine Unterbrechung nach jedem einzelnen PASS.

- **B4 PASS**, wenn alle 13 jeweils durchgeführten Pflichtchecks PASS sind und keine nutzungsblockierenden Fehler offen sind. `S02`-Proxy-Variante kann entfallen, falls im echten Vereinsmodell nicht aktiviert; der Frist-/Tag-Negativtest bleibt Pflicht.
- **B3 separat BLOCKED**, bis Live-P03-I-Schreibschutz trotz Proxy-DSN nachweislich aktiviert und Positiv-/Negativspeicherfälle kontrolliert bestanden sind.
- **Privater Pilot mit Echtdaten bleibt NO-GO**, bis Datenschutz-/Provider-/Medienbackup-/Produktionsumgebungsentscheidungen nach B1/B2/B3 zusätzlich freigegeben sind. Der einmalige PostgreSQL-Backup/Restore-**PASS** ist ein wichtiger Teilnachweis, aber kein vollständiges Restore aller Medien.

## 6. Vorgehen während GitHub Actions gestört ist

- Dieser Stand enthält **Abnahmeplan plus kleinen Sign-out-Sicherheitsfix** in einem separaten Branch, nicht in der laufenden App. Kein Mergen/Deployen nötig, um mit fiktiven Testpersonen die alte funktionierende Preview zu bedienen. Die neuen B4-Tests wurden **noch nicht in CI ausgeführt**, solange GitHub Actions blockiert.
- GitHub-Lauf `43940894792` nicht durch parallele Deploys oder geänderte Concurrency umgehen. Nach GitHub-Klärung den neuen B3-Build gezielt deployen und erst bei `READY` den Sicherheitscheck fortsetzen.
- Nach gesammelt gemeldeten B4-Abweichungen **ein gemeinsamer kleiner Fehlerbehebungs-PR**, statt zahlreiche getrennte Details.
