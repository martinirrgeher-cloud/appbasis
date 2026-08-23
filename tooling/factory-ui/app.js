import { previewAccentForeground } from "./preview-theme.mjs";
import { factoryLifecycleCardCopy } from "./fc1-lifecycle-card-status.mjs";
import {
  factoryLifecycleCopy,
  productionReadinessCopy,
  productionReleaseCriteriaCopy,
  productionReleaseReadinessCopy,
} from "./production-readiness-status.js";

const state = {
  snapshot: null,
  snapshotGeneration: 0,
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
  detailProductionStatus: document.querySelector("#detail-production-status"),
  detailProductionSummary: document.querySelector("#detail-production-summary"),
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
  const generation = ++state.snapshotGeneration;
  showError("");
  if (elements.appsSummary) elements.appsSummary.textContent = "Repository wird gelesen …";

  try {
    const response = await fetch("/api/factory/snapshot", {
      headers: { accept: "application/json" },
      cache: "no-store",
    });
    if (!response.ok) throw new Error("Snapshot konnte nicht geladen werden.");

    const nextSnapshot = await response.json();
    if (generation !== state.snapshotGeneration) return;

    const focusedAppIdBeforeRender = focusedAppButtonId();
    const draftCatalogState = captureDraftCatalogState();
    state.snapshot = nextSnapshot;
    renderApps();
    renderCatalog(draftCatalogState);
    renderDraftPreview();
    restoreSelectedAppDetail();
    restoreListFocusAfterRender(focusedAppIdBeforeRender);
    restoreDraftCatalogFocus(draftCatalogState.focus);
  } catch {
    if (generation !== state.snapshotGeneration) return;

    if (state.snapshot !== null) {
      renderAppsSummary(state.snapshot.apps, "Aktualisierung fehlgeschlagen");
      showError("Die Factory-Daten konnten nicht aktualisiert werden. Der zuletzt geladene Stand bleibt sichtbar.");
      return;
    }

    if (elements.appsSummary) elements.appsSummary.textContent = "Repository nicht verfügbar.";
    if (elements.appsList) elements.appsList.replaceChildren(emptyState("Keine App-Daten verfügbar."));
    showError("Die Factory-Daten konnten nicht gelesen werden. Es wurden keine Änderungen ausgeführt.");
  }
}

function renderApps() {
  const apps = state.snapshot?.apps ?? [];
  renderAppsSummary(apps);
  if (!elements.appsList) return;

  elements.appsList.replaceChildren();
  if (apps.length === 0) {
    elements.appsList.append(emptyState("Noch keine Apps vorhanden."));
    return;
  }

  for (const app of apps) {
    const lifecycleCard = factoryLifecycleCardCopy(
      app.previewReadiness,
      app.productionReadiness,
      app.productionReleaseReadiness,
    );
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
    status.textContent = lifecycleCard.label;
    status.title = lifecycleCard.heading;
    header.append(mark, title, status);

    const details = document.createElement("div");
    details.className = "factory-app-details";
    details.append(
      detailRow("Module", app.modules, moduleLabel),
      detailRow("Dienste", app.platformServices, serviceLabel),
      detailRow("Status", [lifecycleCard.heading]),
      detailRow("Nächster Schritt", [lifecycleCard.nextStep]),
    );

    const footer = document.createElement("div");
    footer.className = "factory-app-card__footer";
    const nextStep = document.createElement("span");
    nextStep.textContent = `Nächster Schritt: ${lifecycleCard.nextStep}`;
    nextStep.title = lifecycleCard.detail;
    const button = document.createElement("button");
    button.className = "ab-button ab-button--ghost";
    button.type = "button";
    button.textContent = "Öffnen";
    button.dataset.appId = app.appId;
    button.setAttribute("aria-label", `${app.displayName} öffnen`);
    button.addEventListener("click", () => openAppDetail(app.appId));
    footer.append(nextStep, button);

    card.append(header, details, footer);
    elements.appsList.append(card);
  }
}

function renderAppsSummary(apps, suffix = "") {
  if (!elements.appsSummary) return;
  const base = `${apps.length} ${apps.length === 1 ? "App" : "Apps"} im aktuellen Repository`;
  elements.appsSummary.textContent = suffix.length > 0 ? `${base} · ${suffix}` : base;
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
  renderPreviewReadiness(
    app.previewReadiness,
    app.productionReadiness,
    app.productionReleaseReadiness,
  );
  renderProductionReadiness(
    app.previewReadiness,
    app.productionReadiness,
    app.productionReleaseReadiness,
  );
  renderFactoryLifecycle(
    app.previewReadiness,
    app.productionReadiness,
    app.productionReleaseReadiness,
  );
}

