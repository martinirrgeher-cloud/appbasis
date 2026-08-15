import { previewAccentForeground } from "./preview-theme.mjs";

const state = {
  snapshot: null,
  selectedAppId: null,
  appIdEdited: false,
  brandMarkEdited: false,
};

const elements = {
  appsList: document.querySelector("#apps-list"),
  appsSummary: document.querySelector("#apps-summary"),
  error: document.querySelector("#factory-error"),
  detailMark: document.querySelector("#detail-mark"),
  detailName: document.querySelector("#detail-name"),
  detailId: document.querySelector("#detail-id"),
  detailSchema: document.querySelector("#detail-schema"),
  detailModules: document.querySelector("#detail-modules"),
  detailServices: document.querySelector("#detail-services"),
  displayName: document.querySelector("#display-name"),
  appId: document.querySelector("#app-id"),
  brandMark: document.querySelector("#brand-mark"),
  accentColor: document.querySelector("#accent-color"),
  accentColorValue: document.querySelector("#accent-color-value"),
  moduleOptions: document.querySelector("#module-options"),
  serviceOptions: document.querySelector("#service-options"),
  previewName: document.querySelector("#preview-name"),
  previewId: document.querySelector("#preview-id"),
  previewMark: document.querySelector("#preview-mark"),
  previewAccent: document.querySelector("#preview-accent"),
  previewTheme: document.querySelector("#preview-theme"),
  previewModules: document.querySelector("#preview-modules"),
  previewServices: document.querySelector("#preview-services"),
};

for (const button of document.querySelectorAll("[data-tab]")) {
  button.addEventListener("click", () => selectTab(button.dataset.tab));
}

document.querySelector("[data-action='show-create']")?.addEventListener("click", () => {
  selectTab("create");
  elements.displayName?.focus();
});

document.querySelector("[data-action='back-to-apps']")?.addEventListener("click", () => {
  returnToApps();
});

document.querySelector("[data-action='refresh']")?.addEventListener("click", () => {
  loadSnapshot();
});

elements.displayName?.addEventListener("input", () => {
  if (!state.appIdEdited && elements.appId) {
    elements.appId.value = appIdFromName(elements.displayName.value);
  }
  if (!state.brandMarkEdited && elements.brandMark) {
    elements.brandMark.value = elements.displayName.value.trim().length > 0
      ? firstLetter(elements.displayName.value)
      : "";
  }
  renderDraftPreview();
});

elements.appId?.addEventListener("input", () => {
  state.appIdEdited = elements.appId.value.length > 0;
  validateAppId();
  renderDraftPreview();
});

elements.brandMark?.addEventListener("input", () => {
  state.brandMarkEdited = elements.brandMark.value.length > 0;
  elements.brandMark.value = elements.brandMark.value.slice(0, 2).toLocaleUpperCase("de-DE");
  renderDraftPreview();
});

elements.accentColor?.addEventListener("input", renderDraftPreview);

loadSnapshot();

async function loadSnapshot() {
  showError("");
  if (elements.appsSummary) elements.appsSummary.textContent = "Repository wird gelesen …";

  try {
    const response = await fetch("/api/factory/snapshot", {
      headers: { accept: "application/json" },
      cache: "no-store",
    });
    if (!response.ok) throw new Error("Snapshot konnte nicht geladen werden.");

    state.snapshot = await response.json();
    renderApps();
    renderCatalog();
    renderDraftPreview();
    restoreSelectedAppDetail();
  } catch {
    const detailWasVisible = isPanelVisible("detail");
    state.snapshot = null;
    state.selectedAppId = null;
    if (elements.appsSummary) elements.appsSummary.textContent = "Repository nicht verfügbar.";
    if (elements.appsList) elements.appsList.replaceChildren(emptyState("Keine App-Daten verfügbar."));
    if (detailWasVisible) {
      returnToApps(null);
    } else {
      selectTab("apps");
    }
    showError("Die Factory-Daten konnten nicht gelesen werden. Es wurden keine Änderungen ausgeführt.");
  }
}

