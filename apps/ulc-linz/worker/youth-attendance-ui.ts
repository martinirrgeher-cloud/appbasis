import { ULC_U12_HTML, ULC_U12_CSS, ULC_U12_SCRIPT } from "./u12-ui";

/**
 * U12 is the canonical mobile layout. Both new youth pages use its complete
 * editor, assignment matrix, guarded save and statistics without a fork of
 * the 1,500-line controller. Distinct identifiers prevent cross-page state.
 */
function areaUi(source: string, prefix: "u14" | "kids", area: "u14" | "kindertraining"): string {
  const name = area === "u14" ? "U14" : "Kindertraining";
  let output = source
    .replaceAll("U12", prefix.toUpperCase())
    .replaceAll("u12", prefix);
  // The UI prefix for Kindertraining intentionally differs from the canonical
  // area key to avoid colliding with the existing Irrgeher weekly module.
  if (area === "kindertraining") {
    output = output.replaceAll("KIDS · Anwesenheit", "Kindertraining · Anwesenheit")
      .replaceAll("KIDS-Gruppe", "Kindertraining-Gruppe");
  }
  if (source === ULC_U12_SCRIPT) {
    output = output.replaceAll(
      "refreshYouthCategoryCatalog()",
      'refreshYouthCategoryCatalog("' + area + '")',
    );
  }
  if (source === ULC_U12_HTML) {
    output = output.replaceAll(
      'data-youth-category-area="' + prefix + '"',
      'data-youth-category-area="' + area + '"',
    ).replaceAll(
      'title="Kind direkt der ' + prefix.toUpperCase() + '-Gruppe zuordnen"',
      'title="Kind direkt der ' + name + '-Gruppe zuordnen"',
    );
  }
  return output;
}

export const ULC_U14_HTML = areaUi(ULC_U12_HTML, "u14", "u14");
export const ULC_U14_CSS = areaUi(ULC_U12_CSS, "u14", "u14");
export const ULC_U14_SCRIPT = areaUi(ULC_U12_SCRIPT, "u14", "u14");

export const ULC_KIDS_HTML = areaUi(ULC_U12_HTML, "kids", "kindertraining");
export const ULC_KIDS_CSS = areaUi(ULC_U12_CSS, "kids", "kindertraining");
export const ULC_KIDS_SCRIPT = areaUi(ULC_U12_SCRIPT, "kids", "kindertraining");
