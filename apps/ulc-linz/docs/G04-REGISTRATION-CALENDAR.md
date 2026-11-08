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

## G-04.2a – geprüfte Registrierungsregeln (separater Integrations-PR)

Die Anwendung kann eine injizierte Kalender-Lesequelle nutzen:

- **Nur wenn `registrationCalendar` injiziert wird**: Terminliste liefert
  `registrationWindow`, filtert nicht zulässige neue Wochentage,
  hält existierende Anmeldungen sichtbar und sperrt direkte/stellvertretende
  Aktionen sowie Notizänderungen entsprechend der Regel.
- POST-Speicherpfad erzeugt Trainingstermin und Registration in **einer**
  PostgreSQL-Transaktion; bei Datenbankfehler (`UL024`) keine leeren Termine.
- Die neue Kandidatenmigration enthält nun einen Trigger, der reguläre
  Wochentage, `extra|cancelled|none`, Gruppenzustand, Vorlauf und
  `Europe/Vienna`-Fristen bei jeder Registration-Änderung mit
  PostgreSQL-Sperren nochmals prüft. Die Regel greift dadurch auch nach
  zwischenzeitlicher Änderung einer Gruppenpolicy.
- Die Wochenansicht zeigt Grund und Meldeschluss, deaktiviert
  Anmeldung/Stellvertretung/Notizen bei gesperrtem Termin und behält
  bestehende Optimismus-/Draft-/Konfliktbehandlung bei.
- Tests: isolierter echter SQL-Write-Guard mit Rollback und Ausnahme-Reset,
  eigener Service-Test für direkten und stellvertretenden Pfad, allgemeine
  Typecheck/Unit/Browser/Build-Regression.

**Wichtige Grenze:** Die aktuelle Laufzeit injiziert `registrationCalendar`
noch **nicht**, das Datenbankschema bleibt v16. Damit sind die neuen Regeln
zunächst vorbereitet, **aber nicht aktiv**. Konfigurationsendpunkte für
berechtigte Administratoren, den Sondertermin-Editor, Runtime-Injektion,
v17-Manifeste/Privacy-/Migrationsfreigabe und mobile Fachabnahme sind
eine **gesonderte** Aktivierungsstufe G-04.2b. Kein automatisches
Production-/Preview-Deploy.

## G-04.2b – Gruppen-Editor und Admin-API (noch nicht live)

Der in `registration-calendar-http.ts` definierte API-Vertrag wird durch
die bestehenden, authentifizierten Stammdatenrechte geschützt:

- GET Regel: `/api/modules/athletes/registration-calendar?groupId=...`
- POST Regel: `/api/modules/athletes/registration-calendar`
  (`groupId`, `expectedRevision`, `schedule`)
- GET Abweichung:
  `/api/modules/athletes/registration-calendar/exception?groupId=...&sessionDate=...`
- POST Abweichung:
  `/api/modules/athletes/registration-calendar/exception`
  (`groupId`, `sessionDate`, `expectedRevision`, `kind`)
- Zugriff: **athletes:view** zum Lesen, **athletes:edit** zum Schreiben.
  Gruppen außerhalb der aktuellen Organisation, inaktive Gruppen und Gruppen
  im Trainer-Anwesenheitsmodus sind nicht bearbeitbar (404).
- Schreibenden wird über das CAS-Token bei Konflikt `409 CALENDAR_CONFLICT`
  signalisiert. Ungültige JSON-Bodies, Felder und Daten werden abgewiesen.
- Kein Termin-Import, kein Zurücksetzen der Mitglieder-Anmeldungen,
  keine Löschung einer anderen Modul-Tabelle, kein erneutes Audit mit
  personenbezogenen Feldern.

**Feature-Gate:** `registrationCalendar` ist ein optionales Runtime-Objekt,
das durch `createGeneratedPostgresApplicationRuntime` in diesem PR
**noch nicht injiziert wird**. Beide Endpunkte antworten nach
Authentifizierung mit `503 CALENDAR_NOT_ENABLED`, ohne Schema-v17-Tabellen
abzufragen. Das aktive Schema bleibt v16.

Die vorhandene Stammdaten-Antwort zeigt mit `calendarAvailable`, ob der
Server den Kalender unterstützt. Nur dann erscheint im bestehenden
Gruppen-Overlay für aktive Selbstanmeldegruppen und mit Bearbeitungsrecht
`Trainingstage & Anmeldefristen`. Der Editor nutzt seine bestehenden
mobilen Overlay-/Schließregeln und bietet den sieben-Tage-Plan,
Wochenvorlauf, optionale Meldeschlusszeit in Wien, Nachmeldemodus sowie
separate explizite `extra`/`cancelled`/`none`-Termine. Die gesperrte
Version darf keine 500er oder ungültigen SQL-Zugriffe auslösen.

**Folge-Gate nach CI/Review von G-04.2b:**
Die Aktivierung in einer isolierten **v17-Preview** benötigt gesonderte
Freigabe und einen eigenen PR für Manifest-/Schema-/Migration-/Retention-/
Restore-Verträge sowie Runtime-Injektion. Vorhandene Jugend-Anwesenheit,
Trainingsplanung, eigene/Stellvertreter-Anmeldung und Statistik müssen als
Regression bestehen. Zusätzliche reine Trainer-Ausnahmerechte
(`kindertraining:edit`) werden **noch nicht erweitert**: das würde
gesonderte aktuelle Trainer-Gruppenzuordnung und atomare Scope-Prüfungen
benötigen. Produktion bleibt gesperrt.

