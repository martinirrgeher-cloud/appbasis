# M4 – Backup & Disaster Recovery v0.1

## Ziel

M4 beweist, dass eine spätere eigenständige Produktiv-App nicht nur gesichert, sondern in eine geeignete Zielumgebung real wiederhergestellt und fachlich geprüft werden kann.

Die bisherigen Slices sind bewusst **noch nicht M4 DONE**. Sie bereiten fail-closed Prüfungen und einen kontrollierten Pre-Migration-Sicherungspfad für den aktuell real verwendeten PostgreSQL-Provider Neon sowie die erste konkrete generierte App `m3-preview` vor. Eine allgemeine Backup-Provider- oder Restore-Abstraktion entsteht nicht, solange kein weiterer realer Verbraucher sie benötigt.

## Slice 1 – Read-only Neon Backup Readiness

`tooling/m4-neon-backup-readiness.mjs` prüft ausschließlich per Neon-GET-API:

- ob das Projekt mindestens das explizit konfigurierte Point-in-Time-Restore-Fenster besitzt,
- ob für den Ziel-Branch ein geplanter Snapshot mit der explizit geforderten Frequenz existiert,
- ob dessen Aufbewahrung mindestens der explizit geforderten Dauer entspricht.

Der Check verändert keine Neon-Ressource. Projekt- und Branch-IDs bleiben Deployment-/Providerzustand und werden nicht in App-Manifeste geschrieben. API-Credentials bleiben Secrets. Fehler werden ohne Provider-Response-Bodies oder Credentials nach außen gegeben.

Der manuelle Workflow `.github/workflows/m4-backup-readiness.yml` verwendet ein geschütztes GitHub Environment `m4-dr`. Ziel-IDs und Policy-Werte liegen in Environment-Variablen; der Neon API Key liegt als Environment-Secret vor.

## Policy wird nicht stillschweigend festgelegt

M4 benötigt eine bewusste Entscheidung für mindestens:

- minimales PITR-Fenster,
- Snapshot-Frequenz,
- minimale Snapshot-Aufbewahrung.

Der Readiness-Check besitzt dafür keine fachlichen Defaultwerte. Fehlende Policy-Werte führen fail-closed zu einem Fehler.

## Slice 2 – Read-only Restore-Fingerprint-Verifikation

`tooling/m4-restore-verification.mjs` definiert für die erste konkrete generierte App `m3-preview` einen deterministischen, nicht-inhaltlichen Restore-Fingerprint.

Der Fingerprint umfasst ausschließlich:

- Zeilenanzahlen,
- Hashes der vollständigen, deterministisch sortierten Tabellenzeilen,
- Identity/Auth-Tabellen,
- Permission-Tabellen inklusive Administration-Audit,
- das Tasks-Fachmodul.

Namen, E-Mail-Adressen, Tokens, Passwörter, Task-Texte oder andere Datensätze werden nicht ausgegeben. Der erwartete Fingerprint wird als geschützter Wert behandelt. Vor der Serialisierung werden die Datenbank-Session-Einstellungen für Zeitzone und Datumsdarstellung kanonisiert, damit identische Restore-Daten nicht allein wegen unterschiedlicher Login-Defaults verschiedene Fingerprints ergeben.

### Fingerprint vor dem Restore erfassen

Unmittelbar vor dem gewählten Restore-Punkt wird der Fingerprint read-only aus der Quelle erfasst:

```text
APPBASIS_M4_SOURCE_DATABASE_URL=<protected source URL> node ./tooling/m4-restore-verification.mjs fingerprint
```

Der ausgegebene JSON-Fingerprint wird anschließend geschützt als `APPBASIS_M4_EXPECTED_RESTORE_FINGERPRINT` im GitHub Environment `m4-dr` hinterlegt. Die Quelldatenbank-URL wird nicht persistiert.

Wichtig: Bei einem PITR-Restore wird **nicht** gegen den späteren aktuellen Live-Stand der Quelle verglichen. Maßgeblich ist immer der vorab zum gewählten Restore-Punkt erfasste Fingerprint.

### Restore-Ziel prüfen

Nach einem getrennt und ausdrücklich freigegeben durchgeführten Restore wird dessen Datenbankverbindung als Environment-Secret `APPBASIS_M4_RESTORE_DATABASE_URL` bereitgestellt. Der manuelle Workflow `.github/workflows/m4-restore-verification.yml`:

