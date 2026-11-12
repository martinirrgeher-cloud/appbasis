# ULC N17 – Performance: Kalender-/Anwesenheitsnavigation (ein Gesamtpaket)

Stand: 12.11.2026. Scope: **bestehende** ULC-Linz-App, kein Schema-/API-Payload-/Rechtewechsel.

## Reproduzierbare Vorher/Nachher-Zählung

| Pfad | Vorher | Nachher | Nachweis |
| --- | --- | --- | --- |
| v17-Kalender für eine autorisierte Woche (Ausnahmen) | 7 einzelne PostgreSQL-Abfragen | 1 bereichsbegrenzte PostgreSQL-Abfrage | `n17-calendar-performance.test.ts` prüft exakt 1 SQL-Aufruf und `BETWEEN`-Grenzen |
| v17-Kalenderwoche inklusive Wochenregel | 8 Kalender-SQL-Abfragen (1 + 7) | 2 Kalender-SQL-Abfragen (1 + 1) | `kindertrainingCalendarResponse`, `readWeekExceptions` |
| 8 Wochen für Kids-Dropdown (Kalender-SQL) | 64 (8 Regeln + 56 Einzelausnahmen) | 16 (8 Regeln + 8 Wochenreads) | gleiche Servermethode je Woche; kein geänderter HTTP-/UI-Vertrag |
| U12/U14/Kids Wechsel des Trainingstags | erst Kategorien-GET, **danach** Session-GET | beide geschützten GETs **parallel**, danach identische Prüfung | `n17-calendar-performance.test.ts`; `u12-ui.ts` wird für U14/Kids abgeleitet |

Die Zahlen sind **deterministische Anfrage- bzw. SQL-Aufrufzahlen, keine behaupteten Millisekunden**. Für echte Vorher/Nachher-Latenzwerte braucht es kontrollierte Browser-/Netzwerkmessung derselben App-Interaktion mit vergleichbarer Latenz und Datenmenge. 4 Sekunden stammen aus der bisherigen Betreiberbeobachtung und werden hier **nicht** als neuer Messwert ausgegeben.

## Sicherheits-/Folgepfadprüfung

1. **Serverzugriff:** `authorizeKindertrainingRequest(..., "view")` und Gruppenfreigabe/Bestandsprüfung bleiben **vor** jedem SQL-Read erhalten. `readWeekExceptions` filtert immer nach `organization_id`, `group_id` und Montag–Sonntag, ohne fremde Daten. Keine neue Route oder öffentliche Abfrage.
2. **Frische:** Weder Kalenderregeln noch Sondertage werden über HTTP-Requests hinweg gecacht; `Cache-Control: private, no-store` bleibt. Änderungen an Trainingstagen/Sonderterminen werden beim nächsten GET erneut gelesen. Der Trainings-POST wird weiterhin serverseitig unabhängig auf Fristen/Modus/CAS geprüft.
3. **Korrektheit:** Kein `kind`-Schemawechsel. Auch `none` behält Revision und wird wie zuvor als `null` interpretiert. Fehlerhafte, doppelte oder gruppenfremde Zeilen führen zu Fehler statt stiller Fehlzuordnung.
4. **UI:** Kategorie- und Anwesenheits-GET werden beide bei **jedem** Tageswechsel weiterhin frisch und authentifiziert ausgeführt. Keine neue Client-Caching-Schicht und kein geänderter Dirty-/Autosave-/Gruppenwechsel-Vertrag. Fehler eines GETs verhindern die Anzeige eines unvollständigen Snapshots.
5. **Regression:** Unit/Fake-SQL für Query-Bounds/Bad-Data, echter isolierter PG-Test für Sondertage, Reset und Organisationstrennung sowie vorhandene Chromium-, Kalender- und Autosave-Tests sind relevant.

## Abnahme

- `pnpm --filter @appbasis/app-ulc-linz typecheck`
- `pnpm --filter @appbasis/app-ulc-linz test`
- CI Quality Gate inkl. Browser/Unit/Build + isolierte PostgreSQL-E2E auf **exaktem PR-HEAD**, nicht nur lokaler PASS.
- Nach *gesonderter* Merge- und Cloudflare-Preview-Freigabe Handytest: U12, U14, Kindertraining Datumspfeile/Dropdown, neue/gecancelte Trainingstage, Gruppenwechsel, Inhalte, Trainer, Auto-Save; keine veralteten Tagesoptionen.
- Gemessene Laufzeitverbesserung ist ein separates Beobachtungsergebnis, nicht mit bloßer SQL-Zählung garantiert.

Kein Merge/Deploy/Provider-Write oder Migration durch dieses Paket.
