# K2-I01 – Night draft PR integration and operator handover (2026-11-15)

**Status: OFFLINE ONLY / NOT A PRODUCTION APPROVAL.** This package adds a deliberately fail-closed, dependency-free local inventory validator. It never calls GitHub, Cloudflare, Neon or the running app.

## Verified snapshot at 2026-11-15 ~06:00 Europe/Vienna
All six draft PRs were individually reported mergeable by GitHub and their *exact HEAD SHAs* each had successful CI. Their changed-file paths do not overlap. **This is not a combined integration build**: all six PRs target `main` independently. Before any merge, refresh the inventory and re-run the checks on the exact latest heads; merge only after separate human approval.

| PR | Scope | HEAD SHA | CI |
| --- | --- | --- | --- |
| #633 | R2 retention offline proposal | `4622f97ae335a12de815bb4e960512d7dbcb9c97` | PASS |
| #634 | media inventory / independent backup gap | `e08f9619a37ef2b9d418a70e0fcbbc4483db7286` | PASS |
| #635 | quarantine boundary / roles / RLS gates | `363cdc28768e9292d0ed83d979dbb09c5bb691f3` | PASS |
| #636 | E2E restore evidence | `8c773866fb4a1308dccf0b461ee7b9f6c807467f` | PASS |
| #637 | operator approval matrix | `662f44093d8dd8b8872f41486ac407c627aa560b` | PASS |
| #638 | RPO/RTO evidence | `894044e54eb9d468f7d5050344f90d3974497ee0` | PASS |

## Offline check
`node --test tooling/ulc-linz-k2-pr-integration.test.mjs`

To check a manually curated snapshot:
`node tooling/ulc-linz-k2-pr-integration.mjs /path/to/private-pr-inventory.json`

The JSON must contain `pullRequests`, each with `number`, `base`, `draft`, `merged`, `sha`, `files` (changed paths) and `checks` (each `status: completed`, `conclusion: success`). A missing/failed check, missing PR, overlapping file, changed SHA, or non-draft state blocks. The tool returns `READY_FOR_HUMAN_REVIEW` only, **never production readiness**. A stale or fabricated inventory cannot be detected offline; compare with GitHub first.

## Ordered review / release gate
1. Review #633 retention proposal: legal hold, EU data, at least two recoverable copies, explicit retention period. No R2 lifecycle or deletion until legal approval.
2. Review #634: videos/media are **not** in PostgreSQL restore; independent R2 backup and real media restore still missing.
3. Review #635: actual isolated role/auth/RLS test still missing; `pg_restore --no-owner --no-acl` cannot prove authorization parity.
4. Review #636: collect real E2E restore evidence including app smoke and integrity; offline tests are synthetic.
5. Review #637: operator sign-off for legal, technical, organizational and product gates.
6. Review #638: agree numerical RPO/RTO and measure real end-to-end recovery.
7. If approved, merge sequentially with fresh CI checks and a combined smoke/regression after the last merge. **No deployment, backup activation, production data, provider write or deletion is authorized by these PRs.**

## Evidence
K2 preview encrypted backup #43645974462 and quarantine restore #43647364218 PASS. Source/restore comparison 62/62 table row counts and data fingerprints, 1305 rows each. This does **not** establish live app, media or ACL/RLS recovery. Main remains unchanged until explicit approval.