function renderPreviewReadiness(readiness, productionReadiness, releaseReadiness) {
  const previewGate = document.querySelector(
    ".factory-detail-gates .factory-detail-gate:nth-child(3)",
  );
  const heading = previewGate?.querySelector("strong");
  const detail = previewGate?.querySelector("small");
  if (!heading || !detail) return;

  const previewAccepted =
    readiness?.status === "repository-ready" &&
    productionReleaseCriteriaCopy(readiness, productionReadiness, releaseReadiness).some(
      (criterion) => criterion.id === "previewAccepted" && criterion.status === "verified",
    );

  if (previewAccepted) {
    heading.textContent = "Preview geprüft";
    detail.textContent =
      "Die Preview wurde im aktuellen M6-Snapshot abgenommen. Produktionsvorbereitung und Produktion bleiben separate, freigabepflichtige Schritte.";
    return;
  }

  if (readiness?.status === "repository-ready") {
    heading.textContent = "Lokale Preview-Voraussetzungen erfüllt";
    detail.textContent =
      "Die benötigten lokalen App-Artefakte sind vorhanden. Die externe Preview-Abnahme ist noch offen.";
    return;
  }

  const missing = [];
  if (!readiness?.workerEntrypointPresent || !readiness?.packageManifestPresent) {
    missing.push("App-Laufzeit");
  }
  if (readiness?.databaseManifestRequired && !readiness?.databaseManifestPresent) {
    missing.push("Datenbank-Vorbereitung");
  }
  heading.textContent = "Lokale Preview-Voraussetzungen unvollständig";
  detail.textContent =
    missing.length > 0
      ? `Fehlt: ${missing.join(", ")}. Preview bleibt gesperrt.`
      : "Die lokalen Preview-Voraussetzungen konnten nicht vollständig bestätigt werden. Preview bleibt gesperrt.";
}

function renderProductionReadiness(previewReadiness, readiness, releaseReadiness) {
  if (!elements.detailProductionStatus || !elements.detailProductionSummary) return;
  const m5Copy = productionReadinessCopy(readiness);
  const m6Copy = productionReleaseReadinessCopy(
    previewReadiness,
    readiness,
    releaseReadiness,
  );
  const productionGate = elements.detailProductionStatus.closest(".factory-detail-gate");
  const productionLabel = productionGate?.querySelector(":scope > span");
  if (productionLabel) productionLabel.textContent = "Security & Privacy Ready";
  elements.detailProductionStatus.textContent = m5Copy.heading;
  elements.detailProductionSummary.textContent = m5Copy.detail;
  renderProductionReleaseCriteria(
    previewReadiness,
    readiness,
    releaseReadiness,
    m6Copy,
  );
}

function renderProductionReleaseCriteria(
  previewReadiness,
  productionReadiness,
  releaseReadiness,
  releaseCopy,
) {
  const productionGate = elements.detailProductionStatus?.closest(".factory-detail-gate");
  if (!productionGate) return;

  let releaseSummary = productionGate.querySelector("[data-m6-release-summary]");
  if (releaseSummary === null) {
    releaseSummary = document.createElement("div");
    releaseSummary.className = "factory-release-gate";
    releaseSummary.dataset.m6ReleaseSummary = "";
    productionGate.append(releaseSummary);
  }
  const releaseHeading = document.createElement("strong");
  releaseHeading.textContent = `Production Ready · ${releaseCopy.heading}`;
  const releaseDetail = document.createElement("span");
  releaseDetail.textContent = releaseCopy.detail;
  releaseSummary.replaceChildren(releaseHeading, releaseDetail);

  let criteriaList = productionGate.querySelector("[data-m6-release-criteria]");
  if (criteriaList === null) {
    criteriaList = document.createElement("div");
    criteriaList.className = "factory-detail-gates";
    criteriaList.dataset.m6ReleaseCriteria = "";
    criteriaList.setAttribute("aria-label", "Technische M6-Nachweise");
    productionGate.append(criteriaList);
  }

  criteriaList.replaceChildren();
  for (const criterion of productionReleaseCriteriaCopy(
    previewReadiness,
    productionReadiness,
    releaseReadiness,
  )) {
    const item = document.createElement("div");
    item.className = "factory-detail-gate";
    if (criterion.status !== "verified") {
      item.classList.add("factory-detail-gate--locked");
    }

    const label = document.createElement("span");
    label.textContent = criterion.label;
    const status = document.createElement("strong");
    status.textContent = criterion.status === "verified" ? "Geprüft" : "Offen";
    const detail = document.createElement("small");
    detail.textContent =
      criterion.status === "verified"
        ? "Technischer Nachweis im aktuellen Factory-Snapshot bestätigt."
        : "Technischer Nachweis fehlt oder ist nicht eindeutig bestätigt.";

    item.append(label, status, detail);
    criteriaList.append(item);
  }
}

