const form = document.querySelector("#create-form");
const createButton = document.querySelector("#create-app-button");
const createReason = document.querySelector("#create-disabled-reason");
const status = document.querySelector("#factory-status");
const displayName = document.querySelector("#display-name");
const appId = document.querySelector("#app-id");
const createdAppIds = new Set();
const MAX_APP_ID_LENGTH = 63;
const MAX_DIRECT_NAVIGATION_ITEMS = 5;
const STYLE_PRESETS = Object.freeze([
  { id: "clear", label: "Klar", detail: "Geradlinig, ruhig und sachlich." },
  { id: "soft", label: "Soft", detail: "Runder, luftiger und freundlicher." },
  { id: "compact", label: "Compact", detail: "Dichter für informationsreiche Apps." },
]);

let createPending = false;
let navigationOrder = ["overview"];
const directNavigationItems = new Set(["overview"]);

setupPersonalizationDraft();

form?.addEventListener("input", syncCreateAvailability);
form?.addEventListener("change", syncCreateAvailability);
form?.addEventListener("change", syncPersonalizationDraft);
form?.addEventListener("submit", handleCreateApp);

syncCreateAvailability();
syncPersonalizationDraft();
observeCatalogChanges();

async function handleCreateApp(event) {
  event.preventDefault();
  syncCreateAvailability();
  if (!form || !createButton || createButton.disabled || createPending) return;

  const input = currentCreateInput();
  createPending = true;
  syncCreateAvailability();
  showStatus("App-Skelett wird lokal erzeugt …", "progress");

  try {
    const response = await fetch("/api/factory/apps", {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
      },
      cache: "no-store",
      credentials: "same-origin",
      body: JSON.stringify(input),
    });
    const payload = await readJsonResponse(response);

    if (!response.ok) {
      throw new FactoryCreateError(
        payload?.error?.code ?? "APP_CREATION_FAILED",
      );
    }

    createdAppIds.add(input.appId);
    showStatus(
      `„${input.displayName}“ wurde lokal unter ${payload.relativeDestination ?? `apps/${input.appId}`} angelegt. Es wurde kein Deployment gestartet.`,
      "success",
    );

    document.querySelector("[data-action='refresh']")?.click();
  } catch (error) {
    const code = error instanceof FactoryCreateError
      ? error.code
      : "APP_CREATION_FAILED";
    showStatus(createErrorMessage(code), "error");
  } finally {
    createPending = false;
    syncCreateAvailability();
  }
}

function currentCreateInput() {
  return {
    appId: appId?.value.trim() ?? "",
    displayName: displayName?.value.trim() ?? "",
    modules: checkedValues("module"),
    platformServices: checkedValues("service"),
  };
}

function syncCreateAvailability() {
  if (!createButton || !createReason) return;

  const input = currentCreateInput();
  const validName = input.displayName.length > 0 && input.displayName.length <= 80;
  const validAppIdLength = input.appId.length <= MAX_APP_ID_LENGTH;
  const validAppIdSyntax = /^[a-z][a-z0-9-]*$/.test(input.appId);
  const validAppId = validAppIdLength && validAppIdSyntax;
  const duplicate = validAppId && appIdAlreadyExists(input.appId);

  createButton.disabled = createPending || !validName || !validAppId || duplicate;

  if (createPending) {
    createReason.textContent = "Die App wird gerade lokal erzeugt.";
  } else if (!validName) {
    createReason.textContent = "Bitte zuerst einen App-Namen eingeben.";
  } else if (!validAppIdLength) {
    createReason.textContent = `Die App-ID darf höchstens ${MAX_APP_ID_LENGTH} Zeichen enthalten.`;
  } else if (!validAppIdSyntax) {
    createReason.textContent = "Die App-ID muss mit einem Kleinbuchstaben beginnen und darf nur Kleinbuchstaben, Zahlen und Bindestriche enthalten.";
  } else if (duplicate) {
    createReason.textContent = "Diese App-ID ist bereits im Repository vorhanden.";
  } else {
    createReason.textContent = "Erzeugt ausschließlich das lokale App-Skelett im Repository. Gestaltung und Navigation sind aktuell Entwurfswerte; Preview und Produktion bleiben getrennt gesperrt.";
  }
}

