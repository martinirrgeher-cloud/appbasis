# ULC Linz P3 — Abschlussmatrix für produktiven Pilotbetrieb

Stand: 20.11.2026. **Dieser Bericht ist kein Datenschutzgutachten, kein Deploymentauftrag und keine automatische Produktionsfreigabe.** Er sammelt die notwendigen, überprüfbaren Akzeptanznachweise zu einem einzigen Arbeitspaket, statt stückweise Cloudflare-Workflows aufzurufen.

## 1. Bereits bestätigt

- GitHub `main`: PRs #673, #674 und #675 merged; Quality + PostgreSQL E2E bis #675 PASS.
- Bestehender Worker ist privat (kein öffentlicher workers.dev-Zugriff, keine Preview-URL, keine Custom Domain/Route), hat aber historische Deployments. **Ausschließlich bestehender Refresh-Pfad**, keine M6-Erstinstallation.
- Letzter Application-Hyperdrive-Role-Reconcile [#44819187328](https://github.com/martinirrgeher-cloud/appbasis/actions/runs/44819187328): **PASS, `already-correct`, kein PUT**. Exaktes Application-Hyperdrive soll vor einer Freigabe noch einmal mit separatem read-only Provider-Probe bestätigt werden. Security-Log-Hyperdrive zuvor vollständig PASS.
- Neon Produktionsschema: 69 Tabellen/501 Spalten/145 Indizes; 3 installierte Training-Subject-Fence-Trigger und 2 aktivierte Doku-Owner-Trigger; keine direkten allgemeinen EXECUTE-Rechte auf die Doku-Schutzfunktionen. **Keine Tabellenzeilen wurden hier geändert.**
- Produktions-Rollenprüfungen für Übungskatalog, Blöcke und Doku sind als **Opt-in** technisch vorbereitet, aber weiterhin nicht aktiviert; die aktuellen Modulverträge bleiben absichtlich `blocked`.

## 2. Acht getrennte Daten-Owner – was echte Freigabe benötigt

Jeder Owner muss eine reale Autoritätsquelle, die physisch isolierte Wiederherstellung, den eigenen idempotenten Lösch-/Reconcile-Schritt, den Residualcheck und den Test gegen erneute Anlage belegen.

| Owner | Minimalnachweis | Aktueller offener Punkt |
|---|---|---|
| identity | Identitätslöschmarker, Wiederherstellungs- und Login-Quarantäne | Vollständige Restore-Freigabe über die gesamte App |
| permissions | Entfernen sämtlicher Principal-Rechte und Audit-Zweck/Frist | Cross-Owner-Reconciliation nach Rollback |
| athletes | Kontakte, Gruppenzugehörigkeiten, Athleten-Löschentscheidung | Einheitlicher 35-Tage-Marker gegen Backups |
| exercise-catalog | Favoriten, nachweislich zugeordnete Usage, private Medien beim Provider wirklich abwesend | Provider-Auskunft/AVV und keine unattribuierten Alt-Ereignisse |
| training-blocks | Favoriten, zugeschriebene Nutzung, Revisionen und alle Querverweise | Owner-Fence/No-Resurrection über Altversionen |
| training-documentation | Eigene Dokumente, historische Revisionen und fremde Teilnehmer in fremden Dokumenten | Freitextprüfung aller Revisionen; HTTP-/Rollen-Abnahme mit echtem Pilot |
| training-plans | Pläne, Revisionen, Items, subjektbezogene Löschmarker | Gesamt-App-Querverweise und Restdaten |
| ulc-linz-lifecycle | Anwesenheit, Anmeldung, Änderungsverlauf, Trainerzuordnung, Sessions/Notizen | Trainer-/Freitext-/Audit-Lifecycle; 3 SQL-Fences sind kein Freitextbeweis |

### Technischer P3-C-Nachweis in diesem PR

- `p3-cross-owner-restore-admission.ts` führt **exakt diese acht Owner** zusammen. Doppelte, fehlende oder fremde Owner dürfen kein positives Ergebnis erzeugen.
- Erfordert eine **unabhängig bestätigte neuere Löschquelle** samt `completedAt`, `purgeAfter` (aktuelle **35-Tage**-Regel), tatsächliche Backup-Horizontbestätigung und nachgewiesene Schreibisolation.
- Jeder Owner braucht aktuelle Scope-/Zeitstempel, erfolgreiches Replay, **0 strukturierte Restdatensätze**, überprüfte Freitexte/Versionen, nachgewiesenen Fence; Katalogmedien brauchen unabhängige Provider-Abwesenheit oder gesonderten Nachweis, dass nie Medien existierten.
- **Auch acht technisch vollständige Owner-Berichte sind ausschließlich `OPERATOR_REVIEW_REQUIRED`.** Die Funktion kann kein Deployment, keine Löschung und keine Wiederherstellung freigeben.
- Negative Integration mit echter isolierter PostgreSQL-Dokumentation/Anwesenheit: Nach erfolgreicher Doku-Löschung bleibt die Registrierung zunächst bestehen (separater Transaktionsfehler); nach Retry verbleibt ein persönlicher Freitext. **Beides blockiert die Freigabe.** Keine Änderung am bisherigen Live-Löschweg.

## 3. Daten- und rechtliche Entscheidungen (nicht programmatisch zu genehmigen)

Die fachlichen bedingten Zeitziele vom 14.11.2026 sind vorhanden: 12 Monate nach Austritt falls nötig; Trainingsverlauf bis 24 Monate nur mit begründetem Zweck; persönliche Freitexte nach 90 Tagen prüfen; Usage bis 12 Monate falls begründet; Löschmarker aktuell 35 Tage und danach **deny**, keine automatische Verlängerung; erkennbares Medienmaterial Minderjähriger vor Prüfung gesperrt.

Vor Echtdaten noch *einmalig* durch den Vereinsverantwortlichen samt Beleg:
- Rechtsgrundlage, Informationen an Erziehungsberechtigte/Trainer und Zweck je Datengruppe, inkl. Freitext-/Trainer-Audit.
- Cloudflare-/Neon-Datenverarbeitung, Unterauftragsverarbeiter, Standort und Berechtigungen (AVV/DPA); private Medien nur nach Speicher-/Löschbeleg.
- Tatsächlicher **maximal wiederherstellbarer** Backup-/Export-/Snapshot-Horizont. Wenn länger als 35 Tage: die alte Löschquelle ist nach Ablauf **unverifizierbar**. Nicht stillschweigend länger halten und keine alte Sicherung ohne isolierte Prüfung produktiv schalten.
- Identifizierende Alt-Notizen, `source_ref`, Teilnehmerlisten in Dokument-Revisions-JSON und fremde Verweise kontrolliert bereinigen oder bis Klärung nicht freischalten.
- Recovery-Snapshot `snap-odd-hat-b1yz457q` läuft laut letzter Inventur am 05.12.2026 23:00 UTC ab. Vor einer mutierenden produktiven Migration ist ein neuer Recovery-Punkt mit überprüftem Restore erforderlich.

## 4. Geordneter EINMALIGER Freigabeablauf

1. P3-C CI und isolierte E2E PASS; anschließend nur gesondert genehmigter Merge. Produktionsstand unverändert.
2. Vollständige acht Owner-Nachweise und die obigen Betreiber-/Providerbelege einholen; keine `blocked`-JSON-Felder per Hand in `ready` umschreiben.
3. Erst nach belegter Schließung aller Gates: einmalige read-only Release-Prüfung inkl. `production-contract.mjs ulc-linz --require-ready`; **FAIL bedeutet keine Deployment-Freigabe**.
4. Nach gesonderter Betreiberfreigabe ausschließlich `M6 ULC Production Runtime Refresh Configuration` für das exakte neue `main`-SHA ausführen; danach `Private Production Refresh Deploy`. Public Ingress bleibt gesperrt.
5. Isolierter Pilot-Smoke mit Benutzer-/Trainerrollen, U12/U14/Kindertraining, IRG, Katalog, Plänen, Blöcken, Doku, Statistik und Restore-/Security-Tests; danach gesonderte **Echtbetriebs- und Pilot-Ingress-Freigabe**.

**Keine** selbstständige Aktivierung der drei optionalen Produktions-Schreibpfade, keine öffentliche Domain, keine Prod-Löschungen, keine pauschale Änderung von SQL-Rechten oder Löschfristen.
