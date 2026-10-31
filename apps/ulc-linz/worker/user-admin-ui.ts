export const ULC_USER_ADMIN_HTML = \`
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
    <div id="user-admin-list" class="user-admin-list"></div>
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
    <div id="user-admin-invitation" hidden>
      <p class="settings-note">Der Zugang wurde erstellt. Den Einladungstext jetzt kopieren und über einen sicheren Kanal weitergeben. Das Passwort wird hier nicht dauerhaft gespeichert.</p>
      <button type="button" class="button button--secondary" id="user-admin-copy">Einladungstext kopieren</button>
      <button type="button" class="button button--secondary" id="user-admin-invite-close">Schließen</button>
    </div>
  </section>
</section>
\`;

export const ULC_USER_ADMIN_CSS = \`
.user-admin-list { display: grid; gap: 7px; }
.user-admin-row { padding: 10px 0; border-bottom: 1px solid var(--border); display: flex; gap: 8px; align-items: flex-start; justify-content: space-between; min-width: 0; }
.user-admin-row:last-child { border-bottom: 0; }
.user-admin-row__identity { display: grid; min-width: 0; gap: 2px; overflow-wrap: anywhere; }
.user-admin-row__meta { font-size: .84rem; color: var(--muted); }
.user-admin-row__status { flex: 0 0 auto; font-size: .8rem; }
#user-admin-form { display: grid; gap: 10px; }
#user-admin-form input, #user-admin-form select { width: 100%; min-width: 0; font-size: 16px; }
#user-admin-invitation { margin-top: 12px; }
#user-admin-invitation .button { margin: 3px; }
\`;

export const ULC_USER_ADMIN_SCRIPT = String.raw\`
const userAdminElements = Object.freeze({
  message: document.querySelector("#user-admin-message"),
  success: document.querySelector("#user-admin-success"),
  list: document.querySelector("#user-admin-list"),
  count: document.querySelector("#user-admin-count"),
  refresh: document.querySelector("#user-admin-refresh"),
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
  inviteClose: document.querySelector("#user-admin-invite-close"),
});

let userAdminReady = false;
let userAdminBusy = false;
let userAdminUsers = [];
let userAdminTargets = null;
let userAdminGeneration = 0;
let userAdminInviteText = "";

userAdminElements.refresh?.addEventListener("click", () => void loadUserAdmin());
userAdminElements.role?.addEventListener("change", renderUserAdminTargets);
userAdminElements.form?.addEventListener("submit", (event) => void createUserAdminAccount(event));
userAdminElements.copy?.addEventListener("click", () => void copyUserAdminInvitation());
userAdminElements.inviteClose?.addEventListener("click", clearUserAdminInvitation);

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
  userAdminElements.form?.reset();
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
  if (userAdminElements.count) userAdminElements.count.textContent = "(" + userAdminUsers.length + ")";
  const roles = { admin: "Administrator", trainer: "Trainer", athlete: "Athlet", parent: "Eltern" };
  for (const user of userAdminUsers) {
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
    row.append(main, status);
    container.append(row);
  }
  if (userAdminUsers.length === 0) {
    const empty = document.createElement("p");
    empty.textContent = "Noch keine Benutzer vorhanden.";
    container.append(empty);
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
    // No automatic email is sent. Only the admin can copy this one-time message.
    userAdminInviteText =
      "ULC Linz Testzugang\\n" +
      "App: " + window.location.origin + "\\n" +
      "Benutzername: " + username + "\\n" +
      "Temporäres Passwort: " + temporaryPassword + "\\n" +
      "Beim ersten Login bitte das Passwort ändern.";
    if (userAdminElements.invitation) userAdminElements.invitation.hidden = false;
    userAdminElements.form?.reset();
    if (userAdminElements.password) userAdminElements.password.value = "";
    renderUserAdminTargets();
    showMessage(userAdminElements.success, "Benutzer angelegt. Einladungstext jetzt kopieren.");
    userAdminTargets = null;
    const payload = await requestJson("/api/admin/users");
    if (generation === userAdminGeneration && Array.isArray(payload?.users)) {
      userAdminUsers = payload.users;
      renderUserAdminList();
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
\`;