function renderFactoryLifecycle(previewReadiness, readiness, releaseReadiness) {
  const readinessSection = document
    .querySelector("#detail-readiness-heading")
    ?.closest(".factory-detail-section");
  const gateList = readinessSection?.querySelector(":scope > .factory-detail-gates");
  if (!readinessSection || !gateList) return;

  let lifecycle = readinessSection.querySelector("[data-factory-lifecycle]");
  if (lifecycle === null) {
    lifecycle = document.createElement("div");
    lifecycle.dataset.factoryLifecycle = "";
    readinessSection.insertBefore(lifecycle, gateList);
  }

  const copy = factoryLifecycleCopy(
    previewReadiness,
    readiness,
    releaseReadiness,
  );
  const flow = document.createElement("ol");
  flow.className = "factory-flow";
  flow.setAttribute("aria-label", "App-Lifecycle");

  for (const stage of copy.stages) {
    const item = document.createElement("li");
    if (stage.state === "current") item.classList.add("is-current");
    const marker = document.createElement("span");
    marker.textContent =
      stage.state === "complete" ? "✓" : stage.state === "current" ? "→" : "–";
    marker.setAttribute("aria-hidden", "true");
    const label = document.createElement("strong");
    label.textContent = stage.label;
    const status = document.createElement("small");
    status.textContent = stage.heading;
    item.append(marker, label, status);
    flow.append(item);
  }

  const nextStep = document.createElement("div");
  nextStep.className = "factory-release-gate";
  nextStep.setAttribute("role", "note");
  const nextHeading = document.createElement("strong");
  nextHeading.textContent = `Nächster sicherer Schritt: ${copy.nextStep.heading}`;
  const nextDetail = document.createElement("span");
  nextDetail.textContent = copy.nextStep.detail;
  nextStep.append(nextHeading, nextDetail);

  lifecycle.replaceChildren(flow, nextStep);
}

function previewReadinessLabel(readiness) {
  return readiness?.status === "repository-ready"
    ? "Preview lokal vorbereitet"
    : "Preview-Voraussetzungen fehlen";
}

function returnToApps(appIdToRestore = state.selectedAppId) {
  state.selectedAppId = null;
  setActiveTab("apps");
  showPanel("apps");
  scheduleAppsFocus(appIdToRestore);
}

function selectTab(tab) {
  if (tab === "apps") state.selectedAppId = null;
  setActiveTab(tab);
  showPanel(tab);
}

function setActiveTab(tab) {
  for (const button of document.querySelectorAll("[data-tab]")) {
    const selected = button.dataset.tab === tab;
    button.classList.toggle("is-active", selected);
    button.setAttribute("aria-selected", String(selected));
  }
}

function showPanel(panel) {
  for (const candidate of document.querySelectorAll("[data-panel]")) {
    candidate.hidden = candidate.dataset.panel !== panel;
  }
}

function renderCatalog(previousState = null) {
  const catalog = state.snapshot?.catalog;
  if (!catalog) return;

  renderCheckboxes(
    elements.moduleOptions,
    catalog.modules,
    moduleLabel,
    previousState?.modules,
  );
  renderCheckboxes(
    elements.serviceOptions,
    catalog.platformServices,
    serviceLabel,
    previousState?.services,
  );
}

function renderCheckboxes(container, values, labelFor, selectedIds = []) {
  if (!container) return;
  container.replaceChildren();

  for (const value of values) {
    const label = document.createElement("label");
    label.className = "factory-check";
    const input = document.createElement("input");
    input.type = "checkbox";
    input.value = value;
    input.checked = selectedIds.includes(value);
    input.addEventListener("change", renderDraftPreview);
    const text = document.createElement("span");
    text.textContent = labelFor(value);
    label.append(input, text);
    container.append(label);
  }
}

