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

The module exposes XLSX exchange contract
`appbasis.athletes.exchange/v2`.

- Exactly one user-facing worksheet, `Athleten`.
- Visible fields contain only athlete data and training-group selections:
  first name, last name, birth year, notes and one or more group dropdowns.
- Existing athlete IDs, active state, contract marker and dropdown source
  values are kept in hidden technical columns. Users do not enter IDs or
  record keys.
- New athlete rows may leave the hidden ID empty; preview then falls back to
  normalized first name + last name + birth year only when that identifies
  exactly one existing athlete.
- Training-group names resolve exclusively against the current
  server-authorized snapshot. Group definitions are references only; the
  workbook never creates or edits groups.
- Existing group history is immutable through import. Active assignments shown
  in the export are skipped when unchanged; additional active groups may be
  appended. Missing existing assignments are warned about and ignored rather
  than removed.
- New membership rows use the actual controlled-apply date as their start date.
- Active/archive state changes remain unsupported.
- Preview is fail-closed, limited to 5 MB / 1,000 athlete rows and mutates no
  fachdata.
- Apply reparses the XLSX against a fresh organization-scoped snapshot and is
  bound to file plus current athlete/group/membership state through a preview
  token.
- Existing-athlete scalar updates use atomic compare-and-update against the
  previewed first name, last name, birth year and notes.
- Results are returned per row and as a user-facing CSV log without exposing
  technical IDs.
- Excel-saved DEFLATE-compressed XLSX containers are supported.
- No schema migration is required.

Low-level workbook serialization primitives shared with the exercise-catalog
exchange live in `@appbasis/xlsx`. Domain mapping, matching, authorization,
preview/apply and persistence remain owned by this module/application boundary.
