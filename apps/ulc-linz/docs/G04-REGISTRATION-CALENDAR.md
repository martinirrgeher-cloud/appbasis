# G-04 – Trainingskalender/Anmeldefristen: neue Struktur (Stand 08.11.2026)

## Entscheidung

Der Betreiber bestätigt, dass **noch keine Echtdaten** in der betreffenden
Trainingsanmeldung verwendet werden. Darum ist keine Kompatibilitätsmigration
für echte historische Anmeldungen nötig. Trotzdem werden die bereits geprüften
Anwesenheits-/Anmeldemodule **nicht destruktiv zurückgesetzt**: sie sind
unabhängige, funktionierende Standardmodule. Dieser Change ist die erste
kleine technische Grundlage und **noch keine aktivierte Funktion**.

## Kalenderfachmodell (G-04.1)

Eine aktive Trainingsgruppe im Modus `self_registration` kann einen eigenen
Regelsatz haben:

- `weekdays`: sortierte ISO-Wochentage Montag=1 bis Sonntag=7; mindestens einer.
- `weeksAhead`: maximal 0–26 Kalenderwochen voraus (inklusive aktuelle Woche).
- `deadline`: optional, `daysBefore` 0–14 plus lokale Uhrzeit `HH:MM`.
- `lateMode`: `allow` oder `block`; die UI meldet späte Anmeldungen auch bei
  `allow`, die verbindliche Entscheidung trifft immer die Serverzeit.
- Gültige Abweichungen pro Datum: `extra` (Zusatztraining), `cancelled`
  (abgesagt) und ein revisioniertes `none` zum Zurücksetzen. Ein aus
  Selbstanmeldung entstandener Trainingstermin ist **keine** Freigabe eines
  normalerweise nicht vorgesehenen Wochentags.
- Wien-Zeitzone: `Europe/Vienna`; doppelter Herbststunden-Meldeschluss
  schließt **beim ersten** Erreichen und öffnet danach nicht erneut.
  Fehlende Frühlingsminute schließt an der ersten gültigen Minute danach.
- Ohne aktiven Regelsatz bleibt die bisherige 7-Tage-Anmeldung zunächst
  unverändert; bestehende Session-/Registrierungszustände bleiben lesbar.

Die Evaluierungsfunktion ist pure/domain-only, arbeitet mit einer
vertrauenswürdigen UTC-Serverzeit, einem bereits autorisierten Regelobjekt,
dem bestehenden Training-/Anmeldestatus und expliziter Abweichung.

## Persistenzentwurf (noch nicht aktiviert)

`migrations/0016_ulc_linz_registration_calendar.sql` ist eine **v17-
Kandidatenmigration**, die **nicht** im aktuellen
`appbasis.database.json` mit Schema v16 enthalten ist. Sie darf weder
automatisch noch manuell auf Preview/Produktion angewandt werden, bis die
getrennte Migrationsfreigabe und notwendige Release-/Datenschutzverträge
vorliegen.

Zwei app-eigene Tabellen, beide gruppen- und organisationsgebunden:

- `ulc_linz_registration_calendar_rule`: Wochenmaske, Frist,
  Bearbeitungsvorlauf, Late-Mode, Revision.
- `ulc_linz_registration_calendar_exception`: exaktes Datum, Ausnahmezustand
  `extra|cancelled|none`, Revision. Kein physisches Löschen bei
  „Zurücksetzen“, damit alte Clients nicht unbemerkt einen Status wiederbeleben.

**Keine neuen Athlete-/Member-/Actor-IDs, Telefonnummern, Notizen,
Freitexte oder personenbezogenen Verlaufsprotokolle**. Beide Tabellen haben
lediglich `updated_at`. Auskunfts-/Retention-/Restorepflichten für künftig
tatsächlich erhobene Personenbezüge sind trotzdem vor einer eventuellen
Produktionsfreigabe mit dem Verantwortlichen zu klären.

`PostgresUlcRegistrationCalendarRepository` besitzt nur passive
Lese-/Schreibmethoden. CAS-Änderungen prüfen im SQL (mit Gruppensperre)
Organisation, aktive Gruppe und `self_registration`. Ein Write-HTTP-Endpunkt
ist **absichtlich noch nicht aktiviert**; DB-Zugriff ist allein keine
Berechtigungsprüfung für Anwender.

## Separater Folgeumfang G-04.2 / G-04.3

Erst nach der fachlichen Freigabe dieser Struktur:

1. Authorisierte API-Gruppe: Lesen nur mit kanonischem `athletes:view`,
   Bearbeiten nur `athletes:edit` der richtigen Organisation. Änderungen an
   Sonderterminen durch Trainer nur nach **aktueller** Gruppenzuordnung und
   bewusst gesonderter Erlaubnis.
2. Migration in **isolierter Preview**, getrennt freigegeben, mit
   Manifest v17 und vollständig gebundenem Schema-/Export-/Datenschutzvertrag.
3. Bindung an `self-registration-service.ts` (eigen/stv.): die aktuelle
   Wochenansicht zeigt nur zugelassene Tage, ggf. abgesagte Tage und
   bestehende Einträge. Frist und Grund der Sperre sind lesbar.
4. **Verbindlicher atomarer DB-Schreibschutz**: nicht nur ausgegraute
   Buttons. Direkt-/Proxy-POSTs, policy/special-day Änderungen und
   Session-Erstellung müssen bei parallelen Requests und geänderter
   Gruppenzuordnung dieselben Regeln erzwingen; keine ungewollt angelegten
   leeren Sessions. Bei CAS/Fristfehler bleibt der eingegebene Hinweis erhalten.
5. Mobile Einstellungen direkt im Gruppen-Overlay und Sondertermin-Maske
   in der Anwesenheit; 44px Touch, Fokus/Overlay und bestehende
   Wochen-Navigation, Nachwuchs-Anwesenheit, Statistik und Autosave schützen.

## Nachweis / Grenzen

- G-04.1: Domain-Tests für Wochentage, Vorlauf, Grundstatus, Absagen,
  Zusatztermine, Zurücksetzen, Winter/Sommer und beide DST-Übergänge.
- Eigener echter PostgreSQL-18-Test in frischer isolierter Testdatenbank,
  nachdem die *aktuelle v16-Manifestauswahl* und dann nur der v17-Kandidat
  geladen wurden: org-/mode-scoped CAS, stale reset, Konkurrenzschreibzugriffe,
  nicht-personenbezogene Tabellen.
- Dieser Test ist kein Beleg für eine existierende v17-Preview-Migration,
  keine auth-Zugangsprüfung und kein vollständiger Browser-E2E.
- Alte Draft-PR #513 bleibt unangetastet, darf nicht versehentlich gemergt
  oder zur automatischen Migration benutzt werden.

**Gate:** Eigener PR, CI, Review; kein Merge, keine Preview- oder
Produktionsmutation ohne nächste ausdrückliche Betreiberfreigabe.
