# P03-G – realer opt-in Schreibschutz für ULC Trainingsanwesenheit und Anmeldung

**14.11.2026 · Status: isolierter Sicherheitsintegrations-Draft, ohne Runtime-/Deployment-Aktivierung.**

## Motivation / Bestandsprüfung

P03-A/B/D haben mit echtem PostgreSQL die Wiederanlage gelöschter personenbezogener Anwesenheits-/Anmeldedaten nachgewiesen. Die **Trainingsdokumentation selbst** verfügt bereits über eigene triggergeschützte Löschmarker; die App-owned `ulc_linz_training_attendance`, `ulc_linz_training_registration`, `ulc_linz_training_registration_change` besitzen keinen gleichwertigen vollständigen Live-Löschschutz. Ein neues dauerhaft personenbezogenes Tombstone-Ledger wäre ohne P01-D2-Freigabe nicht autorisiert und wurde **nicht** angelegt.

## Umsetzung am tatsächlichen Repository

`apps/ulc-linz/worker/training-session-postgres.ts` erhält den explizit opt-in Modus `require-live-athlete-transaction`. Der Standard `legacy` bleibt vollständig unverändert.

- `saveSession` führt im geschützten Modus den gesamten bestehenden Single-Statement-Session-/Anwesenheits-/Trainer-CAS-Write in einer PostgreSQL-Transaktion aus. Vor **jeder** DB-Mutation müssen **alle** namentlich übermittelten Athleten in exakt diesem Verein als **aktiv** im kanonischen `appbasis_athlete`-Owner existieren. Dazu wird jede Person stabil geordnet mit `SELECT ... FOR SHARE` transaktionsgebunden gesperrt; der kanonische Athleten-Retention-Delete verwendet `SELECT ... FOR UPDATE` auf derselben Zeile und kann nicht unbemerkt zwischen Prüfung und Commit löschen.
- Unter demselben Transaction-Lock wird geprüft, ob für die Person im vorhandenen `appbasis_athletes_deletion`-Owner ein Löschmarker existiert. Ein Marker wird nicht erst vom App-Writer erzeugt; ein bestehender Marker wird **unabhängig vom Alter** als Schreibverbotsbeleg behandelt. Fehlt die Tabelle oder verweigert PostgreSQL die Lock-/Markerprüfung, schlägt der Modus **geschlossen** fehl.
- `saveRegistration` prüft vor Status-/Notiz-/Change-History-Schreiben denselben Datenbestand. Bei `proxyActorAthleteId` werden **Zielathlet UND stellvertretender Athlet** geprüft. Der bisherige zusätzliche Proxy-Scope-/aktuelle Membership-SQL-Check bleibt unverändert.
- `withRegistrationTransaction` erzeugt einen geschützt transaktional gebundenen Repository-Writer. Wird darin zunächst `ensureScheduledSession` angelegt und das nachfolgende `saveRegistration` wegen einer gelöschten Person abgewiesen, rollt **auch die neu angelegte Session** zurück.
- Ohne `begin` auf dem PostgreSQL-Client werden die persönlichen Writes im geschützten Modus **verweigert**, nicht auf `legacy` zurückgestellt. Fehler `UlcTrainingSubjectWriteBlockedError` wird intern geworfen; erst ein separat geprüfter HTTP-Error-Vertrag würde für eine spätere Aktivierung eine öffentliche Antwort definieren.
- Die bereits bestehende, zentrale `createGeneratedPostgresApplicationRuntime`-Komposition verwendet weiterhin denselben Session-Repository für Kindertraining, U12, U14, Kids und Selbst-/Stellvertreteranmeldung. Eine **explizite**, standardmäßig nicht gesetzte Option `trainingSessionWriteGuardMode: "require-live-athlete-transaction"` leitet den neuen Modus an alle diese Schreibwege weiter. **Keine** bestehende Cloudflare-Worker-EntryPoint-/Wrangler-Konfiguration setzt dieses Flag; die ausgeführte Handy-Preview bleibt unverändert.

## Abnahme

`test/p03-live-training-session-writer-guard.postgres.e2e.test.ts` installiert **nur die 41 bestehenden ULC-/Modul-Migrationen** in einer eigenen kurzlebigen PostgreSQL-Datenbank. Kein neues Test-DDL/Tombstone/Trigger; nach Testende wird die gesamte Datenbank gelöscht.

