# K2-R02 – RPO/RTO-Evidenz und Wiederanlauf (Entwurf)
Stand: 15.11.2026. **Kein Produktiv-Go; keine Provideraktion.**

## Ausgangslage
Die erfolgreiche verschlüsselte K2-Preview-Sicherung [#43645974462](https://github.com/martinirrgeher-cloud/appbasis/actions/runs/43645974462) und der isolierte Datenbank-Restore [#43647364218](https://github.com/martinirrgeher-cloud/appbasis/actions/runs/43647364218) belegen einen technischen Snapshot-Restore. Sie belegen **weder ein betriebliches RPO/RTO noch einen Medien- und Rollen-Restore**. Diese Vorlage ergänzt, ersetzt aber nicht die Entwürfe #633–#637.

- **RPO (Recovery Point Objective):** maximal tolerierter Datenverlust, gemessen als Alter des tatsächlich wiederherstellbaren Recovery Points zum maßgeblichen Prüfzeitpunkt; bei laufenden Datenänderungen gesondert auswerten.
- **RTO (Recovery Time Objective):** maximal tolerierte Wiederanlaufzeit. Die reine Dauer von `pg_restore` ist **nicht** die betriebliche RTO. Für einen echten E2E-RTO-Beleg müssen Authentifizierung, Rollen/RLS, Medien, App-Routing, Regressionen und menschliche Abnahme in der Zeitmessung enthalten sein.
- Betreiber müssen beide Ziele **vorher** fachlich definieren. Ein tägliches Backup garantiert kein RPO von 24 Stunden; Verzögerungen und fehlgeschlagene Läufe zählen mit.

## Offline-Prüfung
`node --test tooling/ulc-linz-k2-recovery-objectives.test.mjs`

Die reine Funktion `evaluateK2RecoveryObjectives` benötigt UTC-Zeitstempel, RPO-/RTO-Grenzen und fünf unabhängige Bestätigungen. Ungültige Zeitfolgen werden verworfen; unvollständige Evidenz, zu alte Sicherung oder zu lange Wiederanlaufdauer führen zu `BLOCK`. Auch ein synthetisches `READY_FOR_HUMAN_REVIEW` setzt `productionReady=false`, `deployAuthorized=false`, `restoreAuthorized=false` und `enableBackupAuthorized=false`.

Die Quelle der Zeitstempel muss separat geprüft werden: Backup-Metadaten, tatsächlich bestätigter Snapshot-Zeitpunkt, Wiederanlaufstart und vollständige App-Abnahme. **Die Testdaten sind synthetisch**; der Prüfer erhebt keine Live-Evidenz und führt keine Netzwerkanfragen aus.

## Freigabegates
1. Vereinsverantwortliche legen Datenverlust- und Wiederanlaufziel fest; Verantwortliche und Kontaktkette benennen.
2. Medien-Restore, Berechtigungen, RLS, Session/Login und alle Kernmodule mit isolierten Testkonten prüfen.
3. Restore-Snapshot darf gelöschte personenbezogene Daten nicht ohne Re-Deletion wieder produktiv machen; Legal Holds und Löschberechtigungen gesondert prüfen.
4. Zwei unabhängige Wiederherstellungspunkte und Schlüsselwiederbeschaffung nachweisen.
5. E2E-Zeitmessung dokumentieren, inklusive manueller Freigabe und Wiederanlauf nach Fehlerfall.
6. Gesonderte Entscheidung über tägliche Backup-Aktivierung, R2-Retention und Produktivnahme.

**Default: BLOCKED.** Keine Änderung an Cloudflare R2, Neon, GitHub Secrets, Deployments oder produktiven Daten durch dieses Paket.
