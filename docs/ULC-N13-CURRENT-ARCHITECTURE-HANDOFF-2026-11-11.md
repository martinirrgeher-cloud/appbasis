# ULC Linz – N13 verified architecture and handoff (2026-11-11)

> **Scope:** Structural architecture and acceptance boundaries, reviewed on 2026-11-11. This file is not a production readiness declaration, deployment instruction, migration authorization or replacement for factory-wide ADRs. **Live PR/CI/Preview states, deployed SHAs and operator approvals live in GitHub #530/#591; never copy or infer their current values from this repository file.**

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
| Roles / users | User permission profiles and native `functionary` role are part of the ULC architecture; v10 includes role/check constraints | Verify real Preview principal and membership binding read-only before acceptance; identity/permission provisioning requires explicit operator approval |
| Youth attendance | U12, U14, Kindertraining share the U12 attendance/statistics controller with group-scoped data, per-session trainer attendance, notes, category assignments and autosave | Existing mobile operator PASS remains valid unless directly affected |
| Group calendar | Weekly group rules and `extra`/`cancelled` exceptions under v17; registration and attendance share date semantics | No parallel special-training calendar; a typed location must not be inferred from session notes, and schema changes require separate approval |
| Statistics | Four views (training/athlete/category/trainer), monthly counts and safe CSV for each youth group | No cross-group trainer aggregate; first decide scope/permissions and deduplication |
| Planning | Training-plan autosave with day-/identity-bound local recovery drafts; ambiguous POST outcomes must not trigger automatic replay | Check current offline/reconnect implementation and independent mobile acceptance at #530/#591; successful CI or main merge is not Preview/mobile acceptance |
| Staff proxy registration | Existing self-registration paths are protected from changes to staff proxy semantics | Never enable Staff-POST without integrated, reviewed actor/transaction/permission/session guard and concurrency-tested PostgreSQL evidence; consult #530/#591 for current status |
| Preview fixtures | E7B9 pre-/postflight requires a fresh, read-only inventory with protected objects preserved | Authenticated E7B9 acceptance and fixture cleanup require separate approval; ordinary E6H deployment is not E7B9 acceptance |

## Historical backlog reconciliation (avoid false regressions)

- [#509](https://github.com/martinirrgeher-cloud/appbasis/issues/509) (04 Nov): A01 functionary role and v10 source exists, but provisioning/Preview acceptance needs its own approval; A02 staff proxy requires security proof, whereas group-day exceptions are present; A03 U12/U14/Kindertraining and A04 group statistics are present; A05 group days/special dates are present; A06 trainer attendance exists but typed location needs a schema decision; A08 fixture cleanup is not implicit authorization; A09 offline planning behavior must be checked against current main and GitHub acceptance. Other entries must be checked individually, not bulk-closed.
- [#505](https://github.com/martinirrgeher-cloud/appbasis/issues/505) contains both a newer corrected status and an older "PR #478 next" section. #508 was merged and #478 superseded; do not re-open the obsolete work. U14 absence was true in the older snapshot, not now.
- [#451](https://github.com/martinirrgeher-cloud/appbasis/issues/451) has historical checkboxes from PR #450; later reactivation, category, autosave, calendar and UI changes have separate accepted PRs. Its fixture deletion/acceptance boxes are **not** authorization to delete Preview data.
- [#539](https://github.com/martinirrgeher-cloud/appbasis/issues/539) describes a trainer-attendance proposal originally dependent on #538. Later v16 and youth attendance implementations should be inspected before any further coding. Do not create another trainer attendance table.
- Historical PRs [#513](https://github.com/martinirrgeher-cloud/appbasis/pull/513) and [#322](https://github.com/martinirrgeher-cloud/appbasis/pull/322) are not automatically approved merge candidates. The #573–#578 security-draft sequence alone does not prove an integrated, safe staff feature; always inspect current GitHub state.

## Safe implementation/acceptance sequence

1. Re-read #530/#591, compare actual `main` SHA and open PRs, inspect running CI. Check affected source contracts and previous operator PASS before defining a change.
2. Choose one bounded independent slice; use existing module/owner boundaries, shared design tokens and targeted Unit/Chromium/isolated PostgreSQL tests. A draft PR with exact head and CI evidence is the deliverable.
3. **No main merge, Preview/E7B9/production deploy, migration, principal/role provisioning, fixture deletion, security readiness flag or real-user data write without separate operator approval for the specific action.**
4. Log PASS/FAIL/BLOCKED, exact branch/PR/commit/CI links, affected mobile test and pending decisions to both #530 and #591. A green CI is not operator acceptance.

## Acceptance boundaries (verify current decisions in #530/#591)

- **Planning offline/reconnect:** a main merge does not authorize Preview deployment. After separately approved deployment, test only offline draft retention, reconnect-before-POST save, and no silent retry after an ambiguous POST.
- **N09:** independent security integration/PG concurrency review before any Staff-POST exposure; do not request broad enablement without that evidence.
- **N11:** approve typed session-level location schema and UX contract before implementing migration; existing notes must retain their original semantics.
- **N12:** decide whether trainer aggregate may span groups, who can read it, how multi-group assignments are counted, and whether historical trainer names are displayed.
- **N06/N08:** authenticated E7B9 acceptance and any functionary test principal must be separately authorized.

This document intentionally does not modify `CURRENT-GATE.md`, historical ADRs or old issue descriptions, preserving their original decision history while providing an explicit current-status entry point.