Die echten Repository-Tests prüfen:
1. Bestehende, aktive Person: ganze Trainingsanwesenheit und Registrierung werden weiterhin korrekt gespeichert.
2. Veraltete U12-Trainingsliste nach kanonischem Athleten-Delete: kein Reinsert, unveränderte Session-Notiz und Nachbar-Anwesenheit.
3. Veraltete Selbstanmeldung samt Notiz/Change-History wird abgewiesen.
4. Selbstanmeldung nach Löschung: keine verwaiste, zuerst angelegte gemeinsame Session.
5. Gelöschter Proxy-Actor: kein neuer Write für dessen Zielperson.
6. Fehlender bzw. inaktiver Athlet in anderem Verein: verweigert; aktive Nachbarn funktionieren.
7. Fehlende DB-Transaction-API: fail-closed, kein Teilwrite.
8. 2 echte Connections: kanonischer Athleten-`FOR UPDATE`-Delete gewinnt → nachfolgender Guarded Writer blockiert.
9. 2 echte Connections: Guarded Writer hält `FOR SHARE` zuerst, der Delete wartet; Test-only Koordinator löscht anschließend die Attendance und verhindert Wiederanlage.
10. Gesonderter Nachweis: ganze SQL-/Unit-/Modul-CI (Quality und PostgreSQL-E2E) ohne Regression.

## Kritische Grenzen und **BLOCKED** für Produktivstart

Dieser Schutz ist **ein echter im Code implementierter, opt-in Runtime-Writer**, aber noch **keine vollständige Erasure- oder Berechtigungsintegration**:

- Der Schutz verwendet die bestehenden ATHLETES-Zeilen und ihre `FOR UPDATE`-Löschsperre; er entscheidet nicht über die Rechtmäßigkeit von Retention/Löschen und schützt **keine** historische Freitextnotiz/Actor-ID aus fremden Zeilen. Die originale 35-Tage-Source-Autorität wird nicht verlängert.
- **Nicht alle SQL-Schreiber sind gebunden:** Wartungs-SQL, andere Repository-Instanzen, alte Worker und Restore können direkt schreiben. Der bestehende P03-D-Test-Trigger ist ausschließlich eine isolierte Wegwerf-DB-Demo, nicht registrierte Produktionsmigration. Ein **datenbankseitiger Trigger-/Constraint-Fence** ist vor Live-Einsatz nötig, sofern direkte Schreiber nicht anderweitig nachweislich gesperrt sind.
- **Race- und Auth-Grenze:** Die transaktionale Zeilensperre serialisiert gegen den kanonischen ATHLETES-Owner-`FOR UPDATE`-Delete; sie ist kein vollständiger Ersatz für eine appweite Löschung, Rollen-/Gruppen-Revocation oder einen verifizierten Restore-Checkpoint. Insbesondere kann ein erlaubt **vor** der Löschung committeter Trainingseintrag im App-Owner stehen bleiben, bis die gesonderte app-owned Löschung erfolgt. Ein fehlgeschlagener zweiter Owner darf **niemals** als Gesamterfolg quittiert werden.
- Ein freier `session.note`, `registration.note` oder Historien-`actor_identity_id` kann **Dritte** nennen, die nicht durch den exakten `athlete_id`-Check erfasst werden. Ein gelöschter Trainer ist kein Athlet; Traineranwesenheit bleibt separates P03-Owner-Thema.
- **Kein** Merge/Deployment, kein privater R2-/Google-/Neon-Zugriff, keine neuen Prod-Migrationen, keine Readiness-/Permission- oder Retention-Freigabe. `privacy=blocked` und `applicationLifecycle=blocked` unverändert.

**Nächster notwendiger Integrationsschritt:** aktiver kanonischer Permission-/Gruppen-Check innerhalb derselben Write-Transaktion (vor allem S4), DB-seitige Absicherung aller direkten SQL-Schreiber und nachweislich vollständiger Cross-Owner-/Restore-Replay. Anschließend ein eigenständiges, vom Vereinsbetreiber freigegebenes Preview-/Handy-Test-Paket.
