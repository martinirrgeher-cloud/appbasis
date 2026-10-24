# Attendance dual-mode design (work in progress)

This branch isolates attendance work from the Training Planning V2 acceptance baseline. Do not modify training-plans endpoints, UI, or schema until that acceptance is complete.

## Group-level mode
Each training group chooses one attendance mode:
- `self_registration`: a signed-in athlete submits an intention for a scheduled session; a trainer later records actual attendance.
- `trainer_roll_call`: a trainer opens the scheduled session and records actual attendance for group members; no athlete login is required.

Default existing groups to `trainer_roll_call` for backward compatibility. Keep this setting on the training group, not on the fixed ULC module identifier.

## Independent records
Keep athlete intention separate from observed attendance:
- Intention: `unknown | attending | not_attending | maybe`; athlete identity, session, updated timestamp and actor.
- Observation: existing `open | present | excused | absent` status, confirmed by an authorized trainer, with actor and timestamp.
- An intention must never automatically count as confirmed presence. A trainer may override an intention without deleting its history.
- Preserve the current `ulc_linz_training_attendance` semantics and current Kindertraining endpoints during migration.

## Authorization and identity
Resolve a self-registering user's identity to exactly one eligible athlete record within the organization and group. Never trust athlete IDs supplied by a client for self-registration. Verify group membership and session eligibility on every write. Trainers may read and confirm only permitted groups. Record change provenance; prevent cross-organization reads and writes.

## Implementation sequence
1. Add schema migration for group attendance mode and separate session registration records; ensure existing groups remain trainer-roll-call.
2. Add domain validation and repository APIs with revision/concurrency protection; unit and PostgreSQL tests for statuses, permissions and tenant isolation.
3. Add self-registration API and athlete-facing mobile UI.
4. Extend trainer-facing attendance list to show intention and observed attendance separately, with confirmation and corrections.
5. Add filters, statistics and change history; verify that Training Planning V2 contracts remain unchanged.

## Acceptance scenarios
- Existing Kindertraining group behaves exactly as before.
- Athlete can register only themselves for eligible group sessions.
- Trainer can confirm present even when athlete registered not attending, without changing the registration.
- Trainer can record attendance for a child without an app account.
- Conflicting edits are detected, not silently overwritten.
- Cross-group and cross-organization access is denied.
- Existing training-plan week/day views and E7B9 preview acceptance remain compatible.

No deployment or merge is authorized by this design document.
