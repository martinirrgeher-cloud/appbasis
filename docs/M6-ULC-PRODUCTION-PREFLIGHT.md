# M6 – ULC Linz Production Preflight

## Zweck

Dieser Preflight beschreibt den kontrollierten Produktionspfad für `ulc-linz` bis unmittelbar vor externe bzw. produktive Writes. Er ist kein Release und keine Providerfreigabe.

Der M6-Pfad bleibt fail-closed und setzt auch bei vollständig erfolgreicher Repository-Prüfung:

- `providerWritesEnabled = false`
- `providerWriteAllowed = false`
- `releaseAuthorized = false`
- `explicitApprovalRequired = true`

## Reihenfolge

1. eigene Neon-Produktionsdatenbank in Frankfurt
2. eigener privater Production Worker
3. Datenbankbindung
4. Domain-Auswahl
5. Runtime-Konfiguration / Secrets
6. Production Security Logging
7. produktive Migrationen
8. Worker-Deploy
9. Access-Bootstrap
10. Domain-Aktivierung
11. M5-Production-Evidence
12. Backup-/Recovery-Validation
13. Post-Deploy-Smokes
14. separates Release-Gate

Jeder mutierende Schritt bleibt hinter seiner eigenen ausdrücklichen Freigabe. Die finale Produktionsfreigabe ist zusätzlich separat erforderlich.

## Provider-State vor dem ersten Write

Der read-only Provider-State-Preflight muss vor dem ersten Provider-Write ein vollständiges Inventar belegen. Für Neon gilt ein expliziter Mehrseitenvertrag: maximal 400 Projekte pro Seite, maximal 25 Seiten bzw. 10.000 Projekte insgesamt. Eine volle Seite ohne Fortsetzungscursor gilt als unvollständig; terminale Cursor-Sentinels sind nur auf einer kurzen letzten Seite zulässig.

Bestehende exakte oder plausible ULC-Production-Ressourcenkandidaten blockieren fail-closed. Die Zielregion muss autoritativ `aws-eu-central-1` sein und der spätere Create-Mechanismus muss sie explizit setzen.

## Migration-/Smoke-Bindung

Der spätere Migrations-/Smoke-Executor muss das frisch auf dem tatsächlichen finalen Head berechnete Rehearsal konsumieren. Dessen `planFingerprint` bindet nicht nur die Migrationen, sondern zusätzlich die validierten App-/Runtime-/Authorization-/Manifest-, Repository-Preflight-, M6-Execution-Plan- und Smoke-Verträge.

Damit darf eine Änderung dieser Inputs kein altes Rehearsal wiederverwenden, selbst wenn die SQL-Dateien unverändert bleiben.

## M4-Abhängigkeit

M6 setzt M4 DONE voraus. Ein vorhandener Restore-Datenbestand allein genügt nicht, wenn die erforderliche fachliche Restore-/Smoke-Ausführung nicht unabhängig verifizierbar ist. Solange diese Provenienz fehlt, bleibt M4 OPEN und M6 kann nicht freigeschaltet werden.

## Externe Wirkung dieses Preflights

Keine. Keine Ressource wird erstellt, kein Worker deployed, kein Secret gesetzt, keine Produktionsmigration ausgeführt und kein Release freigegeben.
