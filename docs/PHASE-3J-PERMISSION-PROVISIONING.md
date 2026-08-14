# Phase 3J – Permission Provisioning

## Ziel

Dieser Slice schafft den kleinsten getrennten Bootstrap-/Deployment-Pfad für persistente Permission-Daten, die eine generierte App vor dem normalen Runtime-Betrieb benötigt.

Provisioniert werden ausschließlich:

- bekannte Capability-IDs,
- initiale Rollen und deren Capability-Bundles,
- notwendige initiale Principal→Rolle-Zuweisungen.

## Vertrag

Der schreibende Vertrag liegt getrennt vom normalen Runtime-Export unter `@appbasis/permissions/provisioning`. Die normale App-Runtime verwendet weiterhin nur den read-only `PermissionStore` und `can`/`assert` über `@appbasis/permissions`.

Die dafür nötige transaktionale PostgreSQL-Anbindung liegt als schmaler Infrastrukturvertrag unter `@appbasis/database/postgres-provisioning`. Der Subpath exportiert nur die für Bootstrap-Transaktionen benötigten PostgreSQL-Typen und verwendet denselben PostgreSQL-Runtime-Adapter; `database` bleibt reine Infrastruktur und wird ausdrücklich nicht zum Manifest-Plattformdienst.

`PermissionProvisioningBundle` enthält keine Infrastruktur- oder Providerdaten. Insbesondere gehören PostgreSQL-Verbindungsadressen, Secrets, Provider-IDs und konkrete Principal-IDs weiterhin nicht in `appbasis.app.json`. Konkrete initiale Principal-IDs werden dem separaten Provisioning-Schritt aus seiner Deployment-/Bootstrap-Umgebung übergeben.

## Idempotenz und Konflikte

Ein erfolgreicher Provisioning-Lauf arbeitet in genau einer PostgreSQL-Transaktion und serialisiert konkurrierende Permission-Schreibvorgänge während dieses kurzen Bootstrap-Schritts.

- Bereits identisch vorhandene Capabilities, Rollen und angeforderte Principal→Rolle-Kanten werden nicht erneut angelegt.
- Ein identischer Wiederholungslauf ist dadurch ein No-op.
- Bereits vorhandene Rollen müssen exakt dasselbe Capability-Bundle besitzen. Ein abweichender bestehender Rolleninhalt ist ein Zustandskonflikt und führt zum vollständigen Rollback des Provisioning-Laufs.
- Initiale Principal→Rolle-Zuweisungen sind additiv: zusätzliche, später administrativ vergebene Rollen werden weder entfernt noch als Konflikt behandelt.
- Ungültige Bundle-Referenzen werden vor dem Beginn einer Datenbanktransaktion abgewiesen.

Damit überschreibt ein Deployment weder abweichende Rollen stillschweigend noch entfernt es spätere administrative Zuweisungen.

## PostgreSQL-Beweis

Der reale PostgreSQL-E2E verwendet pro Lauf eine zufällige disposable Datenbank und beweist:

1. erstmaliges Provisionieren von Capabilities, Rollen und Principal-Zuweisungen,
2. anschließende deny-by-default Entscheidungen über den echten `PostgresPermissionStore`,
3. einen vollständig idempotenten zweiten Lauf,
4. Erhalt zusätzlicher Principal-Rollen außerhalb des initialen Bootstraps,
5. vollständiges Rollback bei einem widersprüchlichen vorhandenen Rollenbundle.

Der Test läuft über den bereits verpflichtenden Permissions-PostgreSQL-E2E-Schritt der zentralen CI; kein eigener dauerhafter Workflow ist erforderlich.

## Ausdrückliche Nicht-Ziele

Dieser Slice baut bewusst nicht:

- keine HTTP-Admin-API für Rechteverwaltung,
- keine Benutzer-/Rechteverwaltungsoberfläche,
- kein Audit-/Recovery-Modell für spätere Rechteadministration,
- keine Änderung der Permission-Semantik,
- keinen neuen Manifest-Plattformdienst,
- keine Änderung der Reference-App oder der bereits generierten Runtime-Funktion,
- keine neuen Produktionsschemaänderungen außerhalb versionierter Migrationen.

Eine spätere Benutzer-/Rechteverwaltung mit Administration, Audit und Recovery bleibt ein eigener Architektur-Slice.

## Nächster Factory-Schritt

Nach diesem Slice kann die generierte PostgreSQL-Runtime den bereits vorhandenen `PostgresPermissionStore` aus derselben Deployment-Infrastruktur binden und der getrennte Provisioning-Schritt die für diese App erforderlichen Capabilities/Rollen/initialen Principal-Zuweisungen vorbereiten. Erst danach soll eine unabhängig deploybare generierte Worker-Komposition samt isoliertem Preview-Smoke bewiesen werden.
