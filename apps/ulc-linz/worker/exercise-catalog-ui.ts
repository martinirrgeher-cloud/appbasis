export const ULC_EXERCISE_CATALOG_HTML = `
          <section class="app-section" data-app-section="exercise-catalog" id="exercise-catalog" hidden>
            <section class="hero exercise-catalog-hero">
              <div>
                <p class="eyebrow">Training</p>
                <h1>Übungskatalog</h1>
                <p class="summary">Übungen suchen, filtern, favorisieren und für die Trainingsplanung vorbereiten.</p>
              </div>
              <button class="button button--primary" id="exercise-catalog-new" type="button" hidden>Neue Übung</button>
            </section>

            <p class="message message--error" id="exercise-catalog-message" role="alert" hidden></p>
            <p class="message message--success" id="exercise-catalog-success" role="status" hidden></p>

            <section class="card exercise-catalog-filters" aria-label="Übungskatalog filtern">
              <label class="exercise-catalog-search">Suche
                <input id="exercise-catalog-search" type="search" maxlength="160" placeholder="Name, Ziel, Unterkategorie, Material …" autocomplete="off" />
              </label>
              <label>Kategorie
                <select id="exercise-catalog-category-filter"></select>
              </label>
              <label>Trainingsgruppe
                <select id="exercise-catalog-group-filter"></select>
              </label>
              <label>Material
                <input id="exercise-catalog-material-filter" maxlength="80" placeholder="z. B. Hürden" autocomplete="off" />
              </label>
              <label>Favoriten
                <select id="exercise-catalog-favorite-filter">
                  <option value="all">Alle</option>
                  <option value="favorite">Nur Favoriten</option>
                </select>
              </label>
              <label>Status
                <select id="exercise-catalog-status-filter">
                  <option value="active">Aktiv</option>
                  <option value="archived">Archiv</option>
                  <option value="all">Alle</option>
                </select>
              </label>
              <label>Video / Link
                <select id="exercise-catalog-video-filter">
                  <option value="all">Alle</option>
                  <option value="with">Mit Link</option>
                  <option value="without">Ohne Link</option>
                </select>
              </label>
            </section>

            <section class="exercise-catalog-workspace">
              <section class="card exercise-catalog-list-card">
                <div class="section-heading">
                  <div>
                    <p class="eyebrow">Übungen</p>
                    <h2>Katalog</h2>
                  </div>
                  <span id="exercise-catalog-count">0</span>
                </div>
                <div class="exercise-catalog-list" id="exercise-catalog-list" aria-live="polite"></div>
              </section>

              <section class="card exercise-catalog-editor" id="exercise-catalog-editor" hidden>
                <div class="section-heading exercise-catalog-editor-heading">
                  <div>
                    <p class="eyebrow" id="exercise-catalog-editor-eyebrow">Übung</p>
                    <h2 id="exercise-catalog-editor-title">Details</h2>
                  </div>
                  <button class="button button--secondary" id="exercise-catalog-close" type="button">Schließen</button>
                </div>

                <form id="exercise-catalog-form">
                  <div class="exercise-catalog-form-grid">
                    <label>Name
                      <input id="exercise-catalog-name" minlength="2" maxlength="120" required />
                    </label>
                    <label>Kategorie
                      <select id="exercise-catalog-category" required></select>
                    </label>
                    <label>Unterkategorie
                      <input id="exercise-catalog-subcategory" maxlength="100" />
                    </label>
                    <label>Trainingsziel
                      <input id="exercise-catalog-goal" maxlength="240" />
                    </label>
                    <label class="exercise-catalog-wide">Beschreibung / Ausführung
                      <textarea id="exercise-catalog-description" maxlength="10000" rows="4"></textarea>
                    </label>
                    <label class="exercise-catalog-wide">Trainerhinweise
                      <textarea id="exercise-catalog-cues" maxlength="10000" rows="3"></textarea>
                    </label>
                    <label class="exercise-catalog-wide">Typische Fehler
                      <textarea id="exercise-catalog-mistakes" maxlength="10000" rows="3"></textarea>
                    </label>
                    <label class="exercise-catalog-wide">Material
                      <input id="exercise-catalog-equipment" maxlength="2000" placeholder="Kommagetrennt, z. B. Hütchen, Minihürden" />
                    </label>
                    <label class="exercise-catalog-wide">Video- / Weblink
                      <input id="exercise-catalog-video-url" type="url" maxlength="2000" inputmode="url" placeholder="https://…" />
                    </label>
                  </div>

                  <fieldset class="exercise-catalog-fieldset">
                    <legend>Geeignete Trainingsgruppen</legend>
                    <div class="exercise-catalog-check-grid" id="exercise-catalog-groups"></div>
                  </fieldset>

                  <fieldset class="exercise-catalog-fieldset">
                    <div class="exercise-catalog-parameter-heading">
                      <legend>Planungsparameter</legend>
                      <div class="exercise-catalog-parameter-add">
                        <select id="exercise-catalog-parameter-select" aria-label="Planungsparameter auswählen"></select>
                        <button class="button button--secondary" id="exercise-catalog-parameter-add" type="button">Hinzufügen</button>
                      </div>
                    </div>
                    <div class="exercise-catalog-parameters" id="exercise-catalog-parameters"></div>
                  </fieldset>

                  <div class="exercise-catalog-link-row" id="exercise-catalog-link-row" hidden>
                    <a id="exercise-catalog-link" rel="noopener noreferrer" target="_blank">Link öffnen</a>
                  </div>

                  <div class="exercise-catalog-form-actions">
                    <button class="button button--primary" id="exercise-catalog-save" type="submit">Speichern</button>
                    <button class="button button--danger" id="exercise-catalog-deactivate" type="button" hidden>Deaktivieren</button>
                  </div>
                  <p class="exercise-catalog-readonly" id="exercise-catalog-readonly" hidden>Nur-Lese-Zugriff: Favoriten können weiterhin gesetzt werden.</p>
                </form>
              </section>
            </section>
          </section>
`;

