export const ULC_USER_ADMIN_HTML = `
<section class="app-section" data-app-section="users" id="users" hidden>
  <section class="hero">
    <p class="eyebrow">Organisation</p>
    <h1>Benutzer</h1>
    <p class="summary">Konten prüfen und Testzugänge für Trainer oder Athleten anlegen.</p>
  </section>
  <p id="user-admin-message" class="message message--error" role="alert" hidden></p>
  <p id="user-admin-success" class="message message--success" role="status" hidden></p>
  <section class="card">
    <div class="section-heading">
      <div><h2>Benutzerkonten <span id="user-admin-count"></span></h2></div>
      <button type="button" class="button button--secondary" id="user-admin-refresh">Aktualisieren</button>
    </div>
    <div class="user-admin-filters">
      <label>Benutzer suchen
        <input id="user-admin-search" type="search" placeholder="Name oder Benutzername" maxlength="120" autocomplete="off" />
      </label>
      <label>Status
        <select id="user-admin-status-filter">
          <option value="all">Alle</option>
          <option value="active">Aktiv</option>
          <option value="inactive">Inaktiv / gesperrt</option>
        </select>
      </label>
    </div>
    <div id="user-admin-list" class="user-admin-list"></div>
  </section>
  <section class="card" id="user-admin-access-editor" hidden>
    <div class="section-heading">
      <div><h2>Modulrechte</h2><p id="user-admin-access-name"></p></div>
      <button class="button button--secondary" type="button" id="user-admin-access-close">Schließen</button>
    </div>
    <p class="settings-note">Nur für Trainerkonten. Die Rolle bleibt unverändert; pro Modul wird Kein Zugriff, Lesen oder Bearbeiten vergeben.</p>
    <form id="user-admin-access-form">
      <div class="user-admin-access-list" id="user-admin-access-list"></div>
      <button class="button button--primary" type="submit" id="user-admin-access-save">Rechte speichern</button>
    </form>
  </section>
  <section class="card">
    <div class="section-heading"><div><h2>Testzugang anlegen</h2></div></div>
    <p class="settings-note">Ein Zugang wird mit einem vorhandenen Trainer oder Athleten verknüpft. Zum Testen kann davor in den Stammdaten ein eigener Test-Trainer oder Test-Athlet erstellt werden. Der Benutzer muss beim ersten Login sein Passwort ändern.</p>
    <form id="user-admin-form" class="form-stack">
      <label>Rolle
        <select id="user-admin-role" required>
          <option value="trainer">Trainer</option>
          <option value="athlete">Athlet</option>
        </select>
      </label>
      <label>Zuordnung
        <select id="user-admin-target" required><option value="">Bitte auswählen</option></select>
      </label>
      <label>Benutzername
        <input id="user-admin-username" minlength="3" maxlength="30" pattern="[a-z0-9._]+" autocomplete="off" required />
      </label>
      <label>Anzeigename
        <input id="user-admin-name" maxlength="120" autocomplete="off" required />
      </label>
      <label>E-Mail (optional, kein automatischer Versand)
        <input id="user-admin-email" type="email" maxlength="320" autocomplete="off" />
      </label>
      <label>Temporäres Passwort
        <input id="user-admin-password" type="password" minlength="8" maxlength="128" autocomplete="new-password" required />
      </label>
      <button type="submit" class="button button--primary" id="user-admin-create">Benutzer anlegen</button>
    </form>
    <dialog id="user-admin-reset-dialog" class="user-admin-reset-dialog" aria-labelledby="user-admin-reset-title" aria-modal="true">
      <form id="user-admin-reset-form" class="form-stack">
        <h2 id="user-admin-reset-title">Temporäres Passwort setzen</h2>
        <p id="user-admin-reset-target" class="settings-note"></p>
        <p class="settings-note">Der Benutzer wird auf allen Geräten abgemeldet und muss beim nächsten Login das Passwort ändern.</p>
        <label>Neues temporäres Passwort
          <input id="user-admin-reset-password" type="password" autocomplete="new-password" minlength="8" maxlength="128" required />
        </label>
        <div class="user-admin-invite-actions">
          <button class="button button--primary" type="submit" id="user-admin-reset-confirm">Passwort zurücksetzen</button>
          <button class="button button--secondary" type="button" id="user-admin-reset-cancel">Abbrechen</button>
        </div>
      </form>
    </dialog>
    <div id="user-admin-invitation" hidden>
      <p class="settings-note">Zugang angelegt oder Passwort zurückgesetzt. Du kannst die Einladung am Handy teilen oder kopieren. Sie enthält das temporäre Passwort – verwende einen sicheren Kanal. Das Passwort wird hier nicht dauerhaft gespeichert.</p>
      <div class="user-admin-invite-actions">
        <button type="button" class="button button--primary" id="user-admin-share">Einladung teilen</button>
        <button type="button" class="button button--secondary" id="user-admin-copy">Einladung kopieren</button>
        <button type="button" class="button button--secondary" id="user-admin-invite-close">Schließen</button>
      </div>
    </div>
  </section>
</section>
`;

