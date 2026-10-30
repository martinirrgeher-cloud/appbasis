import { describe, expect, it } from "vitest";

import {
  ULC_LINZ_APP_HTML,
  ULC_LINZ_APP_SCRIPT,
  ULC_LINZ_APP_CSS,
} from "../worker/ui";
import {
  ULC_EXERCISE_CATALOG_HTML,
} from "../worker/exercise-catalog-ui";
import {
  ULC_TRAINING_BLOCKS_HTML,
  ULC_TRAINING_BLOCKS_CSS,
  ULC_TRAINING_BLOCKS_SCRIPT,
} from "../worker/training-blocks-ui";

describe("ULC mobile review fixes", () => {
  it("lets users toggle inactive athletes without altering the underlying snapshot", () => {
    expect(ULC_LINZ_APP_HTML).toContain('id="athlete-show-inactive"');
    expect(ULC_LINZ_APP_SCRIPT).toContain("masterdataShowInactiveAthletes");
    expect(ULC_LINZ_APP_SCRIPT).toContain(
      "snapshot.athletes.filter((athlete) => athlete.isActive !== false)",
    );
  });

  it("starts newly selected attendance weeks with all days collapsed", () => {
    expect(ULC_LINZ_APP_SCRIPT).toContain(
      "// A newly selected week starts fully collapsed; days open on demand.",
    );
    expect(ULC_LINZ_APP_SCRIPT).not.toContain(
      "kindertrainingWeekExpandedDates.add(dates[0])",
    );
    expect(ULC_LINZ_APP_HTML).toContain(
      'id="kindertraining-week-current" type="button">Aktuelle Woche',
    );
    expect(ULC_LINZ_APP_HTML).toContain(
      'id="kindertraining-week-save" type="button" disabled>💾 Speichern',
    );
  });

  it("uses compact accessible plus actions for new exercises and blocks", () => {
    expect(ULC_EXERCISE_CATALOG_HTML).toContain(
      'id="exercise-catalog-new" type="button" aria-label="Neue Übung anlegen"',
    );
    expect(ULC_TRAINING_BLOCKS_HTML).toContain(
      'id="training-block-new" type="button" hidden aria-label="Neuen Trainingsblock anlegen"',
    );
    expect(ULC_LINZ_APP_CSS).toContain(
      '.app-section[data-app-section]:not([data-app-section="home"]) > .hero .summary',
    );
  });

  it("filters selectable exercises by catalog category, without hiding clubwide groups", () => {
    expect(ULC_TRAINING_BLOCKS_HTML).toContain(
      'id="training-block-exercise-category" aria-label="Übungskategorie filtern"',
    );
    expect(ULC_TRAINING_BLOCKS_SCRIPT).toContain(
      "item.isActive && (!selectedCategory || item.categoryKey === selectedCategory)",
    );
    expect(ULC_TRAINING_BLOCKS_SCRIPT).toContain(
      'all.textContent = "Alle Kategorien"',
    );
  });

  it("marks missing block names and shows other exercise prescription units", () => {
    expect(ULC_TRAINING_BLOCKS_SCRIPT).toContain(
      'trainingBlockElements.name.classList.toggle("training-block-field-missing", missingName)',
    );
    expect(ULC_TRAINING_BLOCKS_CSS).toContain(".training-block-field-missing {");
    expect(ULC_TRAINING_BLOCKS_SCRIPT).toContain(
      'const otherAmounts = (item?.parameters || [])',
    );
  });
});