export const ULC_EXERCISE_CATALOG_CSS = `
.exercise-catalog-hero {
  display: flex;
  align-items: end;
  justify-content: space-between;
  gap: 12px;
}
.exercise-catalog-hero .button { flex: 0 0 auto; }
.exercise-catalog-filters {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
  margin-bottom: 14px;
  padding: 12px;
}
.exercise-catalog-search { grid-column: 1 / -1; }
.exercise-catalog-workspace { display: grid; gap: 14px; }
.exercise-catalog-list-card,
.exercise-catalog-editor { padding: 14px; }
.exercise-catalog-list { display: grid; gap: 8px; margin-top: 12px; }
.exercise-catalog-empty {
  padding: 22px 12px;
  border: 1px dashed var(--border-strong);
  border-radius: var(--control-radius);
  color: var(--secondary);
  text-align: center;
}
.exercise-catalog-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 44px;
  gap: 8px;
  align-items: stretch;
  border: 1px solid var(--border);
  border-radius: 12px;
  background: white;
}
.exercise-catalog-row[data-active="false"] { background: var(--muted); }
.exercise-catalog-row__main {
  display: grid;
  gap: 6px;
  min-width: 0;
  border: 0;
  background: transparent;
  padding: 10px 8px 10px 12px;
  color: inherit;
  text-align: left;
  cursor: pointer;
}
.exercise-catalog-row__title {
  display: flex;
  align-items: center;
  gap: 7px;
  min-width: 0;
}
.exercise-catalog-row__title strong {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.exercise-catalog-badge {
  flex: 0 0 auto;
  padding: 2px 6px;
  border-radius: 999px;
  background: var(--muted);
  color: var(--secondary);
  font-size: .66rem;
  font-weight: 800;
}
.exercise-catalog-badge--archived {
  background: var(--danger-surface);
  color: var(--danger);
}
.exercise-catalog-row__meta,
.exercise-catalog-row__info {
  overflow: hidden;
  color: var(--secondary);
  font-size: .74rem;
  line-height: 1.35;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.exercise-catalog-favorite {
  display: grid;
  width: 44px;
  min-height: 44px;
  place-items: center;
  align-self: center;
  border: 0;
  border-left: 1px solid var(--border);
  background: transparent;
  color: #64748b;
  font-size: 1.25rem;
  cursor: pointer;
}
.exercise-catalog-favorite[aria-pressed="true"] { color: #b45309; }
.exercise-catalog-editor-heading { align-items: start; }
.exercise-catalog-form-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 10px;
  margin-top: 14px;
}
.exercise-catalog-fieldset {
  min-width: 0;
  margin: 16px 0 0;
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 12px;
}
.exercise-catalog-fieldset legend {
  padding: 0 4px;
  color: var(--text);
  font-size: .82rem;
  font-weight: 850;
}
.exercise-catalog-check-grid { display: grid; gap: 7px; }
.exercise-catalog-check {
  display: flex;
  min-height: 38px;
  align-items: center;
  gap: 8px;
  color: var(--text);
  font-size: .8rem;
  font-weight: 700;
}
.exercise-catalog-check input { width: 20px; min-height: 20px; margin: 0; }
.exercise-catalog-parameter-heading {
  display: grid;
  gap: 8px;
}
.exercise-catalog-parameter-add {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 8px;
}
.exercise-catalog-parameters { display: grid; gap: 10px; margin-top: 10px; }
.exercise-catalog-parameter {
  display: grid;
  gap: 8px;
  padding: 10px;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--muted);
}
.exercise-catalog-parameter__top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.exercise-catalog-parameter__top strong { font-size: .82rem; }
.exercise-catalog-parameter__fields {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}
.exercise-catalog-parameter__required {
  display: flex;
  min-height: 44px;
  align-items: center;
  gap: 8px;
}
.exercise-catalog-parameter__required input {
  width: 20px;
  min-height: 20px;
  margin: 0;
}
.exercise-catalog-remove {
  min-height: 36px;
  padding: 0 10px;
}
.exercise-catalog-form-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 16px;
}
.button--danger {
  border: 1px solid #fecaca;
  background: white;
  color: var(--danger);
}
.exercise-catalog-link-row { margin-top: 12px; }
.exercise-catalog-link-row a {
  color: var(--accent);
  font-size: .82rem;
  font-weight: 800;
}
.exercise-catalog-readonly {
  margin: 12px 0 0;
  color: var(--secondary);
  font-size: .78rem;
}
@media (min-width: 640px) {
  .exercise-catalog-filters { grid-template-columns: repeat(3, minmax(0, 1fr)); }
  .exercise-catalog-search { grid-column: 1 / -1; }
  .exercise-catalog-form-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .exercise-catalog-wide { grid-column: 1 / -1; }
  .exercise-catalog-check-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .exercise-catalog-parameter-heading {
    grid-template-columns: minmax(0, 1fr) minmax(250px, 1fr);
    align-items: end;
  }
}
@media (min-width: 960px) {
  .exercise-catalog-workspace {
    grid-template-columns: minmax(320px, .8fr) minmax(0, 1.2fr);
    align-items: start;
  }
  .exercise-catalog-list-card {
    position: sticky;
    top: 118px;
    max-height: calc(100vh - 140px);
    overflow: auto;
  }
}
`;

