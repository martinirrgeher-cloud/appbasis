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

### 2. Permission-Principal und Lösch-Audit

Der erste echte Delete verlangt einen **exakt vorhandenen Permission-Principal**. Damit kann der privilegierte Vorgang vor dem physischen Löschen immer über den bereits bestehenden, transaktionalen `replacePrincipalAccess()`-Auditvertrag protokolliert werden.

Für einen Delete wird `replacePrincipalAccess()` auch dann ausgeführt, wenn Rollen/Grants/Revokes bereits leer sind. Die vorhandenen Audit-Ereignisse

- `principal.roles.replace`
- `principal.permissions.replace`

tragen den serverseitigen Reason `ULC Linz identity deletion pre-delete access quarantine` und den authentifizierten Actor. Dadurch existiert vor jedem unterstützten physischen Delete ein persistentes, payload-minimiertes Audit des privilegierten Löschvorgangs.

Der vollständig quarantänisierte Permission-Principal bleibt bis zum erfolgreichen Identity-Delete als leerer, nicht autorisierender Owner-Zustand erhalten. Erst danach entfernt `PostgresPrincipalLifecycleAdministration` in `@appbasis/permissions` den Principal. Hat der Principal zu diesem Zeitpunkt wieder Rollen, Grants oder Revokes, wird fail-closed abgebrochen statt den Drift still zu löschen.

Diese Reihenfolge macht Teilfehler kontrolliert wiederholbar: Scheitert der Identity-Owner, bleibt der leere Principal als Auditanker für einen Retry bestehen. Scheitert nur der nachgelagerte Permission-Cleanup, kann der abgeschlossene Identity-Delete-Tombstone den Retry auf den sicheren Cleanup begrenzen.

Bewusst wird in M5-C **kein neuer Permission-Audit-Eventtyp und keine neue Permission-Migration** eingeführt. Der offene M5-F-Strang besitzt die Audit-/Security-Schema-Verantwortung; M5-C verwendet den bereits freigegebenen Auditvertrag statt dieselbe Manifest-/Security-Grenze parallel zu verändern.

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

Die PostgreSQL-E2E- und Lifecycle-Tests beweisen:

1. Der konfigurierte Better-Auth-Admin-Pfad kann einen ungebundenen User löschen.
2. Der bestehende `ON DELETE RESTRICT`-FK schützt gebundenen AppBasis-State vor einem unkoordinierten Better-Auth-Hard-Delete.
3. Der neue Identity-Owner löscht nach Deaktivierung User, Security-State, Person, Account und Session gemeinsam.
4. Aktive/nicht vollständig deaktivierte Identities werden nicht gelöscht.
5. Unerwartete `verification`-Persistenz blockiert fail-closed.
6. Der ULC-End-to-End-Pfad erzeugt zuerst die bestehenden Permission-Administration-Audits mit Löschgrund, löscht danach die Identity und entfernt erst anschließend den bereits leeren Permission-Principal.
7. Das Permission-Audit bleibt nach Subject-Löschung erhalten und enthält weder Kontaktadresse noch Passwort.
8. Ein Replay nach abgeschlossenem Delete führt nicht zu doppelten destruktiven Identity-Writes oder doppelten Audit-Ereignissen.
9. Fehlt beim ersten Delete der exakte Permission-Principal als Auditanker, wird vor Identity-Deaktivierung fail-closed abgebrochen.
10. Auch ein bereits leerer Permission-Principal durchläuft vor dem ersten Delete nochmals den auditierten `replacePrincipalAccess()`-Pfad.
11. Ein Identity-Owner-Fehler lässt den leeren Principal bestehen und kann nach Behebung wiederholt werden; ein nachgelagerter Principal-Cleanup-Fehler kann nach abgeschlossenem Identity-Delete separat fertiggestellt werden.

## Bewusst weiterhin offen

M5-C bleibt global `open`, solange mindestens einer der folgenden Punkte real offen ist:

- die tatsächliche Persistenz hinter `UlcLinzMembershipResolver` ist nicht gebunden/inventarisiert,
- die tatsächliche Persistenz hinter `UlcLinzSubjectScopeResolver` ist nicht gebunden/inventarisiert,
- ein später installiertes ULC-Fachmodul führt personenbezogene Tabellen ohne expliziten Löschvertrag ein,
- Object Storage/Medien werden später real verwendet und besitzen noch keinen Owner-/Löschvertrag,
- ein zukünftiger Better-Auth-Flow führt `verification`-Persistenz ein, ohne dessen exakte Subject-Zuordnung und Cleanup-Semantik zu definieren,
- die Retention des minimalen Identity-Delete-Tombstones ist im separaten M5-D-Gate noch nicht global verifiziert,
- Restore/Reconciliation ist noch nicht so nachgewiesen, dass ein Restore auf einen Backup-Stand vor der Löschung gelöschte personenbezogene Daten nicht dauerhaft wieder produktiv reaktiviert.

Deshalb wird weder `deletionPolicy` noch `retentionPolicy` in diesem Slice auf `verified` gesetzt. Das ist beabsichtigtes fail-closed Verhalten und kein fehlender aktueller Identity-/Permission-Löschpfad.

## Sicherheitsgrenze

- kein direkter ULC-SQL-Zugriff auf Identity- oder Better-Auth-Tabellen
- kein öffentlicher Lifecycle-Endpunkt
- keine neue Migration
- keine produktive Datenänderung
- keine Provideraktion
- keine Secret-Änderung
- keine generische Lifecycle-/Privacy-Engine
