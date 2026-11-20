# ULC Linz – P3-D: Praxisnaher Echtbetriebsfahrplan

**Stand: 20.11.2026.** Fachliche Entscheidungsvorlage, **keine** Datenschutz-, Merge-, Cloudflare-, Bereitstellungs- oder öffentliche Pilotfreigabe.

## 1. Gesicherter Iststand

| Bereich | Beobachtung | Was daraus folgt |
|---|---|---|
| Produktionsschema | 44 publizierte Migrationen, **69 Tabellen**, 8 Eigentümer; übereinstimmend mit dem aktuellen `m5-data-inventory.json` | **Keine** erneute Datenbankmigration nötig |
| Alte P01-Aufbewahrungsrichtlinie | ausdrücklich **historischer Stand mit 66 Tabellen** | Die 3 danach hinzugekommenen Tabellen sind bereits im aktuellen M5-Inventar. Alte Tabelle und Fristenentscheidung **nicht** als aktuellen Rechts-/Produktivnachweis ausgeben |
| CI nach Merge #676 | [Run #44821606777](https://github.com/martinirrgeher-cloud/appbasis/actions/runs/44821606777): Quality + PostgreSQL E2E PASS | P3-C Quarantäne-/Wiederherstellungsprüfungen sind integriert |
| Privater Produktionsworker | Bestehend, deployed, workers.dev/Preview-URL/Routes geschlossen; Refresh-Provenienz geprüft | Nur kontrollierter **Private Refresh**, keine Erstinstallation |
| App-Hyperdrive | [Run #44819187328](https://github.com/martinirrgeher-cloud/appbasis/actions/runs/44819187328): `already-correct`; kein PUT | Vor nächstem Deploy frischen Read-only-Abgleich verwenden; kein weiterer Blindfix |
| Neon-Produktionsdaten | Read-only COUNTs vom 20.11.2026: **2 Benutzerkonten**, **0 Athleten**, **0 Trainer**, **0 Trainingstermine**, **0 Anwesenheiten**, **0 Anmeldungen**, **0 Dokumentationen/Revisionen**, **0 Pläne**, **0 Katalog-/Block-Nutzungsereignisse**, **0 private Medien**, **0 Löschmarker** in den jeweils geprüften Tabellen | Es gibt keine Alt-Trainingsdaten zu migrieren. Die beiden Konten können trotzdem personenbezogen sein; keine Aussage über sämtliche Tabellen/Backups |
| Neon-Snapshot | `snap-odd-hat-b1yz457q`, läuft **05.12.2026 23:00 UTC** ab | Existierender Recovery-Punkt ist **kein** Beleg, dass alle wiederherstellbaren Backups höchstens 35 Tage alt sind |
| Produktionsmodule | `countdown`, `athletes`, `training-plans` READY; `exercise-catalog`, `training-blocks`, `training-documentation` weiterhin BLOCKED | Keine pauschale Go-live-Promotion |
| Datenschutz / Betreiber | App `applicationLifecycle` und `privacy` BLOCKED; Anbieter-DPA-Kontobindungen laut M5-Inventar noch `open` | Echtdatenverarbeitung gesondert freizugeben |

Datenstand ist ein **Zeitpunktbefund**, kein fortlaufendes Monitoring. Weitere Benutzer- oder Trainingsänderungen nach dem Befund ändern die Lage. Die neue maschinelle P3-D-Übersicht ist offline und kann deshalb ohne frische SQL-/Providerabfrage keine Live-Personendaten-Freiheit behaupten.

## 2. Zwei sauber getrennte Stufen

### Stufe T – abgeschotteter technischer Pilot ohne neue Echtdaten

Zweck: Funktionalen Stand auf dem **vorhandenen** privaten Produktionsworker technisch verifizieren, ohne den Vereinsbetrieb oder die Verarbeitung echter Kinder-/Trainingsdaten freizuschalten.

**Voraussetzungen:** eigene Betreiberfreigabe für das private Refresh-Deployment, aktueller PASS der Provider-/Hyperdrive-/Rollenchecks, dokumentiertes Testkonten- und Rollenkonzept, frischer Backup-/Rollbackpunkt. In Tests ausschließlich fiktive Personen und Trainings; keine erkennbaren Personenbilder/Videos, tatsächlichen Kontaktdaten, Elternnamen oder persönlichen Notizen neu erfassen. Die vorhandenen zwei Konten **nicht** als garantiert synthetisch einstufen. Public Ingress bleibt AUS.

**Einmalige mobile Abnahme:** Login/Logout und Rollen; Athleten-Testanlage; U12/U14/Kindertraining, IRG-Anmeldung; Statistik/Export; Übungskatalog/Blöcke; Trainingsplanung und Dokumentation; Navigationszeiten, Auto-Save, Datums-/Gruppenwechsel. Tests nur auf gesondert freigegebener isolierter Testfläche. Kein GO für echte Mitglieder.

Das technische P3-D-Reportprogramm gibt selbst bei grünen Offline-Prüfungen **nur `OPERATOR_APPROVAL_REQUIRED`** aus, nie ein fertiges Deployment- oder Go-live-Signal.

### Stufe E – Echtbetrieb mit tatsächlichen Vereinsdaten

Drei **gebündelte** Betreiberentscheidungen, ohne Wiederholung bereits bestandener Tests:

1. **Datenschutz & Provider:** Kontospezifische Cloudflare-/Neon-Auftragsverarbeitungsverträge, Region/Subprozessoren, Verantwortliche und Kinder-/Elterninformation prüfen; Nutzung privater Medien bis zu belegter Speicherung/Löschung deaktiviert lassen.
2. **Fristen & Restore:** Zweckabhängige Aufbewahrung bestätigen; tatsächlichen vollständigen Backup-/Export-/Snapshot-Horizont klären. Aktuell 35-Tage-Löschmarker und danach `deny`; bei längeren wiederherstellbaren Daten keine automatische Restore-Freigabe. Für genehmigte Löschfälle einen **manuell freigegebenen** isolierten Acht-Owner-Reconciliation-Vorgang samt Freitext-/Mediendatenprüfung definieren.
3. **Module:** Übungskatalog, Blöcke, Dokumentation und app-eigene Anwesenheit/Trainer-Audits vollständig fachlich/technisch abnehmen. Erst echte Nachweise in ihren `appbasis.production.json`-Verträgen verankern; `production-contract.mjs ulc-linz --require-ready` muss anschließend mit den tatsächlichen Runtime-Modi PASS liefern.

**Wichtig für die 30-Personen-App:** Nicht erst eine weitere automatische Löschinfrastruktur entwickeln, bevor der private Funktionstest möglich ist. Aber ebenso wenig automatische `ready`-Flags setzen, nur weil heute in den Trainings-Tabellen null Zeilen stehen.

## 3. Technische Umsetzung in diesem Paket

- `tooling/ulc-linz-p3-release-inventory.mjs` leitet das aktuelle 69er-Schema, die historische P01-Abgrenzung, die 8 Owner, die noch offenen Tabellen-/Modulnachweise und die Provider-/Backup-Grenzen **direkt aus dem Repository** ab.
- GitHub-CI prüft den Bericht mit negativen Fällen (fehlender Owner/Tabelle, falscher Providerstatus, stillschweigende Datenschutzfreigabe, geänderte Löschfristen, neu konfigurierter Objektspeicher).
- Der **bestehende** M6-Gesamt-Preflight zeigt den kompakten P3-Bericht in seinem Job Summary. **Kein neuer manueller Workflow**, keine weitere einzelne GitHub-Bestätigung, kein Provider-Write.
- Keine Änderung an produktiven Worker-/Preview-Funktionen, Migrationsketten, Retention-Parametern, Modul-READY-Status, Konten oder persönlichen Daten.

## 4. Stop-/Go-Regel

**Heute:** `SICHERE_TECHNISCHE_VORBEREITUNG`. Ein geschützter Testpilot kann nach spezifischer Infrastruktur- und Testfreigabe sinnvoll werden. **Echtbetrieb mit personenbezogenen Vereinsdaten: BLOCKED.** Der Freigabezeitpunkt wird nicht von dieser Datei oder von GitHub-CI festgelegt.
