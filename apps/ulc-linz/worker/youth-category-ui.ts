export const ULC_YOUTH_CATEGORY_HTML = `
  <dialog id="youth-category-dialog" class="u12-details-dialog youth-category-dialog" aria-labelledby="youth-category-dialog-title">
    <header class="u12-details-header youth-category-header">
      <div>
        <h2 id="youth-category-dialog-title">Kategorien · <span id="youth-category-area-title">U12</span></h2>
      </div>
      <button type="button" class="button button--secondary" id="youth-category-close" aria-label="Kategorien schließen">✕</button>
    </header>
    <div class="youth-category-body">
      <p class="message message--error" id="youth-category-error" role="alert" hidden></p>
      <p class="message message--success" id="youth-category-success" role="status" hidden></p>
      <form id="youth-category-create" class="youth-category-create" hidden>
        <label class="youth-category-visually-hidden" for="youth-category-new-name">Neue Kategorie</label>
        <div class="youth-category-create-row">
          <input id="youth-category-new-name" maxlength="120" required placeholder="Kategorie hinzufügen" autocomplete="off"/>
          <button type="submit" class="button button--primary" aria-label="Kategorie hinzufügen" title="Kategorie hinzufügen">＋</button>
        </div>
      </form>
      <div class="youth-category-toolbar">
        <small id="youth-category-count"></small>
        <label class="youth-category-show-inactive">
          <input type="checkbox" id="youth-category-inactive"/> Inaktive anzeigen
        </label>
      </div>
      <div id="youth-category-list" class="youth-category-list" role="list"></div>
    </div>
  </dialog>
`;

export const ULC_YOUTH_CATEGORY_CSS = `
.youth-category-dialog { box-sizing:border-box; width:min(96vw,590px); max-width:590px; max-height:calc(100dvh - 24px); padding:0; overflow-y:auto; }
.youth-category-header { position:sticky; top:0; z-index:4; background:var(--surface,#fff); padding:12px; border-bottom:1px solid var(--border); }
.youth-category-header h2 { margin:0; font-size:1.04rem; }
.youth-category-header small { color:var(--secondary); }
.youth-category-header button { min-width:42px; min-height:42px; }
.youth-category-body { padding:14px 12px 18px; display:grid; gap:12px; }
.youth-category-create { display:grid; gap:6px; }
.youth-category-create label { font-weight:700; }
.youth-category-create-row { display:flex; gap:8px; flex-wrap:wrap; }
.youth-category-create-row input, .youth-category-edit input { flex:1 1 180px; min-width:0; min-height:42px; padding:8px 10px; border:1px solid var(--border-strong); border-radius:9px; background:var(--card); color:var(--text); }
.youth-category-create-row button { min-height:42px; }
.youth-category-toolbar { display:flex; align-items:center; justify-content:space-between; gap:12px; flex-wrap:wrap; }
.youth-category-toolbar small { color:var(--secondary); }
.youth-category-show-inactive { display:flex; align-items:center; gap:7px; font-size:.83rem; }
.youth-category-show-inactive input { width:20px; height:20px; accent-color:var(--accent); }
.youth-category-list { display:grid; gap:7px; }
.youth-category-item { border:1px solid var(--border); border-radius:10px; padding:10px; display:grid; gap:7px; }
.youth-category-item[data-inactive="true"] { opacity:.7; }
.youth-category-item__head { display:flex; align-items:center; justify-content:space-between; gap:8px; flex-wrap:wrap; }
.youth-category-item__name { min-width:0; overflow-wrap:anywhere; font-weight:700; }
.youth-category-item__status { font-size:.74rem; color:var(--secondary); }
.youth-category-item__actions, .youth-category-edit { display:flex; align-items:center; flex-wrap:wrap; gap:8px; }
 .youth-category-item__actions button, .youth-category-edit button { min-height:38px; padding:6px 10px; font-size:.8rem; }
/* Mobile-first: one category per dense line, full-size touch targets, no wide action bars. */
.youth-category-dialog { box-sizing:border-box; width:min(calc(100vw - 12px),520px); max-width:520px; max-height:calc(100dvh - 12px); border-radius:12px; }
.youth-category-header { padding:7px 10px; min-height:46px; gap:7px; }
.youth-category-header h2 { font-size:1rem; line-height:1.2; }
.youth-category-header button { min-width:40px; min-height:40px; padding:0 8px; }
.youth-category-body { padding:8px 9px 10px; gap:7px; }
.youth-category-visually-hidden { position:absolute; width:1px; height:1px; padding:0; margin:-1px; overflow:hidden; clip:rect(0,0,0,0); white-space:nowrap; border:0; }
.youth-category-create { gap:0; }
.youth-category-create-row { display:grid; grid-template-columns:minmax(0,1fr) 42px; gap:5px; }
.youth-category-create-row input { min-height:40px; padding:5px 8px; flex:auto; width:100%; box-sizing:border-box; }
.youth-category-create-row button { min-height:42px; width:42px; padding:0; font-size:1.4rem; }
.youth-category-toolbar { gap:7px; flex-wrap:nowrap; min-height:30px; }
.youth-category-show-inactive { white-space:nowrap; font-size:.75rem; }
.youth-category-show-inactive input { width:18px; height:18px; margin:0; }
.youth-category-list { gap:3px; }
.youth-category-item { min-width:0; padding:3px 5px; gap:3px; border-radius:8px; }
.youth-category-item__head { gap:6px; flex-wrap:nowrap; min-height:40px; }
.youth-category-item__name { flex:1 1 auto; font-size:.83rem; font-weight:650; }
.youth-category-item__status { font-size:.68rem; flex:0 0 auto; }
.youth-category-item__actions { flex:0 0 auto; flex-wrap:nowrap; gap:3px; }
.youth-category-item__actions button { min-width:40px; width:40px; min-height:40px; padding:0; font-size:1rem; }
.youth-category-edit { display:grid; grid-template-columns:minmax(0,1fr) auto auto; gap:4px; flex-wrap:nowrap; }
.youth-category-edit input { flex:auto; min-width:0; min-height:40px; padding:5px 8px; box-sizing:border-box; width:100%; }
.youth-category-edit button { min-height:40px; padding:0 8px; font-size:.75rem; }
@media (max-width: 365px) {
  .youth-category-item__name { font-size:.78rem; }
  .youth-category-item__actions button { min-width:38px; width:38px; }
  .youth-category-edit button { padding:0 6px; font-size:.69rem; }
}
`;