export const ULC_EXERCISE_CATALOG_SCRIPT = String.raw`
const EXERCISE_CATEGORIES = Object.freeze([
  { key: "warmup", label: "Aufwärmen & Lauf-ABC" },
  { key: "acceleration", label: "Beschleunigung" },
  { key: "max_velocity", label: "Maximalgeschwindigkeit" },
  { key: "speed_endurance", label: "Schnelligkeitsausdauer" },
  { key: "start_reaction", label: "Start & Reaktion" },
  { key: "technique", label: "Technik" },
  { key: "plyometrics", label: "Plyometrie" },
  { key: "strength", label: "Kraft" },
  { key: "stability", label: "Stabilisation" },
  { key: "regeneration", label: "Regeneration" },
  { key: "other", label: "Sonstiges" },
]);

const EXERCISE_PARAMETER_META = Object.freeze([
  { key: "sets", label: "Sätze", unit: "", inputType: "number" },
  { key: "repetitions", label: "Wiederholungen", unit: "", inputType: "number" },
  { key: "distance_m", label: "Distanz", unit: "m", inputType: "number" },
  { key: "weight_kg", label: "Gewicht", unit: "kg", inputType: "number" },
  { key: "duration_s", label: "Dauer", unit: "s", inputType: "number" },
  { key: "target_time_s", label: "Zielzeit", unit: "s", inputType: "number" },
  { key: "intensity_percent", label: "Intensität", unit: "%", inputType: "number" },
  { key: "rest_s", label: "Pause", unit: "s", inputType: "number" },
  { key: "series_rest_s", label: "Serienpause", unit: "s", inputType: "number" },
  { key: "approach_distance_m", label: "Anlauf", unit: "m", inputType: "number" },
  { key: "flying_distance_m", label: "Fliegende Distanz", unit: "m", inputType: "number" },
  { key: "contacts", label: "Kontakte", unit: "", inputType: "number" },
  { key: "resistance_kg", label: "Widerstand", unit: "kg", inputType: "number" },
  { key: "height_cm", label: "Höhe", unit: "cm", inputType: "number" },
  { key: "tempo_text", label: "Tempo", unit: "", inputType: "text" },
  { key: "surface_text", label: "Untergrund", unit: "", inputType: "text" },
  { key: "start_position_text", label: "Startposition", unit: "", inputType: "text" },
  { key: "note_text", label: "Zusatzhinweis", unit: "", inputType: "text" },
]);

Object.assign(elements, {
  exerciseCatalogQuickAction: document.querySelector("#exercise-catalog-quick-action"),
  exerciseCatalogAccessLabel: document.querySelector("#exercise-catalog-access-label"),
  exerciseCatalogNew: document.querySelector("#exercise-catalog-new"),
  exerciseCatalogMessage: document.querySelector("#exercise-catalog-message"),
  exerciseCatalogSuccess: document.querySelector("#exercise-catalog-success"),
  exerciseCatalogSearch: document.querySelector("#exercise-catalog-search"),
  exerciseCatalogCategoryFilter: document.querySelector("#exercise-catalog-category-filter"),
  exerciseCatalogGroupFilter: document.querySelector("#exercise-catalog-group-filter"),
  exerciseCatalogMaterialFilter: document.querySelector("#exercise-catalog-material-filter"),
  exerciseCatalogFavoriteFilter: document.querySelector("#exercise-catalog-favorite-filter"),
  exerciseCatalogStatusFilter: document.querySelector("#exercise-catalog-status-filter"),
  exerciseCatalogVideoFilter: document.querySelector("#exercise-catalog-video-filter"),
  exerciseCatalogCount: document.querySelector("#exercise-catalog-count"),
  exerciseCatalogList: document.querySelector("#exercise-catalog-list"),
  exerciseCatalogEditor: document.querySelector("#exercise-catalog-editor"),
  exerciseCatalogEditorEyebrow: document.querySelector("#exercise-catalog-editor-eyebrow"),
  exerciseCatalogEditorTitle: document.querySelector("#exercise-catalog-editor-title"),
  exerciseCatalogClose: document.querySelector("#exercise-catalog-close"),
  exerciseCatalogForm: document.querySelector("#exercise-catalog-form"),
  exerciseCatalogName: document.querySelector("#exercise-catalog-name"),
  exerciseCatalogCategory: document.querySelector("#exercise-catalog-category"),
  exerciseCatalogSubcategory: document.querySelector("#exercise-catalog-subcategory"),
  exerciseCatalogGoal: document.querySelector("#exercise-catalog-goal"),
  exerciseCatalogDescription: document.querySelector("#exercise-catalog-description"),
  exerciseCatalogCues: document.querySelector("#exercise-catalog-cues"),
  exerciseCatalogMistakes: document.querySelector("#exercise-catalog-mistakes"),
  exerciseCatalogEquipment: document.querySelector("#exercise-catalog-equipment"),
  exerciseCatalogVideoUrl: document.querySelector("#exercise-catalog-video-url"),
  exerciseCatalogGroups: document.querySelector("#exercise-catalog-groups"),
  exerciseCatalogParameterSelect: document.querySelector("#exercise-catalog-parameter-select"),
  exerciseCatalogParameterAdd: document.querySelector("#exercise-catalog-parameter-add"),
  exerciseCatalogParameters: document.querySelector("#exercise-catalog-parameters"),
  exerciseCatalogLinkRow: document.querySelector("#exercise-catalog-link-row"),
  exerciseCatalogLink: document.querySelector("#exercise-catalog-link"),
  exerciseCatalogSave: document.querySelector("#exercise-catalog-save"),
  exerciseCatalogDeactivate: document.querySelector("#exercise-catalog-deactivate"),
  exerciseCatalogReadonly: document.querySelector("#exercise-catalog-readonly"),
});

let exerciseCatalogReady = false;
let exerciseCatalogCanEdit = false;
let exerciseCatalogItems = [];
let exerciseCatalogGroups = [];
let exerciseCatalogSelectedId = null;
let exerciseCatalogParameterDrafts = [];
let exerciseCatalogBusy = false;

function categoryLabel(key) {
  return EXERCISE_CATEGORIES.find((category) => category.key === key)?.label || key;
}

function parameterMeta(key) {
  return EXERCISE_PARAMETER_META.find((parameter) => parameter.key === key) || null;
}

function isExerciseCatalogItem(item) {
  if (
    item === null ||
    typeof item !== "object" ||
    typeof item.id !== "string" ||
    item.id.length === 0 ||
    typeof item.name !== "string" ||
    item.name.length < 2 ||
    !EXERCISE_CATEGORIES.some((category) => category.key === item.categoryKey) ||
    !Array.isArray(item.equipment) ||
    item.equipment.some((value) => typeof value !== "string") ||
    !Array.isArray(item.groupIds) ||
    item.groupIds.some((value) => typeof value !== "string") ||
    !Array.isArray(item.parameters) ||
    typeof item.isActive !== "boolean" ||
    typeof item.isFavorite !== "boolean"
  ) {
    return false;
  }
  for (const parameter of item.parameters) {
    if (
      parameter === null ||
      typeof parameter !== "object" ||
      parameterMeta(parameter.key) === null ||
      typeof parameter.label !== "string" ||
      typeof parameter.unit !== "string" ||
      !["number", "text"].includes(parameter.inputType) ||
      (parameter.defaultValue !== null && typeof parameter.defaultValue !== "string") ||
      (parameter.minValue !== null && typeof parameter.minValue !== "number") ||
      (parameter.maxValue !== null && typeof parameter.maxValue !== "number") ||
      (parameter.stepValue !== null && typeof parameter.stepValue !== "number") ||
      typeof parameter.isRequired !== "boolean" ||
      !Number.isSafeInteger(parameter.sortOrder)
    ) {
      return false;
    }
  }
  return true;
}

function isExerciseCatalogGroup(group) {
  return (
    group !== null &&
    typeof group === "object" &&
    typeof group.id === "string" &&
    group.id.length > 0 &&
    typeof group.name === "string" &&
    group.name.length > 0 &&
    (group.shortName === null || typeof group.shortName === "string") &&
    Number.isSafeInteger(group.sortOrder)
  );
}

async function bootstrapExerciseCatalog() {
  exerciseCatalogReady = false;
  exerciseCatalogCanEdit = false;
  exerciseCatalogItems = [];
  exerciseCatalogGroups = [];
  exerciseCatalogSelectedId = null;
  closeExerciseCatalogEditor();
  refreshAppAvailability();
  showMessage(elements.exerciseCatalogMessage, "");
  showMessage(elements.exerciseCatalogSuccess, "");

  try {
    const payload = await requestJson("/api/modules/exercise-catalog");
    const items = payload?.catalog?.items;
    const groups = payload?.catalog?.trainingGroups;
    const edit = payload?.access?.edit;
    if (
      payload?.module?.moduleId !== "exercise_catalog" ||
      payload?.access?.view !== true ||
      typeof edit !== "boolean" ||
      !Array.isArray(items) ||
      !items.every(isExerciseCatalogItem) ||
      !Array.isArray(groups) ||
      !groups.every(isExerciseCatalogGroup)
    ) {
      throw new Error("INVALID_EXERCISE_CATALOG_CONTRACT");
    }

    exerciseCatalogReady = true;
    exerciseCatalogCanEdit = edit;
    exerciseCatalogItems = items.slice();
    exerciseCatalogGroups = groups.slice();
    initializeExerciseCatalogFilters();
    renderExerciseCatalogList();
  } catch (error) {
    showMessage(
      elements.exerciseCatalogMessage,
      error?.status === 403
        ? "Für den Übungskatalog fehlt die Berechtigung."
        : "Der Übungskatalog ist derzeit nicht verfügbar.",
    );
  }
  refreshAppAvailability();
}

function initializeExerciseCatalogFilters() {
  replaceSelectOptions(
    elements.exerciseCatalogCategoryFilter,
    [{ value: "", label: "Alle Kategorien" }].concat(
      EXERCISE_CATEGORIES.map((category) => ({
        value: category.key,
        label: category.label,
      })),
    ),
  );
  replaceSelectOptions(
    elements.exerciseCatalogCategory,
    EXERCISE_CATEGORIES.map((category) => ({
      value: category.key,
      label: category.label,
    })),
  );
  replaceSelectOptions(
    elements.exerciseCatalogGroupFilter,
    [{ value: "", label: "Alle Gruppen" }].concat(
      exerciseCatalogGroups.map((group) => ({
        value: group.id,
        label: group.shortName
          ? group.name + " (" + group.shortName + ")"
          : group.name,
      })),
    ),
  );
  renderExerciseCatalogGroupChecks([]);
  renderExerciseCatalogParameterSelect();
}

function replaceSelectOptions(select, options) {
  if (!select) return;
  const selected = select.value;
  select.replaceChildren();
  for (const value of options) {
    const option = document.createElement("option");
    option.value = value.value;
    option.textContent = value.label;
    select.append(option);
  }
  if (options.some((option) => option.value === selected)) select.value = selected;
}

function prepareExerciseCatalogView() {
  if (!exerciseCatalogReady) return;
  renderExerciseCatalogList();
  if (elements.exerciseCatalogNew) {
    elements.exerciseCatalogNew.hidden = !exerciseCatalogCanEdit;
    elements.exerciseCatalogNew.disabled = !exerciseCatalogCanEdit || exerciseCatalogBusy;
  }
}

function exerciseCatalogFilteredItems() {
  const query = (elements.exerciseCatalogSearch?.value || "").trim().toLocaleLowerCase("de");
  const category = elements.exerciseCatalogCategoryFilter?.value || "";
  const groupId = elements.exerciseCatalogGroupFilter?.value || "";
  const material = (elements.exerciseCatalogMaterialFilter?.value || "").trim().toLocaleLowerCase("de");
  const favorite = elements.exerciseCatalogFavoriteFilter?.value || "all";
  const status = elements.exerciseCatalogStatusFilter?.value || "active";
  const video = elements.exerciseCatalogVideoFilter?.value || "all";

  return exerciseCatalogItems.filter((item) => {
    if (category && item.categoryKey !== category) return false;
    if (groupId && !item.groupIds.includes(groupId)) return false;
    if (favorite === "favorite" && item.isFavorite !== true) return false;
    if (status === "active" && item.isActive !== true) return false;
    if (status === "archived" && item.isActive !== false) return false;
    if (video === "with" && !item.videoUrl) return false;
    if (video === "without" && item.videoUrl) return false;
    if (
      material &&
      !item.equipment.some((value) =>
        value.toLocaleLowerCase("de").includes(material),
      )
    ) return false;
    if (!query) return true;
    const haystack = [
      item.name,
      item.subcategory,
      item.goal,
      item.description,
      item.coachingCues,
      item.commonMistakes,
      ...item.equipment,
    ]
      .filter((value) => typeof value === "string")
      .join(" ")
      .toLocaleLowerCase("de");
    return haystack.includes(query);
  });
}

function renderExerciseCatalogList() {
  const container = elements.exerciseCatalogList;
  if (!container) return;
  container.replaceChildren();
  const items = exerciseCatalogFilteredItems();
  if (elements.exerciseCatalogCount) {
    elements.exerciseCatalogCount.textContent =
      String(items.length) + " / " + String(exerciseCatalogItems.length);
  }

  if (items.length === 0) {
    const empty = document.createElement("div");
    empty.className = "exercise-catalog-empty";
    empty.textContent =
      exerciseCatalogItems.length === 0
        ? "Noch keine Übungen im Katalog."
        : "Keine Übungen entsprechen den aktuellen Filtern.";
    container.append(empty);
    return;
  }

  for (const item of items) {
    const row = document.createElement("article");
    row.className = "exercise-catalog-row";
    row.dataset.active = String(item.isActive);

    const main = document.createElement("button");
    main.type = "button";
    main.className = "exercise-catalog-row__main";
    main.dataset.exerciseCatalogOpen = item.id;

    const title = document.createElement("div");
    title.className = "exercise-catalog-row__title";
    const strong = document.createElement("strong");
    strong.textContent = item.name;
    title.append(strong);
    if (!item.isActive) {
      const archived = document.createElement("span");
      archived.className = "exercise-catalog-badge exercise-catalog-badge--archived";
      archived.textContent = "Archiv";
      title.append(archived);
    }

    const meta = document.createElement("div");
    meta.className = "exercise-catalog-row__meta";
    meta.textContent = [
      categoryLabel(item.categoryKey),
      item.subcategory,
      item.goal,
    ].filter(Boolean).join(" · ");

    const info = document.createElement("div");
    info.className = "exercise-catalog-row__info";
    const groupNames = item.groupIds
      .map((id) => exerciseCatalogGroups.find((group) => group.id === id)?.shortName ||
        exerciseCatalogGroups.find((group) => group.id === id)?.name)
      .filter(Boolean);
    info.textContent = [
      item.equipment.length > 0 ? item.equipment.join(", ") : null,
      groupNames.length > 0 ? groupNames.join(", ") : null,
      item.parameters.length > 0 ? String(item.parameters.length) + " Parameter" : null,
      item.videoUrl ? "Link" : null,
    ].filter(Boolean).join(" · ") || "Keine Zusatzangaben";

    main.append(title, meta, info);

    const favorite = document.createElement("button");
    favorite.type = "button";
    favorite.className = "exercise-catalog-favorite";
    favorite.dataset.exerciseCatalogFavorite = item.id;
    favorite.setAttribute("aria-pressed", String(item.isFavorite));
    favorite.setAttribute(
      "aria-label",
      item.isFavorite ? "Favorit entfernen" : "Als Favorit markieren",
    );
    favorite.textContent = item.isFavorite ? "★" : "☆";

    row.append(main, favorite);
    container.append(row);
  }
}

async function openExerciseCatalogItem(id) {
  if (!exerciseCatalogReady || exerciseCatalogBusy) return;
  setExerciseCatalogBusy(true);
  showMessage(elements.exerciseCatalogMessage, "");
  showMessage(elements.exerciseCatalogSuccess, "");
  try {
    const payload = await requestJson(
      "/api/modules/exercise-catalog/" + encodeURIComponent(id),
    );
    if (!isExerciseCatalogItem(payload?.item)) {
      throw new Error("INVALID_EXERCISE_CATALOG_ITEM");
    }
    exerciseCatalogSelectedId = payload.item.id;
    populateExerciseCatalogEditor(payload.item);
  } catch (error) {
    showMessage(
      elements.exerciseCatalogMessage,
      error?.status === 404
        ? "Die Übung wurde nicht gefunden."
        : "Die Übung konnte nicht geladen werden.",
    );
  } finally {
    setExerciseCatalogBusy(false);
  }
}

function newExerciseCatalogItem() {
  if (!exerciseCatalogCanEdit || exerciseCatalogBusy) return;
  exerciseCatalogSelectedId = null;
  populateExerciseCatalogEditor({
    id: "",
    name: "",
    categoryKey: "warmup",
    subcategory: null,
    goal: null,
    description: null,
    coachingCues: null,
    commonMistakes: null,
    equipment: [],
    videoUrl: null,
    groupIds: [],
    parameters: [],
    isActive: true,
    isFavorite: false,
  });
}

function populateExerciseCatalogEditor(item) {
  const editable = exerciseCatalogCanEdit && item.isActive;
  if (elements.exerciseCatalogEditor) elements.exerciseCatalogEditor.hidden = false;
  if (elements.exerciseCatalogEditorEyebrow) {
    elements.exerciseCatalogEditorEyebrow.textContent =
      item.id.length === 0 ? "Neue Übung" : item.isActive ? "Übung" : "Archiv";
  }
  if (elements.exerciseCatalogEditorTitle) {
    elements.exerciseCatalogEditorTitle.textContent =
      item.id.length === 0 ? "Übung anlegen" : item.name;
  }

  if (elements.exerciseCatalogName) elements.exerciseCatalogName.value = item.name;
  if (elements.exerciseCatalogCategory) elements.exerciseCatalogCategory.value = item.categoryKey;
  if (elements.exerciseCatalogSubcategory) elements.exerciseCatalogSubcategory.value = item.subcategory || "";
  if (elements.exerciseCatalogGoal) elements.exerciseCatalogGoal.value = item.goal || "";
  if (elements.exerciseCatalogDescription) elements.exerciseCatalogDescription.value = item.description || "";
  if (elements.exerciseCatalogCues) elements.exerciseCatalogCues.value = item.coachingCues || "";
  if (elements.exerciseCatalogMistakes) elements.exerciseCatalogMistakes.value = item.commonMistakes || "";
  if (elements.exerciseCatalogEquipment) elements.exerciseCatalogEquipment.value = item.equipment.join(", ");
  if (elements.exerciseCatalogVideoUrl) elements.exerciseCatalogVideoUrl.value = item.videoUrl || "";

  renderExerciseCatalogGroupChecks(item.groupIds);
  exerciseCatalogParameterDrafts = item.parameters.map((parameter) => ({ ...parameter }));
  renderExerciseCatalogParameters();

  for (const control of elements.exerciseCatalogForm?.querySelectorAll("input, select, textarea") || []) {
    control.disabled = !editable;
  }
  for (const control of elements.exerciseCatalogParameters?.querySelectorAll("button") || []) {
    control.disabled = !editable;
  }
  if (elements.exerciseCatalogSave) {
    elements.exerciseCatalogSave.hidden = !editable;
    elements.exerciseCatalogSave.disabled = !editable || exerciseCatalogBusy;
  }
  if (elements.exerciseCatalogDeactivate) {
    elements.exerciseCatalogDeactivate.hidden =
      !exerciseCatalogCanEdit || item.id.length === 0 || !item.isActive;
    elements.exerciseCatalogDeactivate.disabled = exerciseCatalogBusy;
  }
  if (elements.exerciseCatalogReadonly) {
    elements.exerciseCatalogReadonly.hidden = editable;
  }
  if (elements.exerciseCatalogParameterAdd) {
    elements.exerciseCatalogParameterAdd.disabled = !editable || exerciseCatalogBusy;
  }
  if (elements.exerciseCatalogParameterSelect) {
    elements.exerciseCatalogParameterSelect.disabled = !editable || exerciseCatalogBusy;
  }

  if (elements.exerciseCatalogLinkRow) {
    elements.exerciseCatalogLinkRow.hidden = !item.videoUrl;
  }
  if (elements.exerciseCatalogLink) {
    if (item.videoUrl) {
      elements.exerciseCatalogLink.href = item.videoUrl;
    } else {
      elements.exerciseCatalogLink.removeAttribute("href");
    }
  }

  elements.exerciseCatalogEditor?.scrollIntoView({ block: "start", behavior: "smooth" });
}

function closeExerciseCatalogEditor() {
  exerciseCatalogSelectedId = null;
  exerciseCatalogParameterDrafts = [];
  if (elements.exerciseCatalogEditor) elements.exerciseCatalogEditor.hidden = true;
  showMessage(elements.exerciseCatalogSuccess, "");
}

function renderExerciseCatalogGroupChecks(selectedIds) {
  const container = elements.exerciseCatalogGroups;
  if (!container) return;
  container.replaceChildren();
  if (exerciseCatalogGroups.length === 0) {
    const empty = document.createElement("span");
    empty.className = "exercise-catalog-readonly";
    empty.textContent = "Keine aktiven Trainingsgruppen vorhanden.";
    container.append(empty);
    return;
  }
  for (const group of exerciseCatalogGroups) {
    const label = document.createElement("label");
    label.className = "exercise-catalog-check";
    const input = document.createElement("input");
    input.type = "checkbox";
    input.value = group.id;
    input.checked = selectedIds.includes(group.id);
    input.dataset.exerciseCatalogGroup = group.id;
    const text = document.createElement("span");
    text.textContent = group.shortName
      ? group.name + " (" + group.shortName + ")"
      : group.name;
    label.append(input, text);
    container.append(label);
  }
}

function renderExerciseCatalogParameterSelect() {
  const select = elements.exerciseCatalogParameterSelect;
  if (!select) return;
  const selected = select.value;
  const used = new Set(exerciseCatalogParameterDrafts.map((parameter) => parameter.key));
  const available = EXERCISE_PARAMETER_META.filter((parameter) => !used.has(parameter.key));
  replaceSelectOptions(
    select,
    available.length === 0
      ? [{ value: "", label: "Alle Parameter verwendet" }]
      : available.map((parameter) => ({
          value: parameter.key,
          label: parameter.label,
        })),
  );
  if (available.some((parameter) => parameter.key === selected)) select.value = selected;
  if (elements.exerciseCatalogParameterAdd) {
    elements.exerciseCatalogParameterAdd.disabled =
      !exerciseCatalogCanEdit || available.length === 0 || exerciseCatalogBusy;
  }
}

function addExerciseCatalogParameter() {
  if (!exerciseCatalogCanEdit || exerciseCatalogBusy) return;
  syncExerciseCatalogParameterDraftsFromDom();
  const key = elements.exerciseCatalogParameterSelect?.value || "";
  const meta = parameterMeta(key);
  if (!meta || exerciseCatalogParameterDrafts.some((parameter) => parameter.key === key)) return;
  exerciseCatalogParameterDrafts.push({
    key: meta.key,
    label: meta.label,
    unit: meta.unit,
    inputType: meta.inputType,
    defaultValue: null,
    minValue: null,
    maxValue: null,
    stepValue: null,
    isRequired: false,
    sortOrder: (exerciseCatalogParameterDrafts.length + 1) * 10,
  });
  renderExerciseCatalogParameters();
}

function renderExerciseCatalogParameters() {
  const container = elements.exerciseCatalogParameters;
  if (!container) return;
  container.replaceChildren();

  if (exerciseCatalogParameterDrafts.length === 0) {
    const empty = document.createElement("div");
    empty.className = "exercise-catalog-empty";
    empty.textContent = "Keine Planungsparameter ausgewählt.";
    container.append(empty);
    renderExerciseCatalogParameterSelect();
    return;
  }

  exerciseCatalogParameterDrafts.forEach((parameter, index) => {
    const row = document.createElement("article");
    row.className = "exercise-catalog-parameter";
    row.dataset.exerciseCatalogParameter = parameter.key;

    const top = document.createElement("div");
    top.className = "exercise-catalog-parameter__top";
    const title = document.createElement("strong");
    title.textContent =
      parameter.label + (parameter.unit ? " (" + parameter.unit + ")" : "");
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "button button--secondary exercise-catalog-remove";
    remove.textContent = "Entfernen";
    remove.dataset.exerciseCatalogParameterRemove = parameter.key;
    remove.hidden = !exerciseCatalogCanEdit;
    top.append(title, remove);

    const fields = document.createElement("div");
    fields.className = "exercise-catalog-parameter__fields";

    fields.append(
      parameterInput("Standard", "defaultValue", parameter.defaultValue, parameter.inputType),
    );

    if (parameter.inputType === "number") {
      fields.append(
        parameterInput("Minimum", "minValue", parameter.minValue, "number"),
        parameterInput("Maximum", "maxValue", parameter.maxValue, "number"),
        parameterInput("Schritt", "stepValue", parameter.stepValue, "number"),
      );
    }

    const requiredLabel = document.createElement("label");
    requiredLabel.className = "exercise-catalog-parameter__required";
    const required = document.createElement("input");
    required.type = "checkbox";
    required.checked = parameter.isRequired;
    required.dataset.exerciseCatalogParameterField = "isRequired";
    required.dataset.exerciseCatalogParameterIndex = String(index);
    const requiredText = document.createElement("span");
    requiredText.textContent = "Pflichtfeld";
    requiredLabel.append(required, requiredText);
    fields.append(requiredLabel);

    row.append(top, fields);
    container.append(row);
  });

  for (const control of container.querySelectorAll("input, button")) {
    control.disabled = !exerciseCatalogCanEdit || exerciseCatalogBusy;
  }
  renderExerciseCatalogParameterSelect();
}

function parameterInput(labelText, field, value, inputType) {
  const label = document.createElement("label");
  label.textContent = labelText;
  const input = document.createElement("input");
  input.type = inputType === "number" ? "number" : "text";
  if (inputType === "number") input.step = "any";
  input.value = value === null ? "" : String(value);
  input.dataset.exerciseCatalogParameterField = field;
  label.append(input);
  return label;
}

function syncExerciseCatalogParameterDraftsFromDom() {
  const rows = [...(elements.exerciseCatalogParameters?.querySelectorAll("[data-exercise-catalog-parameter]") || [])];
  exerciseCatalogParameterDrafts = rows.map((row, index) => {
    const key = row.dataset.exerciseCatalogParameter || "";
    const previous = exerciseCatalogParameterDrafts.find((parameter) => parameter.key === key);
    const meta = parameterMeta(key);
    if (!previous || !meta) throw new Error("INVALID_PARAMETER_STATE");
    const read = (field) =>
      row.querySelector("[data-exercise-catalog-parameter-field='" + field + "']");
    const defaultInput = read("defaultValue");
    const minInput = read("minValue");
    const maxInput = read("maxValue");
    const stepInput = read("stepValue");
    const requiredInput = read("isRequired");
    return {
      ...previous,
      label: previous.label || meta.label,
      unit: previous.unit || meta.unit,
      inputType: previous.inputType || meta.inputType,
      defaultValue: defaultInput?.value.trim() || null,
      minValue: numericInputValue(minInput),
      maxValue: numericInputValue(maxInput),
      stepValue: numericInputValue(stepInput),
      isRequired: requiredInput?.checked === true,
      sortOrder: (index + 1) * 10,
    };
  });
}

function numericInputValue(input) {
  if (!input || input.value.trim() === "") return null;
  const value = Number(input.value);
  return Number.isFinite(value) ? value : null;
}

function parseExerciseEquipment() {
  const parts = (elements.exerciseCatalogEquipment?.value || "")
    .split(/[;,\n]/)
    .map((value) => value.trim())
    .filter(Boolean);
  const result = [];
  const seen = new Set();
  for (const value of parts) {
    const folded = value.toLocaleLowerCase("de");
    if (!seen.has(folded)) {
      seen.add(folded);
      result.push(value);
    }
  }
  return result;
}

function exerciseCatalogFormPayload() {
  syncExerciseCatalogParameterDraftsFromDom();
  return {
    name: elements.exerciseCatalogName?.value || "",
    categoryKey: elements.exerciseCatalogCategory?.value || "",
    subcategory: elements.exerciseCatalogSubcategory?.value || null,
    goal: elements.exerciseCatalogGoal?.value || null,
    description: elements.exerciseCatalogDescription?.value || null,
    coachingCues: elements.exerciseCatalogCues?.value || null,
    commonMistakes: elements.exerciseCatalogMistakes?.value || null,
    equipment: parseExerciseEquipment(),
    videoUrl: elements.exerciseCatalogVideoUrl?.value || null,
    groupIds: [...(elements.exerciseCatalogGroups?.querySelectorAll("input[type='checkbox']:checked") || [])].map(
      (input) => input.value,
    ),
    parameters: exerciseCatalogParameterDrafts.map((parameter) => ({
      key: parameter.key,
      label: parameter.label,
      unit: parameter.unit,
      inputType: parameter.inputType,
      defaultValue: parameter.defaultValue,
      minValue: parameter.inputType === "number" ? parameter.minValue : null,
      maxValue: parameter.inputType === "number" ? parameter.maxValue : null,
      stepValue: parameter.inputType === "number" ? parameter.stepValue : null,
      isRequired: parameter.isRequired,
      sortOrder: parameter.sortOrder,
    })),
  };
}

async function saveExerciseCatalogItem(event) {
  event.preventDefault();
  if (!exerciseCatalogCanEdit || exerciseCatalogBusy) return;
  setExerciseCatalogBusy(true);
  showMessage(elements.exerciseCatalogMessage, "");
  showMessage(elements.exerciseCatalogSuccess, "");
  try {
    const body = exerciseCatalogFormPayload();
    const path = exerciseCatalogSelectedId
      ? "/api/modules/exercise-catalog/" +
        encodeURIComponent(exerciseCatalogSelectedId) +
        "/update"
      : "/api/modules/exercise-catalog";
    const payload = await requestJson(path, {
      method: "POST",
      body: JSON.stringify(body),
    });
    if (!isExerciseCatalogItem(payload?.item)) {
      throw new Error("INVALID_EXERCISE_CATALOG_SAVE");
    }
    const savedId = payload.item.id;
    await reloadExerciseCatalog();
    const saved = exerciseCatalogItems.find((item) => item.id === savedId);
    if (saved) {
      exerciseCatalogSelectedId = saved.id;
      populateExerciseCatalogEditor(saved);
    }
    showMessage(elements.exerciseCatalogSuccess, "Übung wurde gespeichert.");
  } catch (error) {
    showMessage(
      elements.exerciseCatalogMessage,
      error?.status === 409
        ? "Eine Übung mit diesem Namen ist bereits vorhanden."
        : error?.status === 404
          ? "Eine ausgewählte Trainingsgruppe ist nicht mehr verfügbar."
          : "Die Übung konnte nicht gespeichert werden. Bitte Eingaben prüfen.",
    );
  } finally {
    setExerciseCatalogBusy(false);
  }
}

async function deactivateExerciseCatalogItem() {
  if (!exerciseCatalogCanEdit || !exerciseCatalogSelectedId || exerciseCatalogBusy) return;
  const item = exerciseCatalogItems.find((candidate) => candidate.id === exerciseCatalogSelectedId);
  if (!item || !item.isActive) return;
  if (!window.confirm("Übung „" + item.name + "“ deaktivieren? Sie bleibt im Archiv erhalten.")) return;

  setExerciseCatalogBusy(true);
  showMessage(elements.exerciseCatalogMessage, "");
  showMessage(elements.exerciseCatalogSuccess, "");
  try {
    await requestJson(
      "/api/modules/exercise-catalog/" +
        encodeURIComponent(exerciseCatalogSelectedId) +
        "/deactivate",
      { method: "POST" },
    );
    closeExerciseCatalogEditor();
    await reloadExerciseCatalog();
    showMessage(elements.exerciseCatalogSuccess, "Übung wurde ins Archiv verschoben.");
  } catch {
    showMessage(elements.exerciseCatalogMessage, "Die Übung konnte nicht deaktiviert werden.");
  } finally {
    setExerciseCatalogBusy(false);
  }
}

async function toggleExerciseCatalogFavorite(id) {
  if (!exerciseCatalogReady || exerciseCatalogBusy) return;
  const item = exerciseCatalogItems.find((candidate) => candidate.id === id);
  if (!item) return;
  setExerciseCatalogBusy(true);
  try {
    const payload = await requestJson(
      "/api/modules/exercise-catalog/" + encodeURIComponent(id) + "/favorite",
      { method: item.isFavorite ? "DELETE" : "PUT" },
    );
    if (!isExerciseCatalogItem(payload?.item)) {
      throw new Error("INVALID_EXERCISE_CATALOG_FAVORITE");
    }
    exerciseCatalogItems = exerciseCatalogItems.map((candidate) =>
      candidate.id === id ? payload.item : candidate,
    );
    renderExerciseCatalogList();
  } catch {
    showMessage(elements.exerciseCatalogMessage, "Favorit konnte nicht geändert werden.");
  } finally {
    setExerciseCatalogBusy(false);
  }
}

async function reloadExerciseCatalog() {
  const payload = await requestJson("/api/modules/exercise-catalog");
  if (
    payload?.module?.moduleId !== "exercise_catalog" ||
    payload?.access?.view !== true ||
    typeof payload?.access?.edit !== "boolean" ||
    !Array.isArray(payload?.catalog?.items) ||
    !payload.catalog.items.every(isExerciseCatalogItem) ||
    !Array.isArray(payload?.catalog?.trainingGroups) ||
    !payload.catalog.trainingGroups.every(isExerciseCatalogGroup)
  ) {
    throw new Error("INVALID_EXERCISE_CATALOG_RELOAD");
  }
  exerciseCatalogCanEdit = payload.access.edit;
  exerciseCatalogItems = payload.catalog.items.slice();
  exerciseCatalogGroups = payload.catalog.trainingGroups.slice();
  initializeExerciseCatalogFilters();
  renderExerciseCatalogList();
  refreshAppAvailability();
}

function setExerciseCatalogBusy(next) {
  exerciseCatalogBusy = next;
  if (elements.exerciseCatalogNew) {
    elements.exerciseCatalogNew.disabled = next || !exerciseCatalogCanEdit;
  }
  if (elements.exerciseCatalogSave) elements.exerciseCatalogSave.disabled = next;
  if (elements.exerciseCatalogDeactivate) elements.exerciseCatalogDeactivate.disabled = next;
  if (elements.exerciseCatalogParameterAdd) {
    elements.exerciseCatalogParameterAdd.disabled = next || !exerciseCatalogCanEdit;
  }
  if (elements.exerciseCatalogParameterSelect) {
    elements.exerciseCatalogParameterSelect.disabled = next || !exerciseCatalogCanEdit;
  }
  for (const control of elements.exerciseCatalogParameters?.querySelectorAll("input, button") || []) {
    control.disabled = next || !exerciseCatalogCanEdit;
  }
}

function handleExerciseCatalogListClick(event) {
  const favorite = event.target.closest("[data-exercise-catalog-favorite]");
  if (favorite) {
    void toggleExerciseCatalogFavorite(favorite.dataset.exerciseCatalogFavorite || "");
    return;
  }
  const open = event.target.closest("[data-exercise-catalog-open]");
  if (open) {
    void openExerciseCatalogItem(open.dataset.exerciseCatalogOpen || "");
  }
}

function handleExerciseCatalogParameterClick(event) {
  const remove = event.target.closest("[data-exercise-catalog-parameter-remove]");
  if (
    !remove ||
    !exerciseCatalogCanEdit ||
    exerciseCatalogBusy ||
    remove.disabled
  ) return;
  syncExerciseCatalogParameterDraftsFromDom();
  const key = remove.dataset.exerciseCatalogParameterRemove || "";
  exerciseCatalogParameterDrafts = exerciseCatalogParameterDrafts.filter(
    (parameter) => parameter.key !== key,
  );
  renderExerciseCatalogParameters();
}

for (const control of [
  elements.exerciseCatalogSearch,
  elements.exerciseCatalogCategoryFilter,
  elements.exerciseCatalogGroupFilter,
  elements.exerciseCatalogMaterialFilter,
  elements.exerciseCatalogFavoriteFilter,
  elements.exerciseCatalogStatusFilter,
  elements.exerciseCatalogVideoFilter,
]) {
  control?.addEventListener("input", renderExerciseCatalogList);
  control?.addEventListener("change", renderExerciseCatalogList);
}
elements.exerciseCatalogList?.addEventListener("click", handleExerciseCatalogListClick);
elements.exerciseCatalogNew?.addEventListener("click", newExerciseCatalogItem);
elements.exerciseCatalogClose?.addEventListener("click", closeExerciseCatalogEditor);
elements.exerciseCatalogForm?.addEventListener("submit", (event) => void saveExerciseCatalogItem(event));
elements.exerciseCatalogDeactivate?.addEventListener("click", () => void deactivateExerciseCatalogItem());
elements.exerciseCatalogParameterAdd?.addEventListener("click", addExerciseCatalogParameter);
elements.exerciseCatalogParameters?.addEventListener("click", handleExerciseCatalogParameterClick);
`;
