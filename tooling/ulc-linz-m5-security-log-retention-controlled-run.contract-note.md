# M5-F controlled retention compatibility boundary

The controlled production retention adapter preserves the canonical delete implementation in `ulc-linz-m5-security-log-retention-run.mjs`.

Before the canonical runner evaluates the cleanup principal, the adapter classifies the provider-created reverse membership on the cleanup login. It accepts either no reverse membership or exactly one database-owner creator back-reference granted by a superuser with `ADMIN TRUE`, `INHERIT FALSE`, and `SET FALSE`. Every other reverse membership fails closed. The adapter verifies the observed reverse-membership count against the canonical access observation before normalizing that one provider metadata edge for the canonical generic principal check.

This adapter does not grant, revoke, or mutate database privileges and does not authorize production release.