export const ULC_YOUTH_CATEGORY_SCRIPT = `
const youthCategoryUi = {
  dialog: document.querySelector("#youth-category-dialog"),
  close: document.querySelector("#youth-category-close"),
  areaTitle: document.querySelector("#youth-category-area-title"),
  error: document.querySelector("#youth-category-error"),
  success: document.querySelector("#youth-category-success"),
  create: document.querySelector("#youth-category-create"),
  newName: document.querySelector("#youth-category-new-name"),
  inactive: document.querySelector("#youth-category-inactive"),
  count: document.querySelector("#youth-category-count"),
  list: document.querySelector("#youth-category-list"),
};
let youthCategoryCatalog = [];
let youthCategoryArea = "u12";
let youthCategoryCanManage = false;
let youthCategoryBusy = false;
let youthCategoryShowInactive = false;
let youthCategoryEditCode = "";

function validYouthCategoryResponse(payload) {
  return Array.isArray(payload?.categories) && typeof payload?.canManage === "boolean" &&
    payload.categories.length <= 200 &&
    payload.categories.every((x) => x && typeof x.code === "string" &&
      /^[a-z][a-z0-9_]{0,79}$/.test(x.code) &&
      typeof x.label === "string" && x.label.length > 0 &&
      x.label.length <= 120 && x.label.trim() === x.label &&
      typeof x.isActive === "boolean" && Number.isSafeInteger(x.revision) &&
      x.revision > 0) &&
    new Set(payload.categories.map((x) => x.code)).size === payload.categories.length;
}

async function refreshYouthCategoryCatalog(area = "u12") {
  if (!["u12", "u14", "kindertraining"].includes(area)) throw new Error("INVALID_TRAINING_AREA");
  const payload = await requestJson("/api/modules/youth-categories?area=" +
    encodeURIComponent(area));
  if (!validYouthCategoryResponse(payload)) throw new Error("YOUTH_CATEGORY_INVALID_RESPONSE");
  if (area === "u12" && typeof updateU12CategoryCatalog === "function") {
    updateU12CategoryCatalog(payload.categories);
  }
  if (area === youthCategoryArea) {
    youthCategoryCatalog = payload.categories;
    youthCategoryCanManage = payload.canManage;
    renderYouthCategoryManagement();
  }
  return payload.categories;
}

function renderYouthCategoryManagement() {
  if (!youthCategoryUi.list) return;
  youthCategoryUi.list.replaceChildren();
  youthCategoryUi.create.hidden = !youthCategoryCanManage;
  youthCategoryUi.newName.disabled = youthCategoryBusy;
  youthCategoryUi.create.querySelector("button").disabled = youthCategoryBusy;
  youthCategoryUi.count.textContent = youthCategoryCatalog.filter((item) => item.isActive).length +
    " aktive Kategorien";
  for (const category of youthCategoryCatalog) {
    if (!category.isActive && !youthCategoryShowInactive) continue;
    const item = document.createElement("div");
    item.className = "youth-category-item";
    item.setAttribute("role", "listitem");
    item.dataset.inactive = String(!category.isActive);
    const head = document.createElement("div");
    head.className = "youth-category-item__head";
    const name = document.createElement("strong");
    name.className = "youth-category-item__name";
    name.textContent = category.label;
    const status = document.createElement("span");
    status.className = "youth-category-item__status";
    status.textContent = category.isActive ? "" : "Inaktiv";
    head.append(name, status);
    item.append(head);

    if (youthCategoryCanManage) {
      if (youthCategoryEditCode === category.code) {
        const form = document.createElement("form");
        form.className = "youth-category-edit";
        form.dataset.youthCategoryEdit = category.code;
        const input = document.createElement("input");
        input.required = true;
        input.maxLength = 120;
        input.value = category.label;
        input.dataset.youthCategoryName = category.code;
        input.setAttribute("aria-label", "Kategorie umbenennen");
        const save = document.createElement("button");
        save.type = "submit";
        save.className = "button button--primary";
        save.textContent = "Speichern";
        const cancel = document.createElement("button");
        cancel.type = "button";
        cancel.className = "button button--secondary";
        cancel.dataset.youthCategoryCancel = category.code;
        cancel.textContent = "Abbrechen";
        form.append(input, save, cancel);
        item.append(form);
      } else {
        const actions = document.createElement("div");
        actions.className = "youth-category-item__actions";
        const rename = document.createElement("button");
        rename.type = "button";
        rename.className = "button button--secondary";
        rename.dataset.youthCategoryRename = category.code;
        rename.textContent = "✎";
        rename.setAttribute("aria-label", "Umbenennen");
        rename.title = "Umbenennen";
        const toggle = document.createElement("button");
        toggle.type = "button";
        toggle.className = "button button--secondary";
        toggle.dataset.youthCategoryToggle = category.code;
        toggle.textContent = category.isActive ? "⊘" : "↺";
        toggle.setAttribute("aria-label", category.isActive ? "Deaktivieren" : "Aktivieren");
        toggle.title = category.isActive ? "Deaktivieren" : "Aktivieren";
        actions.append(rename, toggle);
        head.append(actions);
      }
    }
    for (const button of item.querySelectorAll("button")) button.disabled = youthCategoryBusy;
    youthCategoryUi.list.append(item);
  }
  if (youthCategoryUi.list.children.length === 0) {
    const empty = document.createElement("small");
    empty.textContent = "Keine Kategorien zur Anzeige.";
    youthCategoryUi.list.append(empty);
  }
}

async function openYouthCategoryManagement(area = "u12") {
  if (!["u12", "u14", "kindertraining"].includes(area)) return;
  if (!youthCategoryUi.dialog || youthCategoryUi.dialog.open) return;
  youthCategoryArea = area;
  youthCategoryCatalog = [];
  youthCategoryCanManage = false;
  youthCategoryEditCode = "";
  youthCategoryShowInactive = false;
  if (youthCategoryUi.inactive) youthCategoryUi.inactive.checked = false;
  if (youthCategoryUi.areaTitle) {
    youthCategoryUi.areaTitle.textContent =
      { u12: "U12", u14: "U14", kindertraining: "Kindertraining" }[area];
  }
  showMessage(youthCategoryUi.error, "");
  showMessage(youthCategoryUi.success, "");
  renderYouthCategoryManagement();
  youthCategoryUi.dialog.showModal();
  try {
    await refreshYouthCategoryCatalog(area);
  } catch {
    if (area === youthCategoryArea && youthCategoryUi.dialog.open) {
      showMessage(youthCategoryUi.error, "Kategorien konnten nicht geladen werden.");
    }
  }
}

async function saveYouthCategoryChange(method, data, successText) {
  if (!youthCategoryCanManage || youthCategoryBusy) return;
  youthCategoryBusy = true;
  showMessage(youthCategoryUi.error, "");
  showMessage(youthCategoryUi.success, "");
  renderYouthCategoryManagement();
  try {
    await requestJson("/api/modules/youth-categories?area=" +
      encodeURIComponent(youthCategoryArea), {
      method, body: JSON.stringify(data),
    });
    youthCategoryEditCode = "";
    await refreshYouthCategoryCatalog(youthCategoryArea);
    showMessage(youthCategoryUi.success, successText);
  } catch (error) {
    if (error?.status === 409) {
      try { await refreshYouthCategoryCatalog(youthCategoryArea); } catch {}
      showMessage(youthCategoryUi.error,
        "Die Kategorie wurde inzwischen verändert oder existiert bereits. Liste neu geladen.");
    } else {
      showMessage(youthCategoryUi.error, "Die Kategorie konnte nicht gespeichert werden.");
    }
  } finally {
    youthCategoryBusy = false;
    renderYouthCategoryManagement();
  }
}

youthCategoryUi.close?.addEventListener("click", () => youthCategoryUi.dialog?.close());
youthCategoryUi.inactive?.addEventListener("change", (event) => {
  youthCategoryShowInactive = event.target.checked === true;
  renderYouthCategoryManagement();
});
youthCategoryUi.create?.addEventListener("submit", (event) => {
  event.preventDefault();
  const label = youthCategoryUi.newName?.value?.trim() || "";
  if (!label || label.length > 120) return;
  void saveYouthCategoryChange("POST", { label }, "Kategorie hinzugefügt.").then(() => {
    if (youthCategoryUi.success && !youthCategoryUi.success.hidden) youthCategoryUi.newName.value = "";
  });
});
youthCategoryUi.list?.addEventListener("click", (event) => {
  if (youthCategoryBusy || !youthCategoryCanManage) return;
  const rename = event.target?.closest?.("[data-youth-category-rename]");
  if (rename) {
    youthCategoryEditCode = rename.dataset.youthCategoryRename;
    renderYouthCategoryManagement();
    youthCategoryUi.list.querySelector("[data-youth-category-name]")?.focus();
    return;
  }
  const cancel = event.target?.closest?.("[data-youth-category-cancel]");
  if (cancel) {
    youthCategoryEditCode = "";
    renderYouthCategoryManagement();
    return;
  }
  const toggle = event.target?.closest?.("[data-youth-category-toggle]");
  if (!toggle) return;
  const category = youthCategoryCatalog.find((x) => x.code === toggle.dataset.youthCategoryToggle);
  if (!category) return;
  void saveYouthCategoryChange("PATCH", {
    code: category.code, label: category.label,
    isActive: !category.isActive, expectedRevision: category.revision,
  }, category.isActive ? "Kategorie deaktiviert." : "Kategorie aktiviert.");
});
youthCategoryUi.list?.addEventListener("submit", (event) => {
  const form = event.target?.closest?.("[data-youth-category-edit]");
  if (!form) return;
  event.preventDefault();
  const category = youthCategoryCatalog.find((x) => x.code === form.dataset.youthCategoryEdit);
  const input = form.querySelector("[data-youth-category-name]");
  const label = input?.value?.trim() || "";
  if (!category || !label || label.length > 120) return;
  void saveYouthCategoryChange("PATCH", {
    code: category.code, label, isActive: category.isActive,
    expectedRevision: category.revision,
  }, "Kategorie umbenannt.");
});
`;