## G-04.2c – V17 Preview-Migration und Laufzeit-Aktivierung **vorbereitet, nicht ausgeführt**

**Betriebsstand dieses PR:** Der zentrale `ulc-linz-lifecycle`-Eigentümer
und `apps/ulc-linz/appbasis.database.json` bleiben auf **v16**, damit die
bestehenden exakt gepinnten Generator-, Privacy- und Restore-Verträge nicht
heimlich ungültig werden. Die bereits geprüfte additive `0016`-Migration
ist weiterhin nicht im Manifest registriert. `appbasis.production.json`
bleibt `blocked`.

### Manueller Preview-Migrationspfad (keine automatischen Ausführungen)

`tooling/ulc-linz-g04-calendar-v17-preview.mjs` kann den aktuellen
v16-Vertrag prüfen (`plan`), eine separate Datenbank **lesend**
untersuchen (`inspect`), einen ausschließlich für die isolierte Preview
freigegebenen v17-Schritt ausführen (`apply`) und `verify`. Die
Klassifizierung kennt nur `migration-required` oder `current`:
fehlende v16-Voraussetzungen, teilweise vorhandene v17-Tabellen,
unvollständige PKs oder ein deaktivierter Trigger führen zum **Abbruch**.

Das Skript verweigert jede Migration ohne `apply=true`, die beiden
vorgesehenen Umgebungsfreigaben und die bewährte
`validateUlcLinzD4PreviewDatabaseCredentials`-Prüfung. Im SQL wird
außerdem **innerhalb einer Transaktion** Datenbank und
`appbasis_ulc_linz_preview_migration`-Rolle nochmals geprüft,
`pg_advisory_xact_lock` verwendet und der vollständige Zustand erneut
gelesen, bevor ein Commit möglich ist. Bei Abweichung: Rollback.

Die neue `.github/workflows/ulc-linz-g04-v17-preview.yml` ist
`workflow_dispatch` **nur für main**, unter der bestehenden
`generated-preview-ulc-linz`-Umgebung und mit demselben
Preview-Concurrency-Lock. `migrate` setzt ein eigenes `apply`,
Backup-/Restore-Bestätigung und eine explizite Gate-Phrase voraus.
Die Eingabebestätigungen sind **kein technischer Backup-/Restore-Beweis**;
Belege sind vor Freigabe durch den Betreiber separat zu prüfen.
Nach freigegebener Migration würde der bestehende D4-Mechanismus die
Runtime-Tabellenrechte erneut abstimmen und überprüfen. Das Workflow
führt **keinen** Worker-Upload, Traffic-Switch oder Produktionsschritt aus.

### Extra abgesicherte Runtime-Aktivierung

Die Worker-Konfiguration setzt
`registrationCalendarActivation="isolated-preview-v17"` nur bei drei
passenden, **nicht standardmäßig gesetzten** Werten:

- `APPBASIS_GENERATED_APP_ID=ulc-linz`
- `APPBASIS_RUNTIME_ENVIRONMENT=generated-preview-ulc-linz`
- `APPBASIS_REGISTRATION_CALENDAR_V17=enabled`

Erst dann prüft `verifyUlcG04PreviewCalendarReadiness` direkt gegen
PostgreSQL die **exakte Preview-Datenbank**, die Runtime-Datenbankrolle,
beide neuen Tabellen, vorhandene Trigger-Funktion und **aktivierten**
SQL-Schreibschutz sowie selektive Lese-/Schreibberechtigungen.
Ein Fehler verhindert die Kalenderaktivierung; **ohne Schalter** wird
weder dieser Test noch ein neuer Kalender-SQL-Zugriff ausgelöst.
Bei Erfolg wird `registrationCalendar` an den Admin- und
Selbstanmeldungs-Service übergeben. Damit gelten dieselben Regeln für
direkte und stellvertretende Anmeldungen.

**Weder der v17-Workflow noch der Runtime-Schalter wird mit diesem PR
ausgeführt/gesetzt.** Ein bestandener Test ist noch keine Fachabnahme
der freigeschalteten Kalenderansicht.

### Offene, verpflichtende Vorbedingungen

Die Privacy-Klassifikation liegt als **Vorschlag**
`privacy/g04-v17-calendar-inventory-proposal.json` vor. Zwei
Kalenderkonfigurationstabellen werden hinzugefügt, keine Member-/Actor-IDs.
`organization_id` und `group_id` können in Kombination mit bestehenden
Mitgliederdaten einen indirekten Personenbezug haben. Deshalb bleibt das
Organisations-/Rollen-Scoping verbindlich.

Vor einer **kanonischen** Manifest-Promotion auf v17 müssen das
derzeit auf 64 Tabellen gepinnte M5-Inventar und die Exportausschlüsse
um beide Tabellen ergänzt, Backup-/Restore-Evidenz bewertet sowie
Generator-/Schema-/Release-Tests angepasst werden. Vor dem erstmaligen
Anwenden der isolierten Preview-Migration werden die Datenschutz- und
Wiederherstellungsentscheidung und die Betreiberfreigabe separat geprüft.
**Keine Preview-Migration, kein Preview-Deployment und keine Produktion
ohne diese Entscheidungen.**

Gezielte Abnahme **nach** aktivierter Preview: Smartphone
320–390px, Gruppen-Overlay mit allen sieben Tagen, Fristzeitpunkt und DST,
Ausnahme/Absage/Zurücksetzen, CAS bei zwei parallel geöffneten Clients,
direkte und stellvertretende Anmeldung (auch API-Bypass), bestehende
Notizen/Anwesenheit/Statistik/Autosave und Abmeldung während Save.
