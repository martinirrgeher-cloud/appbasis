export const ULC_USER_ADMIN_HTML = `
<section class="app-section user-admin-page" data-app-section="users" id="users" hidden>
  <section class="hero user-admin-hero">
    <div class="user-admin-title-row">
      <h1>Benutzer</h1>
      <button type="button" class="button button--primary user-admin-icon-action" id="user-admin-new" title="Neuen Benutzer anlegen" aria-label="Neuen Benutzer anlegen">＋</button>
    </div>
  </section>
  <p id="user-admin-message" class="message message--error" role="alert" hidden></p>
  <p id="user-admin-success" class="message message--success" role="status" hidden></p>
  <section class="card user-admin-card">
    <div class="section-heading user-admin-list-heading">
      <h2>Benutzerkonten <span id="user-admin-count"></span></h2>
      <button type="button" class="button button--secondary user-admin-icon-action" id="user-admin-refresh" title="Benutzer aktualisieren" aria-label="Benutzer aktualisieren">↻</button>
    </div>
    <div class="user-admin-filters">
      <label>Suche
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

  <dialog id="user-admin-create-dialog" class="user-admin-dialog" aria-labelledby="user-admin-create-title" aria-modal="true">
    <header class="user-admin-dialog__header">
      <h2 id="user-admin-create-title">Benutzer anlegen</h2>
      <button type="button" class="button button--secondary user-admin-dialog__close" id="user-admin-create-close" aria-label="Anlegen schließen" title="Schließen">✕</button>
    </header>
    <p class="settings-note">Bestehenden Trainer oder Athleten zuordnen. Bereits verknüpfte Konten – auch gesperrte oder inaktive – in der Benutzerliste verwalten, nicht erneut anlegen. Beim ersten Login muss das Passwort geändert werden.</p>
    <p id="user-admin-create-error" class="message message--error" role="alert" hidden></p>
    <form id="user-admin-form" class="form-stack">
      <label>Rolle
        <select id="user-admin-role" required>
          <option value="trainer">Trainer</option>
          <option value="athlete">Athlet</option>
          <option value="functionary">Funktionär</option>
        </select>
      </label>
      <label id="user-admin-target-row">Zuordnung
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
      <div class="user-admin-dialog__footer">
        <button type="button" class="button button--secondary" id="user-admin-create-cancel">Abbrechen</button>
        <button type="submit" class="button button--primary" id="user-admin-create">Anlegen</button>
      </div>
    </form>
  </dialog>

  <dialog id="user-admin-access-editor" class="user-admin-dialog" aria-labelledby="user-admin-access-title" aria-modal="true">
    <header class="user-admin-dialog__header">
      <div>
        <h2 id="user-admin-access-title">Modulrechte</h2>
        <p id="user-admin-access-name" class="user-admin-dialog__subheading"></p>
      </div>
      <button class="button button--secondary user-admin-dialog__close" type="button" id="user-admin-access-close" aria-label="Modulrechte schließen" title="Schließen">✕</button>
    </header>
    <p class="settings-note">Berechtigungsprofil als Vorlage wählen und danach einzelne Module anpassen. Funktionäre haben eine eigene Vereinsrolle ohne technische Administratorrechte.</p>
    <label id="user-admin-profile-row" class="user-admin-profile-row" hidden>Berechtigungsprofil
      <select id="user-admin-profile"><option value="">Individuelle Berechtigungen</option></select>
    </label>
    <p id="user-admin-access-scope" class="settings-note"></p>
    <p id="user-admin-access-message" class="message message--error" role="alert" hidden></p>
    <form id="user-admin-access-form">
      <div class="user-admin-access-list" id="user-admin-access-list"></div>
      <div class="user-admin-dialog__footer">
        <button class="button button--secondary" type="button" id="user-admin-access-cancel">Abbrechen</button>
        <button class="button button--primary" type="submit" id="user-admin-access-save">Speichern</button>
      </div>
    </form>
  </dialog>

  <dialog id="user-admin-reset-dialog" class="user-admin-dialog" aria-labelledby="user-admin-reset-title" aria-modal="true">
    <header class="user-admin-dialog__header">
      <h2 id="user-admin-reset-title">Passwort zurücksetzen</h2>
      <button type="button" class="button button--secondary user-admin-dialog__close" id="user-admin-reset-close" aria-label="Passwortfenster schließen" title="Schließen">✕</button>
    </header>
    <form id="user-admin-reset-form" class="form-stack">
      <p id="user-admin-reset-target" class="settings-note"></p>
      <p class="settings-note">Alle bisherigen Sitzungen werden beendet. Beim nächsten Login muss das Passwort geändert werden.</p>
      <p id="user-admin-reset-error" class="message message--error" role="alert" hidden></p>
      <label>Neues temporäres Passwort
        <input id="user-admin-reset-password" type="password" autocomplete="new-password" minlength="8" maxlength="128" required />
      </label>
      <div class="user-admin-dialog__footer">
        <button class="button button--secondary" type="button" id="user-admin-reset-cancel">Abbrechen</button>
        <button class="button button--primary" type="submit" id="user-admin-reset-confirm">Zurücksetzen</button>
      </div>
    </form>
  </dialog>

  <dialog id="user-admin-invitation" class="user-admin-dialog" aria-labelledby="user-admin-invite-title" aria-modal="true">
    <header class="user-admin-dialog__header">
      <h2 id="user-admin-invite-title">Zugang weitergeben</h2>
      <button type="button" class="button button--secondary user-admin-dialog__close" id="user-admin-invite-close" aria-label="Einladung schließen" title="Schließen">✕</button>
    </header>
    <p class="settings-note">Zugang angelegt oder Passwort zurückgesetzt. Die Einladung enthält das temporäre Passwort – bitte nur über einen sicheren Kanal teilen. Das Passwort wird hier nicht dauerhaft gespeichert.</p>
    <p id="user-admin-invite-message" class="message message--error" role="alert" hidden></p>
    <div class="user-admin-dialog__footer user-admin-invite-actions">
      <button type="button" class="button button--primary" id="user-admin-share">Einladung teilen</button>
      <button type="button" class="button button--secondary" id="user-admin-copy">Kopieren</button>
    </div>
  </dialog>
</section>
`;

