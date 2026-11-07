import { describe, expect, it } from "vitest";
import {
  ULC_TRAINING_BLOCKS_HTML,
  ULC_TRAINING_BLOCKS_CSS,
  ULC_TRAINING_BLOCKS_SCRIPT,
} from "../worker/training-blocks-ui";

describe("UI-03.1: compact training-block filtering", () => {
  it("puts search and category ahead of optional group and status filters", () => {
    const html = ULC_TRAINING_BLOCKS_HTML;
    const positions = [
      html.indexOf('id="training-block-search"'),
      html.indexOf('id="training-block-category-filter"'),
      html.indexOf('class="training-block-extra-filters"'),
      html.indexOf('id="training-block-audience-filter"'),
      html.indexOf('id="training-block-status-filter"'),
    ];
    expect(positions.every((position) => position >= 0)).toBe(true);
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
    expect(html).toContain('<summary class="ab-disclosure">Weitere Filter');
    expect(html).toContain('id="training-block-filter-summary-state"');
    for (const id of [
      "training-block-search",
      "training-block-category-filter",
      "training-block-audience-filter",
      "training-block-status-filter",
    ]) {
      expect(html.split('id="' + id + '"')).toHaveLength(2);
    }
  });

  it("preserves existing independent category, group and active/archive semantics", () => {
    expect(ULC_TRAINING_BLOCKS_SCRIPT).toContain('if (category === "uncategorized" && block.revision.category) return false;');
    expect(ULC_TRAINING_BLOCKS_SCRIPT).toContain('block.revision.category !== category');
    expect(ULC_TRAINING_BLOCKS_SCRIPT).toContain('audience === "clubwide"');
    expect(ULC_TRAINING_BLOCKS_SCRIPT).toContain('audience !== "clubwide"');
    expect(ULC_TRAINING_BLOCKS_SCRIPT).toContain('status === "active" && !block.isActive');
    expect(ULC_TRAINING_BLOCKS_SCRIPT).toContain('status === "archived" && block.isActive');
    for (const id of ["audienceFilter", "categoryFilter", "statusFilter"]) {
      expect(ULC_TRAINING_BLOCKS_SCRIPT).toContain(
        'trainingBlockElements.' + id + '?.addEventListener("change", renderTrainingBlocks)',
      );
    }
  });

  it("shows advanced-filter state and exact result counts even when the list is empty", () => {
    expect(ULC_TRAINING_BLOCKS_HTML).toContain('id="training-block-result-count" role="status" aria-live="polite"');
    expect(ULC_TRAINING_BLOCKS_SCRIPT).toContain(
      'const advancedCount = Number(audience !== "all") + Number(status !== "active");',
    );
    expect(ULC_TRAINING_BLOCKS_SCRIPT).toContain(
      'String(filtered.length) + " von " + String(trainingBlocks.length) + " Blöcken"',
    );
    expect(ULC_TRAINING_BLOCKS_SCRIPT.indexOf("const advancedCount"))
      .toBeLessThan(ULC_TRAINING_BLOCKS_SCRIPT.indexOf("if (filtered.length === 0)"));
  });

  it("resets only overview filters, not a block editor or its save state", () => {
    expect(ULC_TRAINING_BLOCKS_HTML).toContain('id="training-block-filter-reset" type="button" hidden');
    const start = ULC_TRAINING_BLOCKS_SCRIPT.indexOf("function resetTrainingBlockFilters() {");
    const end = ULC_TRAINING_BLOCKS_SCRIPT.indexOf("\nfunction renderTrainingBlocks()", start);
    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(start);
    const reset = ULC_TRAINING_BLOCKS_SCRIPT.slice(start, end);
    expect(reset).toContain('trainingBlockElements.search.value = "";');
    expect(reset).toContain('trainingBlockElements.categoryFilter.value = "all";');
    expect(reset).toContain('trainingBlockElements.audienceFilter.value = "all";');
    expect(reset).toContain('trainingBlockElements.statusFilter.value = "active";');
    expect(reset).toContain("renderTrainingBlocks();");
    expect(reset).not.toMatch(/saveTrainingBlock|trainingBlockDraft|trainingBlockSelected|fetch\(/);
    expect(ULC_TRAINING_BLOCKS_SCRIPT).toContain(
      'trainingBlockElements.filterReset?.addEventListener("click", resetTrainingBlockFilters);',
    );
  });

  it("keeps phone-width filters and arrow interaction accessible", () => {
    expect(ULC_TRAINING_BLOCKS_CSS).toContain(".training-block-extra-filters > summary {");
    expect(ULC_TRAINING_BLOCKS_CSS).toContain("min-height: 44px;");
    expect(ULC_TRAINING_BLOCKS_CSS).toContain(".training-block-commandbar input,");
    expect(ULC_TRAINING_BLOCKS_CSS).toContain(".training-block-extra-filters__fields {");
    expect(ULC_TRAINING_BLOCKS_CSS).toContain("@media (max-width: 359px) {");
    expect(ULC_TRAINING_BLOCKS_CSS).toContain("#training-block-filter-reset[hidden] { display: none; }");
    expect(ULC_TRAINING_BLOCKS_HTML).toContain('<details class="training-block-more">');
  });
});