function setupPersonalizationDraft() {
  const brandingGrid = document.querySelector(".factory-branding-grid");
  if (brandingGrid && !document.querySelector("#style-preset-options")) {
    const field = document.createElement("div");
    field.className = "factory-field";
    field.style.gridColumn = "1 / -1";

    const title = document.createElement("span");
    title.textContent = "Designstil";

    const hint = document.createElement("small");
    hint.textContent = "Drei AppBasis-Presets verändern Karten, Dichte und Buttonform in der Vorschau. Bedienlogik und Accessibility bleiben gleich.";

    const options = document.createElement("div");
    options.id = "style-preset-options";
    options.className = "factory-options";
    options.style.gridTemplateColumns = "repeat(auto-fit, minmax(145px, 1fr))";

    for (const preset of STYLE_PRESETS) {
      const label = document.createElement("label");
      label.className = "factory-option";

      const input = document.createElement("input");
      input.type = "radio";
      input.name = "stylePreset";
      input.value = preset.id;
      input.checked = preset.id === "clear";

      const copy = document.createElement("span");
      const strong = document.createElement("strong");
      strong.textContent = preset.label;
      const detail = document.createElement("small");
      detail.textContent = preset.detail;
      detail.style.color = "var(--ab-text-muted)";
      copy.append(strong, detail);
      label.append(input, copy);
      options.append(label);
    }

    field.append(title, options, hint);
    brandingGrid.after(field);
  }

  const moduleFieldset = document.querySelector("#module-options")?.closest("fieldset");
  if (moduleFieldset && !document.querySelector("#navigation-options")) {
    const fieldset = document.createElement("fieldset");
    const legend = document.createElement("legend");
    legend.textContent = "4. Navigation";
    const hint = document.createElement("p");
    hint.className = "factory-hint";
    hint.textContent = "Lege fest, welche verfügbaren Bereiche direkt im mobilen Bottom-Menü liegen und in welcher Reihenfolge. Weitere Bereiche landen unter „Mehr“. Aktuell nur Vorschau.";
    const options = document.createElement("div");
    options.id = "navigation-options";
    options.className = "factory-options";
    fieldset.append(legend, hint, options);
    moduleFieldset.after(fieldset);
  }

  renumberFactoryFlow();
  setupPreviewPersonalization();
}

function renumberFactoryFlow() {
  const flow = document.querySelector(".factory-flow");
  const rolesStep = flow?.querySelector("[data-flow-step='roles']");
  if (flow && rolesStep && !flow.querySelector("[data-flow-step='navigation']")) {
    const item = document.createElement("li");
    item.dataset.flowStep = "navigation";
    const number = document.createElement("span");
    number.textContent = "4";
    const strong = document.createElement("strong");
    strong.textContent = "Navigation";
    const small = document.createElement("small");
    small.textContent = "Bottom-Menü";
    item.append(number, strong, small);
    rolesStep.before(item);
  }

  const stepNumbers = {
    roles: "5",
    preview: "6",
    release: "7",
  };
  for (const [step, number] of Object.entries(stepNumbers)) {
    const marker = flow?.querySelector(`[data-flow-step='${step}'] > span`);
    if (marker) marker.textContent = number;
  }

  renameLegend("4. Rollen & Rechte", "5. Rollen & Rechte");
  renameLegend("5. Preview & Tests", "6. Preview & Tests");
  renameLegend("6. Produktion freigeben", "7. Produktion freigeben");
}

function renameLegend(from, to) {
  for (const legend of document.querySelectorAll(".factory-form legend")) {
    if (legend.textContent?.trim() === from) legend.textContent = to;
  }
}