export const ULC_USER_ADMIN_CSS = `
.user-admin-page, .user-admin-card { min-width: 0; }
.user-admin-hero { margin-bottom: 10px; }
.user-admin-title-row { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.user-admin-title-row h1 { margin: 0; }
.user-admin-icon-action { width: 42px; min-width: 42px; min-height: 42px; padding: 0; display: inline-flex; align-items: center; justify-content: center; font-size: 1.35rem; line-height: 1; }
.user-admin-list-heading { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.user-admin-list-heading h2 { margin: 0; font-size: 1.08rem; }
.user-admin-filters { display: grid; grid-template-columns: minmax(0, 1fr) minmax(108px, .52fr); gap: 8px; margin: 10px 0 4px; }
.user-admin-filters label { min-width: 0; font-size: .82rem; }
.user-admin-filters input, .user-admin-filters select { width: 100%; min-width: 0; min-height: 40px; font-size: 16px; }
.user-admin-list { display: grid; gap: 0; min-width: 0; }
.user-admin-profile-row { display: grid; gap: 5px; margin: 10px 0; }
.user-admin-profile-row select { width: 100%; min-height: 42px; font-size: 16px; }
.user-admin-access-row select:disabled { opacity: .75; }
.user-admin-row { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 7px; align-items: center; padding: 10px 0; border-bottom: 1px solid var(--border); min-width: 0; }
.user-admin-row:last-child { border-bottom: 0; }
.user-admin-row__identity { display: grid; gap: 3px; min-width: 0; overflow-wrap: anywhere; }
.user-admin-row__identity strong { font-size: 1rem; line-height: 1.2; }
.user-admin-row__meta { font-size: .81rem; color: var(--secondary); }
.user-admin-row__status { font-size: .77rem; font-weight: 600; color: var(--secondary); }
.user-admin-row__status--active { color: var(--text); }
.user-admin-row__actions { display: flex; align-items: center; gap: 5px; justify-content: flex-end; min-width: 0; }
.user-admin-row__actions .button, .user-admin-actions-menu summary { min-height: 38px; padding: 6px 9px; font-size: .88rem; white-space: nowrap; }
.user-admin-actions-menu { position: relative; }
.user-admin-actions-menu summary { display: inline-flex; align-items: center; justify-content: center; list-style: none; cursor: pointer; border: 1px solid var(--border); border-radius: var(--radius); font-size: 1.3rem; line-height: 1; min-width: 38px; }
.user-admin-actions-menu summary::-webkit-details-marker { display: none; }
.user-admin-actions-menu[open] summary { background: var(--card); }
.user-admin-actions-menu__content { position: absolute; right: 0; top: calc(100% + 3px); z-index: 15; min-width: 160px; max-width: min(260px, calc(100vw - 44px)); padding: 5px; background: var(--card); border: 1px solid var(--border); border-radius: var(--radius); box-shadow: 0 7px 22px rgb(0 0 0 / 16%); display: grid; gap: 3px; }
.user-admin-actions-menu__content button { display: block; width: 100%; text-align: left; min-height: 40px; }
.user-admin-dialog { width: min(510px, calc(100vw - 20px)); max-width: min(510px, calc(100vw - 20px)); max-height: calc(100dvh - 20px); padding: 16px; border: 1px solid var(--border); border-radius: 14px; background: var(--card); color: var(--text); overflow-y: auto; box-sizing: border-box; }
.user-admin-dialog::backdrop { background: rgb(15 23 42 / 55%); }
.user-admin-dialog__header { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; position: sticky; top: -16px; padding: 5px 0 12px; background: var(--card); z-index: 2; }
.user-admin-dialog__header h2 { margin: 0; font-size: 1.24rem; }
.user-admin-dialog__subheading { margin: 3px 0 0; color: var(--secondary); font-size: .86rem; }
.user-admin-dialog__close { flex: 0 0 auto; width: 38px; min-height: 38px; padding: 0; }
.user-admin-dialog__footer { position: sticky; bottom: -16px; margin-top: 12px; padding: 12px 0 3px; display: flex; gap: 8px; justify-content: flex-end; align-items: center; flex-wrap: wrap; background: var(--card); z-index: 2; }
.user-admin-dialog__footer .button { min-height: 40px; }
.user-admin-dialog .form-stack { display: grid; gap: 10px; margin-top: 0; }
.user-admin-dialog input, .user-admin-dialog select { min-width: 0; width: 100%; font-size: 16px; }
.user-admin-dialog .message { margin: 9px 0; }
.user-admin-access-list { display: grid; gap: 0; margin: 8px 0; }
.user-admin-access-row { display: grid; grid-template-columns: minmax(0, 1fr) minmax(120px, 148px); gap: 8px; align-items: center; padding: 8px 0; border-bottom: 1px solid var(--border); }
.user-admin-access-row span { min-width: 0; overflow-wrap: anywhere; font-size: .9rem; }
.user-admin-access-row select { min-height: 40px; }
.user-admin-invite-actions { justify-content: flex-start; }
@media (max-width: 390px) {
  .user-admin-dialog { width: calc(100vw - 12px); max-width: calc(100vw - 12px); max-height: calc(100dvh - 12px); padding: 12px; }
  .user-admin-dialog__header { top: -12px; }
  .user-admin-dialog__footer { bottom: -12px; }
  .user-admin-row__actions .button { padding: 6px 7px; }
  .user-admin-access-row { grid-template-columns: minmax(0, 1fr) minmax(108px, 128px); }
}
`;

