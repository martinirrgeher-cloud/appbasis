import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const catalog = readFileSync(new URL("../worker/exercise-catalog-ui.ts", import.meta.url), "utf8");
const blocks = readFileSync(new URL("../worker/training-blocks-ui.ts", import.meta.url), "utf8");
const documentation = readFileSync(new URL("../worker/training-documentation-ui.ts", import.meta.url), "utf8");

describe("P24 temporary DB contention: mobile editor draft safety", () => {
  it("does not mislabel a lock conflict as a duplicate exercise", () => {
    const save = catalog.slice(catalog.indexOf("async function saveExerciseCatalogItem(event)"));
    const special = save.indexOf('error?.code === "ULC_WRITE_TEMPORARILY_BUSY"');
    const duplicate = save.indexOf('error?.status === 409');
    expect(special).toBeGreaterThan(0);
    expect(duplicate).toBeGreaterThan(special);
    expect(save).toContain("Dein Entwurf bleibt erhalten");
    expect(save).toContain("setExerciseCatalogBusy(false)");
    expect(save).toContain("Eine Übung mit diesem Namen ist bereits vorhanden.");
  });
  it("retains block drafts, but keeps existing revision and in-use conflict paths", () => {
    const save = blocks.slice(blocks.indexOf("async function saveTrainingBlock("));
    expect(save).toContain("trainingBlockDirty = true");
    expect(save).toContain('error?.code === "ULC_WRITE_TEMPORARILY_BUSY"');
    expect(save).toContain("Dein Entwurf bleibt erhalten");
    expect(save).toContain('"TRAINING_BLOCK_CONFLICT"');
    expect(save).toContain('"TRAINING_BLOCK_INACTIVE"');
    const deletion = blocks.slice(blocks.indexOf("async function deleteUnusedTrainingBlock("));
    expect(deletion).toContain('error?.code === "ULC_WRITE_TEMPORARILY_BUSY"');
    expect(deletion).toContain('"TRAINING_BLOCK_IN_USE"');
  });
  it("preserves documentation editor text when a transient lock prevents save", () => {
    const save = documentation.slice(documentation.indexOf("async function saveTrainingDocumentation()"));
    expect(save).toContain('error?.code === "ULC_WRITE_TEMPORARILY_BUSY"');
    expect(save).toContain("Deine Eingaben bleiben erhalten");
    expect(save).toContain("TRAINING_DOCUMENTATION_CONFLICT");
    const caught = save.slice(save.indexOf("  } catch (error) {"),save.indexOf("  } finally {"));
    expect(caught).not.toContain("trainingDocumentationDraft = null");
    expect(caught).not.toContain("trainingDocumentationDirty = false");
  });
});