function renderDraftPreview() {
  if (!elements.previewName) return;
  const name = elements.displayName?.value.trim() || "Neue App";
  const id = elements.appId?.value.trim() || "app-id";
  const mark = elements.brandMark?.value.trim() || firstLetter(name);
  const accent = elements.accentColor?.value ?? "#2563eb";
  const selectedModules = selectedValues(elements.moduleOptions);
  const selectedServices = selectedValues(elements.serviceOptions);

  elements.previewName.textContent = name;
  elements.previewId.textContent = id;
  elements.previewMark.textContent = mark;
  elements.previewAccent.style.background = accent;
  elements.previewAccent.style.color = previewAccentForeground(accent);
  elements.previewAccent.textContent = accent.toUpperCase();
  elements.previewTheme.textContent = themeLabel(accent);
  elements.previewModules.textContent = selectedModules.length > 0
    ? selectedModules.map(moduleLabel).join(", ")
    : "Noch keine Module gewählt";
  elements.previewServices.textContent = selectedServices.length > 0
    ? selectedServices.map(serviceLabel).join(", ")
    : "Keine zusätzlichen Dienste";
  if (elements.accentColorValue) elements.accentColorValue.textContent = accent.toUpperCase();
}

function selectedValues(container) {
  if (!container) return [];
  return [...container.querySelectorAll("input:checked")].map((input) => input.value);
}

function validateAppId() {
  if (!elements.appId) return;
  const valid = /^[a-z][a-z0-9-]{1,62}$/.test(elements.appId.value);
  elements.appId.setCustomValidity(
    valid || elements.appId.value.length === 0
      ? ""
      : "Kleinbuchstaben, Zahlen und Bindestriche; Start mit Buchstabe.",
  );
}

function appIdFromName(value) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("de-DE")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 63);
}

function firstLetter(value) {
  return [...value.trim()][0]?.toLocaleUpperCase("de-DE") ?? "A";
}

function detailRow(label, values, labelFor = (value) => value) {
  const row = document.createElement("div");
  const heading = document.createElement("strong");
  heading.textContent = label;
  const content = document.createElement("span");
  content.textContent = values.length > 0 ? values.map(labelFor).join(", ") : "—";
  row.append(heading, content);
  return row;
}

function replaceWithValueChips(container, values, labelFor) {
  if (!container) return;
  container.replaceChildren();
  if (values.length === 0) {
    container.textContent = "—";
    return;
  }
  for (const value of values) {
    const chip = document.createElement("span");
    chip.className = "ab-chip";
    chip.textContent = labelFor(value);
    container.append(chip);
  }
}

function moduleLabel(moduleId) {
  const labels = {
    tasks: "Aufgaben",
  };
  return labels[moduleId] ?? moduleId;
}

function serviceLabel(serviceId) {
  const labels = {
    identity: "Benutzer",
    permissions: "Rollen & Rechte",
  };
  return labels[serviceId] ?? serviceId;
}

function themeLabel(accent) {
  return accent.toLowerCase() === "#2563eb" ? "AppBasis Standard" : "Individuelle Akzentfarbe";
}

function emptyState(text) {
  const element = document.createElement("p");
  element.className = "factory-empty";
  element.textContent = text;
  return element;
}

function showError(message) {
  if (!elements.error) return;
  elements.error.textContent = message;
  elements.error.hidden = message.length === 0;
}

function captureDraftCatalogState() {
  return {
    modules: selectedValues(elements.moduleOptions),
    services: selectedValues(elements.serviceOptions),
    focus: focusedDraftOption(),
  };
}

function focusedDraftOption() {
  const active = document.activeElement;
  if (!(active instanceof HTMLInputElement)) return null;
  if (!elements.moduleOptions?.contains(active) && !elements.serviceOptions?.contains(active)) {
    return null;
  }
  return { value: active.value, kind: elements.moduleOptions?.contains(active) ? "module" : "service" };
}

function restoreDraftCatalogFocus(focus) {
  if (!focus) return;
  const container = focus.kind === "module" ? elements.moduleOptions : elements.serviceOptions;
  const candidate = [...(container?.querySelectorAll("input") ?? [])].find(
    (input) => input.value === focus.value,
  );
  candidate?.focus();
}

function focusedAppButtonId() {
  const active = document.activeElement;
  if (!(active instanceof HTMLButtonElement)) return null;
  return active.dataset.appId ?? null;
}

function restoreListFocusAfterRender(appId) {
  if (appId === null) return;
  focusAppOpenButton(appId);
}

function scheduleAppsFocus(appId) {
  queueMicrotask(() => {
    if (appId !== null && focusAppOpenButton(appId)) return;
    document.querySelector("button[data-tab='apps']")?.focus();
  });
}

function focusAppOpenButton(appId) {
  const candidate = [...(elements.appsList?.querySelectorAll("button[data-app-id]") ?? [])].find(
    (button) => button.dataset.appId === appId,
  );
  candidate?.focus();
  return candidate !== undefined;
}