function setupPreviewPersonalization() {
  const window = document.querySelector(".factory-preview-window");
  const body = document.querySelector(".factory-preview-window__body");
  if (!window || !body) return;
  window.id = "preview-window";
  window.dataset.stylePreset = "clear";

  const oldTopNavigation = body.querySelector(".factory-preview-nav");
  if (oldTopNavigation) oldTopNavigation.hidden = true;

  if (!document.querySelector("#preview-style-actions")) {
    const actions = document.createElement("div");
    actions.id = "preview-style-actions";
    actions.setAttribute("aria-hidden", "true");
    actions.style.display = "flex";
    actions.style.gap = "8px";

    const primary = document.createElement("button");
    primary.type = "button";
    primary.tabIndex = -1;
    primary.textContent = "Öffnen";
    primary.style.border = "0";
    primary.style.cursor = "default";
    primary.style.font = "inherit";
    primary.style.fontSize = "0.72rem";
    primary.style.fontWeight = "700";

    const secondary = document.createElement("button");
    secondary.type = "button";
    secondary.tabIndex = -1;
    secondary.textContent = "Mehr";
    secondary.style.cursor = "default";
    secondary.style.font = "inherit";
    secondary.style.fontSize = "0.72rem";
    secondary.style.fontWeight = "700";

    actions.append(primary, secondary);
    body.append(actions);
  }

  if (!document.querySelector("#preview-bottom-nav")) {
    const bottom = document.createElement("div");
    bottom.id = "preview-bottom-nav";
    bottom.className = "factory-preview-nav";
    bottom.setAttribute("aria-hidden", "true");
    bottom.style.borderBottom = "0";
    bottom.style.borderTop = "1px solid var(--ab-border-default)";
    bottom.style.justifyContent = "space-around";
    bottom.style.paddingTop = "8px";
    body.append(bottom);
  }

  const previewList = document.querySelector(".factory-preview-list");
  if (previewList && !document.querySelector("#preview-style-preset")) {
    const styleRow = createPreviewDefinition("Designstil", "preview-style-preset", "Klar");
    const navigationRow = createPreviewDefinition("Navigation", "preview-navigation", "Übersicht");
    const themeRow = document.querySelector("#preview-theme")?.closest("div");
    if (themeRow) themeRow.after(styleRow, navigationRow);
    else previewList.prepend(styleRow, navigationRow);
  }
}

function createPreviewDefinition(term, id, value) {
  const row = document.createElement("div");
  const dt = document.createElement("dt");
  dt.textContent = term;
  const dd = document.createElement("dd");
  dd.id = id;
  dd.textContent = value;
  row.append(dt, dd);
  return row;
}

function observeCatalogChanges() {
  const targets = [
    document.querySelector("#module-options"),
    document.querySelector("#service-options"),
  ].filter(Boolean);
  if (targets.length === 0) return;

  const observer = new MutationObserver(() => syncPersonalizationDraft());
  for (const target of targets) observer.observe(target, { childList: true, subtree: true });
}

function syncPersonalizationDraft() {
  syncNavigationCandidates();
  renderStylePreview();
}

function syncNavigationCandidates() {
  const candidates = availableNavigationCandidates();
  const availableIds = new Set(candidates.map((item) => item.id));
  navigationOrder = navigationOrder.filter((id) => availableIds.has(id));
  for (const candidate of candidates) {
    if (!navigationOrder.includes(candidate.id)) navigationOrder.push(candidate.id);
  }

  for (const id of [...directNavigationItems]) {
    if (!availableIds.has(id)) directNavigationItems.delete(id);
  }
  for (const candidate of candidates) {
    if (directNavigationItems.size >= MAX_DIRECT_NAVIGATION_ITEMS) break;
    if (!directNavigationItems.has(candidate.id)) directNavigationItems.add(candidate.id);
  }
  if (directNavigationItems.size === 0 && candidates[0]) {
    directNavigationItems.add(candidates[0].id);
  }

  renderNavigationOptions(candidates);
  renderNavigationPreview(candidates);
}

function availableNavigationCandidates() {
  const items = [{ id: "overview", label: "Übersicht" }];
  for (const moduleId of checkedValues("module")) {
    items.push({ id: `module:${moduleId}`, label: moduleLabel(moduleId) });
  }
  if (checkedValues("service").includes("permissions")) {
    items.push({ id: "roles", label: "Rollen" });
  }
  return items;
}

