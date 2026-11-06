# ULC A02.4 – Datenschutz- und Release-Gate (noch gesperrt)

Stand: 2026-11-05. Gilt nur für den Draft-PR #513. **Keine Freigabe für Migration, Preview oder Produktion.**

## Materialisierte Daten / Eigentümer

Migration: `apps/ulc-linz/migrations/0011_ulc_linz_registration_schedule.sql`.
Eigentümer: `ulc-linz-lifecycle`, **nicht** `modules/athletes`.

| Tabelle | Inhalt | Personenbezug | Weiterer Pflichtnachweis |
| --- | --- | --- | --- |
| `ulc_linz_registration_group_policy` | Gruppe, Wochentage, Vorlauf, Stichtag, Nachmeldungsmodus, Revision, letzte Bearbeiterkennung und Uhrzeit | Admin-/Funktionärskennung | Auskunft, Export, Identitätslöschung/Anonymisierung und Aufbewahrungsdauer |
| `ulc_linz_registration_extra_day` | Gruppe, Datum, aktiver Freigabestatus, Revision, erste und letzte Bearbeiterkennung, Zeitstempel | Bearbeiterkennung | Aufbewahrung, Widerruf, Löschung/Anonymisierung, zeitlicher Berechtigungswechsel |
| `ulc_linz_registration_extra_day_change` | Versionierter, append-only Approval-/Revoke-Verlauf, Bearbeiterkennung und Uhrzeit | Audit-/Personenkennung | Definierte Audit-Löschfrist und Nachweis der datensparsamen Protokollierung |

Keine neue Freitextspalte. Die bereits vor A02.4 vorhandenen Registrierungsnotizen und deren
Historien sind **nicht** durch diese Änderung datenschutzrechtlich freigegeben.

Das **maschinenlesbare, versionsgebundene v12-Delta-Inventar** liegt unter
`apps/ulc-linz/privacy/a02-registration-schedule-inventory.json`.
Ein automatisierter Drift-Test gleicht die Tabellen und personenbezogenen
Spalten mit der unpublizierten Migration ab. Das ältere
`m5-data-inventory.json` bleibt absichtlich ein historischer v0.5-Nachweis.

Ein **nicht in die Runtime eingebundener** lesender Datenschutz-Preflight
(`registration-schedule-privacy-preflight.ts`) zählt ausschließlich
noch vorhandene personenbezogene Verweise für einen Benutzer, dessen
abgeschlossene Löschung durch einen gültigen 35-Tage-Marker nachgewiesen ist.
Er liefert keine Identitäten oder Rohzeilen. Der separat privilegierte
Baustein `registration-schedule-actor-erasure.ts` kann nach diesem
Abschlussnachweis die vier Kennungsverweise der drei Tabellen in einem
atomaren SQL-Schritt auf NULL setzen; Entscheidungsstatus, Revision und
Zeitstempel bleiben unangetastet. Bei fehlendem/abgelaufenem Marker oder
wieder aktiver Mitgliedschaft wird die Operation verweigert.
Das ist eine **zulässigkeitsbedürftige, nicht aktivierte
Datenschutz-Ausnahme** zum append-only Actor-Audit und keine automatische
gesetzliche oder technische Löschfreigabe.

### Optionale Lifecycle-/Retention-/Restore-Anbindung (noch nicht aktiviert)

`registration-schedule-lifecycle.ts` enthält einen streng
markergebundenen Privacy-Hook. Er ist derzeit lediglich **optional** in
`lifecycle-service.ts`, `retention.ts` und `restore-reconciliation.ts`
verdrahtet; in `postgres.ts` und im aktiven Worker gibt es weiterhin
**keine** Erasure-Injektion. Ohne Hook bleiben die bisherigen v11-Abläufe
unverändert. Nach Freigabe eines v12-Schemas muss der Hook in allen drei
Löschwegen als verpflichtender Teil eines **separat genehmigten**
Datenschutz-/Backup-/Restore-Gates aktiviert werden.

- **Manuelle Löschung:** Nach dem prüfbaren kanonischen App-Delete-Marker
  erfolgt die A02.4-Bearbeiterredaktion. Fehler blockieren die
  Abschlussmeldung; erneuter autorisierter Löschlauf darf den Marker
  idempotent nacharbeiten.
