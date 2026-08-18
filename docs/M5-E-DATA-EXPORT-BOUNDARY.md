# M5-E – ULC Datenexport Technical Boundary

Stand: 2026-08-18

## Zweck

Dieser Slice bindet den bestehenden M5-E-Exportvertrag für `ulc-linz` an den finalen realen C/D-Persistenzstand. JSON bleibt das kanonische vollständige Format, CSV die ergänzende tabellarische Darstellung. Der Slice führt keine produktive Datenabfrage, kein Deployment und keine Produktionsfreigabe aus.

## Kanonischer Runtime-Einstieg

Runtime-Consumer verwenden ausschließlich `exportUlcLinzDataWithCanonicalAuthorization()` aus `apps/ulc-linz/worker/data-export-service.ts`.

Vor einem Dataset-Read werden serverseitig geprüft:

- Application Access der aktuellen Identity,
- aktive Membership im exakt angefragten Verein,
- kanonische aktive Runtime-Role im bestehenden `PermissionStore`,
- `self`: explizite Self-Relation,
- `managed`: ausschließlich Parent plus explizite Managed-Relation,
- `organization`: ausschließlich kanonischer ULC-Admin im eigenen Verein.

Fehlende, inkonsistente oder fremde Zustände blockieren fail-closed.

## Reale Persistenzbindung

Membership und Subject-Scope sind nicht mehr abstrakt/ungebunden. Der Export konsumiert den in M5-C/D eingeführten app-eigenen `PostgresUlcLinzScopePersistence` für die bestehenden Resolver-Verträge.

Der konkrete aktuelle Dataset-Reader `PostgresUlcLinzExportDatasetReader` liest die Zuordnung Organisation/Subject → Identity ausschließlich aus `ulc_linz_membership`. Die eigentlichen Identity-Masterdaten liest er ausschließlich über den öffentlichen Owner-Vertrag `IdentityStateStore.find()`; M5-E greift nicht direkt per SQL auf Identity-eigene Tabellen zu.

Die **handelnde** Identity muss durch die kanonische Autorisierung weiterhin eine aktive Same-Organization-Membership und die passende aktive Runtime-Role besitzen. Für `self` muss genau die eigene Subject-Zuordnung auflösbar sein. Für `managed` muss der aktive Parent eine explizite `managed`-Relation zum Ziel besitzen; die Ziel-Membership darf bereits beendet sein, solange ihre Member-/Kontaktdaten gemäß M5-D noch tatsächlich gespeichert werden. Beim Organisations-Export werden entsprechend alle noch gespeicherten Membership-Zuordnungen des autorisierten Vereins berücksichtigt – aktive und innerhalb des Retention-Lifecycles noch vorhandene beendete Memberships. Der Export erfindet keine eigene Retention-Frist: sobald der M5-D-Owner die zugehörige Persistenz regelkonform entfernt hat, ist sie auch nicht mehr exportierbar.

Fehlt zu einer noch gespeicherten Membership der passende Identity-/Person-State oder stimmt `personId` nicht exakt mit dem ULC-Subject überein, bricht der gesamte Dataset-Read ab. Ein Teilbestand wird nie als vollständiger Export zurückgegeben.

## Aktuelle Datenklassifikation

Die aktuelle App besitzt weiterhin keine Fachmodule und keinen Object Storage. Das aktuelle M5-C/D-Inventar umfasst 19 persistente Tabellen aus drei Ownern: Identity, Permissions und `ulc-linz-lifecycle`.

Normal exportierbar ist weiterhin ausschließlich `member-contact` aus `appbasis_person` und `user` mit:

- `username`
- `displayName`
- `contactEmail`
- `createdAt`
- `updatedAt`

Alle Credential-, Session-, Verification-, Security-, Authorization-, Lifecycle-, Reconciliation- und Audit-Tabellen sind explizit vom normalen Export ausgeschlossen. Insbesondere werden `ulc_linz_membership`, `ulc_linz_subject_scope`, `ulc_linz_lifecycle_deletion` und `ulc_linz_lifecycle_audit` nicht als normale Nutzdaten exportiert.

Jede aktuell inventarisierte Tabelle muss exakt einmal als exportiert oder ausgeschlossen klassifiziert sein. Neue Owner, Tabellen, Module oder Object Storage invalidieren die aktuelle E-Acceptance fail-closed.

## Ausgabe- und Sanitization-Grenze

- unbekannte, fehlende oder doppelte Datasets blockieren,
- Dataset-Records werden erneut gegen autorisierte Organisation und Zielperson geprüft,
- zusätzliche, accessor-basierte, symbolische, nichtskalare oder credential-shaped Felder werden abgewiesen,
- CSV neutralisiert Spreadsheet-Formula-Injection; JSON bleibt unverändert,
- Session-/Credential-Material gelangt nicht in den Export.

## Audit-Grenze

Ein erfolgreicher Export wird erst nach erfolgreichem Audit-Callback zurückgegeben. Der Callback erhält nur Actor, Organisation, Scope, optionale Zielperson, Zeitpunkt, Schema-Version, Dataset-IDs und Ergebnisstatus; der Exportinhalt selbst wird nicht kopiert.

M5-E erfindet keinen zweiten Audit-Sink. Der persistente Security-/Audit-Nachweis bleibt Eigentum von M5-F. Deshalb emittiert der neue E-Evidence-Owner `dataExport=true` nur dann, wenn zusätzlich exakt `auditSecurityLogging=true` aus dem unabhängigen F-Evidence-Owner vorliegt. Ohne diesen Nachweis bleibt E für die globale Factory korrekt `open`, obwohl der Export-Consumer selbst technisch vollständig ist.

## Ausführbare Acceptance

Der PostgreSQL-E2E verwendet die reale sieben Migrationen umfassende ULC-Datenbankkomposition und beweist auf echten Owner-Verträgen:

- Self-Export über reale Membership + Self-Scope + Permission-Role,
- Managed-Export über reale aktive Parent-Membership + Managed-Scope auch für noch gespeicherte Daten einer bereits beendeten Ziel-Membership,
- Organisations-Export ausschließlich als aktiver Admin im eigenen Verein und einschließlich noch gespeicherter beendeter Member-/Kontaktdaten,
- Cross-Organization-Denial vor dem Dataset-Read,
- Identity-/Membership-Inkonsistenz erzeugt keinen Teil-Export und kein Erfolgs-Audit.

Die bereits vorhandenen Unit-/Security-Tests bleiben zusätzlich für Dataset-Vollständigkeit, Role-/Scope-Drift, Passwortwechselpflicht, Feld-Sanitization, CSV-Formula-Injection und Audit-Failure bestehen.

## Factory-/M5-J-Grenze

`tooling/factory-ui/ulc-linz-data-export-evidence.mjs` ist der E-spezifische Evidence-Owner. Er wird in diesem Slice bewusst noch nicht in `model.mjs` komponiert. M5-J bleibt Eigentümer der finalen All-required-Komposition und darf E nur mit dem unabhängigen M5-F-Auditnachweis aktivieren.
