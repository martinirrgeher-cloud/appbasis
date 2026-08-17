# M5-C – Current-owner identity deletion boundary

Stand: 2026-08-17

## Ziel

Dieser Slice liefert den realen destruktiven Löschpfad für die persistenten ULC-Owner, die im aktuellen App-Stand tatsächlich existieren: `identity` und `permissions`.

Er führt **keine** generische Privacy-/Lifecycle-Plattform ein und setzt das globale M5-C-Gate noch nicht auf `verified`, solange Membership-/Subject-Scope-Persistenz nicht real gebunden ist.

## Technisch umgesetzt

### 1. Pre-delete Quarantäne

`apps/ulc-linz/worker/lifecycle.ts` autorisiert den Lifecycle-Schreibzugriff zuerst gegen den app-spezifischen Membership-Scope.

Für bekannte Nicht-Admin-Rollen werden anschließend über die bestehenden Owner-Verträge:

- direkte Rollen entfernt,
- Grants/Revokes entfernt,
- die Identity deaktiviert und aktive Sessions dadurch unbrauchbar gemacht.

Admin-Ziele, unbekannte Rollen, widersprüchlicher Permission-State oder fremde Capability-Namespaces blockieren fail-closed.

### 2. Permission-Principal

`PostgresPrincipalLifecycleAdministration` liegt in `@appbasis/permissions` und löscht nur einen bereits vollständig quarantänisierten Principal.

Vor dem destruktiven Identity-Schritt wird ein Audit-Ereignis `principal.identity.delete.requested` geschrieben. Die eigentliche Principal-Löschung und ihr Audit-Ereignis `principal.delete` liegen in derselben Permission-Transaktion.

Das Audit enthält Actor, Reason, Target und Ereignistyp, aber keinen gelöschten personenbezogenen Payload. Die bestehende separate 12-Monats-Retention des Permission-Administration-Audits bleibt unverändert.

### 3. Identity-Owner

`PostgresIdentityDeletion` liegt innerhalb von `@appbasis/identity` und ist der einzige neue destruktive Zugriff auf die aktuelle Better-Auth-/AppBasis-Identity-Persistenz.

Vor Löschung muss nachweisbar gelten:

- Better-Auth-User ist deaktiviert (`banned = true`),
- `appbasis_identity_security_state.disabled_at` ist gesetzt,
- Ziel ist kein technischer Better-Auth-Admin,
- AppBasis-Security-State ist konsistent,
- es existiert kein unerwarteter `verification`-Persistenzzustand.

Die aktuelle Identity-Owner-Transaktion entfernt:

- `appbasis_identity_security_state`,
- verknüpften `appbasis_person`,
- historische `appbasis_identity_operation`-Einträge des Ziel-Users,
- Better-Auth-`user`,
- dadurch per bestehender FK-Kaskade `account` und `session`.

Ein minimaler abgeschlossener `delete:<identityId>`-Operation-Tombstone bleibt für idempotente Wiederholung nach mehrdeutigen Client-/Connection-Ergebnissen erhalten. Er enthält weder Name, Kontaktadresse noch gelöschten Fachinhalt.

Falls eine zukünftige Referenz auf `appbasis_person` oder ein unerwarteter Owner die Löschung verhindert, rollt die PostgreSQL-Transaktion zurück statt Orphans oder einen scheinbaren Erfolg zu erzeugen.

## Ausführbare Evidenz

Die PostgreSQL-E2E-Tests beweisen:

1. Der konfigurierte Better-Auth-Admin-Pfad kann einen ungebundenen User löschen.
2. Der bestehende `ON DELETE RESTRICT`-FK schützt gebundenen AppBasis-State vor einem unkoordinierten Better-Auth-Hard-Delete.
3. Der neue Identity-Owner löscht nach Deaktivierung User, Security-State, Person, Account und Session gemeinsam.
4. Aktive/nicht vollständig deaktivierte Identities werden nicht gelöscht.
5. Unerwartete `verification`-Persistenz blockiert fail-closed.
6. Der ULC-End-to-End-Pfad entfernt zuerst Access, auditiert den destruktiven Intent, entfernt den Permission-Principal und löscht anschließend die Identity.
7. Das Permission-Audit bleibt nach Subject-Löschung erhalten.
8. Ein Replay nach abgeschlossenem Delete führt nicht zu doppelten destruktiven Writes oder doppelten Audit-Ereignissen.

## Bewusst weiterhin offen

M5-C bleibt global `open`, solange mindestens einer der folgenden Punkte real offen ist:

- die tatsächliche Persistenz hinter `UlcLinzMembershipResolver` ist nicht gebunden/inventarisiert,
- die tatsächliche Persistenz hinter `UlcLinzSubjectScopeResolver` ist nicht gebunden/inventarisiert,
- ein später installiertes ULC-Fachmodul führt personenbezogene Tabellen ohne expliziten Löschvertrag ein,
- Object Storage/Medien werden später real verwendet und besitzen noch keinen Owner-/Löschvertrag,
- ein zukünftiger Better-Auth-Flow führt `verification`-Persistenz ein, ohne dessen exakte Subject-Zuordnung und Cleanup-Semantik zu definieren.

Deshalb wird weder `deletionPolicy` noch `retentionPolicy` in diesem Slice auf `verified` gesetzt. Das ist beabsichtigtes fail-closed Verhalten und kein fehlender aktueller Identity-/Permission-Löschpfad.

## Sicherheitsgrenze

- kein direkter ULC-SQL-Zugriff auf Identity- oder Better-Auth-Tabellen
- kein öffentlicher Lifecycle-Endpunkt
- keine neue Migration
- keine produktive Datenänderung
- keine Provideraktion
- keine Secret-Änderung
- keine generische Lifecycle-/Privacy-Engine