- **Retention:** Bei aktiviertem Hook werden zuerst alle noch gültigen
  bestehenden Delete-Marker über eine authoritative Quelle nachgespielt.
  Erst danach dürfen Retention-Status und Marker-Purge abgearbeitet werden.
  Neue Retention-Löschungen rufen die Redaktionsprüfung direkt nach dem
  App-Delete-Marker auf. Ohne Markerquelle wird der aktivierte Pfad
  **gesperrt**, bevor Status- oder Purge-Operationen stattfinden.
- **Restore:** Nach geprüfter Wiedereinspielung eines Delete-Markers wird
  dessen A02.4-Redaktion erneut ausgeführt. Bei Fehlern wird die
  Restore-Reconciliation nicht erfolgreich abgeschlossen.
- **Bekannte Grenze:** Ein bereits abgelaufener 35-Tage-Marker kann nicht
  nachträglich als Autorisierung verwendet werden. Vor v12-Aktivierung
  müssen Altbestände, die Zeit bis zur erstmaligen Ausführung, ein
  autoritativer Backup-Stand und ein prüfbarer Nachholplan geklärt werden.
  Es ist **kein** stillschweigendes Bypass- oder Global-Purge erlaubt.

### A02.4 Auskunft und Retention – getrennte, noch gesperrte Verträge

- `a02-subject-access-contract.json` beschreibt genau die vier in drei
  Tabellen gespeicherten personenbezogenen Bearbeiterverweise, die zulässigen
  Auskunftsrollen (eigene Daten oder exakt berechtigter Organisationsadmin),
  das Audit vor Datenrückgabe und eine vollständige Ablehnung bei mehr als
  500 Datensätzen. Eltern-/Stellvertretungsrechte werden nicht auf
  administrative Bearbeiterprotokolle übertragen.
- `registration-schedule-actor-access-postgres.ts` liest diese vier Verweise
  in **einer** organisationsgebundenen PostgreSQL-Abfrage. Es werden keine
  Kennungen anderer Bearbeiter, Freitexte oder Credentials mit ausgegeben.
  `registration-schedule-subject-access.ts` prüft die aktuelle
  authentifizierte Identität, Organisation, Verwaltungsrechte und die
  Zugehörigkeit des betroffenen Benutzers; erst nach einem nachweislich persistenten Auditbeleg (positiver
  Schreibbeleg mit Ereigniskennung) gibt die Funktion die begrenzte
  Auskunft zurück. Ein bloßer Konsolenlog oder eine aufgelöste Promise
  ohne Persistenzbeleg wird abgewiesen. Ein konkreter persistenter
  Auditadapter ist weiterhin **nicht** implementiert bzw. injiziert.
- Diese Funktion ist **kein aktiver öffentlicher Export** und bleibt absichtlich
  außerhalb des bisherigen M5-E-Exports. Insbesondere die rechtliche
  Herausgabe von audit-/sicherheitsrelevanten Ereignissen, die verlässliche
  Audit-Persistenz und die Einbindung in den kanonischen Auskunftspfad
  erfordern noch Datenschutzfreigabe.
- `a02-retention-decision.json` enthält die notwendige Fachentscheidung für
  alle drei Tabellen, ohne willkürliche Monate/Jahre zu erfinden:
  Konfiguration, aktive Freigaben und nachvollziehbarer Versionsverlauf
  benötigen möglicherweise **unterschiedliche** Fristen. Bis der
  Verantwortliche diese Zwecke, Fristen, Löschmethoden und Backupregeln
  bestätigt, existiert **kein** aktivierter A02.4-Purge.
- Auch nach Freigabe eines personenbezogenen Exportwegs muss der Workflow
  prüfbar zwischen Bearbeiter-Kennungen, nicht personenbezogenen
  Gruppenregeln und bestehenden Anmelde-/Freitext-Historien unterscheiden.
  Die früheren v0.5-Verträge sind keine automatische v12-Zustimmung.

## Bereits technisch abgesichert