function renderApps() {
  const apps = state.snapshot?.apps ?? [];
  if (elements.appsSummary) {
    elements.appsSummary.textContent = `${apps.length} ${apps.length === 1 ? "App" : "Apps"} im aktuellen Repository`;
  }
  if (!elements.appsList) return;

  elements.appsList.replaceChildren();
  if (apps.length === 0) {
    elements.appsList.append(emptyState("Noch keine Apps vorhanden."));
    return;
  }

  for (const app of apps) {
    const card = document.createElement("article");
    card.className = "factory-app-card ab-surface";

    const header = document.createElement("div");
    header.className = "factory-app-card__header";

    const mark = document.createElement("span");
    mark.className = "factory-app-mark";
    mark.textContent = firstLetter(app.displayName);
    mark.setAttribute("aria-hidden", "true");

    const title = document.createElement("div");
    const name = document.createElement("h3");
    name.textContent = app.displayName;
    const id = document.createElement("code");
    id.textContent = app.appId;
    title.append(name, id);

    const status = document.createElement("span");
    status.className = "ab-badge";
    status.textContent = "Im Repository";
    header.append(mark, title, status);

    const details = document.createElement("div");
    details.className = "factory-app-details";
    details.append(
      detailRow("Module", app.modules, moduleLabel),
      detailRow("Dienste", app.platformServices, serviceLabel),
    );

    const footer = document.createElement("div");
    footer.className = "factory-app-card__footer";
    const preview = document.createElement("span");
    preview.textContent = "Details verfügbar";
    const button = document.createElement("button");
    button.className = "ab-button ab-button--ghost";
    button.type = "button";
    button.textContent = "Öffnen";
    button.dataset.appId = app.appId;
    button.setAttribute("aria-label", `${app.displayName} öffnen`);
    button.addEventListener("click", () => openAppDetail(app.appId));
    footer.append(preview, button);

    card.append(header, details, footer);
    elements.appsList.append(card);
  }
}

function openAppDetail(appId) {
  const app = state.snapshot?.apps.find((candidate) => candidate.appId === appId);
  if (app === undefined) {
    showError("Die gewählte App ist im aktuellen Repository-Snapshot nicht mehr vorhanden.");
    state.selectedAppId = null;
    selectTab("apps");
    return;
  }

  state.selectedAppId = appId;
  renderAppDetail(app);
  setActiveTab("apps");
  showPanel("detail");
  document.querySelector("[data-action='back-to-apps']")?.focus();
}

function restoreSelectedAppDetail() {
  if (state.selectedAppId === null) return;
  const app = state.snapshot?.apps.find((candidate) => candidate.appId === state.selectedAppId);
  if (app === undefined) {
    returnToApps();
    return;
  }
  renderAppDetail(app);
}

function renderAppDetail(app) {
  if (elements.detailMark) elements.detailMark.textContent = firstLetter(app.displayName);
  if (elements.detailName) elements.detailName.textContent = app.displayName;
  if (elements.detailId) elements.detailId.textContent = app.appId;
  if (elements.detailSchema) elements.detailSchema.textContent = `Schema v${app.schemaVersion}`;
  replaceWithValueChips(elements.detailModules, app.modules, moduleLabel);
  replaceWithValueChips(elements.detailServices, app.platformServices, serviceLabel);
}

function returnToApps(appIdToRestore = state.selectedAppId) {
  state.selectedAppId = null;
  setActiveTab("apps");
  showPanel("apps");
  requestAnimationFrame(() => {
    if (appIdToRestore !== null && focusAppOpenButton(appIdToRestore)) return;
    focusAppsTab();
  });
}

function focusAppOpenButton(appId) {
  const button = [...document.querySelectorAll("button[data-app-id]")].find(
    (candidate) => candidate.dataset.appId === appId,
  );
  if (button === undefined) return false;
  button.focus();
  return true;
}

function focusAppsTab() {
  document.querySelector("button[data-tab='apps']")?.focus();
}

function isPanelVisible(panelName) {
  const panel = document.querySelector(`[data-panel='${panelName}']`);
  return panel !== null && !panel.hidden;
}

function renderCatalog() {
  renderCheckboxes(
    elements.moduleOptions,
    state.snapshot?.catalog?.modules ?? [],
    "module",
    moduleLabel,
  );
  renderCheckboxes(
    elements.serviceOptions,
    state.snapshot?.catalog?.platformServices ?? [],
    "service",
    serviceLabel,
  );
}

function renderCheckboxes(container, ids, groupName, labelFor) {
  if (!container) return;
  container.replaceChildren();

  if (ids.length === 0) {
    container.append(emptyState("Aktuell keine Auswahl verfügbar."));
    return;
  }

  for (const id of ids) {
    const label = document.createElement("label");
    label.className = "factory-option";

    const input = document.createElement("input");
    input.type = "checkbox";
    input.name = groupName;
    input.value = id;
    input.addEventListener("change", () => {
      if (groupName === "service") enforceServiceDependencies(input);
      renderDraftPreview();
    });

    const copy = document.createElement("span");
    const strong = document.createElement("strong");
    strong.textContent = labelFor(id);
    const code = document.createElement("code");
    code.textContent = id;
    copy.append(strong, code);

    label.append(input, copy);
    container.append(label);
  }
}

