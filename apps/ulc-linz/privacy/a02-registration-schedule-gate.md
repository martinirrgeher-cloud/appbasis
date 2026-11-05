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

## Bereits technisch abgesichert

- Reguläre Gruppenregeln nur über authentifizierten, organisationsgebundenen `athletes:edit`-Pfad (`athletes:view` zum Lesen). Sondertrainingstage zusätzlich über bestehende `kindertraining:view/edit`-Berechtigungen für Trainer **ausschließlich ihrer aktuell zugewiesenen Gruppen**. Die Rollenlogik wird im HTTP-Pfad und der Trainerzuordnungsstatus nochmals atomar beim DB-Schreibvorgang geprüft; ein Trainer erhält dadurch kein allgemeines `athletes:edit`.
- Ungültige Datumsformate, fremde oder inaktive Gruppen sowie Trainingsgruppen ohne Selbstanmeldung werden abgewiesen.
- Freigabe/Rücknahme verwenden CAS-Revision und eine atomare historische Änderung; Rücknahmen löschen keine bestehenden Anmeldungen.
- Der PostgreSQL-Registrierungs-Trigger sperrt Änderungen auf einem nicht genehmigten Sondertrainingstag. Der eigene/stellvertretende Speichervorgang läuft in einer Transaktion, damit Ablehnungen keine leeren Sitzungen hinterlassen.
- Kein automatisches Recht für ältere Anmeldungen oder allein durch Selbstanmeldung erzeugte Sessions.

## Noch offen und **vor jeder Schema-Aktivierung Pflicht**

1. **Schema-Manifest:** Derzeit `ulc-linz-lifecycle` v11, insgesamt 36 veröffentlichte Migrationen; `0011` bleibt absichtlich außerhalb von `appbasis.database.json`. Nach Freigabe v12, Vertrags-/Driftchecks, Schemaabgleich und isolierte frische Restore-/Migrations-E2E aktualisieren. Den PR vor der Manifestaufnahme **nicht mergen**, weil die Laufzeit die neuen Tabellen abfragt.
2. **Datenschutz-Inventar:** `privacy/m5-data-inventory.json` beschreibt ausdrücklich einen älteren materialisierten Stand; nicht als aktueller Beleg für die drei neuen Tabellen verwenden. Relevante Erfassungs-, Lösch- und Retention-Einträge samt Versionsgrenzen korrekt nachziehen und automatisiert prüfen.
3. **Rechte und Subject Lifecycle:** Identitätslöschung/Deaktivierung, Bearbeiterpseudonymisierung in Tabelle und Audit, fortbestehende Gruppenänderung, Gruppenlöschung und Trainer-/Funktionärsrechte mit Daten-Scope prüfen. Ausstehende Export-/Auskunfts- und Löschpflichten nicht als erfüllt ausgeben.
4. **Retention:** Aufbewahrungsfristen für Konfiguration vs. personenbezogene Bearbeiter-/Auditdaten festlegen, technische Löschung und Nachweis in E2E. Kein pauschales „unbegrenzt“ und keine unbegründete Zwangslöschung historischer Anmeldeabsichten.
5. **Berechtigungsgrenzen / fachliche Abnahme:** Die vorläufig umgesetzte Regel erlaubt Sondertermin-Freigaben für Trainer mit `kindertraining:edit`, ausschließlich in ihren aktuell zugewiesenen Gruppen. Der gesonderte mobile Dialog befindet sich unter Anwesenheit; das allgemeine Gruppenregel-Editing bleibt auf `athletes:edit` beschränkt. Die fachliche Entscheidung und ein gezielter Handytest sind noch ausdrücklich abzunehmen; keine pauschale Rechteausweitung und keine Freigabe anderer Gruppen.
6. **Races und Zeitumstellung:** Gleichzeitige Policy-/Ausnahme-/Registrierungs-Updates, DB-Trigger-Zeitpunkt bei DST sowie Benutzerfehlermeldungen für konkurrierende Freigaben in E2E prüfen.
7. **Betriebliche Gates:** Preview nur mit ausdrücklicher Betreiberfreigabe, vorher Backup-/Restore-Readiness, danach gezielte Mobilabnahme; Production und Public Ingress bleiben unabhängig gesperrt (Issue #483).

## Abnahme

PR #513 bleibt **Draft**. Ein grüner isolierter PostgreSQL-E2E-Lauf ist kein Datenschutz-,
Betriebs- oder Nutzer-Abnahmenachweis. Frühere Betreiber-PASS für andere Module bleiben gültig.
