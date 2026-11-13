import { describe, expect, it, vi } from "vitest";
import { ULC_LINZ_APP_HTML, ULC_LINZ_APP_CSS, ULC_LINZ_APP_SCRIPT } from "../worker/ui";
import {
  ULC_NETWORK_STATUS_HTML,
  ULC_NETWORK_STATUS_CSS,
  ULC_NETWORK_STATUS_SCRIPT,
} from "../worker/network-status-ui";

type FakeState = {
  banner: { hidden: boolean; dataset: Record<string, string> };
  title: { textContent: string };
  detail: { textContent: string };
  button: { textContent: string; disabled: boolean };
  navigator: { onLine: boolean };
  emit: (name: "online" | "offline") => void;
  click: () => Promise<void>;
};

function mount(
  initiallyOnline: boolean,
  serverCheck: (url: string, options: Record<string, unknown>) => Promise<unknown>,
): FakeState {
  const banner = { hidden: true, dataset: {} as Record<string, string> };
  const title = { textContent: "" };
  const detail = { textContent: "" };
  const button = { textContent: "", disabled: false };
  const navigator = { onLine: initiallyOnline };
  const events = new Map<string, () => void>();
  let clickHandler: () => Promise<void> = async () => {};
  const document = {
    querySelector: (selector: string): unknown => ({
      "#ulc-network-status": banner,
      "#ulc-network-status-title": title,
      "#ulc-network-status-detail": detail,
      "#ulc-network-status-check": {
        ...button,
        addEventListener: (name: string, handler: () => Promise<void>) => {
          if (name === "click") clickHandler = handler;
        },
      },
    } as Record<string, unknown>)[selector],
  };
  // Preserve the original button object's state, including disabled flags.
  const originalQuery = document.querySelector;
  const linkedButton = new Proxy(button, {
    get(target, key) {
      if (key === "addEventListener") return (name: string, handler: () => Promise<void>) => {
        if (name === "click") clickHandler = handler;
      };
      return Reflect.get(target, key);
    },
    set(target, key, value) { return Reflect.set(target, key, value); },
  });
  document.querySelector = (selector: string) =>
    selector === "#ulc-network-status-check" ? linkedButton : originalQuery(selector);
  const window = { addEventListener: (name: string, callback: () => void) => events.set(name, callback) };
  new Function("window", "document", "navigator", "fetch", ULC_NETWORK_STATUS_SCRIPT)(
    window, document, navigator, serverCheck,
  );
  return {
    banner, title, detail, button, navigator,
    emit: (name) => events.get(name)?.(),
    click: () => clickHandler(),
  };
}

const ok = async () => ({
  ok: true,
  json: async () => ({ status: "ok", appId: "ulc-linz" }),
});

describe("ULC A12 network connection guidance", () => {
  it("shows only authenticated, responsive, accessible read-only status controls", () => {
    const appStart = ULC_LINZ_APP_HTML.indexOf('id="app-view"');
    const connection = ULC_LINZ_APP_HTML.indexOf('id="ulc-network-status"');
    const main = ULC_LINZ_APP_HTML.indexOf('<main class="content">', appStart);
    expect(appStart).toBeGreaterThan(0);
    expect(connection).toBeGreaterThan(appStart);
    expect(connection).toBeLessThan(main);
    expect(ULC_NETWORK_STATUS_HTML).toContain('role="status" aria-live="polite"');
    expect(ULC_NETWORK_STATUS_HTML).toContain("type=\"button\"");
    expect(ULC_LINZ_APP_CSS).toContain(ULC_NETWORK_STATUS_CSS);
    expect(ULC_LINZ_APP_SCRIPT).toContain(ULC_NETWORK_STATUS_SCRIPT);
    expect(ULC_NETWORK_STATUS_CSS).toContain("@media (max-width: 430px)");
    expect(ULC_NETWORK_STATUS_SCRIPT).not.toMatch(/localStorage|sessionStorage|indexedDB|\.post\(|method: "POST"/);
  });

  it("never resends a write after offline/online; verifies only by explicit GET", async () => {
    const fetcher = vi.fn(async (_url: string, _options: Record<string, unknown>) => ok());
    const state = mount(false, fetcher);
    expect(state.banner.hidden).toBe(false);
    expect(state.banner.dataset.networkState).toBe("offline");
    expect(state.button.disabled).toBe(true);
    state.navigator.onLine = true;
    state.emit("online");
    expect(state.banner.dataset.networkState).toBe("restored");
    expect(fetcher).not.toHaveBeenCalled();
    expect(state.detail.textContent).toContain("nicht automatisch wiederholt");
    await state.click();
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher.mock.calls.at(0)?.[0]).toBe("/api/health/build");
    expect(fetcher.mock.calls.at(0)?.[1]).toMatchObject({
      method: "GET", cache: "no-store", credentials: "same-origin",
    });
    expect(state.banner.dataset.networkState).toBe("confirmed");
    expect(state.detail.textContent).toContain("tatsächlich gespeichert");
    await state.click();
    expect(state.banner.hidden).toBe(true);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("does not present a false green state on failed checks or stale requests", async () => {
    let respond: (value: unknown) => void = () => {};
    const fetcher = vi.fn(() => new Promise<unknown>((resolve) => { respond = resolve; }));
    const state = mount(false, fetcher);
    state.navigator.onLine = true;
    state.emit("online");
    const checking = state.click();
    state.navigator.onLine = false;
    state.emit("offline");
    respond(await ok());
    await checking;
    expect(state.banner.dataset.networkState).toBe("offline");
    expect(state.button.disabled).toBe(true);

    const fail = vi.fn(async () => ({ ok: false, status: 503 }));
    const other = mount(false, fail);
    other.navigator.onLine = true;
    other.emit("online");
    await other.click();
    expect(other.banner.dataset.networkState).toBe("unreachable");
    expect(other.title.textContent).toContain("nicht bestätigt");
  });

  it("stays invisible on an initially healthy connection", () => {
    const fetcher = vi.fn(async (_url: string, _options: Record<string, unknown>) => ok());
    const state = mount(true, fetcher);
    expect(state.banner.hidden).toBe(true);
    state.emit("online");
    expect(state.banner.hidden).toBe(true);
    expect(fetcher).not.toHaveBeenCalled();
  });
});
