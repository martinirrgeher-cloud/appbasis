import { describe, expect, it } from "vitest";
import { ULC_LINZ_APP_HTML, ULC_LINZ_APP_SCRIPT } from "../worker/ui";
import {
  ULC_EXERCISE_CATALOG_HTML,
  ULC_EXERCISE_CATALOG_SCRIPT,
} from "../worker/exercise-catalog-ui";
import {
  ULC_TRAINING_BLOCKS_HTML,
  ULC_TRAINING_BLOCKS_SCRIPT,
} from "../worker/training-blocks-ui";

describe("ULC reactivation UI", () => {
  it("shows role-controlled restore actions on inactive athlete and trainer overlays", () => {
    expect(ULC_LINZ_APP_HTML).toContain('id="athlete-detail-reactivate"');
    expect(ULC_LINZ_APP_HTML).toContain('id="trainer-detail-reactivate"');
    expect(ULC_LINZ_APP_SCRIPT).toContain('masterdataCanEdit');
    expect(ULC_LINZ_APP_SCRIPT).toContain('athlete.isActive !== false || !masterdataCanEdit');
    expect(ULC_LINZ_APP_SCRIPT).toContain('trainer.isActive !== false || !masterdataCanEdit');
    expect(ULC_LINZ_APP_SCRIPT).toContain('/reactivate"');
    expect(ULC_LINZ_APP_SCRIPT).toContain('Frühere Gruppenzuordnungen werden nicht automatisch wiederhergestellt.');
  });

  it("restores only archived catalog exercises via the edit-scoped API", () => {
    expect(ULC_EXERCISE_CATALOG_HTML).toContain('id="exercise-catalog-reactivate"');
    expect(ULC_EXERCISE_CATALOG_SCRIPT).toContain('!exerciseCatalogCanEdit || item.id.length === 0 || item.isActive');
    expect(ULC_EXERCISE_CATALOG_SCRIPT).toContain('/reactivate"');
    expect(ULC_EXERCISE_CATALOG_SCRIPT).toContain('method: "POST"');
    expect(ULC_EXERCISE_CATALOG_SCRIPT).toContain(
      "elements.exerciseCatalogReactivate.disabled =",
    );
    expect(ULC_EXERCISE_CATALOG_SCRIPT).toContain(
      "selectedExercise.isActive",
    );
  });

  it("keeps training-block reactivation revision guarded", () => {
    expect(ULC_TRAINING_BLOCKS_HTML).toContain('id="training-block-reactivate"');
    expect(ULC_TRAINING_BLOCKS_SCRIPT).toContain('trainingBlockSelected.isActive || trainingBlockDirty');
    expect(ULC_TRAINING_BLOCKS_SCRIPT).toContain('/reactivate"');
    expect(ULC_TRAINING_BLOCKS_SCRIPT).toContain('expectedRevision: trainingBlockSelected.currentRevision');
    expect(ULC_TRAINING_BLOCKS_SCRIPT).toContain('trainingBlockConflict = true');
  });
});
