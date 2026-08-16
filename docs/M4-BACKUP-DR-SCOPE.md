# M4 – Backup & Disaster Recovery v0.1

## Ziel

M4 beweist, dass eine spätere eigenständige Produktiv-App nicht nur gesichert, sondern in eine geeignete Zielumgebung real wiederhergestellt und fachlich geprüft werden kann.

Die bisherigen Slices sind bewusst **noch nicht M4 DONE**. Sie bereiten read-only, fail-closed Prüfungen für den aktuell real verwendeten PostgreSQL-Provider Neon und die erste konkrete generierte App `m3-preview` vor. Eine allgemeine Backup-Provider- oder Restore-Abstraktion entsteht nicht, solange kein weiterer realer Verbraucher sie benötigt.

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

Namen, E-Mail-Adressen, Tokens, Passwörter, Task-Texte oder andere Datensätze werden nicht ausgegeben. Der erwartete Fingerprint wird als geschützter Wert behandelt.

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

## Weitere M4-Slices

1. Produktions-Policy und Zielprojekt festlegen.
2. Neon Backup-Schedule kontrolliert konfigurieren. Das ist eine externe Provideränderung und benötigt ausdrückliche Freigabe.
3. Vor kritischen Migrationen einen expliziten manuellen Snapshot-Pfad ergänzen.
4. Einen Restore zunächst in eine getrennte Restore-/Preview-Zielumgebung durchführen, niemals direkt in die laufende Produktion.
5. Den vorab erfassten Restore-Fingerprint gegen das Restore-Ziel verifizieren.
6. Wiederhergestellte Laufzeit technisch prüfen: Health-, Identity-/Auth-, Permission- und Tasks-Smokes.
7. Fachlich relevante Restore-Daten prüfen und das Ergebnis mit Zeit, Restore-Punkt, Ausgangspunkt, Ziel, Prüfschritten und Resultat dokumentieren.
8. Temporäre Restore-Ressourcen kontrolliert entfernen, sofern ihre Aufbewahrung nicht mehr benötigt wird.

## M4 DONE Gate

M4 ist erst DONE, wenn zusätzlich zum Backup-/PITR-Vertrag mindestens ein **realer Restore** erfolgreich durchgeführt, per Fingerprint auf Datenintegrität geprüft, technisch über die erforderlichen Smokes und fachlich geprüft sowie dokumentiert wurde.

Object Storage wird ergänzt, sobald eine reale App Dateien verwendet.
