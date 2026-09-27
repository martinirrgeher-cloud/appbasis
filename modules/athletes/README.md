# Stammdaten

AppBasis module for shared athlete master data.

- Module ID: `athletes`
- Display name: `Stammdaten`
- Package: `@appbasis/athletes`
- Capabilities: `athletes:view`, `athletes:edit`
- Database owner: `modules/athletes`
- Schema version: 1

## Foundation scope

The first schema owns only the shared master-data foundation:

- training groups,
- athletes,
- trainers,
- historical athlete-to-group memberships,
- trainer-to-group memberships.

Every row is organization-scoped. User accounts, parent/athlete identity links,
realtime collaboration, edit locks, import/export and training-specific settings
are deliberately outside this foundation slice.

The initial migration deliberately contains no SQL `REFERENCES` clauses. The
current incremental module migration contract rejects target references until a
public dependency contract exists. Cross-row and organization consistency must
therefore be enforced by the module service/repository layer when E2 is wired
into a concrete app; this restriction must not be weakened silently.