- besitzt nur `contents: read`,
- läuft im geschützten Environment `m4-dr`,
- führt keine Neon-Provideraktion aus,
- führt keine Migration und keine Datenmutation aus,
- prüft zuerst den bestehenden `m3-preview`-Schema-Vertrag,
- liest anschließend ausschließlich den Restore-Fingerprint,
- schlägt bei jedem Fingerprint-Unterschied fail-closed fehl,
- nennt bei Abweichungen nur die betroffenen Fingerprint-Felder und keine Datenwerte.

Dieser Slice beweist Datenintegrität des Restore-Ziels, aber noch **nicht** den kompletten fachlichen Restore. Health-, Auth-, Permission- und Tasks-Smokes gegen die wiederhergestellte Laufzeit bleiben verpflichtend.

## Slice 3 – Gegateter Pre-Migration-Snapshot

`tooling/m4-pre-migration-snapshot.mjs` bereitet den M4-Pflichtpunkt **Sicherung vor kritischen Migrationen** vor.

Der Vertrag ist bewusst Neon-spezifisch und nutzt den aktuellen Snapshot-Vertrag:

- Zielprojekt und Zielbranch werden explizit vorgegeben,
- der Branch wird zuerst read-only geladen und muss ein betriebsbereiter Root-Branch sein,
- der Snapshot-Name wird deterministisch aus einer kanonischen Migrations-/Change-ID abgeleitet,
- `expires_at` muss ausdrücklich als zukünftiger UTC-RFC3339-Zeitpunkt vorgegeben werden; es gibt keine versteckte Retention-Vorgabe,
- bestehende Snapshots werden vor jeder möglichen Mutation per GET geprüft,
- ein exakt passender bestehender Snapshot macht einen erneuten Lauf ohne weiteren POST erfolgreich,
- mehrdeutige oder abweichende gleichnamige Snapshots führen fail-closed zum Abbruch,
- ohne `apply=true` bleibt der gesamte Lauf read-only,
- mit `apply=true` wird höchstens **ein** Snapshot-POST ausgeführt,
- nach erfolgreichem POST wird der Snapshot per GET autoritativ zurückgelesen und gegen Name, Quellbranch und Ablaufzeit geprüft,
- bei Timeout, Netzwerkfehler oder unklarem Providerergebnis wird niemals blind erneut POST ausgeführt; ein read-only Reconciliation-GET darf einen bereits entstandenen exakten Snapshot erkennen, ansonsten bleibt das Ergebnis bewusst unbestätigt und ein späterer neuer Preflight ist erforderlich.

Der manuelle Workflow `.github/workflows/m4-pre-migration-snapshot.yml` verwendet `m4-dr`, `contents: read`, einen standardmäßig deaktivierten Apply-Schalter und geschützte Providerparameter.

**Wichtig:** Dieser Repository-Slice führt den Workflow nicht aus und erzeugt keinen Snapshot. Eine reale Snapshot-Erzeugung ist eine externe Provideränderung und benötigt weiterhin eine ausdrückliche Nutzerfreigabe.

## Weitere M4-Slices

1. Produktions-Policy und Zielprojekt festlegen.
2. Neon Backup-Schedule kontrolliert konfigurieren. Das ist eine externe Provideränderung und benötigt ausdrückliche Freigabe.
3. Den Pre-Migration-Snapshot-Pfad an einem ausdrücklich freigegebenen realen Ziel ausführen und dokumentieren.
4. Einen Restore zunächst in eine getrennte Restore-/Preview-Zielumgebung durchführen, niemals direkt in die laufende Produktion.
5. Den vorab erfassten Restore-Fingerprint gegen das Restore-Ziel verifizieren.
6. Wiederhergestellte Laufzeit technisch prüfen: Health-, Identity-/Auth-, Permission- und Tasks-Smokes.
7. Fachlich relevante Restore-Daten prüfen und das Ergebnis mit Zeit, Restore-Punkt, Ausgangspunkt, Ziel, Prüfschritten und Resultat dokumentieren.
8. Temporäre Restore-Ressourcen kontrolliert entfernen, sofern ihre Aufbewahrung nicht mehr benötigt wird.

## M4 DONE Gate

M4 ist erst DONE, wenn automatische Backups/Retention/PITR ausreichend konfiguriert sind, ein Backup vor kritischen Migrationen real möglich und geprüft ist, der Recovery-Prozess dokumentiert ist und mindestens ein **realer Restore** erfolgreich durchgeführt, per Fingerprint auf Datenintegrität geprüft, technisch über die erforderlichen Smokes und fachlich geprüft sowie dokumentiert wurde.

Object Storage wird ergänzt, sobald eine reale App Dateien verwendet.
