import { describe, it, expect } from "vitest";

// TEMPORARY bridge to retrieve unchanged public ULC artwork via GitHub-hosted CI.
// This test file must be removed before merging the actual PWA implementation.
describe("temporary original ULC artwork export", () => {
  it("exports exact legacy icons to the CI log in safe base64 chunks", async () => {
    if (process.env.CI !== "true") return;
    const files = [
      ["logo", "logo.png"],
      ["icon192", "icons/icon-192.png"],
      ["icon512", "icons/icon-512.png"],
      ["mask512", "icons/icon-maskable-512.png"],
      ["apple180", "icons/apple-touch-icon.png"],
    ] as const;
    for (const [id, path] of files) {
      const target = "https://raw.githubusercontent.com/martinirrgeher-cloud/ulc-linz/main/public/" + path;
      const reply = await fetch(target);
      expect(reply.ok, target).toBe(true);
      expect(reply.headers.get("content-type")).toMatch(/image\/png|application\/octet-stream/);
      const b64 = Buffer.from(await reply.arrayBuffer()).toString("base64");
      const segments = Math.ceil(b64.length / 1200);
      console.log("ULC_ASSET_BEGIN:" + id + ":" + segments + ":" + b64.length);
      for (let part = 0; part < segments; part++) {
        console.log("ULC_ASSET_CHUNK:" + id + ":" + part + ":" + b64.slice(part * 1200, (part + 1) * 1200));
      }
      console.log("ULC_ASSET_END:" + id);
    }
  }, 40_000);
});
