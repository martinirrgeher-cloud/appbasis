# M5-CD3 – ULC Plattform-Lifecycle Preflight

Stand: 2026-08-17

## Zweck

Dieser Preflight hält den technisch verifizierten Stand nach M5-CD1/CD2 fest und grenzt den nächsten schreibenden Lösch-/Retention-Slice ein. Er ist reine Vorbereitung: keine Runtime-, Schema-, Provider- oder Produktionsänderung und kein M5-Kriterium wird dadurch `verified`.

## Verifizierter Ausgangspunkt

Der isolierte ULC-CD1/CD2-Slice in PR #142 inventarisiert auf Head `39c37312fbb94cb7f5a0f5dd331b15eb9b3eef44` die aktuell persistierten Owner `identity` und `permissions` einschließlich Schema-Versionen, Migrationslisten und aller durch diese Migrationen erzeugten PostgreSQL-Tabellen. Exact-Head-CI #1008 ist PASS. `deletionPolicy` und `retentionPolicy` bleiben ausdrücklich `open`.

Aktuell existieren weiterhin keine ULC-Fachmodultabellen, kein ULC-Object-Storage-Vertrag und keine persistente Membership-/Subject-Scope-Implementierung.

## Bereits vorhandene sichere Primitives

### Identity

`IdentityService.disableIdentity()` beendet den AppBasis-Zugriff und Better Auth wird technisch gebannt. Das ist eine geeignete fail-closed Vorstufe eines späteren Löschvorgangs, aber ausdrücklich **keine Löschung oder Anonymisierung**.

Better Auth 1.6.27 und der bereits aktivierte Admin-Plugin-Pfad besitzen upstream einen Hard-Delete für Benutzer. AppBasis exponiert diesen Pfad derzeit bewusst nicht als eigenen Identity-Vertrag. ULC darf Better Auth nicht direkt importieren oder den AppBasis-Identity-Layer umgehen.

### Permissions

Der bestehende `PostgresPrincipalAccessAdministration`-Pfad kann Rollen sowie direkte Grants/Revokes transaktional ersetzen und dabei die vorhandenen Last-Admin-/Required-Role-Sicherheitsgrenzen wiederverwenden. Damit kann ein späterer Löschvorgang bestehenden Zugriff vor der eigentlichen Datenlöschung fail-closed entziehen.

Die Tabelle `appbasis_permission_administration_audit` besitzt einen eigenen bestätigten 12-Monats-Retention-Vertrag und darf nicht still mit einem Principal entfernt werden.

## Warum noch kein Gesamt-Hard-Delete verdrahtet wird

Ein einzelner Better-Auth-Delete beweist M5-C noch nicht, weil AppBasis zusätzliche persistente Daten besitzt:

- `appbasis_identity_security_state` referenziert Better-Auth-`user` aktuell mit `ON DELETE RESTRICT`.
- `appbasis_person` besitzt den eigentlichen Kontakt-/Personenbezug und hat einen separaten Lifecycle.
- `appbasis_identity_operation` kann weiterhin Identity-/Operation-Bezüge enthalten.
- Permissions-Principal, Rollen/Overrides und Permission-Audit besitzen eigene Retention-/Löschsemantik.
- Membership-/Subject-Scope-Backing-Stores sind noch nicht persistent gebunden und dürfen nicht angenommen werden.

Direkte SQL-Löschung dieser fremden Ownership-Bereiche aus `apps/ulc-linz` wäre eine Verletzung der bestehenden Package-/Security-Grenzen. Ein vollständiger Write-Pfad muss deshalb über die jeweiligen Owner-Verträge laufen.

## Bereits eindeutig gebundene Retention

| Reale Klasse | Zielwert | Technische Evidenz |
|---|---|---|
| Mitglieds-/Kontaktstammdaten (`appbasis_person`, aktueller User-Stammdatenanteil) | 12 Monate nach Austritt/Zweckende | Policy gebunden, Write-/Lifecycle-Evidenz offen |
| Permission-Administration-Audit | 12 Monate | Policy gebunden, Ablauf-/Cleanup-Evidenz offen |
| Backup-Rotation | maximal 35 Tage | getrennt unter M4/M5-CD6 nachzuweisen |

## Noch explizit offene Lifecycle-/Retention-Entscheidungen

Die folgenden real existierenden Plattformdaten werden nicht still einer bestehenden Betreiberklasse zugeschlagen:

