/**
 * P04-D: explicit, read-only OAuth check for a future, separate Google Drive
 * backup client. NEVER uploads files, creates folders or accesses the DB.
 *
 * This module accepts only the configured My Drive folder ID. It does not
 * implement the OAuth consent or refresh-token creation; operators must
 * complete Google's interactive consent flow independently.
 */
export const ULC_BACKUP_DRIVE_FOLDER_ID = "1GpEzbPYeg-3KYHJUses7va8llYWpbl85";
export const ULC_BACKUP_DRIVE_FOLDER_NAME = "ULC Linz – verschlüsselte Datenbank-Backups";
export const ULC_BACKUP_OAUTH_SCOPE = "https://www.googleapis.com/auth/drive.file";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const FILE_URL = "https://www.googleapis.com/drive/v3/files/";
const FOLDER_FIELDS = "id,name,mimeType,trashed,ownedByMe,shared,isAppAuthorized,capabilities(canAddChildren,canListChildren)";
const TARGET = "ulc-linz-my-drive-p04d-readonly";

export type BackupOAuthBlockReason =
  | "operator-approval-required"
  | "target-not-explicitly-authorized"
  | "credentials-not-configured"
  | "oauth-refresh-rejected"
  | "oauth-scope-not-exact"
  | "drive-folder-inaccessible-to-this-app"
  | "drive-folder-not-owned-or-permitted"
  | "provider-response-invalid"
  | "provider-transport-failure";

export type BackupOAuthCheckResult =
  | Readonly<{
      status: "blocked";
      reason: BackupOAuthBlockReason;
      backupEnabled: false;
      uploadEnabled: false;
    }>
  | Readonly<{
      status: "google-drive-folder-readonly-confirmed";
      scope: typeof ULC_BACKUP_OAUTH_SCOPE;
      folderId: typeof ULC_BACKUP_DRIVE_FOLDER_ID;
      backupEnabled: false;
      uploadEnabled: false;
    }>;

type Transport = (
  url: string,
  request: RequestInit,
) => Promise<Response>;

export interface BackupOAuthPreflightOptions {
  readonly env: Readonly<Record<string, string | undefined>>;
  readonly fetchImpl?: Transport;
  readonly timeoutMs?: number;
}

function blocked(reason: BackupOAuthBlockReason): BackupOAuthCheckResult {
  return Object.freeze({
    status: "blocked",
    reason,
    backupEnabled: false,
    uploadEnabled: false,
  });
}

function nonempty(value: unknown, minimum = 1): value is string {
  return (
    typeof value === "string" &&
    value.length >= minimum &&
    value.trim() === value &&
    !/[\r\n\0]/.test(value)
  );
}

async function fetchWithBoundedTimeout(
  transport: Transport,
  url: string,
  request: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await transport(url, {
      ...request,
      signal: controller.signal,
      redirect: "error",
    });
    if (!(response instanceof Response) || response.redirected) {
      throw new Error("Unexpected transport response");
    }
    return response;
  } finally {
    clearTimeout(timeout);
  }
}

export async function checkUlcGoogleDriveOAuthReadOnly(
  options: BackupOAuthPreflightOptions,
): Promise<BackupOAuthCheckResult> {
  const env = options.env;
  // Critical: do not inspect credentials or perform ANY network operations
  // unless the current manual workflow run has a fresh, explicit approval.
  if (env.ULC_BACKUP_OAUTH_READONLY_APPROVED !== "1") {
    return blocked("operator-approval-required");
  }
  if (env.ULC_BACKUP_OAUTH_TARGET !== TARGET) {
    return blocked("target-not-explicitly-authorized");
  }
  const clientId = env.ULC_BACKUP_GOOGLE_CLIENT_ID;
  const clientSecret = env.ULC_BACKUP_GOOGLE_CLIENT_SECRET;
  const refreshToken = env.ULC_BACKUP_GOOGLE_REFRESH_TOKEN;
  if (
    !nonempty(clientId, 20) ||
    !clientId.endsWith(".apps.googleusercontent.com") ||
    !nonempty(clientSecret, 8) ||
    !nonempty(refreshToken, 10)
  ) {
    return blocked("credentials-not-configured");
  }
  const transport = options.fetchImpl ?? fetch;
  const timeoutMs = options.timeoutMs ?? 10000;
  if (
    typeof transport !== "function" ||
    !Number.isInteger(timeoutMs) ||
    timeoutMs < 10 ||
    timeoutMs > 30000
  ) {
    return blocked("provider-transport-failure");
  }

  let accessToken: string;
  try {
    const form = new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    });
    const response = await fetchWithBoundedTimeout(
      transport,
      TOKEN_URL,
      {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: form.toString(),
        cache: "no-store",
      },
      timeoutMs,
    );
    if (response.status !== 200) {
      return blocked("oauth-refresh-rejected");
    }
    const token: unknown = await response.json();
    if (
      !token ||
      typeof token !== "object" ||
      Array.isArray(token)
    ) {
      return blocked("provider-response-invalid");
    }
    const claims = token as Record<string, unknown>;
    if (
      claims.scope !== ULC_BACKUP_OAUTH_SCOPE ||
      claims.token_type !== "Bearer" ||
      !nonempty(claims.access_token, 12) ||
      typeof claims.expires_in !== "number" ||
      !Number.isFinite(claims.expires_in) ||
      claims.expires_in <= 0
    ) {
      return blocked("oauth-scope-not-exact");
    }
    accessToken = claims.access_token;
  } catch {
    // Token endpoint error bodies may contain secrets: never return them.
    return blocked("provider-transport-failure");
  }

  try {
    const response = await fetchWithBoundedTimeout(
      transport,
      FILE_URL +
        encodeURIComponent(ULC_BACKUP_DRIVE_FOLDER_ID) +
        "?fields=" +
        encodeURIComponent(FOLDER_FIELDS),
      {
        method: "GET",
        headers: {
          authorization: "Bearer " + accessToken,
          accept: "application/json",
        },
        cache: "no-store",
      },
      timeoutMs,
    );
    if (response.status === 401 || response.status === 403 ||
      response.status === 404) {
      return blocked("drive-folder-inaccessible-to-this-app");
    }
    if (response.status !== 200) {
      return blocked("provider-response-invalid");
    }
    const folder: unknown = await response.json();
    if (!folder || typeof folder !== "object" || Array.isArray(folder)) {
      return blocked("provider-response-invalid");
    }
    const item = folder as Record<string, unknown>;
    const caps = item.capabilities;
    if (
      item.id !== ULC_BACKUP_DRIVE_FOLDER_ID ||
      item.name !== ULC_BACKUP_DRIVE_FOLDER_NAME ||
      item.mimeType !== "application/vnd.google-apps.folder" ||
      item.trashed !== false ||
      item.ownedByMe !== true ||
      item.shared !== false ||
      item.isAppAuthorized !== true ||
      !caps ||
      typeof caps !== "object" ||
      Array.isArray(caps) ||
      (caps as Record<string, unknown>).canAddChildren !== true ||
      (caps as Record<string, unknown>).canListChildren !== true
    ) {
      return blocked("drive-folder-not-owned-or-permitted");
    }
    return Object.freeze({
      status: "google-drive-folder-readonly-confirmed",
      scope: ULC_BACKUP_OAUTH_SCOPE,
      folderId: ULC_BACKUP_DRIVE_FOLDER_ID,
      backupEnabled: false,
      uploadEnabled: false,
    });
  } catch {
    return blocked("provider-transport-failure");
  } finally {
    // Immutable JS strings cannot be forcibly zeroed. Do not log accessToken.
    accessToken = "";
  }
}
