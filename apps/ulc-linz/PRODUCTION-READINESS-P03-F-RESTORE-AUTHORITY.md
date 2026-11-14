# P03-F – Restore- und Löschautorität: Fail-closed-Nachweise

**Stand:** 14.11.2026 · **Status:** TEST-/DESIGN-DRAFT, **KEINE** Live-Erasure- oder Restore-Freigabe.  
Basis: `main=da9e61548c33d37a9f234cc5aaf566f9048384cc`, [P03](./PRODUCTION-READINESS-P03.md), [P03-B](./PRODUCTION-READINESS-P03-B-WRITER-AUDIT.md), [P01-Datenschutz (offen)](./PRODUCTION-PRIVACY-DECISIONS-P01-DRAFT.md), [Sprint #607](https://github.com/martinirrgeher-cloud/appbasis/issues/607).

## 1. Was der vorhandene Code heute wirklich garantieren kann

`worker/athlete-subject-deletion-recovery.ts` ist **nur eine read-only Diagnose**. Die Source-Entscheidung stammt vom Owner `athletes`; deren Original-Löschmarker ist laut `privacy/athlete-deletion-recovery-policy.json` 35 Tage gültig, danach `postExpiryRetry=deny`.

| Diagnosestatus | Bedeutung | Sicherheitsfolge |
| --- | --- | --- |
| `source-unverifiable` | Autoritativer Originalmarker nicht verfügbar oder ungültig | kein Owner-Erase, kein blindes Cross-Owner-Delete oder Restore-Release |
| `source-expired` | Originalmarker um mehr als 35 Tage überschritten | auch zuvor übereinstimmende Owner-Marker sind keine nachträgliche Vollmacht |
| `owner-conflict` | Plan-/Usage-Quellen widersprechen der ursprünglichen Löschentscheidung | nicht autorisiert weiterarbeiten; Datenowner/Operator prüfen |
| `pending` / `urgent-manual-review` | ein oder mehrere überprüfte Owner haben noch offene Einträge/Marker, im letzten 7-Tage-Fenster eskalieren | manuell prüfen, unter neuer kanonischer Autorisierung entscheiden; **kein** automatischer Write |
| `owner-markers-consistent` | die aktuell überprüften **zwei** Owner (Pläne, Usage) passen zur Quellentscheidung | **nicht** gleichbedeutend mit global erledigt: App-Owner, Trainer, Doku, Favoriten, andere Daten und Backups sind nicht mitabgedeckt |

**Unbedingte Invariante:** `authorizesPostExpiryRetry=false` und `automaticActionAllowed=false` für **alle** Fälle. Ein positiver Diagnosezustand darf niemals still mit einer produktiven Erasure-Freigabe verwechselt werden.

## 2. Ergänzte Regression und nicht belegte Fälle

Neuer `test/p03-recovery-authority-fail-closed.test.ts` prüft sieben konkrete Fälle ohne PostgreSQL-/Provider-Write: gültige Owner-Marker liefern weiterhin keine automatische Autorität; exakt 35 Tage und +1 ms; letzte sieben Tage; widersprüchliche Owner; fehlende kanonische Quelle; inkonsistente und zukünftige Marker und ungültiger Org-Scope.

**Was das ausdrücklich nicht testet:** tatsächliche Wiederherstellung eines älteren Snapshots, Dauer sämtlicher Provider-/Exportbackups, Cross-Owner-Re-Deletion, parallelen Runtime-Writer mit neuerer Löschentscheidung und privilegierte Adminfreigabe. Diese sind die **noch offenen** S7-/S6-/P04-B-Pflichten.

## 3. Design für den späteren freizugebenden Restore-Prozess

**R0 – Produktionszugang sperren.** Restore niemals direkt in eine schreibbare oder öffentlich erreichbare Hauptdatenbank. Keine externen Worker/Writer oder Scheduler auf der Quarantäneinstanz.

**R1 – Quelle und Vollständigkeit nachweisen.** Identität der wiederhergestellten Datenbank, Snapshot-Zeit, sämtliche weiteren Backups/Exporte sowie eine *unabhängige, neuere und nach P01 berechtigte* kanonische Löschentscheid-/Checkpointquelle prüfen. **Leere Markerlisten sind kein Beweis, dass nie jemand gelöscht wurde.**

**R2 – Alle acht Owner abarbeiten.** `identity`, `permissions`, `athletes`, `exercise-catalog`, `training-blocks`, `training-documentation`, `training-plans`, `ulc-linz-lifecycle`. Über Eigentümer hinweg dürfen Teilerfolge nicht als global abgeschlossen quittiert werden; jede Stufe idempotent, isolierbar und wiederholbar.

**R3 – Risikoquellen separat prüfen.** Registrierungs- und Trainingshistorie, Trainerpräsenz, Actor-/Traineridentitäten, fremde Dokumentationsrevisionen, personenbezogene Notizen/JSON/Freitext, Legacy-Usage und externe Mediendateien. SQL-Zähler von drei Athletentabellen belegen keine vollständige Löschung.

**R4 – Race/Fail-Closed.** Wiederanlauf nach Fehler oder abgelaufener Quelle nur unter explizit erneuerter Betreiberentscheidung; kein neuer personenbezogener Dauer-Löschledger ohne P01. Geschützte normale Writer erst nach erwiesener Löschsperre und kontrollierter Wiederfreigabe.

**R5 – Release.** Dokumentierte Betreiberprüfung des replizierten finalen Datenbestands, CI/E2E passend zur exakt autorisierten SHA und gesonderte Schritte des M6-Produktionsworkflows. Jede Freigabe gilt nur für ihren eigenen Schritt.

## 4. Noch ausstehender externer Input (ein zusammenhängender Betreiberentscheid)

- **D2:** Ist die tatsächliche maximale Wiederherstellbarkeit inkl. Neon-History, Snapshots, Exporten, künftig geplanten verschlüsselten **Google-Drive-Backups**, deren Papierkorb/Versionen und Fremdbackups **sicher kürzer als 35 Tage** und können alle Owner davor abgeschlossen werden (Option A)? Andernfalls braucht es eine **gesondert genehmigte** minimaldatenhaltige, atomare Entscheidungs-/Expiry-Autorität (Option B). Aus den Neon-Projektmetadaten `history_retention_seconds=21600` allein folgt nichts über alle externen Kopien. Ein 14-Tage-Rollfenster bei Drive ist nur ein technischer Vorschlag und bei 30 Tagen Trash keineswegs ein 14-Tage-Restorehorizont; siehe [P04-B-Plan](./PRODUCTION-READINESS-P04-B-GOOGLE-DRIVE-BACKUP.md).
- **D1/D3/D4:** historische personenbezogene Notizen und Trainer-/Actorbezüge, Medien-Providerlöschung, vollständige Restore-/Re-Deletion-Checkpoints und konkrete Retention rechtlich/fachlich entscheiden.
- Dokumentierte App-/Cloudflare↔Neon-Produktionsbindung und AVV/Providerbelege vor dem echten Pilot.

**Kein Eingriff:** Kein HTTP-Handler, keine Migration, keine neue Löschmarkertabelle, kein automatischer Retry, keine echte SQL-/Provider-Mutation und keine Workflow-Aktivierung. `privacy=blocked` bleibt bestehen.
