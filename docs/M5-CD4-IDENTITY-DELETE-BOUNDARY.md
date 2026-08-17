# M5-CD4 – Identity delete owner boundary

Stand: 2026-08-17

## Ziel

Dieser Slice liefert ausführbare Evidenz für die nächste owner-spezifische Identity-Löschstufe, ohne bereits eine vollständige Lösch- oder Retention-Semantik zu behaupten.

## Technisch bewiesen

Der PostgreSQL-E2E-Test `packages/identity/test/hard-delete-boundary.postgres.e2e.test.ts` verwendet die reale `createBetterAuthRuntime()`-Komposition mit aktiviertem Admin-Plugin.

Er beweist:

1. Der konfigurierte Better-Auth-Admin-Pfad `POST /api/auth/admin/remove-user` kann einen noch nicht an AppBasis-Identity-State gebundenen User hart löschen.
2. Sobald `appbasis_identity_security_state` den User referenziert, blockiert der bestehende `ON DELETE RESTRICT`-FK den Better-Auth-Hard-Delete fail-closed; User und Security-State bleiben erhalten.

Damit ist der Provider-/Kompositionsbaustein technisch vorhanden, aber ein AppBasis-Identity-Delete darf noch nicht einfach auf Better Auth durchgereicht werden.

## Bewusst offen

Vor einem schreibenden `IdentityService`-Delete-Vertrag müssen die Endzustände der tatsächlich betroffenen Owner-Daten explizit gebunden werden:

- `appbasis_identity_security_state`
- verknüpfter `appbasis_person`
- `appbasis_identity_operation`
- Better-Auth-`account` und `session` (kaskadieren mit `user`)
- `verification`, soweit eine belastbare Zuordnung und Cleanup-Semantik existiert

Insbesondere wird in diesem Slice keine Retention-Frist erfunden und keine Operation-Historie still gelöscht oder pseudonymisiert.

## Sicherheitsgrenze

- kein ULC-Direktzugriff auf Identity-/Better-Auth-Tabellen
- kein neuer öffentlicher Lifecycle-Endpunkt
- keine Schema-/Migrationänderung
- keine produktive Datenänderung
- kein `deletionPolicy`/`retentionPolicy = verified`
- keine generische Lifecycle-/Privacy-Engine

Der nächste schreibende Owner-Slice darf erst die Endzustände implementieren, die explizit entschieden und über die Identity-Ownership-Grenze abbildbar sind.
