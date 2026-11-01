import { describe, expect, it } from "vitest";
import { generatedUiResponse, ULC_LINZ_APP_HTML, ULC_LINZ_APP_CSS, ULC_LINZ_APP_SCRIPT } from "../worker/ui";
import { ULC_PWA_MANIFEST, ULC_PWA_SERVICE_WORKER } from "../worker/pwa";

function send(path: string, method = "GET") {
  return generatedUiResponse(new Request("https://ulc.example.test" + path, { method }));
}
describe("ULC PWA installation", () => {
  it("declares a standalone mobile app and install affordance", async () => {
    expect(ULC_LINZ_APP_HTML).toContain('rel="manifest" href="/manifest.webmanifest"');
    expect(ULC_LINZ_APP_HTML).toContain('rel="apple-touch-icon"');
    expect(ULC_LINZ_APP_HTML).toContain('id="app-install"');
    expect(ULC_LINZ_APP_CSS).toContain(".app-install");
    expect(ULC_LINZ_APP_SCRIPT).toContain('navigator.serviceWorker.register("/sw.js"');
    expect(ULC_LINZ_APP_SCRIPT).toContain("beforeinstallprompt");
    expect(send("/api/auth/session")).toBeNull();
    expect(send("/api/modules/athletes")).toBeNull();
  });
  it("serves an installable manifest without caching", async () => {
    const response = send("/manifest.webmanifest");
    expect(response?.status).toBe(200);
    expect(response?.headers.get("content-type")).toContain("application/manifest+json");
    expect(response?.headers.get("cache-control")).toBe("no-store");
    const manifest = await response?.json();
    expect(manifest).toEqual(ULC_PWA_MANIFEST);
    expect(manifest.display).toBe("standalone");
    expect(manifest.start_url).toBe("/");
    expect(manifest.scope).toBe("/");
    expect(manifest.icons).toEqual(expect.arrayContaining([
      expect.objectContaining({ sizes: "192x192", type: "image/png" }),
      expect.objectContaining({ sizes: "512x512", type: "image/png" }),
    ]));
  });
  it.each([192, 512])("serves a true %i px PNG", async (size) => {
    const response = send("/icon-" + size + ".png");
    expect(response?.headers.get("content-type")).toBe("image/png");
    const bytes = new Uint8Array(await response!.arrayBuffer());
    expect([...bytes.slice(0, 8)]).toEqual([137,80,78,71,13,10,26,10]);
    const view = new DataView(bytes.buffer);
    expect(view.getUint32(16)).toBe(size);
    expect(view.getUint32(20)).toBe(size);
    expect((await send("/icon-" + size + ".png", "HEAD")?.arrayBuffer())?.byteLength).toBe(0);
  });
  it("never caches authenticated state or user data", async () => {
    const response = send("/sw.js");
    expect(response?.headers.get("cache-control")).toBe("no-store");
    expect(response?.headers.get("service-worker-allowed")).toBe("/");
    expect(await response?.text()).toBe(ULC_PWA_SERVICE_WORKER);
    expect(ULC_PWA_SERVICE_WORKER).toContain("fetch(event.request)");
    expect(ULC_PWA_SERVICE_WORKER).not.toContain("caches.open");
    expect(send("/sw.js","POST")).toBeNull();
  });
});
