import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { generatedUiResponse, ULC_LINZ_APP_HTML, ULC_LINZ_APP_CSS, ULC_LINZ_APP_SCRIPT } from "../worker/ui";
import { ULC_PWA_MANIFEST, ULC_PWA_SERVICE_WORKER } from "../worker/pwa";

function response(path: string, method = "GET") {
  return generatedUiResponse(new Request("https://ulc.example.test" + path, { method }));
}
function gitBlobSha(bytes: Uint8Array): string {
  return createHash("sha1").update("blob " + bytes.byteLength + "\0").update(bytes).digest("hex");
}
describe("ULC original-logo PWA installation", () => {
  it("includes standalone app installation metadata and an install action", () => {
    expect(ULC_LINZ_APP_HTML).toContain('rel="manifest" href="/manifest.webmanifest"');
    expect(ULC_LINZ_APP_HTML).toContain('rel="apple-touch-icon" href="/apple-touch-icon.png"');
    expect(ULC_LINZ_APP_HTML).toContain('name="theme-color" content="#147a46"');
    expect(ULC_LINZ_APP_HTML).toContain('id="app-install"');
    expect(ULC_LINZ_APP_CSS).toContain(".app-install");
    expect(ULC_LINZ_APP_SCRIPT).toContain('navigator.serviceWorker.register("/sw.js"');
    expect(ULC_LINZ_APP_SCRIPT).toContain("beforeinstallprompt");
    expect(response("/api/auth/session")).toBeNull();
    expect(response("/api/modules/athletes")).toBeNull();
    expect(response("/manifest.webmanifest", "POST")).toBeNull();
  });
  it("returns the original ULC Linz Oberbank install manifest", async () => {
    const res = response("/manifest.webmanifest");
    expect(res?.status).toBe(200);
    expect(res?.headers.get("content-type")).toContain("application/manifest+json");
    expect(res?.headers.get("cache-control")).toBe("no-store");
    expect(await res?.json()).toEqual(ULC_PWA_MANIFEST);
    expect(ULC_PWA_MANIFEST.display).toBe("standalone");
    expect(ULC_PWA_MANIFEST.name).toBe("ULC Linz Oberbank");
    expect(ULC_PWA_MANIFEST.icons).toEqual(expect.arrayContaining([
      expect.objectContaining({ src: "/icon-192.png", sizes: "192x192", purpose: "any" }),
      expect.objectContaining({ src: "/icon-512.png", sizes: "512x512", purpose: "any" }),
      expect.objectContaining({ src: "/icon-maskable-512.png", sizes: "512x512", purpose: "maskable" }),
    ]));
  });
  it.each([
    ["logo.png", "a26a18bf8712072d0ba8d3310e5f6a48eca23a26", null],
    ["icon-192.png", "0359d61faf8c2896d056208b90aae9b43f69a232", 192],
    ["icon-512.png", "cb05596b5c261e04aef2b01ae512b6945e574f58", 512],
    ["icon-maskable-512.png", "f571bef0390fa271a035cf72033414b5c52996dd", 512],
    ["apple-touch-icon.png", "d1371a3e4e3f04e5bd7ca6014da1e89d4752d992", 180],
  ] as const)("serves original %s without a byte changed", async (file, sha, dimension) => {
    const original = readFileSync(new URL("../assets/pwa/" + file, import.meta.url));
    expect(gitBlobSha(original)).toBe(sha);
    const res = response("/" + file);
    expect(res?.status).toBe(200);
    expect(res?.headers.get("content-type")).toBe("image/png");
    const actual = new Uint8Array(await res!.arrayBuffer());
    expect(actual).toEqual(new Uint8Array(original));
    expect([...actual.slice(0,8)]).toEqual([137,80,78,71,13,10,26,10]);
    if(dimension!==null) {
      const image = new DataView(actual.buffer);
      expect(image.getUint32(16)).toBe(dimension);
      expect(image.getUint32(20)).toBe(dimension);
    }
    const head = response("/" + file, "HEAD");
    expect(head?.status).toBe(200);
    expect((await head!.arrayBuffer()).byteLength).toBe(0);
  });
  it("does not cache authenticated views or personal data", async () => {
    const res = response("/sw.js");
    expect(res?.status).toBe(200);
    expect(res?.headers.get("cache-control")).toBe("no-store");
    expect(res?.headers.get("service-worker-allowed")).toBe("/");
    expect(await res?.text()).toBe(ULC_PWA_SERVICE_WORKER);
    expect(ULC_PWA_SERVICE_WORKER).toContain("fetch(event.request)");
    expect(ULC_PWA_SERVICE_WORKER).not.toContain("caches.open");
  });
});
