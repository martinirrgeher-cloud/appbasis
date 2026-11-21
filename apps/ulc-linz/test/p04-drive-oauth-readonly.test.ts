import { describe, expect, it } from "vitest";

import {
  checkUlcGoogleDriveOAuthReadOnly,
  ULC_BACKUP_DRIVE_FOLDER_ID,
  ULC_BACKUP_DRIVE_FOLDER_NAME,
  ULC_BACKUP_OAUTH_SCOPE,
} from "../backup/google-drive-oauth-readonly";

const ENV = {
  ULC_BACKUP_OAUTH_READONLY_APPROVED: "1",
  ULC_BACKUP_OAUTH_TARGET: "ulc-linz-my-drive-p04d-readonly",
  ULC_BACKUP_GOOGLE_CLIENT_ID:
    "123456789-abcdefghijklmnopqrstuvwxyz.apps.googleusercontent.com",
  ULC_BACKUP_GOOGLE_CLIENT_SECRET: "fake-secret-only",
  ULC_BACKUP_GOOGLE_REFRESH_TOKEN: "fake-refresh-token-only",
};
const FOLDER = {
  id: ULC_BACKUP_DRIVE_FOLDER_ID,
  name: ULC_BACKUP_DRIVE_FOLDER_NAME,
  mimeType: "application/vnd.google-apps.folder",
  trashed: false,
  ownedByMe: true,
  shared: false,
  isAppAuthorized: true,
  capabilities: { canAddChildren: true, canListChildren: true },
};

function fakeTransport({
  token = {
    access_token: "fake-access-token-123456789",
    token_type: "Bearer",
    scope: ULC_BACKUP_OAUTH_SCOPE,
    expires_in: 3599,
  },
  folder = FOLDER,
  tokenStatus = 200,
  folderStatus = 200,
}: {
  token?: Record<string, unknown>;
  folder?: Record<string, unknown>;
  tokenStatus?: number;
  folderStatus?: number;
} = {}) {
  const calls: { url: string; request: RequestInit }[] = [];
  return {
    calls,
    fetchImpl: async (url: string, request: RequestInit) => {
      calls.push({ url, request });
      if (calls.length === 1) {
        return Response.json(token, { status: tokenStatus });
      }
      if (calls.length === 2) {
        return Response.json(folder, { status: folderStatus });
      }
      throw new Error("Unexpected third Google API request");
    },
  };
}

