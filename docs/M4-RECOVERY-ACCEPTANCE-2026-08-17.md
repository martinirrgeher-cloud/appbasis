# M4 – Recovery Evidence Record 2026-08-17

## Status

**M4 Backup & Disaster Recovery v0.1 bleibt für `m3-preview` OPEN.**

Dieser Record dokumentiert starke reale Recovery-Evidence, reicht aber nicht aus, um das M4-DONE-Gate fail-closed zu schließen. Für DONE verlangt die aktuelle Roadmap einen real getesteten Restore, dessen Ergebnis fachlich geprüft ist – einschließlich Datenintegrität, Auth, Permissions und mindestens eines Fachmodul-Smokes.

Die derzeit noch fehlende Grenze ist **unabhängig verifizierbare Ausführungsprovenienz des historischen Restore-/Funktions-Smoke-Laufs**. Der historische GitHub-Actions-Run-Identifier und der konkrete R2-Objekt-Key des damaligen Restore-Laufs stehen in der aktuell zugänglichen Evidence nicht belastbar zur Verfügung. Sie werden nicht nachträglich erfunden.

Die vorhandenen persistenten Daten beweisen den erreichten Datenbankzustand, aber nicht allein, dass der kanonische Workflow tatsächlich alle vorgesehenen Schritte in der geforderten Reihenfolge ausgeführt hat. Insbesondere dürfen Health-Request, Better-Auth-Anmeldung, Passwortwechsel, Permission-Deny und die Reihenfolge nach erfolgreicher Fingerprint-Prüfung nicht ausschließlich aus der später sichtbaren Datenbanksignatur als ausgeführt abgeleitet werden.

## Geprüfter Recovery-Umfang

Geprüfte Umgebung:

- Quelle: `appbasis-m3-preview`
- isoliertes Restore-Ziel: `appbasis-m4-r2-restore`
- Datenbank: `appbasis_m3_preview`
- PostgreSQL: Version 18
- Restore-Ziel bereitgestellt: `2026-08-17T08:06:22Z`
- keine Produktionsdatenbank und keine Produktionsfreigabe

Das Restore-Ziel enthält den vollständigen erwarteten `m3-preview`-Schemaumfang mit Identity/Auth, Permissions und Tasks.

## Backup- und Recovery-Verträge

Der kanonische Free-First-Pfad verwendet den bestehenden `M4 Free External Backup`-Workflow:

- tägliche geplante Ausführung um `02:17 UTC`, wenn das geschützte M4-Profil aktiviert ist,
- PostgreSQL-18-Custom-Dump und Fingerprint aus demselben konsistenten Datenbanksnapshot,
- client-seitige AES-256-GCM-Verschlüsselung vor dem Provider-Upload,
- immutable R2-Objekte,
- Retention der letzten 7 Daily-Slots plus 4 jüngsten Weekly-Slots,
- getrennte immutable Pre-Migration-Backups,
- read-only Reconciliation statt blindem Wiederholen bei unklarem Write-Ausgang.

Der externe Backup-Pfad und der Pre-Migration-Pfad wurden bereits real verwendet. Dieser Repository-Record führt keinen zusätzlichen Provider-Write und keinen weiteren Restore aus.

## Unabhängig bestätigte Datenintegrität

Am 18.08.2026 wurde Quelle gegen Restore ausschließlich read-only verglichen.

Der Restore-Datenbestand enthält eindeutig als M4-Testdaten erkennbare Datensätze (`m4r.*` sowie `M4 restored smoke ...`). Für die Baseline-Prüfung wurden ausschließlich diese eindeutig nachträglich erzeugten M4-Testdatensätze aus dem Restore herausgerechnet.

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

Damit ist die restaurierte Baseline für den vollständigen kanonischen M4-Fingerprint-Scope datenidentisch zur geprüften Quelle.

## Beobachtete Testdatensignatur

Die live gelesene Restore-Datenbank enthält folgende persistente Signatur:

- 2 M4-Testidentitäten,
- davon 1 Identität mit genau 1 persistierter Rollenbindung,
- 1 Identität ohne Rollenbindung,
- 1 M4-Testtask,
- dieser Task steht auf `completed`.

