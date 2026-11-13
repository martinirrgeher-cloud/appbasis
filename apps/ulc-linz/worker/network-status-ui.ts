/**
 * Informational connectivity affordance for the authenticated ULC shell.
 * The network indicator does not persist drafts, retry writes or grant access.
 * Health checks are read-only and initiated exclusively by a user click.
 */
export const ULC_NETWORK_STATUS_HTML = `
        <aside id="ulc-network-status" class="ulc-network-status ab-surface" role="status" aria-live="polite" aria-atomic="true" hidden>
          <div class="ulc-network-status__content">
            <strong id="ulc-network-status-title">Verbindungsstatus</strong>
            <p id="ulc-network-status-detail"></p>
          </div>
          <button class="button button--secondary ulc-network-status__check" id="ulc-network-status-check" type="button">Server prüfen</button>
        </aside>
`;

export const ULC_NETWORK_STATUS_CSS = `
.ulc-network-status {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 10px;
  width: min(100% - 24px, 52rem);
  min-width: 0;
  box-sizing: border-box;
  margin: 10px auto 0;
  padding: 11px 12px;
  border: 1px solid var(--border);
  border-left: 3px solid var(--accent);
  border-radius: var(--control-radius);
  background: var(--card);
  color: var(--text);
}
.ulc-network-status[hidden] { display: none !important; }
.ulc-network-status[data-network-state="offline"],
.ulc-network-status[data-network-state="unreachable"] { border-left-color: var(--danger); }
.ulc-network-status__content { min-width: 0; }
.ulc-network-status__content strong { display: block; font-size: .87rem; line-height: 1.35; }
.ulc-network-status__content p { margin: 3px 0 0; color: var(--secondary); font-size: .77rem; line-height: 1.45; overflow-wrap: anywhere; }
.ulc-network-status__check { min-height: 40px; flex: 0 0 auto; white-space: normal; font-size: .79rem; }
@media (max-width: 430px) {
  .ulc-network-status { grid-template-columns: minmax(0, 1fr); gap: 8px; padding: 10px; }
  .ulc-network-status__check { width: 100%; }
}
`;

/* Kept independent of session, autosave and module-specific mutation handlers. */
export const ULC_NETWORK_STATUS_SCRIPT = `
(() => {
  const banner = document.querySelector("#ulc-network-status");
  const title = document.querySelector("#ulc-network-status-title");
  const detail = document.querySelector("#ulc-network-status-detail");
  const button = document.querySelector("#ulc-network-status-check");
  if (!banner || !title || !detail || !button) return;

  let revision = 0;
  const render = (state) => {
    banner.hidden = state === "initial";
    banner.dataset.networkState = state;
    title.textContent = {
      initial: "",
      offline: "Keine Internetverbindung",
      restored: "Verbindung am Gerät wiederhergestellt",
      checking: "Server wird geprüft …",
      unreachable: "Verbindung zum Server nicht bestätigt",
      confirmed: "Server antwortet",
    }[state] || "";
    detail.textContent = {
      initial: "",
      offline: "Neue Änderungen können derzeit nicht übertragen werden. Prüfe den Speicherstatus und verlasse ungespeicherte Eingaben nicht.",
      restored: "Die Verbindung scheint wieder verfügbar. Ein ausstehender Speichervorgang wird nicht automatisch wiederholt. Prüfe zuerst den Status im Modul.",
      checking: "Es wird nur eine lesende Serverabfrage ausgeführt. Keine Trainingsdaten werden gesendet oder erneut gespeichert.",
      unreachable: "Der Server antwortet noch nicht zuverlässig. Prüfe deine Verbindung und wiederhole Speichervorgänge nicht unkontrolliert.",
      confirmed: "Der Server ist erreichbar. Kontrolliere im jeweiligen Modul, ob deine Änderungen tatsächlich gespeichert wurden.",
    }[state] || "";
    button.textContent = state === "confirmed" ? "Schließen" : "Server prüfen";
    button.disabled = state === "checking" || state === "offline";
  };

  const deviceOffline = () => navigator.onLine === false;
  if (deviceOffline()) render("offline");

  window.addEventListener("offline", () => {
    revision += 1;
    render("offline");
  });
  window.addEventListener("online", () => {
    revision += 1;
    if (!banner.hidden) render("restored");
  });

  button.addEventListener("click", async () => {
    if (banner.dataset.networkState === "confirmed") {
      revision += 1;
      render("initial");
      return;
    }
    if (deviceOffline()) {
      revision += 1;
      render("offline");
      return;
    }
    const requestedRevision = ++revision;
    render("checking");
    try {
      const response = await fetch("/api/health/build", {
        method: "GET",
        cache: "no-store",
        credentials: "same-origin",
        headers: { accept: "application/json" },
      });
      const payload = response.ok ? await response.json().catch(() => null) : null;
      if (requestedRevision !== revision) return;
      if (deviceOffline()) {
        render("offline");
      } else {
        render(response.ok && payload?.status === "ok" && payload?.appId === "ulc-linz"
          ? "confirmed" : "unreachable");
      }
    } catch {
      if (requestedRevision === revision) render(deviceOffline() ? "offline" : "unreachable");
    }
  });
})();
`;