export const ULC_USER_ADMIN_CSS = `
.user-admin-list { display: grid; gap: 7px; }
.user-admin-reset-dialog { width: min(460px, calc(100vw - 24px)); max-height: calc(100dvh - 24px); padding: 18px; border: 1px solid var(--border); border-radius: var(--radius); color: var(--text); background: var(--card); overflow-y: auto; }
.user-admin-reset-dialog::backdrop { background: rgb(15 23 42 / 55%); }
.user-admin-reset-dialog .form-stack { margin-top: 0; }
.user-admin-reset-dialog .user-admin-invite-actions { margin-top: 8px; }
.user-admin-filters { display: grid; grid-template-columns: minmax(0, 1fr) minmax(112px, .6fr); gap: 8px; margin: 8px 0 12px; }
.user-admin-filters input, .user-admin-filters select { width: 100%; min-width: 0; font-size: 16px; }
.user-admin-invite-actions { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; }
@media (max-width: 380px) { .user-admin-filters { grid-template-columns: minmax(0, 1fr); } }

.user-admin-row { padding: 10px 0; border-bottom: 1px solid var(--border); display: flex; gap: 8px; align-items: flex-start; justify-content: space-between; min-width: 0; }
.user-admin-row:last-child { border-bottom: 0; }
.user-admin-row__identity { display: grid; min-width: 0; gap: 2px; overflow-wrap: anywhere; }
.user-admin-row__meta { font-size: .84rem; color: var(--secondary); }
.user-admin-row__status { flex: 0 0 auto; font-size: .8rem; }
#user-admin-form { display: grid; gap: 10px; }
#user-admin-form input, #user-admin-form select { width: 100%; min-width: 0; font-size: 16px; }
.user-admin-access-list { display: grid; gap: 8px; margin: 12px 0; }
.user-admin-access-row { display: grid; grid-template-columns: minmax(0, 1fr) minmax(130px, 150px); gap: 10px; align-items: center; }
.user-admin-access-row select { min-height: 42px; min-width: 0; width: 100%; font-size: 16px; }
.user-admin-row__actions { display: flex; gap: 5px; align-items: center; justify-content: flex-end; flex-wrap: wrap; flex: 0 1 auto; max-width: 57%; }
.user-admin-row__actions .button { min-height: 38px; padding: 4px 8px; }
#user-admin-invitation { margin-top: 12px; }
#user-admin-invitation .button { margin: 3px; }
`;

