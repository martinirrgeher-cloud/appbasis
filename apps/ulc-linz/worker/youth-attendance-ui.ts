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
    // Transform uppercase U12 identifiers into the camel-case Kids prefix,
    // matching the shared runtime lifecycle and category callback.
    output = output.replaceAll("KIDS", "Kids")
      .replaceAll("Kids · Anwesenheit", "Kindertraining · Anwesenheit")
      .replaceAll("Kids-Gruppe", "Kindertraining-Gruppe");
  }
  if (source === ULC_U12_SCRIPT) {
    if (area === "kindertraining") {
      // Only the Kids page uses the shared v17 calendar for day navigation.
      // Leave the already accepted U12/U14 date controls unchanged.
      output = output.replace("const kidsFollowGroupCalendar = false;",
        "const kidsFollowGroupCalendar = true;");
    }
    output = output.replaceAll(
      "refreshYouthCategoryCatalog()",
      'refreshYouthCategoryCatalog("' + area + '")',
    );
  }
  if (source === ULC_U12_CSS && area === "kindertraining") {
    output += `
/* Kids only: a full-width date row keeps the entire date readable on phones. */
@media (max-width: 560px) {
  .kids-date-toolbar {
    grid-template-columns: minmax(0, 1fr);
    row-gap: 5px;
  }
  .kids-date-nav {
    grid-column: 1;
    grid-row: 1;
    grid-template-columns: 44px minmax(0, 1fr) 44px;
    gap: 6px;
  }
  .kids-date-arrow { min-width: 44px; min-height: 44px; }
  .kids-date-field select { font-size: .88rem; text-overflow: clip; }
  .kids-date-shortcuts {
    grid-column: 1;
    grid-row: 2;
    justify-content: space-between;
    gap: 8px;
    min-width: 0;
  }
  .kids-date-shortcuts #kids-today {
    text-align: left;
    white-space: normal;
    line-height: 1.25;
    padding: 5px 8px;
  }
  .kids-date-shortcuts #kids-reload { flex: 0 0 44px; }
}
.kids-calendar-hint { grid-column:1 / -1; margin:0; padding:4px 6px; font-size:.76rem; line-height:1.35; color:var(--secondary); background:var(--muted); border-radius:7px; }
.kids-calendar-hint[hidden] { display:none; }
`;
  }
  if (source === ULC_U12_HTML) {
    if (area === "kindertraining") {
      output = output.replace('>Heute</button>', '>Zum aktuellen Training</button>')
        .replace('<input type="date" id="kids-date" required aria-label="Trainingstag auswählen" />',
          '<select id="kids-date" required aria-label="Trainingstag auswählen"></select>')
        .replace('<div class="kids-date-shortcuts">',
          '<p class="kids-calendar-hint" id="kids-calendar-hint" role="status" hidden></p>' +
          '<div class="kids-date-shortcuts">')
        .replace('id="kids-prev" aria-label="Vorheriger Tag"',
          'id="kids-prev" aria-label="Vorheriges Training"')
        .replace('id="kids-next" aria-label="Nächster Tag"',
          'id="kids-next" aria-label="Nächstes Training"');
    }
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
