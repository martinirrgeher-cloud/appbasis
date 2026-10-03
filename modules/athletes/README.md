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

The ULC consumer now uses the same module contract for E6F4B import preview and
controlled apply.

- Preview parses XLSX fail-closed with the same 5 MB / 1,000-athlete limits used
  by the first catalog exchange.
- Existing athletes are matched by explicit ID first; blank-ID rows may fall
  back to normalized first name + last name + birth year only when unique.
- Training groups resolve only against the current server-authorized snapshot.
- Existing membership history is immutable through import. Exact existing rows
  are skipped; only new memberships to active groups may be appended.
- Active/archive state changes are intentionally unsupported in the import.
- Apply is bound to XLSX bytes, organization and current athlete/group/membership
  state through a preview token and reparses against a fresh snapshot.
- Results are returned per row and as an Excel-friendly CSV log.
- No schema migration is required.
- The token prevents normal stale/repeated applies after state changes. Because
  athlete rows currently have no business-key unique constraint and the
  repository exposes no connection-bound transaction/lock contract, two
  exactly concurrent new-athlete applies are not claimed to be globally
  exactly-once. Solving that requires a separate persistence/idempotency gate.

The initial migration deliberately contains no SQL `REFERENCES` clauses. The
current incremental module migration contract rejects target references until a
public dependency contract exists. Cross-row and organization consistency must
therefore be enforced by the module service/repository layer when E2 is wired
into a concrete app; this restriction must not be weakened silently.