export const ULC_USER_ADMIN_SCRIPT = String.raw`
const userAdminElements = Object.freeze({
  message: document.querySelector("#user-admin-message"),
  success: document.querySelector("#user-admin-success"),
  list: document.querySelector("#user-admin-list"),
  count: document.querySelector("#user-admin-count"),
  refresh: document.querySelector("#user-admin-refresh"),
  search: document.querySelector("#user-admin-search"),
  statusFilter: document.querySelector("#user-admin-status-filter"),
  form: document.querySelector("#user-admin-form"),
  role: document.querySelector("#user-admin-role"),
  target: document.querySelector("#user-admin-target"),
  username: document.querySelector("#user-admin-username"),
  name: document.querySelector("#user-admin-name"),
  email: document.querySelector("#user-admin-email"),
  password: document.querySelector("#user-admin-password"),
  create: document.querySelector("#user-admin-create"),
  invitation: document.querySelector("#user-admin-invitation"),
  copy: document.querySelector("#user-admin-copy"),
  share: document.querySelector("#user-admin-share"),
  inviteClose: document.querySelector("#user-admin-invite-close"),
  resetDialog: document.querySelector("#user-admin-reset-dialog"),
  resetForm: document.querySelector("#user-admin-reset-form"),
  resetTarget: document.querySelector("#user-admin-reset-target"),
  resetPassword: document.querySelector("#user-admin-reset-password"),
  resetConfirm: document.querySelector("#user-admin-reset-confirm"),
  resetCancel: document.querySelector("#user-admin-reset-cancel"),
  accessEditor: document.querySelector("#user-admin-access-editor"),
  accessName: document.querySelector("#user-admin-access-name"),
  accessList: document.querySelector("#user-admin-access-list"),
  accessForm: document.querySelector("#user-admin-access-form"),
  accessSave: document.querySelector("#user-admin-access-save"),
  accessClose: document.querySelector("#user-admin-access-close"),
});

let userAdminReady = false;
let userAdminBusy = false;
let userAdminUsers = [];
let userAdminTargets = null;
let userAdminGeneration = 0;
let userAdminInviteText = "";
let userAdminAccessSnapshot = null;
let userAdminResetIdentityId = null;
let userAdminResetUsername = "";

userAdminElements.refresh?.addEventListener("click", () => void loadUserAdmin());
userAdminElements.search?.addEventListener("input", renderUserAdminList);
userAdminElements.statusFilter?.addEventListener("change", renderUserAdminList);
userAdminElements.role?.addEventListener("change", renderUserAdminTargets);
userAdminElements.form?.addEventListener("submit", (event) => void createUserAdminAccount(event));
userAdminElements.copy?.addEventListener("click", () => void copyUserAdminInvitation());
userAdminElements.share?.addEventListener("click", () => void shareUserAdminInvitation());
userAdminElements.inviteClose?.addEventListener("click", clearUserAdminInvitation);
userAdminElements.accessClose?.addEventListener("click", closeUserAdminAccess);
userAdminElements.accessForm?.addEventListener("submit", (event) => void saveUserAdminAccess(event));
userAdminElements.resetForm?.addEventListener("submit", (event) => void saveUserAdminPasswordReset(event));
userAdminElements.resetCancel?.addEventListener("click", closeUserAdminPasswordReset);
userAdminElements.resetDialog?.addEventListener("close", () => {
  userAdminResetIdentityId = null;
  userAdminResetUsername = "";
  if (userAdminElements.resetPassword) userAdminElements.resetPassword.value = "";
});

function clearUserAdminInvitation() {
  userAdminInviteText = "";
  if (userAdminElements.invitation) userAdminElements.invitation.hidden = true;
}

function resetUserAdminSessionState() {
  userAdminGeneration += 1;
  userAdminReady = false;
  userAdminBusy = false;
  userAdminUsers = [];
  userAdminTargets = null;
  clearUserAdminInvitation();
  closeUserAdminAccess();
  closeUserAdminPasswordReset();
  userAdminElements.form?.reset();
  if (userAdminElements.search) userAdminElements.search.value = "";
  if (userAdminElements.statusFilter) userAdminElements.statusFilter.value = "all";
  userAdminElements.list?.replaceChildren();
  if (userAdminElements.count) userAdminElements.count.textContent = "";
  showMessage(userAdminElements.message, "");
  showMessage(userAdminElements.success, "");
}

async function bootstrapUserAdmin() {
  const generation = ++userAdminGeneration;
  userAdminReady = false;
  try {
    const payload = await requestJson("/api/admin/users");
    if (generation !== userAdminGeneration) return;
    if (!Array.isArray(payload?.users)) throw new Error("INVALID_USER_ADMIN_RESPONSE");
    userAdminReady = true;
    userAdminUsers = payload.users;
    renderUserAdminList();
  } catch (error) {
    if (generation !== userAdminGeneration) return;
    userAdminReady = false;
    userAdminUsers = [];
    if (error?.status !== 403) {
      showMessage(userAdminElements.message, "Die Benutzerverwaltung konnte nicht geladen werden.");
    }
  }
  if (generation === userAdminGeneration) refreshAppAvailability();
}

async function loadUserAdmin() {
  if (!userAdminReady || userAdminBusy) return;
  const generation = userAdminGeneration;
  userAdminBusy = true;
  updateUserAdminControls();
  try {
    const payload = await requestJson("/api/admin/users");
    if (generation !== userAdminGeneration) return;
    if (!Array.isArray(payload?.users)) throw new Error("INVALID_USER_ADMIN_RESPONSE");
    userAdminUsers = payload.users;
    renderUserAdminList();
    showMessage(userAdminElements.message, "");
  } catch {
    if (generation === userAdminGeneration) {
      showMessage(userAdminElements.message, "Benutzer konnten nicht aktualisiert werden.");
    }
  } finally {
    if (generation === userAdminGeneration) {
      userAdminBusy = false;
      updateUserAdminControls();
    }
  }
}

function renderUserAdminList() {
  const container = userAdminElements.list;
  if (!container) return;
  container.replaceChildren();
  const search = (userAdminElements.search?.value || "").trim().toLocaleLowerCase("de-AT");
  const statusFilter = userAdminElements.statusFilter?.value || "all";
  const filtered = userAdminUsers.filter((user) => {
    const active = user.active === true && user.blocked !== true;
    const statusMatches = statusFilter === "all" ||
      (statusFilter === "active" && active) ||
      (statusFilter === "inactive" && !active);
    const text = [user.displayName, user.username].filter(Boolean).join(" ")
      .toLocaleLowerCase("de-AT");
    return statusMatches && text.includes(search);
  });
  if (userAdminElements.count) {
    userAdminElements.count.textContent = "(" + filtered.length +
      (filtered.length === userAdminUsers.length ? "" : " von " + userAdminUsers.length) + ")";
  }
  const roles = { admin: "Administrator", trainer: "Trainer", athlete: "Athlet", parent: "Eltern" };
  for (const user of filtered) {
    const row = document.createElement("article");
    row.className = "user-admin-row";
    const main = document.createElement("div");
    main.className = "user-admin-row__identity";
    const title = document.createElement("strong");
    title.textContent = String(user.displayName || user.username || "");
    const meta = document.createElement("span");
    meta.className = "user-admin-row__meta";
    meta.textContent = String(user.username || "") + " · " + (roles[user.sourceRole] || "Unbekannt");
    const status = document.createElement("span");
    status.className = "user-admin-row__status";
    status.textContent = user.blocked ? "Gesperrt" : user.active ? "Aktiv" : "Inaktiv";
    main.append(title, meta);
    const actions = document.createElement("div");
    actions.className = "user-admin-row__actions";
    actions.append(status);
    if (user.active && !user.blocked) {
      const invite = document.createElement("button");
      invite.type = "button";
      invite.className = "button button--secondary";
      invite.textContent = "Link";
      invite.setAttribute("aria-label", "Anmeldelink für " + String(user.displayName || user.username) + " teilen");
      invite.addEventListener("click", () => void shareExistingUserAdminLogin(user.username));
      actions.append(invite);
    }
    if (user.sourceRole === "trainer" && user.active && !user.blocked) {
      const edit = document.createElement("button");
      edit.type = "button";
      edit.className = "button button--secondary";
      edit.textContent = "Rechte";
      edit.setAttribute("aria-label", "Modulrechte für " + String(user.displayName || user.username));
      edit.addEventListener("click", () => void openUserAdminAccess(user.identityId));
      actions.append(edit);
    }
    if (user.sourceRole === "trainer" || user.sourceRole === "athlete") {
      if (user.active && !user.blocked) {
        const reset = document.createElement("button");
        reset.type = "button";
        reset.className = "button button--secondary";
        reset.textContent = "Passwort";
        reset.setAttribute("aria-label", "Passwort zurücksetzen für " + user.username);
        reset.addEventListener("click", () => openUserAdminPasswordReset(user));
        actions.append(reset);
      }
      const action = !user.active ? (!user.blocked ? "reactivate" : null)
        : user.blocked ? "unblock" : "block";
      if (action) {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "button button--secondary";
        button.textContent = action === "block" ? "Sperren"
          : action === "unblock" ? "Entsperren" : "Reaktivieren";
        button.setAttribute("aria-label", button.textContent + ": " + user.username);
        button.addEventListener("click", () => void changeUserAdminStatus(user, action));
        actions.append(button);
      }
    }
    row.append(main, actions);
    container.append(row);
  }
  if (filtered.length === 0) {
    const empty = document.createElement("p");
    empty.textContent = userAdminUsers.length === 0
      ? "Noch keine Benutzer vorhanden."
      : "Keine Benutzer entsprechen der Suche.";
    container.append(empty);
  }
}

function closeUserAdminPasswordReset() {
  if (userAdminElements.resetDialog?.open) userAdminElements.resetDialog.close();
  userAdminResetIdentityId = null;
  userAdminResetUsername = "";
  if (userAdminElements.resetPassword) userAdminElements.resetPassword.value = "";
}

function openUserAdminPasswordReset(user) {
  if (!userAdminReady || userAdminBusy || userAdminElements.resetDialog?.open) return;
  if (!user?.active || user?.blocked || !["trainer", "athlete"].includes(user.sourceRole)) return;
  userAdminResetIdentityId = user.identityId;
  userAdminResetUsername = user.username;
  if (userAdminElements.resetTarget) userAdminElements.resetTarget.textContent =
    String(user.displayName || user.username) + " (" + user.username + ")";
  if (userAdminElements.resetPassword) userAdminElements.resetPassword.value = "";
  userAdminElements.resetDialog?.showModal();
  userAdminElements.resetPassword?.focus();
}

async function saveUserAdminPasswordReset(event) {
  event.preventDefault();
  if (!userAdminReady || userAdminBusy || !userAdminResetIdentityId ||
    !userAdminElements.resetForm?.reportValidity()) return;
  const generation = userAdminGeneration;
  const identityId = userAdminResetIdentityId;
  const username = userAdminResetUsername;
  const password = userAdminElements.resetPassword?.value || "";
  if (!window.confirm("Passwort für " + username +
    " zurücksetzen und alle bisherigen Sitzungen beenden?")) return;
  userAdminBusy = true;
  updateUserAdminControls();
  showMessage(userAdminElements.message, "");
  clearUserAdminInvitation();
  try {
    await requestJson("/api/admin/users/" + encodeURIComponent(identityId) + "/password-reset", {
      method: "POST",
      body: JSON.stringify({ temporaryPassword: password }),
    });
    if (generation !== userAdminGeneration) return;
    userAdminInviteText =
      "ULC Linz neuer Testzugang\n" +
      "App: " + window.location.origin + "\n" +
      "Benutzername: " + username + "\n" +
      "Temporäres Passwort: " + password + "\n" +
      "Beim nächsten Login das Passwort ändern.";
    closeUserAdminPasswordReset();
    if (userAdminElements.invitation) userAdminElements.invitation.hidden = false;
    showMessage(userAdminElements.success,
      "Passwort zurückgesetzt. Alle bisherigen Sitzungen beendet. Zugang jetzt sicher teilen.");
  } catch (error) {
    if (generation === userAdminGeneration) {
      showMessage(userAdminElements.message, error?.status === 403
        ? "Dieses Konto darf nicht zurückgesetzt werden."
        : error?.status === 409 ? "Der Kontostand hat sich verändert. Bitte Liste aktualisieren."
          : "Passwort konnte nicht zurückgesetzt werden.");
    }
  } finally {
    if (generation === userAdminGeneration) {
      userAdminBusy = false;
      updateUserAdminControls();
    }
  }
}

async function changeUserAdminStatus(user, action) {
  if (!userAdminReady || userAdminBusy || !user?.identityId) return;
  const verbs = { block: "sperren", unblock: "entsperren", reactivate: "reaktivieren" };
  if (!verbs[action] || !window.confirm(user.username + " wirklich " + verbs[action] + "?")) return;
  const generation = userAdminGeneration;
  userAdminBusy = true;
  updateUserAdminControls();
  showMessage(userAdminElements.message, "");
  try {
    await requestJson("/api/admin/users/" + encodeURIComponent(user.identityId) + "/status", {
      method: "POST",
      body: JSON.stringify({ action }),
    });
    if (generation !== userAdminGeneration) return;
    const payload = await requestJson("/api/admin/users");
    if (generation !== userAdminGeneration) return;
    if (!Array.isArray(payload?.users)) throw new Error("INVALID_USERS");
    userAdminUsers = payload.users;
    renderUserAdminList();
    showMessage(userAdminElements.success,
      user.username + " wurde " +
      (action === "block" ? "gesperrt" : action === "unblock" ? "entsperrt" : "reaktiviert") +
      ". Alte Sitzungen wurden beendet.");
  } catch (error) {
    if (generation === userAdminGeneration) {
      showMessage(userAdminElements.message, error?.status === 403
        ? "Dieses Konto oder die verknüpfte Person ist nicht für die Aktion freigegeben."
        : error?.status === 409 ? "Kontostand geändert – bitte Liste aktualisieren."
          : "Kontostatus konnte nicht geändert werden.");
    }
  } finally {
    if (generation === userAdminGeneration) {
      userAdminBusy = false;
      updateUserAdminControls();
    }
  }
}

function closeUserAdminAccess() {
  userAdminAccessSnapshot = null;
  if (userAdminElements.accessEditor) userAdminElements.accessEditor.hidden = true;
  userAdminElements.accessList?.replaceChildren();
}

async function openUserAdminAccess(identityId) {
  if (!userAdminReady || userAdminBusy || typeof identityId !== "string") return;
  const generation = userAdminGeneration;
  userAdminBusy = true;
  updateUserAdminControls();
  closeUserAdminAccess();
  showMessage(userAdminElements.message, "");
  try {
    const payload = await requestJson("/api/admin/users/" +
      encodeURIComponent(identityId) + "/access");
    if (generation !== userAdminGeneration) return;
    if (!Array.isArray(payload?.permissions?.modules)) throw new Error("INVALID_ACCESS");
    userAdminAccessSnapshot = payload.permissions;
    renderUserAdminAccess();
    if (userAdminElements.accessEditor) userAdminElements.accessEditor.hidden = false;
    userAdminElements.accessEditor?.scrollIntoView({ block: "nearest" });
  } catch (error) {
    if (generation === userAdminGeneration) {
      showMessage(userAdminElements.message, error?.status === 403
        ? "Für dieses Konto dürfen die Modulrechte nicht bearbeitet werden."
        : "Modulrechte konnten nicht geladen werden.");
    }
  } finally {
    if (generation === userAdminGeneration) {
      userAdminBusy = false;
      updateUserAdminControls();
    }
  }
}

function renderUserAdminAccess() {
  const snapshot = userAdminAccessSnapshot;
  if (!snapshot || !userAdminElements.accessList) return;
  if (userAdminElements.accessName) {
    userAdminElements.accessName.textContent = String(snapshot.username || "");
  }
  userAdminElements.accessList.replaceChildren();
  for (const module of snapshot.modules) {
    const row = document.createElement("label");
    row.className = "user-admin-access-row";
    const name = document.createElement("span");
    name.textContent = String(module.label || module.key);
    const select = document.createElement("select");
    select.dataset.userAccessModule = String(module.key);
    for (const [value, label] of [
      ["none", "Kein Zugriff"],
      ["view", "Lesen"],
      ["edit", "Bearbeiten"],
    ]) {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = label;
      select.append(option);
    }
    select.value = module.level;
    row.append(name, select);
    userAdminElements.accessList.append(row);
  }
}

async function saveUserAdminAccess(event) {
  event.preventDefault();
  if (!userAdminReady || userAdminBusy || !userAdminAccessSnapshot) return;
  const snapshot = userAdminAccessSnapshot;
  const generation = userAdminGeneration;
  const selects = [...(userAdminElements.accessList?.querySelectorAll("[data-user-access-module]") || [])];
  const modules = selects.map((select) => ({
    key: select.dataset.userAccessModule,
    level: select.value,
  }));
  userAdminBusy = true;
  updateUserAdminControls();
  showMessage(userAdminElements.message, "");
  showMessage(userAdminElements.success, "");
  try {
    const payload = await requestJson("/api/admin/users/" +
      encodeURIComponent(snapshot.userId) + "/access", {
      method: "POST",
      body: JSON.stringify({
        modules,
        expectedGrants: snapshot.expectedGrants,
        expectedRevokes: snapshot.expectedRevokes,
      }),
    });
    if (generation !== userAdminGeneration) return;
    if (!Array.isArray(payload?.permissions?.modules)) throw new Error("INVALID_ACCESS");
    userAdminAccessSnapshot = payload.permissions;
    renderUserAdminAccess();
    showMessage(userAdminElements.success,
      "Modulrechte gespeichert. Der Benutzer sollte sich für die Übernahme neu anmelden.");
  } catch (error) {
    if (generation === userAdminGeneration) {
      showMessage(userAdminElements.message,
        error?.status === 409
          ? "Die Rechte wurden zwischenzeitlich verändert. Schließen und erneut öffnen."
          : error?.status === 403
            ? "Du darfst diese Modulrechte nicht bearbeiten."
            : "Modulrechte konnten nicht gespeichert werden.");
    }
  } finally {
    if (generation === userAdminGeneration) {
      userAdminBusy = false;
      updateUserAdminControls();
    }
  }
}

async function prepareUserAdminView() {
  if (!userAdminReady || userAdminBusy) return;
  if (userAdminTargets !== null) {
    renderUserAdminTargets();
    return;
  }
  const generation = userAdminGeneration;
  try {
    const payload = await requestJson("/api/modules/athletes/masterdata");
    if (generation !== userAdminGeneration) return;
    const masterdata = payload?.masterdata;
    if (!Array.isArray(masterdata?.athletes) || !Array.isArray(masterdata?.trainers)) {
      throw new Error("INVALID_USER_ADMIN_TARGETS");
    }
    userAdminTargets = masterdata;
    renderUserAdminTargets();
  } catch {
    if (generation === userAdminGeneration) {
      showMessage(userAdminElements.message, "Trainer und Athleten konnten nicht geladen werden.");
    }
  }
}

function renderUserAdminTargets() {
  const select = userAdminElements.target;
  if (!select) return;
  const previous = select.value;
  select.replaceChildren();
  const empty = document.createElement("option");
  empty.value = "";
  empty.textContent = "Bitte auswählen";
  select.append(empty);
  const role = userAdminElements.role?.value || "trainer";
  const targets = role === "athlete" ? userAdminTargets?.athletes : userAdminTargets?.trainers;
  for (const item of targets || []) {
    if (item.isActive === false) continue;
    const label = role === "athlete"
      ? [item.firstName, item.lastName].filter(Boolean).join(" ")
      : [item.firstName, item.lastName].filter(Boolean).join(" ");
    const option = document.createElement("option");
    option.value = item.id;
    option.textContent = label || item.name || item.id;
    select.append(option);
  }
  if ([...select.options].some((option) => option.value === previous)) select.value = previous;
}

function updateUserAdminControls() {
  if (userAdminElements.refresh) userAdminElements.refresh.disabled = userAdminBusy;
  if (userAdminElements.create) userAdminElements.create.disabled = userAdminBusy;
  if (userAdminElements.share) userAdminElements.share.disabled = userAdminBusy;
  if (userAdminElements.copy) userAdminElements.copy.disabled = userAdminBusy;
  if (userAdminElements.accessSave) userAdminElements.accessSave.disabled = userAdminBusy;
  if (userAdminElements.resetConfirm) userAdminElements.resetConfirm.disabled = userAdminBusy;
  if (userAdminElements.resetCancel) userAdminElements.resetCancel.disabled = userAdminBusy;
}

async function createUserAdminAccount(event) {
  event.preventDefault();
  if (!userAdminReady || userAdminBusy || !userAdminElements.form?.reportValidity()) return;
  const role = userAdminElements.role?.value;
  if (role !== "trainer" && role !== "athlete") return;
  const generation = userAdminGeneration;
  const username = userAdminElements.username?.value || "";
  const temporaryPassword = userAdminElements.password?.value || "";
  const body = {
    username,
    displayName: userAdminElements.name?.value?.trim() || "",
    temporaryPassword,
    ...(userAdminElements.email?.value.trim() ? { contactEmail: userAdminElements.email.value.trim() } : {}),
    ...(role === "trainer"
      ? { trainerId: userAdminElements.target?.value || "" }
      : { athleteId: userAdminElements.target?.value || "" }),
  };
  userAdminBusy = true;
  updateUserAdminControls();
  clearUserAdminInvitation();
  showMessage(userAdminElements.message, "");
  showMessage(userAdminElements.success, "");
  try {
    await requestJson(role === "trainer" ? "/api/admin/trainer-users" : "/api/admin/athlete-users", {
      method: "POST",
      body: JSON.stringify(body),
    });
    if (generation !== userAdminGeneration) return;
    // No automatic email is sent. The admin can share or copy this one-time message.
    userAdminInviteText =
      "ULC Linz Testzugang\n" +
      "App: " + window.location.origin + "\n" +
      "Benutzername: " + username + "\n" +
      "Temporäres Passwort: " + temporaryPassword + "\n" +
      "Beim ersten Login bitte das Passwort ändern.";
    if (userAdminElements.invitation) userAdminElements.invitation.hidden = false;
    userAdminElements.form?.reset();
    if (userAdminElements.password) userAdminElements.password.value = "";
    renderUserAdminTargets();
    showMessage(userAdminElements.success, "Benutzer angelegt. Einladung jetzt teilen oder kopieren.");
    userAdminTargets = null;
    try {
      const payload = await requestJson("/api/admin/users");
      if (generation === userAdminGeneration && Array.isArray(payload?.users)) {
        userAdminUsers = payload.users;
        renderUserAdminList();
      }
    } catch {
      if (generation === userAdminGeneration) {
        showMessage(userAdminElements.success,
          "Benutzer angelegt. Die Liste konnte nicht aktualisiert werden; die Einladung kann trotzdem geteilt oder kopiert werden.");
      }
    }
  } catch (error) {
    if (generation !== userAdminGeneration) return;
    showMessage(userAdminElements.message,
      error?.status === 409
        ? "Der Benutzername oder die Zuordnung ist bereits vergeben."
        : error?.status === 403
          ? "Keine Berechtigung zum Anlegen von Benutzern."
          : "Benutzer konnte nicht angelegt werden. Bitte Angaben prüfen.");
  } finally {
    if (generation === userAdminGeneration) {
      userAdminBusy = false;
      updateUserAdminControls();
    }
  }
}

async function shareUserAdminText(text, title) {
  if (typeof navigator.share === "function") {
    try {
      await navigator.share({ title, text });
      return "shared";
    } catch (error) {
      if (error?.name === "AbortError") return "cancelled";
      // Browser denied share; offer clipboard as a fallback.
    }
  }
  if (typeof navigator.clipboard?.writeText !== "function") return "unavailable";
  try {
    await navigator.clipboard.writeText(text);
    return "copied";
  } catch {
    return "unavailable";
  }
}

async function shareUserAdminInvitation() {
  if (!userAdminInviteText) return;
  const generation = userAdminGeneration;
  const result = await shareUserAdminText(userAdminInviteText, "ULC Linz Testzugang");
  if (generation !== userAdminGeneration) return;
  if (result === "shared" || result === "copied") {
    showMessage(userAdminElements.success, result === "shared"
      ? "Einladung geteilt. Bitte sicheren Empfänger prüfen."
      : "Einladung kopiert. Bitte über einen sicheren Kanal weitergeben.");
    clearUserAdminInvitation();
  } else if (result === "unavailable") {
    showMessage(userAdminElements.message, "Teilen oder Kopieren ist hier nicht verfügbar.");
  }
}

async function shareExistingUserAdminLogin(username) {
  if (!userAdminReady || typeof username !== "string" || !username) return;
  // Existing credentials are never accessible: share only app URL + username.
  const text = "ULC Linz Anmeldung\n" +
    "App: " + window.location.origin + "\n" +
    "Benutzername: " + username + "\n" +
    "Bitte mit deinem bestehenden Passwort anmelden. Falls du es nicht kennst, den Administrator kontaktieren.";
  const generation = userAdminGeneration;
  const result = await shareUserAdminText(text, "ULC Linz Anmeldung");
  if (generation !== userAdminGeneration) return;
  if (result === "shared" || result === "copied") {
    showMessage(userAdminElements.success, result === "shared"
      ? "Anmeldelink geteilt (ohne Passwort)."
      : "Anmeldelink kopiert (ohne Passwort).");
  } else if (result === "unavailable") {
    showMessage(userAdminElements.message, "Teilen oder Kopieren ist hier nicht verfügbar.");
  }
}

async function copyUserAdminInvitation() {
  if (!userAdminInviteText) return;
  try {
    await navigator.clipboard.writeText(userAdminInviteText);
    showMessage(userAdminElements.success, "Einladungstext kopiert. Bitte sicher übermitteln.");
    clearUserAdminInvitation();
  } catch {
    showMessage(userAdminElements.message, "Kopieren nicht möglich. Bitte Browser-Berechtigung prüfen.");
  }
}
`;