function renderNavigationOptions(candidates) {
  const container = document.querySelector("#navigation-options");
  if (!container) return;
  container.replaceChildren();

  const byId = new Map(candidates.map((item) => [item.id, item]));
  for (const id of navigationOrder) {
    const item = byId.get(id);
    if (!item) continue;

    const row = document.createElement("div");
    row.className = "factory-option";
    row.style.cursor = "default";

    const direct = document.createElement("input");
    direct.type = "checkbox";
    direct.checked = directNavigationItems.has(id);
    direct.setAttribute("aria-label", `${item.label} direkt im Bottom-Menü anzeigen`);
    direct.addEventListener("change", () => {
      if (direct.checked && directNavigationItems.size >= MAX_DIRECT_NAVIGATION_ITEMS) {
        direct.checked = false;
        return;
      }
      if (direct.checked) directNavigationItems.add(id);
      else directNavigationItems.delete(id);
      if (directNavigationItems.size === 0) {
        directNavigationItems.add(id);
        direct.checked = true;
      }
      renderNavigationOptions(candidates);
      renderNavigationPreview(candidates);
    });

    const copy = document.createElement("span");
    const strong = document.createElement("strong");
    strong.textContent = item.label;
    const small = document.createElement("small");
    small.textContent = direct.checked ? "Direkt sichtbar" : "Unter Mehr";
    small.style.color = "var(--ab-text-muted)";
    copy.append(strong, small);

    const controls = document.createElement("span");
    controls.style.display = "flex";
    controls.style.flexDirection = "row";
    controls.style.gap = "4px";
    controls.style.marginLeft = "auto";
    controls.append(
      navigationMoveButton(id, -1, "Nach links"),
      navigationMoveButton(id, 1, "Nach rechts"),
    );

    row.append(direct, copy, controls);
    container.append(row);
  }
}

function navigationMoveButton(id, direction, label) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "ab-button ab-button--ghost";
  button.textContent = direction < 0 ? "←" : "→";
  button.setAttribute("aria-label", label);
  button.style.minWidth = "44px";
  button.addEventListener("click", () => {
    const index = navigationOrder.indexOf(id);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= navigationOrder.length) return;
    [navigationOrder[index], navigationOrder[target]] = [
      navigationOrder[target],
      navigationOrder[index],
    ];
    const candidates = availableNavigationCandidates();
    renderNavigationOptions(candidates);
    renderNavigationPreview(candidates);
  });
  return button;
}

function renderNavigationPreview(candidates) {
  const container = document.querySelector("#preview-bottom-nav");
  if (!container) return;
  container.replaceChildren();
  const byId = new Map(candidates.map((item) => [item.id, item]));
  const directItems = navigationOrder
    .filter((id) => directNavigationItems.has(id))
    .map((id) => byId.get(id))
    .filter(Boolean);
  const hiddenCount = candidates.length - directItems.length;

  for (const [index, item] of directItems.entries()) {
    const label = document.createElement("span");
    label.textContent = item.label;
    label.classList.toggle("is-active", index === 0);
    container.append(label);
  }
  if (hiddenCount > 0) {
    const more = document.createElement("span");
    more.textContent = "Mehr";
    container.append(more);
  }

  const summary = document.querySelector("#preview-navigation");
  if (summary) {
    const labels = directItems.map((item) => item.label);
    if (hiddenCount > 0) labels.push("Mehr");
    summary.textContent = labels.join(" · ") || "Keine";
  }
}

function renderStylePreview() {
  const preset = selectedStylePreset();
  const window = document.querySelector("#preview-window");
  const body = document.querySelector(".factory-preview-window__body");
  const card = document.querySelector(".factory-preview-card");
  const actions = document.querySelector("#preview-style-actions");
  const primary = actions?.querySelector("button:first-child");
  const secondary = actions?.querySelector("button:last-child");
  if (!window || !body || !card || !primary || !secondary) return;

  window.dataset.stylePreset = preset;
  const config = stylePreviewConfig(preset);
  window.style.borderRadius = config.windowRadius;
  body.style.gap = config.gap;
  body.style.padding = config.padding;
  card.style.borderRadius = config.cardRadius;
  card.style.boxShadow = config.cardShadow;
  primary.style.background = "var(--ab-brand-primary)";
  primary.style.color = "var(--ab-text-inverse)";
  primary.style.borderRadius = config.buttonRadius;
  primary.style.padding = config.buttonPadding;
  primary.style.boxShadow = config.buttonShadow;
  secondary.style.background = "var(--ab-surface-card)";
  secondary.style.color = "var(--ab-text-primary)";
  secondary.style.border = "1px solid var(--ab-border-default)";
  secondary.style.borderRadius = config.buttonRadius;
  secondary.style.padding = config.buttonPadding;
  secondary.style.boxShadow = config.secondaryShadow;

  const summary = document.querySelector("#preview-style-preset");
  const label = STYLE_PRESETS.find((item) => item.id === preset)?.label ?? "Klar";
  if (summary) summary.textContent = label;
}

