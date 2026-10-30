import { describe, expect, it } from "vitest";

import { ULC_LINZ_APP_CSS } from "../worker/ui";
import { ULC_TRAINING_PLANS_CSS } from "../worker/training-plans-ui";
import { ULC_TRAINING_BLOCKS_CSS } from "../worker/training-blocks-ui";
import { ULC_TRAINING_DOCUMENTATION_CSS } from "../worker/training-documentation-ui";
import { ULC_EXERCISE_CATALOG_CSS } from "../worker/exercise-catalog-ui";

describe("ULC mobile list and status layout", () => {
  it("preserves full group details and readable registration cards on phones", () => {
    expect(ULC_LINZ_APP_CSS).toContain(
      ".masterdata-row__secondary {\n    white-space: normal;",
    );
    expect(ULC_LINZ_APP_CSS).toContain("overflow-wrap: anywhere;");
    expect(ULC_LINZ_APP_CSS).toContain(
      ".registration-card__head strong { overflow-wrap: anywhere; }",
    );
  });

  it("keeps weekly attendance status actions touchable and reflows the narrowest days", () => {
    expect(ULC_LINZ_APP_CSS).toContain(
      "grid-template-columns: repeat(4, minmax(0, 1fr));",
    );
    expect(ULC_LINZ_APP_CSS).toContain(
      ".kindertraining-status {\n    min-width: 0;\n    min-height: var(--touch);",
    );
    expect(ULC_LINZ_APP_CSS).toContain("@media (max-width: 380px)");
    expect(ULC_LINZ_APP_CSS).toContain(
      ".kindertraining-day-registration-summary {\n    grid-column: 1 / -1;",
    );
  });

  it("allows long group-planning labels while retaining the weekly navigation", () => {
    expect(ULC_TRAINING_PLANS_CSS).toContain(
      ".training-plan-group-row__main { min-width: 0; overflow-wrap: anywhere; }",
    );
    expect(ULC_TRAINING_PLANS_CSS).toContain(
      ".training-plan-group-row__status { min-width: 0; max-width: 38vw; }",
    );
    expect(ULC_TRAINING_PLANS_CSS).toContain(
      ".training-plan-attendance-badge {\n    max-width: 100%;",
    );
    expect(ULC_TRAINING_PLANS_CSS).toContain(
      "scroll-snap-type: x proximity;",
    );
  });

  it("does not truncate training-block metadata or shrink touch targets", () => {
    expect(ULC_TRAINING_BLOCKS_CSS).toContain(
      ".training-block-row {\n    grid-template-columns: minmax(0, 1fr) auto;",
    );
    expect(ULC_TRAINING_BLOCKS_CSS).toContain(
      "min-height: var(--touch);",
    );
    expect(ULC_TRAINING_BLOCKS_CSS).toContain(
      ".training-block-row__badge {\n    max-width: 36vw;",
    );
  });

  it("wraps documentation status pills without altering their status states", () => {
    expect(ULC_TRAINING_DOCUMENTATION_CSS).toContain(
      ".training-documentation-status-row { gap: 6px; min-width: 0; }",
    );
    expect(ULC_TRAINING_DOCUMENTATION_CSS).toContain(
      "overflow-wrap: anywhere;",
    );
    expect(ULC_TRAINING_DOCUMENTATION_CSS).toContain(
      '.training-documentation-status[data-state="dirty"]',
    );
    expect(ULC_TRAINING_DOCUMENTATION_CSS).toContain(
      '.training-documentation-status[data-state="completed"]',
    );
  });

  it("shows full exercise names and metadata without reducing the favorite hit area", () => {
    expect(ULC_EXERCISE_CATALOG_CSS).toContain(
      ".exercise-catalog-row__title { flex-wrap: wrap; }",
    );
    expect(ULC_EXERCISE_CATALOG_CSS).toContain(
      ".exercise-catalog-favorite { min-height: var(--touch); }",
    );
    expect(ULC_EXERCISE_CATALOG_CSS).toContain(
      "white-space: normal;",
    );
    expect(ULC_EXERCISE_CATALOG_CSS).toContain(
      "grid-template-columns: minmax(0, 1fr) 44px;",
    );
  });
});