Die Testidentitäten wurden zwischen `2026-08-17T12:02:14.899Z` und `2026-08-17T12:02:16.179Z` erzeugt. Der Task wurde um `2026-08-17T12:02:30.140Z` erzeugt und zuletzt um `2026-08-17T12:02:32.389Z` aktualisiert.

Diese Signatur ist **konsistent mit** dem in PR #132 definierten Restore-Smoke-Vertrag. Sie ist jedoch allein kein unabhängiger Beweis dafür, dass der historische Workflow sämtliche vorgesehenen HTTP-/Auth-/Permission-Schritte und deren Reihenfolge tatsächlich ausgeführt hat.

## Dauer

Aus den persistenten Zeitstempeln ist für die beobachtete Testdatensignatur ein Intervall von **17,490 Sekunden** sichtbar (`12:02:14.899Z` bis `12:02:32.389Z`).

Als rein beobachtbares äußeres Zeitfenster zwischen Bereitstellung des Restore-Projekts und letztem Testdaten-Update gilt:

- Start: `2026-08-17T08:06:22Z`
- letztes beobachtetes Update: `2026-08-17T12:02:32.389Z`
- Intervall: **3 h 56 min 10,389 s**

Dieses Intervall ist **keine verifizierte Workflow-Laufzeit** und keine gemessene `pg_restore`-Dauer.

## M4-Gate – bestätigte und offene Evidence

Belastbar bestätigt sind:

- Backup-/Retention-/Pre-Migration-Verträge vorhanden,
- getrenntes Restore-Ziel vorhanden,
- erwartetes Schema vorhanden,
- 16/16 Tabellen bzw. 32/32 Count-/Digest-Fingerprintwerte baseline-identisch,
- persistente Testdatensignatur auf dem Restore-Ziel vorhanden,
- Quelle, Ziel und beobachtete Zeitpunkte dokumentiert.

Für **M4 DONE** fehlt weiterhin ein unabhängig verifizierbarer Nachweis, dass der kanonische Restore-/Smoke-Lauf tatsächlich die erforderlichen fachlichen Schritte in der vorgesehenen Reihenfolge ausgeführt hat. Deshalb werden insbesondere folgende Punkte aus diesem historischen Datenbankzustand **nicht** als abgeschlossen behauptet:

- Health-Smoke ausgeführt und erfolgreich,
- Better-Auth-Anmeldung ausgeführt und erfolgreich,
- verpflichtender Passwortwechsel ausgeführt und erfolgreich,
- Permission-Negativfall tatsächlich als `403 PERMISSION_DENIED` geprüft,
- erlaubter Tasks-Pfad über die vorgesehene Runtime ausgeführt,
- Smoke erst nach erfolgreicher Restore-Fingerprint-Prüfung ausgeführt.

## Sicherer Weg zum Abschluss

M4 kann geschlossen werden, sobald mindestens eine der folgenden belastbaren Provenienzvarianten vorliegt:

1. die historische Workflow-/Provider-Evidence wird autoritativ wiedergefunden und belegt den konkreten Restore-/Smoke-Lauf einschließlich Reihenfolge und Ergebnis, **oder**
2. ein neuer kontrollierter Restore-/Verification-Lauf erzeugt diese Evidence erneut und nachvollziehbar.

Variante 2 wäre eine externe Restore-/Provideraktion und darf nur nach ausdrücklicher Nutzerfreigabe ausgeführt werden.

## Grenzen

- Dieser Record ist keine Produktionsfreigabe.
- Er erzeugt keine neue Produktionsressource und verändert keine Produktivdatenbank.
- M4 bleibt OPEN und kann M6 daher nicht freischalten.
- Eine spätere eigenständige Produktiv-App benötigt ohnehin ihren eigenen Backup-/Restore-Nachweis auf ihren eigenen Ressourcen.
- Object Storage wird Bestandteil des jeweiligen Recovery-Gates, sobald eine App tatsächlich Dateien speichert.
- M5- und M6-Gates bleiben unabhängig.
