# M4 – Recovery Acceptance Record 2026-08-17

## Status

**M4 Backup & Disaster Recovery v0.1 ist für den ersten realen Verbraucher `m3-preview` DONE.**

Dieser Acceptance Record ersetzt ausschließlich die älteren Statusaussagen in `M4-BACKUP-DR-SCOPE.md` und `M4-R2-RESTORE-REHEARSAL.md`, nach denen M4 vor dem realen Abschlusslauf noch offen war. Die dort beschriebenen technischen Sicherheits-, Backup-, Restore- und Fail-closed-Verträge bleiben unverändert gültig.

Die Evidenz gilt nur für den aktuellen ersten Verbraucher `m3-preview`. Eine spätere eigenständige Produktiv-App muss ihren eigenen Backup-/Restore-Nachweis auf ihren eigenen Ressourcen erbringen.

## Geprüfter Umfang

M4 verlangt für DONE nicht nur vorhandene Backup-Software, sondern einen realen Wiederherstellungsnachweis mit:

- realem externem Backup-Pfad und Retention,
- Pre-Migration-Sicherungspfad,
- realem Restore in ein getrenntes Ziel,
- Datenintegritätsprüfung,
- Health-/Auth-Prüfung,
- Permission-Prüfung inklusive deny-by-default-Negativfall,
- mindestens einem echten Fachmodul-Smoke,
- dokumentierter Recovery-Evidenz.

## Backup- und Recovery-Verträge

Der aktuell kanonische Free-First-Pfad verwendet den bestehenden `M4 Free External Backup`-Workflow:

- tägliche geplante Ausführung um `02:17 UTC`, wenn das geschützte M4-Profil aktiviert ist,
- PostgreSQL-18-Custom-Dump und Fingerprint aus demselben konsistenten Datenbanksnapshot,
- client-seitige AES-256-GCM-Verschlüsselung vor dem Provider-Upload,
- immutable R2-Objekte,
- Retention der letzten 7 Daily-Slots plus 4 jüngsten Weekly-Slots,
- getrennte immutable Pre-Migration-Backups,
- read-only Reconciliation statt blindem Wiederholen bei unklarem Write-Ausgang.

Der reale externe Backup-Pfad und der reale Pre-Migration-Pfad wurden vor diesem Acceptance Record bereits erfolgreich ausgeführt. Dieser Abschluss führt bewusst keinen zweiten Provider-Write und keinen zusätzlichen Restore nur zur Dokumentation aus.

Der historische GitHub-Actions-Run-Identifier und der konkrete R2-Objekt-Key des damaligen Restore-Laufs werden in diesem Repository nicht nachträglich erfunden. Der aktuell verbundene GitHub-Reader stellt diese historischen Workflow-Dispatch-Eingaben nicht bereit. Die Datenintegrität wird deshalb unten unabhängig und read-only gegen den tatsächlich restaurierten Datenbestand belegt.

## Restore-Ziel

Geprüfte Umgebung:

- Quelle: `appbasis-m3-preview`
- isoliertes Restore-Ziel: `appbasis-m4-r2-restore`
- Datenbank: `appbasis_m3_preview`
- PostgreSQL: Version 18
- Restore-Ziel bereitgestellt: `2026-08-17T08:06:22Z`
- keine Produktionsdatenbank und keine Produktionsfreigabe

Das Restore-Ziel enthält den vollständigen erwarteten `m3-preview`-Schemaumfang mit Identity/Auth, Permissions und Tasks.

## Unabhängige Datenintegritätsprüfung

Am 18.08.2026 wurde Quelle gegen Restore erneut ausschließlich read-only geprüft.

Der nach dem Restore ausgeführte M4-Funktions-Smoke hinterlässt eindeutig erkennbare Testdatensätze (`m4r.*` sowie `M4 restored smoke ...`). Für die Baseline-Prüfung wurden ausschließlich diese eindeutig nachträglich erzeugten M4-Smoke-Datensätze aus dem Restore herausgerechnet.

Danach stimmen **alle 32 kanonischen M4-Fingerprint-Felder exakt überein**: Für jede der 16 vom M4-Fingerprint erfassten Tabellen sind sowohl Zeilenanzahl als auch Digest zwischen Quelle und restaurierter Baseline identisch.

| Bereich | Baseline-Count Quelle | Baseline-Count Restore | Digest |
| --- | ---: | ---: | --- |
| Identity Users | 3 | 3 | exakt gleich |
| Identity Accounts | 3 | 3 | exakt gleich |
| Identity Sessions | 2 | 2 | exakt gleich |
| Identity Verifications | 0 | 0 | exakt gleich |
| Identity Persons | 0 | 0 | exakt gleich |
| Identity Security State | 2 | 2 | exakt gleich |
| Identity Operations | 4 | 4 | exakt gleich |
| Permission Capabilities | 3 | 3 | exakt gleich |
| Permission Roles | 2 | 2 | exakt gleich |
| Permission Role Capabilities | 5 | 5 | exakt gleich |
| Permission Principals | 2 | 2 | exakt gleich |
| Permission Principal Roles | 1 | 1 | exakt gleich |
| Permission Principal Grants | 0 | 0 | exakt gleich |
| Permission Principal Revokes | 0 | 0 | exakt gleich |
| Permission Administration Audit | 0 | 0 | exakt gleich |
| Tasks | 1 | 1 | exakt gleich |

