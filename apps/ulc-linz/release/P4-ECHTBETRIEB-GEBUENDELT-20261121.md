# ULC Linz – P4: Gebündelter Restplan bis zum Vereins-Echtbetrieb

**Stand: 21.11.2026 – technische Entscheidungsvorlage, keine Produktions- oder Datenschutzfreigabe.**

## Was wir nicht nochmals machen

| Nachweis | Gesicherter Befund |
|---|---|
| GitHub `main` | `4162de32436f2bae0617dc4bcb17a8e0a1dc1a9e` – [Quality + PostgreSQL CI PASS](https://github.com/martinirrgeher-cloud/appbasis/actions/runs/44872670071) |
| Bestehender privater Cloudflare Worker | [Runtime Refresh PASS #44873806249](https://github.com/martinirrgeher-cloud/appbasis/actions/runs/44873806249) und [Private Deploy PASS #44874025012](https://github.com/martinirrgeher-cloud/appbasis/actions/runs/44874025012); workers.dev/Preview-Routen bleiben geschlossen |
| Remote Worker ↔ produktive PostgreSQL-Bindung | [Private Security Smoke PASS #44874534467](https://github.com/martinirrgeher-cloud/appbasis/actions/runs/44874534467): echte Hyperdrive-Anfrage und verweigerte Session mit Sicherheitsereignis |
| Datenbank | 44 aktuelle Migrationen, 69 Tabellen; P4-E2E mit `ulc_linz_application` für die geschützten Module bestanden |
| Produktionsdaten zuletzt gelesen | 2 bestehende Konten; 0 Athleten, Trainings, Anwesenheiten, Pläne, Dokumente und Übungskatalogeinträge in den jeweiligen aktuellen Tabellen. Kein Beweis, dass alte Backups, Freitext oder die Konten selbst synthetisch sind |
| Neon-Region und aktuelle Wiederherstellungsmetadaten | Read-only API-Abfrage vom 21.11.2026: Projekt `bold-dew-01343606` in **`aws-eu-central-1` (Frankfurt)**, PostgreSQL 18, `history_retention_seconds=21600` (**6 Stunden**); ein manuell angelegter Snapshot vom 20.11.2026 läuft am **05.12.2026, 23:00 UTC** ab. Diese Einzelwerte **beweisen nicht** den vollständigen Backup-/Exporthorizont oder eine vertragliche Datenregion-Freigabe. |
| Dokumentation – PostgreSQL | `training-documentation/appbasis.production.json`: **database=verified** mit an Git-Blob-SHAs gebundenen Migrationen und realem PostgreSQL-E2E. **authorization=blocked, lifecycle=blocked, status=blocked** bleiben absichtlich erhalten |

**Wichtige Abgrenzung:** Der Private Security Smoke hat keine interaktive Anmeldung eines Vereinsbenutzers oder persistente Fachmoduldaten getestet. Kein vollständiger Vereinsbetrieb ist damit nachgewiesen.

## Ein einziges verbleibendes fachliches Arbeitspaket, drei Entscheidungen

| Entscheidung | Konkret notwendiger Beleg | Konsequenz bis dahin |
|---|---|---|
| **A. Betreiber und Provider** | Verbindliche Prüfung/Zuordnung der Cloudflare- und Neon-AVV/DPA für die tatsächlich verwendeten Konten; Datenregion, Unterauftragsverarbeiter, Verantwortliche, rechtmäßige Zwecke und Eltern-/Trainerinformation | Echtdatenzugang bleibt gesperrt; `privacy=blocked` |
| **B. Löschung und Restore** | Maximal wiederherstellbarer Zeitraum über Neon-Backups, Snapshots und Exporte; Abgleich mit 35-Tage-Löschmarkern; persönliche Notizen, Änderungsprotokolle, Teilnehmernamen in allen Revisionen, Medien und acht Daten-Owner einmalig bewerten; Umgang mit gelöschten Athleten ausdrücklich festlegen | Keine automatische Restore-Promotion, kein produktiver Löschjob, `applicationLifecycle=blocked` |
| **C. Funktionale Gesamtfreigabe** | Echte Berechtigungen mit Vereinsmitgliedschaft und Trainingsdokumentation; Katalogfavoriten/-nutzung/-medien sowie Blockfavoriten/-nutzung/-revisionen und Anwesenheit/Trainer-Audit in einem getrennten Testkontext fachlich bestätigen | Katalog, Blöcke und Dokumentation bleiben `blocked`; kein manueller JSON-READY-Eingriff |

Es ist **nicht** nötig, für jede einzelne Tabelle ein eigenes Projekt oder eine neue Freigabeschleife zu eröffnen. Die offene Tabellenliste hilft nur, die drei gebündelten Entscheidungen nachweislich vollständig zu treffen.

## Danach nur drei technische Live-Smokes

**Erst nach gesonderter Freigabe des technischen Pilotzugangs** (kein stillschweigend öffentlicher Worker) auf einem abgeschotteten Testweg mit *ausschließlich künstlichen* Personen, Terminen und Notizen:

1. **Login/Session:** erlaubte technische Anmeldung und erneuter Session-Abruf, anschließend Session widerrufen.
2. **Speichern/Laden:** einen klar als Testdatensatz markierten Eintrag über den tatsächlichen HTTP-Fachmodulpfad speichern, über einen zweiten Aufruf laden und nachweislich bereinigen. Keine produktiven Vereinsdaten oder realen Namen/Medien.
3. **Rechte:** Berechtigter Zugriff erfolgreich; unberechtigter Zugriff verweigert und protokolliert.

**Weder P4-Unit-/PostgreSQL-Tests noch der private Security Smoke ersetzen diese HTTP-Abnahme.** Sollte eine zugelassene Testidentität oder eine isolierte Testoberfläche fehlen, bleibt der betreffende Punkt offen; es wird kein neues öffentliches Eingangstor ohne ausdrückliche Betreiberfreigabe eröffnet.

## Stopp-Regeln

- Kein neues M6-First-Install/Worker-Create; es existiert ein privater produktiver Worker.
- Keine zusätzlichen M6-Refresh-/Security-Smokes nur zur Wiederholung bereits bestandener Läufe.
- `composition_gate` benötigt derzeit `production-contract.mjs ulc-linz --require-ready` und **scheitert zu Recht**, solange die obigen Verträge gesperrt sind. Der Lifecycle-Preflight allein kann dies nicht ändern.
- Keine Modulstatus-Promotion durch bloße Tabellenanzahl, leere Trainingsdaten, synthetisches Rollentestergebnis oder fehlende Medienobjekte.
- Weder Merge noch Deployment noch reale Personendatenverarbeitung ohne gesonderte Freigabe.

**Richtung Echtbetrieb:** A–C gebündelt abarbeiten, dann drei Live-Smokes und eine letzte Gesamtentscheidung. Nicht vorher alle bisherigen Tests erneut starten.
