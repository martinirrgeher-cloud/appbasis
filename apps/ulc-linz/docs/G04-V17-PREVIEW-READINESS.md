# G-04.2d – Datenschutz-, Export- und Restore-Vorbereitung für v17

**Stand: 08.11.2026 · nicht aktiviert, keine Migration, keine Datenveränderung.**

## Ausgangslage

Die ULC-Linz-App läuft weiterhin mit dem **kanonischen Schema v16**.
Die bestehenden Dateien `privacy/m5-data-inventory.json`,
`privacy/m5-export-contract.json`,
`tooling/ulc-linz-database-contract.mjs` und
`appbasis.database.json` werden in G-04.2d **nicht verändert**.
Der M5-Basisvertrag enthält 64 registrierte Tabellen, wovon 62 aus
individuellen Exporten ausgeschlossen werden. Die neue v17-Migration
`0016_ulc_linz_registration_calendar.sql` fügt genau zwei
Kalender-Konfigurationstabellen hinzu.

## Staged v17, nicht das aktuelle M5-Inventar

- `privacy/m5-data-inventory.v17-proposed.json`: 66 klassifizierte Tabellen;
  die ursprünglichen 64 Datensätze bleiben inhaltlich unverändert, der
  zukünftige Lifecycle-Owner führt v17 und die additive Migration.
- `privacy/m5-export-contract.v17-proposed.json`: dieselben bestehenden
  personenbezogenen Export-Datasets wie v16. Die beiden Kalendertabellen
  werden separat und eindeutig unter `training-calendar-configuration`
  als **nicht Bestandteil des persönlichen Member-Exports** geführt.
  Eine Bereitstellung für Administratoren bleibt im fachlich geschützten
  Gruppen-Overlay möglich.
- `tooling/ulc-linz-g04-v17-activation-readiness.mjs`: vergleicht
  die staged Version strikt mit den aktuellen 64 Tabellen und prüft die
  lückenlose Klassifikation **aller 66**. Der isolierte PostgreSQL-18-E2E
  gleicht die wirklichen neuen Datenbankspalten mit dem Inventarvorschlag ab.

Die Konfiguration enthält keine Athleten-/Trainer-/Actor-Kennung
und keinen Freitext. **Trotzdem** können Gruppenkennung und Termine durch
Verknüpfung mit der vorhandenen Mitgliederdatenbank personenbeziehbar sein.
Deshalb bleibt die bestehende Organisations- und Rollenprüfung Pflicht.

**Offene Entscheidung des Verantwortlichen:** Lebenszyklus, Löschfrist
und Verhalten bei Deaktivierung/Löschung einer Trainingsgruppe. Das
v17-Inventar markiert `retentionPolicy`,
`deletionEvidence` und `retentionEvidence` ausdrücklich **pending**.
Die neue SQL-Migration besitzt kein bereits nachgewiesenes
gruppenbezogenes Lösch-/Retentionverfahren. Ein Test grün ist dafür
kein Ersatz. Das ist vor echter Freischaltung zu entscheiden, umzusetzen
und unabhängig abzunehmen.

## Backup, isolierter Restore und Beweiskette

`privacy/g04-v17-preview-activation-evidence.json` enthält zu Beginn
**keine** positiven Nachweise. Sie steht auf
`blocked-pending-independent-operator-evidence`.

Ein später freigebbarer Zustand benötigt mindestens:

1. Nachvollziehbare Entscheidung der Datenverantwortlichen zu
   Datenschutzklassifikation, Export und Lösch-/Retentionverfahren.
2. Eine verifizierte v16-Preview-Sicherung mit Quelle, Zeitpunkt,
   SHA-256-Prüfsumme und **abrufbarem, unabhängigem Beleg**.
3. Einen Wiederherstellungstest dieser **identischen** Sicherung in einer
   **anderen**, isolierten Datenbank mit bestätigter Prüfsumme,
   eigenem Beleg und nach der Sicherung liegendem Testzeitpunkt.
4. Eine gesonderte, explizite Betreiberfreigabe für **genau** die
   v17-Preview-Migration, nicht für Produktion.
5. Nach Prüfung der Belege Änderung des default-deny Status
   im eigenen, zu reviewenden PR. Der Metadatentest validiert
   Referenzen, Datenbanktrennung, Frische und Prüfsummenbezug,
   **er beweist nicht, dass fremde Systeme tatsächlich ein Backup
   erstellt haben**. Der Prüfer muss die Originalbelege öffnen.

Die Prüfung akzeptiert nur eine innerhalb von 24 Stunden vor dem
Migrationslauf liegende Sicherung und den zugehörigen Restore-Test.
Damit können alte Belege nicht stillschweigend wiederverwendet werden.

Der bestehende M4-Backup-/Restore-Code enthält workflowspezifische
`m3-preview`- oder Produktionsannahmen. Er darf nicht automatisch
als verifizierte ULC-v17-Preview-Wiederherstellung behauptet werden.
Ein eigener, tatsächlich ausgeführter isolierter Preview-Restore
ist erforderlich.