Damit ist die restaurierte Baseline unabhängig vom späteren Funktions-Smoke datenidentisch zur aktuellen Quelle für den vollständigen kanonischen M4-Fingerprint-Scope.

## Realer Funktions-Smoke auf dem Restore-Ziel

PR #132 hat den kanonischen Restore-Workflow so erweitert, dass der Funktions-Smoke erst **nach erfolgreicher Restore-Fingerprint-Prüfung** ausgeführt wird.

Die live gelesene Restore-Datenbank enthält exakt die erwartete Signatur dieses Smokes:

- 2 M4-Smoke-Identitäten,
- davon 1 erlaubte und 1 verweigerte Identität,
- erlaubte Identität: genau 1 persistierte Rollenbindung,
- verweigerte Identität: 0 Rollenbindungen,
- 1 M4-Smoke-Task,
- dieser Task steht nach Persistenzprüfung und Toggle auf `completed`.

Die Smoke-Identitäten wurden zwischen `2026-08-17T12:02:14.899Z` und `2026-08-17T12:02:16.179Z` erzeugt. Der Smoke-Task wurde um `2026-08-17T12:02:30.140Z` erzeugt und zuletzt um `2026-08-17T12:02:32.389Z` aktualisiert.

Diese Zeitpunkte liegen nach dem Merge des finalen Restore-Smoke-Vertrags aus PR #132. Der dortige Testvertrag prüft:

1. Health `200` für `m3-preview`,
2. echte Better-Auth-Anmeldung,
3. verpflichtenden Passwortwechsel und danach Full Access,
4. deny-by-default `403 PERMISSION_DENIED` für die verweigerte Identität,
5. erlaubte Task-Erzeugung,
6. Task-Persistenz nach neuer Runtime-Instanz,
7. Toggle auf `completed`,
8. erneute Persistenzprüfung nach weiterer Runtime-Neueröffnung.

Die im Restore vorhandene Signatur entspricht exakt diesem operationalen Testvertrag.

## Dauer

Die reine Funktions-Smoke-Phase ist aus den persistenten Zeitstempeln mit **17,490 Sekunden** beobachtbar (`12:02:14.899Z` bis `12:02:32.389Z`).

Da der aktuelle GitHub-Reader die historische Workflow-Run-Dauer dieses manuellen Restore-Laufs nicht mehr auflisten kann, wird keine kürzere Gesamt-Restore-Dauer erfunden. Als konservative dokumentierte End-to-end-Wandzeit gilt deshalb das Intervall vom Bereitstellen des isolierten Restore-Projekts bis zum abgeschlossenen Funktions-Smoke:

- Start: `2026-08-17T08:06:22Z`
- Abschluss: `2026-08-17T12:02:32.389Z`
- konservative End-to-end-Dauer: **3 h 56 min 10,389 s**

Diese Dauer ist bewusst eine Obergrenze einschließlich Bereitstellungs-/Wartezeit und nicht als reine `pg_restore`-Laufzeit zu interpretieren.

## Ergebnis / M4 DONE Gate

Für `m3-preview` ist damit nachgewiesen:

- Backup-Pfad vorhanden und real verwendet,
- Retention und Pre-Migration-Pfad definiert und real erprobt,
- realer Restore in getrennte Umgebung vorhanden,
- Schema vollständig,
- 16/16 Tabellen bzw. 32/32 Count-/Digest-Fingerprintwerte baseline-identisch,
- Health erfolgreich,
- Auth inklusive Passwortwechsel erfolgreich,
- Permission-Negativfall deny-by-default erfolgreich,
- erlaubter Tasks-Fachmodulpfad inklusive Persistenz und Toggle erfolgreich,
- Recovery-Zeitpunkt, Quelle, Ziel, Dauer und Ergebnis dokumentiert.

**M4 v0.1 ist damit für den ersten realen AppBasis-Verbraucher `m3-preview` abgeschlossen.**

## Grenzen

- Dieser Nachweis ist keine Produktionsfreigabe.
- Er erzeugt keine neue Produktionsressource und verändert keine Produktivdatenbank.
- Er ersetzt nicht den später erforderlichen app-spezifischen Backup-/Restore-Nachweis der ersten echten Produktiv-App.
- Object Storage innerhalb einer Fach-App wird erst Bestandteil ihres eigenen Recovery-Gates, sobald diese App tatsächlich Dateien speichert.
- M5- und M6-Gates bleiben unabhängig und werden durch diesen Record nicht freigeschaltet.