- Reguläre Gruppenregeln nur über authentifizierten, organisationsgebundenen `athletes:edit`-Pfad (`athletes:view` zum Lesen). Sondertrainingstage zusätzlich über bestehende `kindertraining:view/edit`-Berechtigungen für Trainer **ausschließlich ihrer aktuell zugewiesenen Gruppen**. Die Rollenlogik wird im HTTP-Pfad und der Trainerzuordnungsstatus nochmals atomar beim DB-Schreibvorgang geprüft; ein Trainer erhält dadurch kein allgemeines `athletes:edit`.
- Ungültige Datumsformate, fremde oder inaktive Gruppen sowie Trainingsgruppen ohne Selbstanmeldung werden abgewiesen.
- Freigabe/Rücknahme verwenden CAS-Revision und eine atomare historische Änderung; Rücknahmen löschen keine bestehenden Anmeldungen.
- Der PostgreSQL-Registrierungs-Trigger sperrt Änderungen auf einem nicht genehmigten Sondertrainingstag. Der eigene/stellvertretende Speichervorgang läuft in einer Transaktion, damit Ablehnungen keine leeren Sitzungen hinterlassen.
- Kein automatisches Recht für ältere Anmeldungen oder allein durch Selbstanmeldung erzeugte Sessions.

## Noch offen und **vor jeder Schema-Aktivierung Pflicht**

1. **Schema-Manifest:** Derzeit `ulc-linz-lifecycle` v11, insgesamt 36 veröffentlichte Migrationen; `0011` bleibt absichtlich außerhalb von `appbasis.database.json`. Nach Freigabe v12, Vertrags-/Driftchecks, Schemaabgleich und isolierte frische Restore-/Migrations-E2E aktualisieren. Den PR vor der Manifestaufnahme **nicht mergen**, weil die Laufzeit die neuen Tabellen abfragt.
2. **Datenschutz-Inventar:** Das separate maschinenlesbare v12-Delta wurde ergänzt, jedoch weder als v12-Schema aktiviert noch in den export-/deletion-/retention-Verträgen des bestehenden M5-Scope verifiziert. Der alte v0.5-Nachweis wird ausdrücklich nicht als aktueller Beleg verwendet.
3. **Rechte und Subject Lifecycle:** Die gemeinsamen optionalen Hooks für manuelle Löschung, Retention-Wiederholung und Restore sind implementiert, **aber die aktiven Runtime-/Betreiber-Löschwege injizieren sie nicht**. Zusätzlich existiert ein strikter, vollständig mandantengebundener Auskunfts-Kandidat für Bearbeiterkennungen, der **nicht** in den M5-Export oder die HTTP-Runtime eingebunden ist. Vor Aktivierung fehlen die rechtlich freigegebene Audit-/Export-Regelung, verpflichtende Runtime-Integration, Retention-/Backup-/Restore-Promotion und Behandlung fehlender/abgelaufener Marker.
4. **Retention:** Die offenen Entscheidungen sind im maschinenlesbaren `a02-retention-decision.json` erfasst. Zweck und Aufbewahrungsfristen für Konfiguration, Freigaben und personenbezogenen Auditverlauf sowie technische Purge-/Backup-Nachweise müssen vom Verantwortlichen bestätigt werden. Bis dahin kein automatisches Löschen, kein pauschales „unbegrenzt“.
5. **Berechtigungsgrenzen / fachliche Abnahme:** Die vorläufig umgesetzte Regel erlaubt Sondertermin-Freigaben für Trainer mit `kindertraining:edit`, ausschließlich in ihren aktuell zugewiesenen Gruppen. Der gesonderte mobile Dialog befindet sich unter Anwesenheit; das allgemeine Gruppenregel-Editing bleibt auf `athletes:edit` beschränkt. Die fachliche Entscheidung und ein gezielter Handytest sind noch ausdrücklich abzunehmen; keine pauschale Rechteausweitung und keine Freigabe anderer Gruppen.
6. **Races und Zeitumstellung:** Gleichzeitige Policy-/Ausnahme-/Registrierungs-Updates, DB-Trigger-Zeitpunkt bei DST sowie Benutzerfehlermeldungen für konkurrierende Freigaben in E2E prüfen.
7. **Betriebliche Gates:** Preview nur mit ausdrücklicher Betreiberfreigabe, vorher Backup-/Restore-Readiness, danach gezielte Mobilabnahme; Production und Public Ingress bleiben unabhängig gesperrt (Issue #483).

## Abnahme

PR #513 bleibt **Draft**. Ein grüner isolierter PostgreSQL-E2E-Lauf ist kein Datenschutz-,
Betriebs- oder Nutzer-Abnahmenachweis. Frühere Betreiber-PASS für andere Module bleiben gültig.
