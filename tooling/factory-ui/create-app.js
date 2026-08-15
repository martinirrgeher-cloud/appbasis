const form = document.querySelector("#create-form");
const createButton = document.querySelector("#create-app-button");
const createReason = document.querySelector("#create-disabled-reason");
const status = document.querySelector("#factory-status");
const displayName = document.querySelector("#display-name");
const appId = document.querySelector("#app-id");
const createdAppIds = new Set();

let createPending = false;

form?.addEventListener("input", syncCreateAvailability);
form?.addEventListener("change", syncCreateAvailability);
form?.addEventListener("submit", handleCreateApp);

syncCreateAvailability();

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

    const appsTab = document.querySelector("button[data-tab='apps']");
    appsTab?.click();
    document.querySelector("[data-action='refresh']")?.click();
    appsTab?.focus();
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
  const validAppId = /^[a-z][a-z0-9-]*$/.test(input.appId);
  const duplicate = validAppId && appIdAlreadyExists(input.appId);

  createButton.disabled = createPending || !validName || !validAppId || duplicate;

  if (createPending) {
    createReason.textContent = "Die App wird gerade lokal erzeugt.";
  } else if (!validName) {
    createReason.textContent = "Bitte zuerst einen App-Namen eingeben.";
  } else if (!validAppId) {
    createReason.textContent = "Die App-ID muss mit einem Kleinbuchstaben beginnen und darf nur Kleinbuchstaben, Zahlen und Bindestriche enthalten.";
  } else if (duplicate) {
    createReason.textContent = "Diese App-ID ist bereits im Repository vorhanden.";
  } else {
    createReason.textContent = "Erzeugt ausschließlich das lokale App-Skelett im Repository. Preview und Produktion bleiben getrennt gesperrt.";
  }
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