export const ULC_USER_ADMIN_SCRIPT = String.raw`
const userAdminElements = Object.freeze({
  message: document.querySelector("#user-admin-message"),
  createDialog: document.querySelector("#user-admin-create-dialog"),
  newButton: document.querySelector("#user-admin-new"),
  createClose: document.querySelector("#user-admin-create-close"),
  createCancel: document.querySelector("#user-admin-create-cancel"),
  createError: document.querySelector("#user-admin-create-error"),
  accessMessage: document.querySelector("#user-admin-access-message"),
  resetError: document.querySelector("#user-admin-reset-error"),
  inviteMessage: document.querySelector("#user-admin-invite-message"),
  resetClose: document.querySelector("#user-admin-reset-close"),
  accessCancel: document.querySelector("#user-admin-access-cancel"),
  success: document.querySelector("#user-admin-success"),
  list: document.querySelector("#user-admin-list"),
  count: document.querySelector("#user-admin-count"),
  refresh: document.querySelector("#user-admin-refresh"),
  search: document.querySelector("#user-admin-search"),
  statusFilter: document.querySelector("#user-admin-status-filter"),
  form: document.querySelector("#user-admin-form"),
  role: document.querySelector("#user-admin-role"),
  target: document.querySelector("#user-admin-target"),
  targetRow: document.querySelector("#user-admin-target-row"),
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
  accessScope: document.querySelector("#user-admin-access-scope"),
  profileRow: document.querySelector("#user-admin-profile-row"),
  profile: document.querySelector("#user-admin-profile"),
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
userAdminElements.newButton?.addEventListener("click", openUserAdminCreate);
userAdminElements.createClose?.addEventListener("click", () => closeUserAdminCreate());
userAdminElements.createCancel?.addEventListener("click", () => closeUserAdminCreate());
userAdminElements.createDialog?.addEventListener("cancel", (event) => {
  if (userAdminBusy) event.preventDefault();
});
userAdminElements.resetClose?.addEventListener("click", closeUserAdminPasswordReset);
userAdminElements.resetDialog?.addEventListener("cancel", (event) => {
  if (userAdminBusy) event.preventDefault();
});
userAdminElements.accessCancel?.addEventListener("click", () => closeUserAdminAccess());
userAdminElements.accessEditor?.addEventListener("cancel", (event) => {
  event.preventDefault();
  closeUserAdminAccess();
});
userAdminElements.accessEditor?.addEventListener("close", () => {
  userAdminAccessSnapshot = null;
  userAdminElements.accessList?.replaceChildren();
});
userAdminElements.invitation?.addEventListener("close", clearUserAdminInvitation);
document.addEventListener("click", (event) => {
  for (const menu of document.querySelectorAll(".user-admin-actions-menu[open]")) {
    if (!menu.contains(event.target)) menu.open = false;
  }
});
userAdminElements.search?.addEventListener("input", renderUserAdminList);
userAdminElements.statusFilter?.addEventListener("change", renderUserAdminList);
userAdminElements.role?.addEventListener("change", renderUserAdminTargets);
userAdminElements.form?.addEventListener("submit", (event) => void createUserAdminAccount(event));
userAdminElements.copy?.addEventListener("click", () => void copyUserAdminInvitation());
userAdminElements.share?.addEventListener("click", () => void shareUserAdminInvitation());
userAdminElements.inviteClose?.addEventListener("click", closeUserAdminInvitation);
userAdminElements.accessClose?.addEventListener("click", () => closeUserAdminAccess());
userAdminElements.accessForm?.addEventListener("submit", (event) => void saveUserAdminAccess(event));
userAdminElements.profile?.addEventListener("change", applyUserAdminPermissionProfile);
userAdminElements.resetForm?.addEventListener("submit", (event) => void saveUserAdminPasswordReset(event));
userAdminElements.resetCancel?.addEventListener("click", closeUserAdminPasswordReset);
userAdminElements.resetDialog?.addEventListener("close", () => {
  userAdminResetIdentityId = null;
  userAdminResetUsername = "";
  if (userAdminElements.resetPassword) userAdminElements.resetPassword.value = "";
});

function clearUserAdminInvitation() {
  userAdminInviteText = "";
  showMessage(userAdminElements.inviteMessage, "");
}

function closeUserAdminInvitation() {
  if (userAdminElements.invitation?.open) userAdminElements.invitation.close();
  clearUserAdminInvitation();
}

function openUserAdminInvitation() {
  if (!userAdminInviteText || userAdminElements.invitation?.open) return;
  showMessage(userAdminElements.inviteMessage, "");
  userAdminElements.invitation?.showModal();
}

function closeUserAdminCreate(force = false) {
  if (!force && userAdminBusy) return;
  if (userAdminElements.createDialog?.open) userAdminElements.createDialog.close();
  if (userAdminElements.password) userAdminElements.password.value = "";
  showMessage(userAdminElements.createError, "");
}

function openUserAdminCreate() {
  if (!userAdminReady || userAdminBusy || userAdminElements.createDialog?.open) return;
  userAdminElements.form?.reset();
  showMessage(userAdminElements.createError, "");
  userAdminElements.createDialog?.showModal();
  renderUserAdminTargets();
  void prepareUserAdminView();
}

function resetUserAdminSessionState() {
  userAdminGeneration += 1;
  userAdminReady = false;
  userAdminBusy = false;
  userAdminUsers = [];
  userAdminTargets = null;
  closeUserAdminInvitation();
  closeUserAdminCreate(true);
  closeUserAdminAccess(true);
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
    if (userAdminTargets !== null) renderUserAdminTargets();
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
  const isIncomplete = (user) => user.sourceRole === "trainer" &&
    String(user.subjectId || "").startsWith("ulc-unassigned-trainer:");
  const isRetired = (user) => user.sourceRole === "trainer" &&
    String(user.subjectId || "").startsWith("ulc-detached-trainer:");
  const filtered = userAdminUsers.filter((user) => {
    const active = user.active === true && user.blocked !== true &&
      !isIncomplete(user) && !isRetired(user);
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
  const roles = { admin: "Administrator", trainer: "Trainer", athlete: "Athlet", parent: "Eltern", functionary: "Funktionär" };
  for (const user of filtered) {
    const incomplete = isIncomplete(user);
    const retired = isRetired(user);
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
    status.textContent = incomplete ? "Einrichtung unvollständig" :
      retired ? "Ehemaliger Testzugang" :
      user.blocked ? "Gesperrt" : user.active ? "Aktiv" : "Inaktiv";
    if (user.active && !user.blocked && !incomplete && !retired) {
      status.classList.add("user-admin-row__status--active");
    }
    main.append(title, meta, status);
    if (incomplete) {
      const note = document.createElement("small");
      note.className = "user-admin-row__meta";
      note.textContent = "Trainerzuordnung fehlt. Konto nicht als Testzugang verwenden.";
      main.append(note);
    }
    const actions = document.createElement("div");
    actions.className = "user-admin-row__actions";
    const addAction = (parent, text, description, handler) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "button button--secondary";
      button.textContent = text;
      button.setAttribute("aria-label", description);
      button.addEventListener("click", () => {
        const menu = button.closest(".user-admin-actions-menu");
        if (menu) menu.open = false;
        handler();
      });
      parent.append(button);
    };
    // All identities have a rights overview; only authorized, active roles
    // may modify their bounded module permissions.
    addAction(actions, "Rechte", "Modulrechte für " + user.username,
      () => void openUserAdminAccess(user.identityId));
    const supportsAccountActions = (user.sourceRole === "trainer" || user.sourceRole === "athlete" ||
      user.sourceRole === "functionary") &&
      !incomplete && !retired;
    const canLink = user.active && !user.blocked && !incomplete && !retired;
    if (canLink || supportsAccountActions) {
      const menu = document.createElement("details");
      menu.className = "user-admin-actions-menu";
      const summary = document.createElement("summary");
      summary.textContent = "⋯";
      summary.setAttribute("aria-label", "Weitere Aktionen für " + user.username);
      summary.setAttribute("title", "Weitere Aktionen");
      const panel = document.createElement("div");
      panel.className = "user-admin-actions-menu__content";
      if (canLink) {
        addAction(panel, "Link teilen", "Anmeldelink für " + user.username + " teilen",
          () => void shareExistingUserAdminLogin(user.username));
      }
      if (supportsAccountActions) {
        if (user.active && !user.blocked) {
          addAction(panel, "Passwort zurücksetzen", "Passwort für " + user.username + " zurücksetzen",
            () => openUserAdminPasswordReset(user));
        }
        const action = user.blocked ? "unblock" : !user.active ? "reactivate" : "block";
        const label = action === "block" ? "Sperren" :
          action === "unblock" ? "Entsperren" : "Reaktivieren";
        addAction(panel, label, label + ": " + user.username,
          () => void changeUserAdminStatus(user, action));
      }
      menu.append(summary, panel);
      menu.addEventListener("toggle", () => {
        if (!menu.open) return;
        for (const other of container.querySelectorAll(".user-admin-actions-menu[open]")) {
          if (other !== menu) other.open = false;
        }
      });
      actions.append(menu);
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
  showMessage(userAdminElements.resetError, "");
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
    openUserAdminInvitation();
    showMessage(userAdminElements.success,
      "Passwort zurückgesetzt. Alle bisherigen Sitzungen beendet. Zugang jetzt sicher teilen.");
  } catch (error) {
    if (generation === userAdminGeneration) {
      showMessage(userAdminElements.resetError, error?.status === 403
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

function userAdminAccessHasChanges() {
  if (!userAdminAccessSnapshot) return false;
  const choices = new Map(
    [...(userAdminElements.accessList?.querySelectorAll("[data-user-access-module]") || [])]
      .map(select => [select.dataset.userAccessModule, select.value]),
  );
  return userAdminAccessSnapshot.modules.some(module =>
    choices.get(module.key) !== module.level);
}

function closeUserAdminAccess(force = false) {
  if (!force && userAdminBusy) return;
  if (!force && userAdminAccessHasChanges() &&
    !window.confirm("Ungespeicherte Modulrechte verwerfen?")) return;
  if (userAdminElements.accessEditor?.open) userAdminElements.accessEditor.close();
  userAdminAccessSnapshot = null;
  userAdminElements.accessList?.replaceChildren();
  showMessage(userAdminElements.accessMessage, "");
}

async function openUserAdminAccess(identityId) {
  if (!userAdminReady || userAdminBusy || typeof identityId !== "string" ||
    userAdminElements.accessEditor?.open) return;
  const generation = userAdminGeneration;
  userAdminBusy = true;
  updateUserAdminControls();
  closeUserAdminAccess(true);
  showMessage(userAdminElements.message, "");
  try {
    const payload = await requestJson("/api/admin/users/" +
      encodeURIComponent(identityId) + "/access");
    if (generation !== userAdminGeneration) return;
    if (!Array.isArray(payload?.permissions?.modules)) throw new Error("INVALID_ACCESS");
    userAdminAccessSnapshot = payload.permissions;
    renderUserAdminAccess();
    showMessage(userAdminElements.accessMessage, "");
    userAdminElements.accessEditor?.showModal();
  } catch (error) {
    if (generation === userAdminGeneration) {
      showMessage(userAdminElements.message, error?.status === 403
        ? "Die Modulrechte dieses Kontos können derzeit nicht geladen werden (Sicherheits- oder Rollenprüfung)."
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
  const labels = { admin: "Administrator", trainer: "Trainer", athlete: "Athlet", parent: "Eltern", functionary: "Funktionär" };
  if (userAdminElements.accessName) {
    userAdminElements.accessName.textContent =
      String(snapshot.username || "") + " · " + (labels[snapshot.sourceRole] || "Rolle unbekannt");
  }
  if (userAdminElements.accessScope) {
    userAdminElements.accessScope.textContent = !snapshot.editable
      ? "Nur Ansicht: Inaktive oder gesperrte Konten können nicht geändert werden."
      : snapshot.sourceRole === "admin"
        ? "Technische Administratorrechte bleiben geschützt. App-Modulrechte können angepasst und im Zweifel über dieses Menü wiederhergestellt werden."
        : snapshot.sourceRole === "athlete" || snapshot.sourceRole === "parent"
          ? "Persönlicher Datenzugriff bleibt eingeschränkt. Nicht verfügbare Module sind gesperrt."
          : "Individuelle Anpassungen gelten nur für diese Person. Technische Rolle und Systemrechte bleiben unverändert.";
  }
  if (userAdminElements.accessSave) userAdminElements.accessSave.hidden = !snapshot.editable;
  if (userAdminElements.profileRow) {
    userAdminElements.profileRow.hidden = !snapshot.editable || !snapshot.profiles?.length;
  }
  const profileSelect = userAdminElements.profile;
  if (profileSelect) {
    profileSelect.replaceChildren();
    const empty = document.createElement("option");
    empty.value = "";
    empty.textContent = "Individuelle Berechtigungen";
    profileSelect.append(empty);
    for (const profile of snapshot.profiles || []) {
      const option = document.createElement("option");
      option.value = String(profile.id);
      option.textContent = String(profile.name) + " – " + String(profile.description);
      profileSelect.append(option);
    }
    profileSelect.value = "";
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
    select.disabled = module.editable !== true || snapshot.editable !== true;
    if (select.disabled) select.title = "Durch Rolle oder Kontostatus geschützt";
    row.append(name, select);
    userAdminElements.accessList.append(row);
  }
}

function applyUserAdminPermissionProfile() {
  const snapshot = userAdminAccessSnapshot;
  if (!snapshot?.editable) return;
  const profile = snapshot.profiles?.find(item => item.id === userAdminElements.profile?.value);
  if (!profile || profile.sourceRole !== snapshot.sourceRole) return;
  const selections = new Map(profile.modules.map(item => [item.key, item.level]));
  for (const select of userAdminElements.accessList?.querySelectorAll("[data-user-access-module]") || []) {
    if (!select.disabled && selections.has(select.dataset.userAccessModule)) {
      select.value = selections.get(select.dataset.userAccessModule);
    }
  }
}

async function saveUserAdminAccess(event) {
  event.preventDefault();
  if (!userAdminReady || userAdminBusy || !userAdminAccessSnapshot?.editable) return;
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
    closeUserAdminAccess(true);
    showMessage(userAdminElements.success,
      "Modulrechte gespeichert. Der Benutzer sollte sich für die Übernahme neu anmelden.");
  } catch (error) {
    if (generation === userAdminGeneration) {
      showMessage(userAdminElements.accessMessage,
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
      showMessage(userAdminElements.createError, "Trainer und Athleten konnten nicht geladen werden.");
    }
  }
}

function renderUserAdminTargets() {
  const select = userAdminElements.target;
  if (!select) return;
  const role = userAdminElements.role?.value || "trainer";
  if (role === "functionary") {
    if (userAdminElements.targetRow) userAdminElements.targetRow.hidden = true;
    select.required = false;
    select.replaceChildren();
    return;
  }
  if (userAdminElements.targetRow) userAdminElements.targetRow.hidden = false;
  select.required = true;
  const previous = select.value;
  select.replaceChildren();
  const empty = document.createElement("option");
  empty.value = "";
  empty.textContent = "Bitte auswählen";
  select.append(empty);
  const targets = role === "athlete" ? userAdminTargets?.athletes : userAdminTargets?.trainers;
  for (const item of targets || []) {
    if (item.isActive === false) continue;
    const label = role === "athlete"
      ? [item.firstName, item.lastName].filter(Boolean).join(" ")
      : [item.firstName, item.lastName].filter(Boolean).join(" ");
    const option = document.createElement("option");
    option.value = item.id;
    // Each linked identity, including inactive/blocked accounts, must be
    // managed through its existing row. Creating a second account for the
    // same person would fail at the server and confuse invited testers.
    const existing = userAdminUsers.find(user =>
      user.sourceRole === role && user.subjectId === item.id);
    const existingStatus = existing?.blocked ? "gesperrt" :
      existing?.active === false ? "inaktiv" : "aktiv";
    option.textContent = existing
      ? (label || item.name || item.id) + " – Konto " + existingStatus +
        " (" + existing.username + "; in der Benutzerliste verwalten)"
      : (label || item.name || item.id);
    option.disabled = Boolean(existing);
    select.append(option);
  }
  if ([...select.options].some((option) => option.value === previous && !option.disabled)) {
    select.value = previous;
  } else {
    select.value = "";
  }
}

function updateUserAdminControls() {
  if (userAdminElements.refresh) userAdminElements.refresh.disabled = userAdminBusy;
  if (userAdminElements.create) userAdminElements.create.disabled = userAdminBusy;
  if (userAdminElements.newButton) userAdminElements.newButton.disabled = userAdminBusy;
  if (userAdminElements.createCancel) userAdminElements.createCancel.disabled = userAdminBusy;
  if (userAdminElements.createClose) userAdminElements.createClose.disabled = userAdminBusy;
  if (userAdminElements.accessCancel) userAdminElements.accessCancel.disabled = userAdminBusy;
  if (userAdminElements.accessClose) userAdminElements.accessClose.disabled = userAdminBusy;
  if (userAdminElements.resetClose) userAdminElements.resetClose.disabled = userAdminBusy;
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
  if (role !== "trainer" && role !== "athlete" && role !== "functionary") return;
  const generation = userAdminGeneration;
  const username = userAdminElements.username?.value || "";
  const temporaryPassword = userAdminElements.password?.value || "";
  const body = {
    username,
    displayName: userAdminElements.name?.value?.trim() || "",
    temporaryPassword,
    ...(userAdminElements.email?.value.trim() ? { contactEmail: userAdminElements.email.value.trim() } : {}),
    ...(role === "functionary" ? {} :
      role === "trainer" ? { trainerId: userAdminElements.target?.value || "" }
        : { athleteId: userAdminElements.target?.value || "" }),
  };
  userAdminBusy = true;
  updateUserAdminControls();
  clearUserAdminInvitation();
  showMessage(userAdminElements.message, "");
  showMessage(userAdminElements.success, "");
  try {
    await requestJson(role === "functionary" ? "/api/admin/functionary-users" :
      role === "trainer" ? "/api/admin/trainer-users" : "/api/admin/athlete-users", {
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
    closeUserAdminCreate(true);
    openUserAdminInvitation();
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
    showMessage(userAdminElements.createError,
      error?.status === 409
        ? (role === "functionary"
          ? "Funktionär kann noch nicht angelegt werden: Schema/Rolle nicht bereit oder Benutzername bereits vorhanden."
          : "Der Benutzername oder die Zuordnung ist bereits vergeben.")
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
    closeUserAdminInvitation();
  } else if (result === "unavailable") {
    showMessage(userAdminElements.inviteMessage, "Teilen oder Kopieren ist hier nicht verfügbar.");
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
    closeUserAdminInvitation();
  } catch {
    showMessage(userAdminElements.inviteMessage, "Kopieren nicht möglich. Bitte Browser-Berechtigung prüfen.");
  }
}
`;