function enforceServiceDependencies(changedInput) {
  const identity = elements.serviceOptions?.querySelector("input[value='identity']");
  const permissions = elements.serviceOptions?.querySelector("input[value='permissions']");
  if (!identity || !permissions) return;

  if (changedInput === permissions && permissions.checked) {
    identity.checked = true;
  }
  if (changedInput === identity && !identity.checked && permissions.checked) {
    permissions.checked = false;
  }
}

function renderDraftPreview() {
  const name = elements.displayName?.value.trim() || "Neue App";
  const appId = elements.appId?.value.trim() || "app-id";
  const mark = elements.brandMark?.value.trim() || firstLetter(name);
  const accent = elements.accentColor?.value || "#2457e6";
  const accentLabel = accent.toLocaleUpperCase("de-DE");
  const modules = checkedValues("module");
  const services = checkedValues("service");

  if (elements.previewName) elements.previewName.textContent = name;
  if (elements.previewId) elements.previewId.textContent = appId;
  if (elements.previewMark) {
    elements.previewMark.textContent = mark;
    elements.previewMark.style.backgroundColor = accent;
    elements.previewMark.style.color = previewAccentForeground(accent);
  }
  if (elements.previewAccent) elements.previewAccent.style.backgroundColor = accent;
  if (elements.accentColorValue) elements.accentColorValue.textContent = accentLabel;
  if (elements.previewTheme) elements.previewTheme.textContent = `Akzent ${accentLabel}`;
  if (elements.previewModules) {
    elements.previewModules.textContent = listLabels(modules, moduleLabel);
  }
  if (elements.previewServices) {
    elements.previewServices.textContent = listLabels(services, serviceLabel);
  }
}

function checkedValues(name) {
  return [...document.querySelectorAll(`input[name='${name}']:checked`)].map(
    (input) => input.value,
  );
}

function validateAppId() {
  if (!elements.appId) return;
  const value = elements.appId.value;
  const valid = value.length === 0 || /^[a-z][a-z0-9-]*$/.test(value);
  elements.appId.setAttribute("aria-invalid", valid ? "false" : "true");
}

function selectTab(tab) {
  state.selectedAppId = null;
  setActiveTab(tab);
  showPanel(tab);
}

function setActiveTab(tab) {
  for (const button of document.querySelectorAll("[data-tab]")) {
    const active = button.dataset.tab === tab;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-selected", String(active));
  }
}

function showPanel(panelName) {
  for (const panel of document.querySelectorAll("[data-panel]")) {
    panel.hidden = panel.dataset.panel !== panelName;
  }
}

function detailRow(labelText, values, labelFor) {
  const row = document.createElement("div");
  const label = document.createElement("span");
  label.textContent = labelText;
  const value = document.createElement("div");
  value.className = "factory-chip-list";
  appendValueChips(value, values, labelFor);
  row.append(label, value);
  return row;
}

function replaceWithValueChips(container, values, labelFor) {
  if (!container) return;
  container.replaceChildren();
  appendValueChips(container, values, labelFor);
}

function appendValueChips(container, values, labelFor) {
  if (values.length === 0) {
    const empty = document.createElement("span");
    empty.className = "factory-muted";
    empty.textContent = "Keine";
    container.append(empty);
    return;
  }

  for (const id of values) {
    const chip = document.createElement("span");
    chip.className = "ab-badge";
    chip.textContent = labelFor(id);
    container.append(chip);
  }
}

function emptyState(message) {
  const element = document.createElement("div");
  element.className = "ab-empty-state";
  const strong = document.createElement("strong");
  strong.textContent = message;
  element.append(strong);
  return element;
}

function showError(message) {
  if (!elements.error) return;
  elements.error.hidden = message.length === 0;
  elements.error.textContent = message;
}

function appIdFromName(value) {
  return value
    .trim()
    .toLocaleLowerCase("de-DE")
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/^[^a-z]+/, "");
}

function listLabels(ids, labelFor) {
  return ids.length === 0 ? "Keine" : ids.map(labelFor).join(", ");
}

function firstLetter(value) {
  return value.trim().charAt(0).toLocaleUpperCase("de-DE") || "A";
}

function moduleLabel(id) {
  if (id === "tasks") return "Aufgaben";
  return humanizeIdentifier(id);
}

function serviceLabel(id) {
  if (id === "identity") return "Benutzer & Login";
  if (id === "permissions") return "Rollen & Rechte";
  return humanizeIdentifier(id);
}

function humanizeIdentifier(id) {
  return id
    .split("-")
    .filter(Boolean)
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(" ");
}