describe("P04-D Google My Drive OAuth – read-only preflight", () => {
  it("does nothing without fresh explicit operator approval, even with credentials", async () => {
    const transport = fakeTransport();
    const r = await checkUlcGoogleDriveOAuthReadOnly({
      env: { ...ENV, ULC_BACKUP_OAUTH_READONLY_APPROVED: "0" },
      fetchImpl: transport.fetchImpl,
    });
    expect(r).toEqual({
      status: "blocked",
      reason: "operator-approval-required",
      backupEnabled: false,
      uploadEnabled: false,
    });
    expect(transport.calls).toHaveLength(0);
  });

  it("denies a wrong target before any network or secret processing", async () => {
    const transport = fakeTransport();
    const r = await checkUlcGoogleDriveOAuthReadOnly({
      env: { ...ENV, ULC_BACKUP_OAUTH_TARGET: "any-drive" },
      fetchImpl: transport.fetchImpl,
    });
    expect(r).toMatchObject({
      status: "blocked", reason: "target-not-explicitly-authorized",
    });
    expect(transport.calls).toHaveLength(0);
  });

  it("refuses missing or malformed client credentials without network access", async () => {
    for (const overrides of [
      { ULC_BACKUP_GOOGLE_CLIENT_ID: undefined },
      { ULC_BACKUP_GOOGLE_CLIENT_SECRET: undefined },
      { ULC_BACKUP_GOOGLE_REFRESH_TOKEN: undefined },
      { ULC_BACKUP_GOOGLE_CLIENT_ID: "wrong-client" },
      { ULC_BACKUP_GOOGLE_CLIENT_SECRET: "secret\nwithnewline" },
    ]) {
      const transport = fakeTransport();
      const r = await checkUlcGoogleDriveOAuthReadOnly({
        env: { ...ENV, ...overrides },
        fetchImpl: transport.fetchImpl,
      });
      expect(r).toMatchObject({
        status: "blocked", reason: "credentials-not-configured",
      });
      expect(transport.calls).toHaveLength(0);
    }
  });

  it("calls only the Google refresh-token endpoint and the exact folder GET", async () => {
    const transport = fakeTransport();
    const r = await checkUlcGoogleDriveOAuthReadOnly({
      env: ENV, fetchImpl: transport.fetchImpl,
    });
    expect(r).toEqual({
      status: "google-drive-folder-readonly-confirmed",
      folderId: ULC_BACKUP_DRIVE_FOLDER_ID,
      scope: ULC_BACKUP_OAUTH_SCOPE,
      backupEnabled: false,
      uploadEnabled: false,
    });
    expect(transport.calls).toHaveLength(2);
    expect(transport.calls[0]!.url).toBe("https://oauth2.googleapis.com/token");
    expect(transport.calls[0]!.request).toMatchObject({
      method: "POST", redirect: "error",
    });
    expect(transport.calls[0]!.request.body).toContain(
      "grant_type=refresh_token",
    );
    expect(transport.calls[1]!.url).toMatch(
      /^https:\/\/www\.googleapis\.com\/drive\/v3\/files\//,
    );
    expect(transport.calls[1]!.url).toContain(ULC_BACKUP_DRIVE_FOLDER_ID);
    expect(transport.calls[1]!.request).toMatchObject({
      method: "GET", redirect: "error",
    });
    expect(transport.calls[1]!.request.headers).toMatchObject({
      authorization: "Bearer fake-access-token-123456789",
    });
    expect(JSON.stringify(r)).not.toContain("fake-");
  });

  it("rejects OAuth grants without the exact minimal drive.file scope", async () => {
    for (const scope of [
      undefined,
      "https://www.googleapis.com/auth/drive",
      ULC_BACKUP_OAUTH_SCOPE + " https://www.googleapis.com/auth/drive",
    ]) {
      const transport = fakeTransport({
        token: {
          access_token: "fake-access-token-123456789",
          token_type: "Bearer",
          scope,
          expires_in: 3600,
        },
      });
      const r = await checkUlcGoogleDriveOAuthReadOnly({
        env: ENV, fetchImpl: transport.fetchImpl,
      });
      expect(r).toMatchObject({
        status: "blocked", reason: "oauth-scope-not-exact",
      });
      expect(transport.calls).toHaveLength(1);
    }
  });

  it("does not accept revoked credentials or silent folder access failures", async () => {
    const failedRefresh = fakeTransport({ tokenStatus: 400 });
    const r1 = await checkUlcGoogleDriveOAuthReadOnly({
      env: ENV, fetchImpl: failedRefresh.fetchImpl,
    });
    expect(r1).toMatchObject({
      status: "blocked", reason: "oauth-refresh-rejected",
    });
    expect(failedRefresh.calls).toHaveLength(1);
    for (const status of [401, 403, 404]) {
      const denied = fakeTransport({ folderStatus: status });
      const r = await checkUlcGoogleDriveOAuthReadOnly({
        env: ENV, fetchImpl: denied.fetchImpl,
      });
      expect(r).toMatchObject({
        status: "blocked", reason: "drive-folder-inaccessible-to-this-app",
      });
      expect(denied.calls).toHaveLength(2);
    }
  });

  it("refuses foreign, shared, inaccessible or unauthorised folders", async () => {
    const cases: Record<string, unknown>[] = [
      { id: "foreign-folder" },
      { name: "Other" },
      { mimeType: "application/pdf" },
      { trashed: true },
      { ownedByMe: false },
      { shared: true },
      { isAppAuthorized: false },
      { capabilities: { canAddChildren: false, canListChildren: true } },
      { capabilities: { canAddChildren: true, canListChildren: false } },
    ];
    for (const change of cases) {
      const transport = fakeTransport({ folder: { ...FOLDER, ...change } });
      const r = await checkUlcGoogleDriveOAuthReadOnly({
        env: ENV, fetchImpl: transport.fetchImpl,
      });
      expect(r).toMatchObject({
        status: "blocked", reason: "drive-folder-not-owned-or-permitted",
      });
    }
  });

  it("never reveals upstream provider exceptions or secrets to output", async () => {
    const r = await checkUlcGoogleDriveOAuthReadOnly({
      env: ENV,
      fetchImpl: async () => {
        throw new Error("fake-secret-only refresh-token fake-refresh-token-only");
      },
    });
    expect(r).toMatchObject({
      status: "blocked", reason: "provider-transport-failure",
    });
    expect(JSON.stringify(r)).not.toContain("fake");
  });
});
