# ULC Linz – N13 verified architecture and handoff (2026-11-11)

> **Scope:** Documentation-only reconciliation against `main` at `369a746826fa40ebaab602d253c122e1115bb467`. This file is not a production readiness declaration, deployment instruction, migration authorization or replacement for the factory-wide ADRs. Recheck live GitHub before acting on any PR/CI snapshot.

## Authoritative order and evidence

1. [ULC working handoff #530](https://github.com/martinirrgeher-cloud/appbasis/issues/530) and [N08–N13 sprint #591](https://github.com/martinirrgeher-cloud/appbasis/issues/591), including latest comments, define current operator acceptance and next scope.
2. `CURRENT-GATE.md` is the historical/architectural gate inventory. Its introductory A10/A03/A04 "next" suggestions were written before subsequent ULC implementation. Do **not** treat them as uncompleted work without checking current `main`.
3. `docs/PROJECT-STATE.md` and `docs/ROADMAP.md` retain earlier factory phases (including Phase 3I and an August roadmap). They describe the platform history, not the current ULC sprint. Do not restart M6 on their basis.
4. `docs/ULC-LEGACY-FACTORY-AUDIT.md` was dated 2026-10-04. Its historical matrix (e.g. planning missing, U14 not yet available) is not an up-to-date ULC feature matrix. The old ULC repository is a *behavioral reference*, not deployable source.
5. `docs/design-system-v0.1.md`, `packages/ui/tokens.css`, ULC `worker/design-system.ts` and app theme manifest remain the common UI rules. Reuse tokens, responsive breakpoints, compact editor headers, front-positioned disclosure arrows, semantic save/conflict indicators and accessible touch targets; do not create another ULC-only design system.

## Current ULC functional baseline (source and operator evidence)

| Area | Verified current state | Do not repeat / outstanding boundary |
| --- | --- | --- |
| Platform | M6 factory milestone finished; ULC Production-Ready still **blocked** under #483 | Never infer deployment approval from completed platform M6 |
| Roles / users | User permission profiles and native `functionary` role on main; isolated Preview v10 role/check constraints and system role present (N08 read-only audit) | No Preview functionary membership/test principal yet; identity/permission provisioning requires explicit operator approval |
| Youth attendance | U12, U14, Kindertraining share the U12 attendance/statistics controller with group-scoped data, per-session trainer attendance, notes, category assignments and autosave | Existing mobile operator PASS remains valid unless directly affected |
| Group calendar | Weekly group rules and `extra`/`cancelled` exceptions under v17; registration and attendance share date semantics | No parallel special-training calendar; typed training location is **not** present in Preview schema and requires a separately approved migration |
| Statistics | Four views (training/athlete/category/trainer), monthly counts and safe CSV for each youth group | No cross-group trainer aggregate; first decide scope/permissions and deduplication |
| Planning | N07 autosave merged and Preview E6H success on main `369a7468` | N10 offline/reconnect fail-closed fix in **Draft #592**, head `c4b28830`, CI [#43000522700](https://github.com/martinirrgeher-cloud/appbasis/actions/runs/43000522700) success; **not** merged/deployed/handset-accepted |
| Staff proxy registration | Existing self-registration paths stay intact | N09 Staff-POST **BLOCKED**: Drafts #573–#578 are security pieces, no fully integrated actor/transaction/permission/session guard; do not activate |
| Preview fixtures | N08 read-only inventory found 0 E7B9 candidates, retained protected Preview group and athlete | E7B9 authenticated acceptance and cleanup require separate approval; ordinary E6H deploy is not E7B9 acceptance |

## Historical backlog reconciliation (avoid false regressions)

- [#509](https://github.com/martinirrgeher-cloud/appbasis/issues/509) (04 Nov): A01 functionary role source now implemented, Preview v10 read-only readiness verified but **real principal provisioning pending**; A02 staff proxy still blocked, whereas group-day exceptions are present; A03 U12/U14/Kindertraining and A04 group statistics are present; A05 group days/special dates present; A06 trainer attendance present but typed location absent; A08 fixture cleanup not authorized; A09 mobile planning offline fix awaits #592 approval. Other entries must be checked individually, not bulk-closed.
- [#505](https://github.com/martinirrgeher-cloud/appbasis/issues/505) contains both a newer corrected status and an older "PR #478 next" section. #508 was merged and #478 superseded; do not re-open the obsolete work. U14 absence was true in the older snapshot, not now.
- [#451](https://github.com/martinirrgeher-cloud/appbasis/issues/451) has historical checkboxes from PR #450; later reactivation, category, autosave, calendar and UI changes have separate accepted PRs. Its fixture deletion/acceptance boxes are **not** authorization to delete Preview data.
- [#539](https://github.com/martinirrgeher-cloud/appbasis/issues/539) describes a trainer-attendance proposal originally dependent on #538. Later v16 and youth attendance implementations should be inspected before any further coding. Do not create another trainer attendance table.
- Legacy open PRs [#513](https://github.com/martinirrgeher-cloud/appbasis/pull/513) and [#322](https://github.com/martinirrgeher-cloud/appbasis/pull/322) are not pre-approved merge candidates. Security drafts #573–#578 are not an integrated staff feature.

## Safe implementation/acceptance sequence

1. Re-read #530/#591, compare actual `main` SHA and open PRs, inspect running CI. Check affected source contracts and previous operator PASS before defining a change.
2. Choose one bounded independent slice; use existing module/owner boundaries, shared design tokens and targeted Unit/Chromium/isolated PostgreSQL tests. A draft PR with exact head and CI evidence is the deliverable.
3. **No autonomous main merge, Preview/E7B9/production deploy, migration, principal/role provisioning, fixture deletion, security readiness flag or real-user data write.** All require separate operator approval.
4. Log PASS/FAIL/BLOCKED, exact branch/PR/commit/CI links, affected mobile test and pending decisions to both #530 and #591. A green CI is not operator acceptance.

## Current operator decisions still needed

- **#592:** separate merge/Preview approval; after deployment only test offline draft retention, reconnect-before-POST save, and no silent retry after ambiguous POST.
- **N09:** independent security integration/PG concurrency review before any Staff-POST exposure; do not request broad enablement without that evidence.
- **N11:** approve typed session-level location schema and UX contract before implementing migration; existing notes must retain their original semantics.
- **N12:** decide whether trainer aggregate may span groups, who can read it, how multi-group assignments are counted, and whether historical trainer names are displayed.
- **N06/N08:** authenticated E7B9 acceptance and any functionary test principal must be separately authorized.

This document intentionally does not modify `CURRENT-GATE.md`, historical ADRs or old issue descriptions, preserving their original decision history while providing an explicit current-status entry point.
