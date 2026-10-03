# Stammdaten

AppBasis module for shared athlete master data.

- Module ID: `athletes`
- Display name: `Stammdaten`
- Package: `@appbasis/athletes`
- Capabilities: `athletes:view`, `athletes:edit`
- Database owner: `modules/athletes`
- Schema version: 2

## Foundation scope

The first schema owns only the shared master-data foundation:

- training groups,
- athletes,
- trainers,
- historical athlete-to-group memberships,
- trainer-to-group memberships.

Every row is organization-scoped. User accounts, parent/athlete identity links,
realtime collaboration, edit locks and training-specific settings remain outside
this foundation slice.

## Exchange contract

The module exposes the read-only XLSX contract
`appbasis.athletes.exchange/v1` for athlete export and import templates.

- `Athleten` contains athlete master data and stable existing IDs.
- `Gruppen` contains historical athlete-to-group memberships.
- `Listen` contains the current training-group resolver values.
- `Hinweise` documents the contract and editing rules.
- Organization IDs, actor IDs, trainer identities and user-account data are
  deliberately excluded from the workbook.
- Group definitions are references only; this exchange does not create or edit
  training groups.
- Application adapters remain responsible for authenticated organization scope
  and view/edit authorization.

The first ULC consumer exposes only export/template downloads in E6F4A.
Import preview/apply stays a separate E6F4B gate.

The initial migration deliberately contains no SQL `REFERENCES` clauses. The
current incremental module migration contract rejects target references until a
public dependency contract exists. Cross-row and organization consistency must
therefore be enforced by the module service/repository layer when E2 is wired
into a concrete app; this restriction must not be weakened silently.
