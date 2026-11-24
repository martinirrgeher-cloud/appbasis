import { describe, expect, it, vi, beforeEach } from "vitest";

import harness from "../worker/t07-protected-operator-harness";

const mock = vi.hoisted(() => ({
  execute: vi.fn(async () => ({
    status: "structured-follow-up-pending",
    sourceDecisionAt: "2026-11-22T12:00:00.000Z",
    planMarkerPresent: false,
    usageMarkerPresent: true,
    documentationMarkerPresent: false,
    historyMarkerPresent: false,
    documentationOwned: 1,
    documentationOtherRevisions: 2,
    attendanceRows: 3,
    registrationRows: 4,
    registrationHistoryRows: 5,
    fullErasureAuthorized: false,
    olderRestorePromotionAuthorized: false,
  })),
}));

vi.mock("../worker/protected-athlete-erasure-credential-operation", () => ({
  runProtectedUlcLinzAthleteErasureWithCredentials: mock.execute,
}));

const env = {
  HYPERDRIVE: { connectionString: "postgres://owner@localhost/neondb" },
  BETTER_AUTH_SECRET: "s".repeat(32),
  ADMINISTRATOR_USERNAME: "ulc.admin",
  ADMINISTRATOR_PASSWORD: "validpassword",
  T07_OPERATION_TOKEN: "x".repeat(64),
};
const url = "https://127.0.0.1/__appbasis/t07/athlete-erasure";
function req(mode: string, extras: Record<string, string> = {}) {
  const headers = {
    "x-appbasis-t07-token": env.T07_OPERATION_TOKEN,
    "x-appbasis-t07-operation": mode,
    "x-appbasis-t07-subject-id": "athlete-subject-1",
    "x-appbasis-t07-confirmation": mode === "inspect"
      ? "INSPECT-ULC-T07-STRUCTURED-OWNERS"
      : "ERASE-ULC-T07-FOUR-STRUCTURED-OWNERS",
    ...extras,
  };
  return new Request(url, { method: "POST", headers });
}

describe("T07 isolated ephemeral operator ingress is token and approval gated", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 404 for absent/incorrect token, path, operation, subject or timestamp", async () => {
    const attempts = [
      new Request(url, { method: "GET" }),
      new Request(url, { method: "POST" }),
      req("inspect", { "x-appbasis-t07-token": "invalid" }),
      req("inspect", { "x-appbasis-t07-subject-id": "athlete invalid" }),
      req("inspect", { "x-appbasis-t07-source-completed-at": "2026-11-22T12:00:00.000Z" }),
      req("erase-structured-only"),
      req("erase-structured-only", { "x-appbasis-t07-source-completed-at": "invalid" }),
      req("delete-anything"),
    ];
    for (const request of attempts) {
      expect((await harness.fetch(request, env)).status).toBe(404);
    }
    expect(mock.execute).not.toHaveBeenCalled();
  });

  it("restricts requests to exact non-personal summary with no cache", async () => {
    const response = await harness.fetch(req("inspect"), env);
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    const body = await response.json();
    expect(JSON.stringify(body)).not.toContain("athlete-subject-1");
    expect(mock.execute).toHaveBeenCalledWith(
      expect.objectContaining({ administratorUsername: "ulc.admin" }),
      { organizationId: "ulc-linz", subjectId: "athlete-subject-1" },
      "inspect",
      undefined,
    );
  });

  it("requires exact timestamp and operator approval for a destructive four-owner attempt", async () => {
    const completedAt = "2026-11-22T12:00:00.000Z";
    const response = await harness.fetch(req("erase-structured-only", {
      "x-appbasis-t07-source-completed-at": completedAt,
    }), env);
    expect(response.status).toBe(200);
    expect(mock.execute).toHaveBeenCalledWith(
      expect.any(Object),
      { organizationId: "ulc-linz", subjectId: "athlete-subject-1" },
      "erase-structured-only",
      { confirmation: "ERASE-ULC-T07-FOUR-STRUCTURED-OWNERS",
        expectedSourceCompletedAt: completedAt },
    );
  });

  it("does not leak SQL exceptions or private metadata from failed operator execution", async () => {
    mock.execute.mockRejectedValueOnce(new Error("Database username, private subject and sensitive SQL"));
    const response = await harness.fetch(req("inspect"), env);
    expect(response.status).toBe(503);
    expect(await response.text()).toBe("");
    expect(response.headers.get("cache-control")).toBeNull();
  });
});
