# M5-E – ULC Datenexport Technical Boundary

Stand: 2026-08-18

## Zweck

Dieses Dokument beschreibt den implementierten technischen M5-E-Stand für die erste reale Ziel-App `ulc-linz`. Es ergänzt den vorbereitenden `M5-E-EXPORT-PLAN` und ersetzt weder dessen Policy noch die M5-Acceptance-Matrix.

M5-E folgt weiterhin deny-by-default und fail-closed. Dieser Stand autorisiert keine produktive Datenabfrage, kein Deployment und keine Produktionsfreigabe.

## Kanonischer Runtime-Einstieg

Runtime-Consumer müssen über

`exportUlcLinzDataWithCanonicalAuthorization()`

in `apps/ulc-linz/worker/data-export-service.ts` einsteigen.

Der darunterliegende Exportkoordinator in `data-export.ts` besitzt absichtlich nur die Aufgaben Export-Shaping, Dataset-Vollständigkeit, Record-Ownership-Prüfung, Feld-Sanitization, JSON-/CSV-Serialisierung und verpflichtenden Audit-Callback. Er ist kein eigenständiger Autorisierungsersatz.

Der kanonische Service prüft vor jedem Dataset-Read über die bereits bestehenden M5-B-Verträge:

- Application Access der aktuellen Identity
- aktive Membership für exakt die angefragte Organisation
- kanonische ULC-Source-Role
- exakt passende Runtime-Role im bestehenden `PermissionStore`
- `self`: explizite Self-Relation zur Zielperson
- `managed`: ausschließlich Parent plus explizite Managed-Relation
- `organization`: ausschließlich kanonischer ULC-Admin im eigenen Verein

Fehlende, inkonsistente oder unbekannte Zustände blockieren den Export.

## Aktuell reale Exportdaten

Die aktuelle ULC-App deklariert noch keine Fachmodule (`modules: []`). Das reale Dateninventar enthält daher derzeit nur die bestehenden Plattform-Owner `identity` und `permissions`.

Als normal exportierbares fachliches Dataset ist aktuell ausschließlich `member-contact` klassifiziert. Es verwendet die bereits semantisch exponierten Identity-Masterdaten:

- `username`
- `displayName`
- `contactEmail`
- `createdAt`
- `updatedAt`

Credential-, Session-, Verification-, Security-State-, Identity-Operation-, Authorization- und Audit-Daten sind explizit vom normalen Export ausgeschlossen.

Jede heute inventarisierte persistente Tabelle muss exakt einer Export- oder Ausschlussentscheidung zugeordnet sein. Neue persistente Tabellen oder neue Privacy-Klassen führen ohne ausdrückliche M5-E-Entscheidung zu einem Testfehler und dürfen nicht stillschweigend fehlen.

## Ausgabe

- JSON ist das kanonische vollständige Format.
- CSV ist ausschließlich ergänzende tabellarische Darstellung derselben bereits validierten Rows.
- CSV neutralisiert Spreadsheet-Formula-Injection; das kanonische JSON wird dadurch nicht verändert.
- Dataset-Records tragen vor der Sanitization explizit `organizationId` und `subjectId`; diese Ownership-Metadaten werden gegen den autorisierten Scope geprüft und nicht als frei vertrauenswürdiger Clientfilter behandelt.
- unbekannte, fehlende oder doppelte Datasets blockieren fail-closed.
- zusätzliche, accessor-basierte, symbolische, nichtskalare oder credential-shaped Felder werden abgewiesen.

## Audit-Grenze

Ein erfolgreicher Export wird erst zurückgegeben, nachdem der verpflichtende Audit-Port erfolgreich geschrieben wurde. Der Audit-Input enthält ausschließlich Actor/Principal, Organisation, Scope, optionale Zielperson, Zeitpunkt, Schema-Version, Dataset-IDs und Ergebnisstatus; der Exportinhalt selbst wird nicht in das Audit kopiert.

Der konkrete persistente Audit-/Security-Adapter wird nicht parallel in M5-E erfunden. M5-F besitzt die Verantwortung für den kanonischen ULC Audit-/Security-Logging-Vertrag. Bis diese Integration auf einem gemeinsamen finalen Integrationshead erfolgt, bleibt die globale Factory-Evidenz `dataExport` offen.

## Bewusst nicht erfundene Persistenz

`UlcLinzMembershipResolver` und `UlcLinzSubjectScopeResolver` sind reale, bereits bestehende Runtime-Verträge, aber ihre fachliche Persistenz ist im aktuellen ULC-App-Manifest nicht gebunden. Ebenso existieren noch keine ULC-Fachmodule und kein Object Storage.

M5-E fügt dafür bewusst keine Sondertabellen und keinen parallelen Datenbank-Owner hinzu:

- `appbasis.app.json` deklariert aktuell nur `identity` und `permissions` als Platform Services und keine Module.
- `appbasis.database.json` wird aus diesem Generatorvertrag deterministisch abgeleitet.
- Eine manuell hinzugefügte ULC-Sonderpersistenz würde den maßgeblichen `createAppSkeleton()`-/Generatorpfad umgehen und wäre eine stille Architekturänderung.

Sobald reale Fachmodule, Membership-/Subject-Persistenz oder Object Storage tatsächlich Bestandteil der App werden, müssen sie über ihren kanonischen Owner-/Generatorvertrag entstehen und M5-E erweitert werden. Bis dahin darf ihr Fehlen nicht durch erfundene Testdaten oder Sondertabellen kaschiert werden.

## Acceptance-Abdeckung des aktuellen technischen Slices

Tests belegen mindestens:

- Self-Export mit aktiver Membership, passender Runtime-Role und expliziter Self-Relation
- Managed-Export ausschließlich für Parent mit expliziter Managed-Relation
- separater Organisations-Export ausschließlich für Admin
- Cross-Organization-/inaktive Membership wird vor Dataset-Read abgewiesen
- Rollen-/Principal-Drift wird abgewiesen
- fehlende Self-/Managed-Relation wird abgewiesen
- unbekannte Rolle und fehlender Principal bleiben fail-closed
- Passwortwechselpflicht blockiert vor Membership-/Dataset-Read
- falscher Dataset-Owner bzw. falsches Subject wird abgewiesen
- unbekannte, fehlende oder doppelte Datasets werden abgewiesen
- Credential-/Zusatzfeld- und Accessor-Daten werden nicht exportiert
- CSV-Formula-Injection wird neutralisiert
- Audit-Fehler verhindert die Rückgabe des Exportergebnisses
- Dateninventar-/Tabellen-Drift erzwingt eine neue Exportklassifizierung

## Production-/Factory-Grenze

Der technische M5-E-Consumer kann für den heute real vorhandenen App-Vertrag vollständig geprüft werden. Die globale Factory-Evidenz `dataExport=true` darf dennoch erst auf einem späteren gemeinsamen Integrationshead gesetzt werden, wenn:

1. der dann tatsächlich vorhandene ULC-Datenbestand vollständig klassifiziert ist,
2. alle real vorhandenen Membership-/Subject-/Fach-Owner gebunden sind,
3. der kanonische persistente Audit-/Security-Vertrag integriert ist,
4. die End-to-End-Acceptance auf genau diesem realen Consumer grün ist.

Damit bleibt M5 fail-closed, ohne M5-E mit spekulativer Plattformarchitektur aufzublähen.
