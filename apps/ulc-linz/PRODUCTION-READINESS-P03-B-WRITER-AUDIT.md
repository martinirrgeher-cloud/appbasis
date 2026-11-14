# P03-B – Inventur der produktiven Trainings-Schreibwege (Security-Audit, ohne Aktivierung)

**Stand:** 14.11.2026. **Status:** READ-ONLY-AUDIT / NICHT PRODUKTIONSFREIGEGEBEN.  
**Geprüfter Basiscommit:** `567b89fc1d3c5dd4bfc59f3272b914b2a64c7566`.  
**Verknüpfungen:** [Produktiv-Sprint #607](https://github.com/martinirrgeher-cloud/appbasis/issues/607), [Übergabe #530](https://github.com/martinirrgeher-cloud/appbasis/issues/530), [P03-A](./PRODUCTION-READINESS-P03.md), [offene Datenschutzentscheidungen P01](./PRODUCTION-PRIVACY-DECISIONS-P01-DRAFT.md).

## 1. Tatsächliche HTTP-Writer und Datenowner

| Eingang und Berechtigungsprüfung | Tatsächlicher Schreibweg | Betroffene personenbezogene Daten | Nachweis / aktuelle Grenze |
| --- | --- | --- | --- |
| `POST /api/modules/kindertraining/session`; `authorizeKindertrainingRequest(..., "edit")`, danach Gruppenscope und Kalendertag | `runtime.kindertraining.saveSession` → `PostgresUlcTrainingSessionRepository.saveSession` | Anwesenheit je Athlet, Trainingsinhalte/-slots, Session-Notiz; über die gemeinsame Repository-Implementierung ggf. Traineranwesenheit | `worker/index.ts` (1613–1670); `worker/training-session-postgres.ts` (407–723). Kein persistent geschützter Subject-Delete-/No-Resurrection-Check im SQL |
| `POST /api/modules/u12/session`; `authorizeU12Request(..., "edit")` und Gruppenscope | `runtime.u12.saveSession` → gemeinsames Session-Repository | Dieselben App-Owner-Felder plus Trainer-IDs, Inhalte und Zuordnung | `worker/index.ts` (2174–2234), `worker/training-session-postgres.ts` (407–723). Der SQL-Batch kann alte Athleten aus einer erneuten Listenübermittlung erneut einfügen |
| `POST /api/modules/u14/session` und `POST /api/modules/kids/session`; jeweilige Edit-/Gruppenprüfung | `runtime.u14.saveSession` bzw. `runtime.kids.saveSession` → gemeinsames Session-Repository | Anwesenheit, Trainerbezug, Inhalte, Freitext | `worker/index.ts` (1975–2084). Kalenderprüfung ist keine Löschbarriere |
| `POST /api/modules/kindertraining/registration` (Selbstanmeldung) | `selfRegistrationAccess.assertEditAccess` → `selfRegistration.save` → `registerAtomically` → `ensureScheduledSession` + `saveRegistration` | Registrierung, Status, persönliche Note, Bearbeiteridentität, unveränderlich fortgeschriebene Registrierungshistorie | `worker/index.ts` (1166–1266); `worker/self-registration-service.ts` (322–385, 102–142); `worker/training-session-postgres.ts` (287–359, 725–930). Kalender-/Gruppenprüfung allein verhindert Wiederanlage eines gelöschten Subjects nicht nachweislich |
| `POST /api/modules/kindertraining/registration/proxy` (Anmeldung durch Gruppenmitglied für anderes Mitglied) | Derselbe Registrierungs-Writer, zusätzlich `saveProxy` und SQL-Check für aktive Actor-/Target-Zuordnung innerhalb der Write-Query | Zielathlet, Stellvertreter-/Actor-Referenz, Historie, Note | `worker/self-registration-service.ts` (265–319); `worker/training-session-postgres.ts` (764–818). Gute bestehende Schutzprüfung, aber kein persistenter Delete-Marker und keine vollständige Live-Race-Garantie |
| `POST /api/modules/training-documentation/start` und `POST /api/modules/training-documentation/:id/{update,refresh-attendance,complete,reopen}` | `trainingDocumentationAccess.assertEditAccess` → Service/Documentation-Repository | eigene Dokumente, historische Revisionen, Teilnehmer-Verweise, freie Kommentare | `worker/training-documentation-http.ts` (29–118, 194–233); `modules/training-documentation/src/postgres-repository.ts`. Modul-Owner-SQL-Marker gegen Rebirth ist vorhanden; separate Autorisierung und historische Freitextbezüge bleiben prüfpflichtig |
| Keine freigeschaltete Live-/HTTP-Route: gezielte Löschung der App-Owner-Trainingshistorie | `eraseUlcLinzAthleteTrainingHistoryOnFrozenStore` → `PostgresUlcTrainingSubjectFrozenHistoryRepository.eraseSubjectHistoryOnFrozenStore` | Attendance, Registration und Change-Historie | `worker/lifecycle-service.ts`, `worker/training-subject-history-deletion-postgres.ts`. Ausschließlich für **eingefrorene isolierte** Datenbanken. Eine erfolgreiche Teiltransaktion ist kein globales Erasure-Zertifikat |

Die Tabelle inventarisiert die aus den gegenwärtigen Handlern und Repositories nachgewiesenen Hauptschreibwege. Weitere direkte SQL-, Wartungs-, Import-, Rücksicherungs- und Fremd-Worker-Pfade sind **nicht automatisch ausgeschlossen**: Ein Repository-weiter Referenzscan plus Migration-/Triggerinventur sind vor der Implementierungsfreigabe zwingend. Die in Review befindlichen N16-/Staff-Guards werden nicht als produktiv aktiv vorausgesetzt.

## 2. Bestätigte Sicherheitslücke und bestehende Grenzen

- **Belegt in P03-A:** Eine korrekt ausgeführte Löschung in einem eingefrorenen App-Owner-Store verhindert heute kein späteres `INSERT` in `ulc_linz_training_attendance`. Das reale PostgreSQL-E2E zeigt explizit, dass ein alter Writer den Target-Athleten wieder einfügen kann.
- `saveSession` führt Session-Upsert, Attendance-Upsert/Abgleich und Trainerlisten-Abgleich aus. Revision-/Gruppenchecks ersetzen keine transaktionsgebundene kanonische Subject-Erasure-Sperre. Eine stale Trainerliste nach Subject-Löschung ist deshalb kritischer als eine gewöhnliche konkurrierende UI-Änderung.
- `saveRegistration` schreibt Registrierung und Change-History im selben Statement; bei Proxy-Anmeldung gibt es zusätzliche SQL-Gruppen-/Aktivitätsprüfungen. Die bisherige Selbstanmeldung prüft Kontext außerhalb des finalen SQL-Schreibens. Für beide Varianten muss No-Resurrection **auch gegen Concurrent Delete, Rollen-/Gruppenentzug und Restore** bewiesen werden.
- `training-documentation` schützt sein eigenes Subject per SQL-Tombstone, kann jedoch Freitext-/Drittpersonennamen in fremden Revisionen nicht automatisch erkennen. App-Owner Session-Notizen, Registration-Notizen, Actor-/Trainerreferenzen sind gesonderte Datenkategorien.
- Die dokumentierte 35-Tage-Quellautorität darf **nicht stillschweigend verlängert** oder durch dauerhaft personenbezogene neue Marker ersetzt werden. Diese Entscheidung gehört zu P01.

## 3. Sicherheitsarchitektur für den separaten Freigabe-Draft (noch KEIN Code)

1. **Kanonische Subject-Autorität:** Schreibbar nur, wenn das Subject im selben Organisationsscope zulässig und nicht mit einer verbindlichen Löschentscheidung gesperrt ist; unveränderliche Löschsperre / Autoritätsprüfung atomar zum Write, nicht nur durch vorheriges HTTP-Read. Die konkrete Dauer und minimal notwendigen Daten des Sperrnachweises sind **P01-entscheidungsabhängig**.
2. **Gemeinsame Transaktionsgrenze:** Session/Attendance/Registration/History/Trainer-Referenzen und Subject-Guard müssen korrekt serialisiert werden. Direkte SQL- und alte Writer dürfen die Sperre nicht umgehen können; Trigger/Constraints und Transaktionslocks sind gegeneinander und mit Revoke zu testen.
3. **Deny-by-default bei Ungewissheit:** Abgelaufene/nicht vorhandene Quellautorität, verlorener Lock, nicht eindeutiger Org-/Athletenscope oder unvollständiger Restore-Nachweis dürfen keine Live-Löschung und kein ungesichertes Weiter-Schreiben auslösen. Fail-closed ohne Verfügbarkeits-Selbstsabotage des allgemeinen Trainingstermins fachlich spezifizieren.
4. **Owner-übergreifende Abschlussautorität:** Dokumentation, App-Historie, Pläne, Katalog, Blöcke, Medien und Backup erhalten separate überprüfbare Checkpoints. Ein fehlgeschlagener Owner-Teil muss wiederholbar sein, darf aber niemals als globale Löschung quittiert werden.
5. **Freitext und Actor-Identitäten:** Notizen/Änderungshistorie/Trainer-Zuordnungen und historische Fremdteilnehmer explizit inventarisieren. Keine automatische Textheuristik als Nachweis vollständiger Löschung.

## 4. Verbindliche isolierte Abnahmetests für den nachfolgenden Security-PR

| Test | Fehlerszenario | PASS erst wenn |
| --- | --- | --- |
| S1 – stale Trainerliste | Vor Subject-Löschung geladene U12/U14/Kids-Liste wird danach erneut gespeichert | Kein `attendance`-Reinsert für gelöschten Athleten; erlaubte Nachbarn/Session bleiben unverändert |
| S2 – stale Selbstanmeldung | Bereits autorisierte Registrierung trifft nach wirksamer Löschsperre ein | 0 neue Registration-/Change-Zeilen; keine orphan Session; nachvollziehbare geschlossene Fehlerantwort |
| S3 – Proxy-Entzug | Proxy-Actor oder Target verliert Zugehörigkeit/Status während des Schreibens | Kein unautorisierter Commit und keine Änderung fremder Gruppen/Organisationen |
| S4 – Rechte-/Gruppen-Race | Rolle, Membership oder Gruppenzuordnung wird parallel zur Sessionänderung entzogen | Eindeutiger serialisierter Commit oder verweigerter Write; keine veraltete Berechtigung autorisiert nach Entzug |
| S5 – Direkt-SQL/alte Revision | Writer umgeht HTTP und versucht `INSERT`/`UPDATE` in geschützte Tabellen | Datenbank selbst verweigert Wiederanlage |
| S6 – Cross-Owner-Teilfehler | Dokumentations-Cleanup committet, App-Owner schlägt fehl | Globales Ergebnis bleibt unvollständig, Retry entfernt nur Zielscope |
| S7 – Restore vor Delete | Älterer SQL-Stand mit alten Personenreferenzen wird eingespielt | Weiterverwendung erst nach nachweislich vollständigster neuer Erasure-Autorität aller Owner; kein Schreibzugriff während Quarantäne |
| S8 – Historischer Freitext | Betroffene Person in fremder Dokumentrevision, Session-/Registrierungsnotiz oder Actor-Verweis | Durch P01 freigegebene Behandlung und vollständige Inspektion, keine falsche Zusicherung der Anonymität |

Die E2E sind mit ephemeren PostgreSQL-Datenbanken und Fremd-Org-/Nachbarathleten-Gegenproben durchzuführen. Tests ändern keine Produktivdaten und dürfen bestehende beleggebundene Testdateien nicht blind überschreiben.

## 5. Gates / Ergebnis

- **P03-B Writer-Audit:** Dokumentations- und Designstand geprüft; keine produktive Umsetzung.
- **P03-B Live-Security-Implementierung:** **BLOCKED** bis ausdrücklicher Betreiberfreigabe und P01-Entscheidung zur löschfesten Autorität/Frist; noch keine SQL-, Trigger-, HTTP- oder Rollenänderung.
- **P03 / ULC Gesamtproduktion:** **BLOCKED** bis E2E-S1–S8, Owner-übergreifender Freigabe, Production-Contracts auf exact SHA und Betriebsabnahme.
- **N16 PR #602 / gestapelte Staff-Guards:** ohne separate Security-Freigabe nicht mergen/aktivieren.
- **Diese PR:** Nur neue Markdown-Datei. Keine Laufzeit-, Berechtigungs-, Datenbank-, Deployment-, Provider-, Contract- oder Policy-Änderung. Weder CI-Green noch Dokumentations-Merge gilt als Production-Ready.

**Nächster autorisierter Schritt:** P01-D1–D4 mit Vereinsverantwortlichem verbindlich entscheiden. Unabhängig davon können die S1–S8-Tests ohne Runtime-Eingriff als isolierte Negativbeweise vorbereitet werden. Erst danach ist der getrennte Security-Implementierungs-PR sinnvoll.
