ALTER TABLE "ulc_linz_membership"
  ADD COLUMN "retention_deletion_claimed_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "ulc_linz_membership"
  ADD CONSTRAINT "ulc_linz_membership_retention_deletion_claim_check"
  CHECK (
    "retention_deletion_claimed_at" IS NULL
    OR (
      "active" = false
      AND "ended_at" IS NOT NULL
      AND "source_role" <> 'admin'
      AND "ended_at" + interval '12 months' < "retention_deletion_claimed_at"
      AND (
        "retention_review_at" IS NULL
        OR "retention_review_at" <= "retention_deletion_claimed_at"
      )
    )
  );
