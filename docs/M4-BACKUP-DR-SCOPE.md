# M4 – Backup & Disaster Recovery v0.1

## Ziel

M4 beweist, dass eine spätere eigenständige Produktiv-App nicht nur gesichert, sondern in eine geeignete Zielumgebung real wiederhergestellt und fachlich geprüft werden kann.

Dieser erste Slice ist bewusst **noch nicht M4 DONE**. Er führt einen read-only, fail-closed Readiness-Check für den aktuell real verwendeten PostgreSQL-Provider Neon ein. Eine allgemeine Backup-Provider-Abstraktion entsteht nicht, solange kein zweiter realer Provider sie benötigt.

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

## Weitere M4-Slices

1. Produktions-Policy und Zielprojekt festlegen.
2. Neon Backup-Schedule kontrolliert konfigurieren. Das ist eine externe Provideränderung und benötigt ausdrückliche Freigabe.
3. Vor kritischen Migrationen einen expliziten manuellen Snapshot-Pfad ergänzen.
4. Einen Restore zunächst in eine getrennte Restore-/Preview-Zielumgebung durchführen, niemals direkt in die laufende Produktion.
5. Wiederhergestellte Datenbank technisch prüfen: erwartete Migrationen/Schemas sowie Health-, Identity-, Permission- und ausgewählte Modul-Smokes.
6. Fachlich relevante Restore-Daten prüfen und das Ergebnis mit Zeit, Ausgangspunkt, Ziel, Prüfschritten und Resultat dokumentieren.
7. Temporäre Restore-Ressourcen kontrolliert entfernen, sofern ihre Aufbewahrung nicht mehr benötigt wird.

## M4 DONE Gate

M4 ist erst DONE, wenn zusätzlich zum Backup-/PITR-Vertrag mindestens ein **realer Restore** erfolgreich durchgeführt, technisch und fachlich geprüft sowie dokumentiert wurde.

Object Storage wird ergänzt, sobald eine reale App Dateien verwendet.
