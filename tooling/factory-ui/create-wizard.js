const form = document.querySelector("#create-form");
const panels = [...document.querySelectorAll("[data-wizard-panel]")];
const flowItems = [...document.querySelectorAll("[data-flow-step]")];
const backButton = document.querySelector("[data-wizard-back]");
const nextButton = document.querySelector("[data-wizard-next]");
const createButton = document.querySelector("#create-app-button");
const displayName = document.querySelector("#display-name");
const appId = document.querySelector("#app-id");
const brandMark = document.querySelector("#brand-mark");
const accentColor = document.querySelector("#accent-color");

const STEPS = Object.freeze(["identity", "branding", "modules", "roles", "preview"]);
const MAX_APP_ID_LENGTH = 63;
let currentIndex = 0;

backButton?.addEventListener("click", () => move(-1));
nextButton?.addEventListener("click", () => move(1));
form?.addEventListener("input", syncWizardAvailability);
form?.addEventListener("change", syncWizardAvailability);

renderStep({ focus: false });

function move(direction) {
  const targetIndex = currentIndex + direction;
  if (targetIndex < 0 || targetIndex >= STEPS.length) return;
  if (direction > 0 && !currentStepValid()) {
    syncWizardAvailability();
    focusFirstInvalidControl();
    return;
  }

  currentIndex = targetIndex;
  renderStep({ focus: true });
}

function renderStep({ focus }) {
  const currentStep = STEPS[currentIndex];
  if (form) {
    form.dataset.wizardStep = currentStep;
  }

  for (const panel of panels) {
    panel.hidden = panel.dataset.wizardPanel !== currentStep;
  }

  for (const [index, item] of flowItems.entries()) {
    const active = index === currentIndex;
    const complete = index < currentIndex;
    item.classList.toggle("is-current", active);
    item.classList.toggle("is-complete", complete);
    if (active) {
      item.setAttribute("aria-current", "step");
    } else {
      item.removeAttribute("aria-current");
    }
  }

  if (backButton) backButton.hidden = currentIndex === 0;
  if (nextButton) nextButton.hidden = currentIndex === STEPS.length - 1;
  if (createButton) createButton.hidden = currentIndex !== STEPS.length - 1;

  syncWizardAvailability();
  form?.dispatchEvent(new Event("change", { bubbles: true }));

  if (focus) {
    requestAnimationFrame(() => {
      const panel = panels.find((candidate) => candidate.dataset.wizardPanel === currentStep);
      const control = panel?.querySelector("input:not([type='hidden']), button, textarea, select");
      if (control instanceof HTMLElement) control.focus();
    });
  }
}

function syncWizardAvailability() {
  if (!nextButton) return;
  nextButton.disabled = !currentStepValid();
}

function currentStepValid() {
  const step = STEPS[currentIndex];
  if (step === "identity") {
    const name = displayName?.value.trim() ?? "";
    const id = appId?.value.trim() ?? "";
    return (
      name.length > 0 &&
      name.length <= 80 &&
      id.length <= MAX_APP_ID_LENGTH &&
      /^[a-z][a-z0-9-]*$/.test(id)
    );
  }

  if (step === "branding") {
    const mark = brandMark?.value.trim() ?? "";
    const color = accentColor?.value ?? "";
    return (
      Array.from(mark).length <= 2 &&
      /^#[0-9a-fA-F]{6}$/.test(color)
    );
  }

  return true;
}

function focusFirstInvalidControl() {
  if (STEPS[currentIndex] === "identity") {
    const name = displayName?.value.trim() ?? "";
    if (name.length === 0 || name.length > 80) {
      displayName?.focus();
      return;
    }
    appId?.focus();
    return;
  }

  if (STEPS[currentIndex] === "branding") {
    const mark = brandMark?.value.trim() ?? "";
    if (Array.from(mark).length > 2) {
      brandMark?.focus();
      return;
    }
    accentColor?.focus();
  }
}