function selectedStylePreset() {
  return document.querySelector("input[name='stylePreset']:checked")?.value ?? "clear";
}

function stylePreviewConfig(preset) {
  if (preset === "soft") {
    return {
      windowRadius: "20px",
      cardRadius: "16px",
      buttonRadius: "999px",
      gap: "16px",
      padding: "18px",
      buttonPadding: "10px 16px",
      cardShadow: "0 8px 22px rgba(15, 23, 42, 0.08)",
      buttonShadow: "0 6px 16px rgba(15, 23, 42, 0.12)",
      secondaryShadow: "0 3px 10px rgba(15, 23, 42, 0.06)",
    };
  }
  if (preset === "compact") {
    return {
      windowRadius: "8px",
      cardRadius: "6px",
      buttonRadius: "6px",
      gap: "8px",
      padding: "10px",
      buttonPadding: "6px 10px",
      cardShadow: "none",
      buttonShadow: "none",
      secondaryShadow: "none",
    };
  }
  return {
    windowRadius: "12px",
    cardRadius: "10px",
    buttonRadius: "8px",
    gap: "12px",
    padding: "16px",
    buttonPadding: "9px 14px",
    cardShadow: "none",
    buttonShadow: "none",
    secondaryShadow: "none",
  };
}

function appIdAlreadyExists(candidate) {
  if (createdAppIds.has(candidate)) return true;
  return [...document.querySelectorAll("button[data-app-id]")].some(
    (button) => button.dataset.appId === candidate,
  );
}

function checkedValues(name) {
  return [...document.querySelectorAll(`input[name='${name}']:checked`)].map(
    (input) => input.value,
  );
}

function moduleLabel(id) {
  if (id === "tasks") return "Aufgaben";
  return humanizeIdentifier(id);
}

function humanizeIdentifier(id) {
  return id
    .split("-")
    .filter(Boolean)
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(" ");
}

async function readJsonResponse(response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function showStatus(message, kind) {
  if (!status) return;
  status.hidden = message.length === 0;
  status.textContent = message;
  status.dataset.kind = kind;
}

function createErrorMessage(code) {
  if (code === "APP_ALREADY_EXISTS") {
    return "Die App konnte nicht angelegt werden, weil diese App-ID inzwischen bereits existiert.";
  }
  if (code === "INVALID_APP_REQUEST" || code === "INVALID_JSON") {
    return "Der App-Entwurf ist noch nicht gültig. Bitte Name, App-ID, Module und Dienste prüfen.";
  }
  if (code === "FACTORY_STATE_UNAVAILABLE") {
    return "Der aktuelle Repository-Stand konnte nicht sicher gelesen werden. Deshalb wurde keine App angelegt.";
  }
  if (code === "INVALID_REQUEST_ORIGIN") {
    return "Die Factory hat den Schreibversuch aus Sicherheitsgründen abgelehnt. Bitte die lokale Factory-Seite direkt verwenden.";
  }
  if (code === "UNSUPPORTED_MEDIA_TYPE" || code === "REQUEST_TOO_LARGE") {
    return "Die Factory hat die Erstellungsanfrage aus Sicherheitsgründen abgelehnt.";
  }
  return "Das App-Skelett konnte nicht angelegt werden. Es wurde kein Deployment gestartet.";
}

class FactoryCreateError extends Error {
  constructor(code) {
    super(code);
    this.code = code;
  }
}