1. **Authentication credential data (`account`)**
   - Empfehlung: bei finaler Identity-Löschung entfernen; kein Credential-Tombstone.
   - Betreiber-/Lifecycle-Bindung: noch offen.
2. **Authentication sessions (`session`)**
   - Empfehlung: bei Löschbeginn sofort vollständig revoken/entfernen; normale Post-Expiry-Cleanup-Frist separat festlegen.
   - konkrete Post-Expiry-Frist: noch offen.
3. **Authentication verification data (`verification`)**
   - besitzt `expires_at`, aber ein belastbarer Post-Expiry-Cleanup-Vertrag ist noch nicht AppBasis-seitig festgelegt.
   - konkrete Cleanup-Frist: noch offen.
4. **Identity security state**
   - ist aktueller Zustand, kein Auditlog; darf nicht automatisch unter den 12-Monats-Auditvertrag fallen.
   - Endzustand nach finaler Löschung: noch offen.
5. **Identity operation state**
   - enthält idempotente technische Operationshistorie und kann Identity-/Username-Bezüge tragen.
   - Retention bzw. Pseudonymisierung: noch offen.
6. **Authorization state (`principal`, Rollen-/Grant-/Revoke-Zuordnungen)**
   - Empfehlung: aktiven Zugriff vor Löschung vollständig entfernen.
   - ob ein Principal-Tombstone für Audit-Zwecke bestehen bleibt oder die ID nach Auditierung gelöscht/pseudonymisiert wird: noch offen.
7. **Authorization configuration (Roles/Capabilities)**
   - nicht automatisch personenbezogen, kann aber frei eingegebene Metadaten enthalten.
   - eigener Config-Lifecycle statt pauschaler Personenlöschung erforderlich.

Solange eine dieser tatsächlich verwendeten personenbezogenen bzw. potenziell personenbezogenen Klassen keine belastbare Endzustands-/Retention-Semantik besitzt, bleibt M5-D fail-closed `open`.

## Empfohlene technische Reihenfolge für den nächsten Write-Slice

1. **Pre-delete access quarantine**
   - Identity deaktivieren.
   - Sessions revoken.
   - Rollen/Grants/Revokes über bestehende Permissions-Verträge auf den zulässigen Endzustand bringen.
   - Last-Admin-/Cross-Org-Sicherheitsregeln unverändert wiederverwenden.
2. **Owner-spezifischer Identity-Delete-Vertrag**
   - nur im `packages/identity`-Ownership-Layer.
   - Better-Auth-Hard-Delete über die vorhandene Backend-Kompositionsgrenze kapseln; kein direkter ULC-Better-Auth-Import.
   - `appbasis_person`, Security-State und Operation-State mit explizitem Endzustand behandeln.
3. **Permissions-Lifecycle-Vertrag**
   - Audit-Retention nicht durch Personenlöschung verkürzen.
   - falls Principal-Hard-Delete benötigt wird: eigener auditierter Contract; keine stille direkte SQL-Löschung aus der App.
4. **PostgreSQL-E2E**
   - Zugriff vor/nach Löschung.
   - Teilfehler/retry bleibt fail-closed.
   - kein Cross-Org.
   - letzter Admin bleibt geschützt.
   - Audit enthält Metadaten, aber keinen gelöschten sensiblen Payload.
5. **Restore-Evidence**
   - erst danach M4-Restore so erweitern, dass wirksame Lifecycle-Entscheidungen nicht dauerhaft reaktiviert werden.

## Nicht jetzt bauen

- keine generische Lifecycle-/Privacy-Engine,
- keine spekulative Job-/Outbox-Schicht nur für M5,
- keine ULC-direkten Deletes in Better-Auth-/Identity-/Permissions-Tabellen,
- keine Fachmodul-Löschlogik ohne reale Fachmodultabelle,
- keine Object-Storage-Cleanup-Abstraktion ohne realen Storage-Verbraucher,
- kein `verified`, solange technische End-to-End-Evidenz fehlt.

## Gate für den nächsten technischen Slice

Der nächste schreibende CD3-Slice darf starten, sobald für die von ihm berührten realen Datenklassen der Endzustand eindeutig ist. Er bleibt klein und owner-spezifisch. Eine Änderung an Identity-/Permissions-Schema oder gemeinsamer Security-Boundary ist ein eigener technischer Slice und wird nicht mit einem anderen Schema-/Security-Strang parallelisiert.