## Technischer Freigabeschutz

Die manuelle
`.github/workflows/ulc-linz-g04-v17-preview.yml`-Aktion
`inspect` bleibt lesend zugänglich. Die Aktion `migrate`
prüft vor dem Anwenden die unabhängige Evidence-Ledger. Auch
`tooling/ulc-linz-g04-calendar-v17-preview.mjs apply`
führt die Prüfung selbst aus; ein Umgehen des Workflow-Gates per CLI
ist dadurch nicht möglich. Bei fehlender Evidenz wird **vor
Öffnung der Datenbankverbindung** abgebrochen.

Die ältere Checkliste `backupConfirmed` / `restoreConfirmed` /
`privacyConfirmed` bleibt als zusätzlicher Operator-Gate bestehen,
ersetzt die unabhängige Evidenz aber nicht.

## Noch nicht erteilte Freigaben

- **G-04.2d PR-Merge:** separat vom Betreiber zu entscheiden.
- **Privacy/Retention-Verantwortlichenentscheidung:** ausständig.
- **Isolierter Backup-/Restore-Beweis:** ausständig.
- **v17-Preview-Datenbankmigration:** gesperrt; zusätzlicher Gate nötig.
- **Aktivierung `APPBASIS_REGISTRATION_CALENDAR_V17=enabled`:** gesperrt.
- **Preview-/Produktionsdeployment:** nicht Teil dieses Pakets;
  Produktion bleibt `blocked`.

Erst nach tatsächlicher Aktivierung sind Admin-Gruppenoverlay,
Wochenansicht, Anmeldefrist, Sondertermine, Direkt-/Proxy-Anmeldung,
Frist-Bypass, CAS, Abmeldeverhalten und Smartphone-Layout in einer
isolierten Preview fachlich zu prüfen.

## G-04.2e – Technischer Lebenszyklus der Kalenderkonfiguration (Entwurf)

**Kein aktivierter Löschlauf und keine vorweggenommene rechtliche Frist.**
Der Gruppenstamm bietet derzeit keinen öffentlichen Hard-Delete-Endpunkt.
Die Gruppen-Deaktivierung ist reversibel; sie darf Kalenderregeln und
CAS-Versionen daher **nicht löschen**. Damit bleiben bestehende
Konfigurationen bei späterer Reaktivierung erhalten.

Der v17-**Migrationskandidat** `0016` legt für beide
Kalenderkonfigurationstabellen jeweils einen Foreign Key
`group_id → appbasis_training_group(id) ON DELETE CASCADE` fest.
**Nur falls** ein anderweitig autorisierter physischer Gruppendatensatz
tatsächlich gelöscht werden kann, löscht PostgreSQL die zugehörigen
Regel-/Ausnahmetabellenzeilen in derselben Transaktion. Wenn andere
Owner-Tabellen die Gruppenlöschung blockieren, wird auch die
Kalenderlöschung vollständig zurückgerollt.

Dies ist **keine** allgemeine Athleten- oder Trainingsdatenlöschung:
bestehende Anwesenheit, Trainingshistorie, Notizen und andere
Modulbesitzer behalten ihre unabhängigen Aufbewahrungsverträge.
Ein Versionierungs-Reset `kind='none'` wird absichtlich nicht als
frei löschbarer Ausnahmedatensatz behandelt: sein CAS-Stand verhindert,
dass eine veraltete Sitzung den Termin wiederherstellt.

Die v17-Preview-Schemaprüfung lehnt fehlende, falsch zugeordnete,
`NO ACTION`- oder doppelte Gruppen-Foreign-Keys ab und verifiziert
den referenzierten Schlüssel und das `CASCADE`-Verhalten. Der isolierte
PostgreSQL-E2E prüft beides: Deaktivieren **erhält** Daten,
physisches Löschen **entfernt** ausschließlich Kalenderkonfiguration.
Kein neuer Anwendungs-Endpunkt führt Hard Deletes aus.

Die vorgeschlagene technische Entscheidung steht in
`privacy/g04-v17-calendar-lifecycle-proposal.json`.
**Noch offen** sind die fachliche und datenschutzrechtliche Entscheidung
über Aufbewahrungsdauer, inaktive Gruppen, Fristen nach Trainingstag und
eventuelle spätere automatisierte Bereinigung. Ein automatischer
Zeitablauf-Purge wird nicht implementiert oder aktiviert, da dadurch
bestehende CAS-Versionsstände verlorengehen könnten.

Unverändert gesperrt bleiben v17-Migration, Preview-Featureflag,
Deployments und Produktion. Die `g04-v17-preview-activation-evidence.json`
bleibt `pending`, bis echte Controller-, Backup-, Restore- und
Betreiberbelege unabhängig geprüft wurden.
