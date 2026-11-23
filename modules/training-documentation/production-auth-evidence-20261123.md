# Training documentation – production authorization acceptance (23.11.2026)

## Scope and immutable evidence

- GitHub: [ULC T08 private pre-ingress smoke run #45260339171](https://github.com/martinirrgeher-cloud/appbasis/actions/runs/45260339171).
- Event: `workflow_dispatch`, run attempt `1`, branch `main`, exact SHA `52cca9e457f103be4a01aad2abe155d63c6b44ec`; `completed/success`.
- Code: [PR #720](https://github.com/martinirrgeher-cloud/appbasis/pull/720), head `37af68637370df66a327e202a773a064e0716849`, PR CI [#45256329696](https://github.com/martinirrgeher-cloud/appbasis/actions/runs/45256329696) 3/3 PASS, final independent review zero findings. Main push CI [#45257601217](https://github.com/martinirrgeher-cloud/appbasis/actions/runs/45257601217) PASS.
- Runtime: existing production-protected ULC Worker through `wrangler dev --remote` (transient token-guarded private harness, no public ingress or new canonical Worker deployment); real production app SQL role and pre-existing isolated synthetic `ulc.m6.smoke` trainer inside `ulc-linz-m6-smoke`.
- Real HTTP outcomes from job log: `anonymous401=true`, `authenticated200=true`, `docView200=true`, `authorizedPost404=true`, `revoke403=true`, `logout401=true`.
- Live SQL rights revocation took effect during the same Better Auth session (403). The POST 404 is expected after **successful authorization** because the subject deliberately does not exist; it is not a documentation creation success.
- Runner `always()` cleanup PASS. Independent post-run Neon read-only aggregate verification: exactly 1 isolated active smoke membership, 1 trainer-role assignment, 2 explicit documentation capability revokes, 0 grants, 0 active sessions, 0 documents, 0 plans and 0 athletes in the synthetic organization. No personal data values or secrets captured in this file.

## Authorization versus lifecycle / functional persistence

This evidence verifies **remote sign-in, documentation read permission, authorization of the edit route before subject validation, immediate live permission revocation and sign-out**. Together with existing local real HTTP/PostgreSQL documentation tests, it supports the **authorization** requirement of the module production contract.

It **does not** prove a persisted remote documentation POST-201 / GET replay, its privileged deletion including revision rows, full 8-owner subject erasure and restore, private-media/retention guarantees or the app privacy/lifecycle production readiness. The production application SQL role has no DELETE privilege on documentation roots and revisions. Therefore `persistentDocWriteVerified=false`; do not claim it or mark module `ready` based on this file. Do not repeat the successful T08 auth test. Complete the missing lifecycle and controlled pilot release prerequisites separately, with actual evidence.

Operational decisions and remaining acceptance tasks stay in [issue #716](https://github.com/martinirrgeher-cloud/appbasis/issues/716). A `verified` authorization component never grants deployment or data processing approval by itself.
