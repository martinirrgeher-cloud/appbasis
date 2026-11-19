import { describe, expect, it } from "vitest";

import { trainingDocumentationHttpResponse } from "../worker/training-documentation-http";

function request(path: string, method = "GET"): Request {
  return new Request("https://app.example.test" + path, { method });
}

/**
 * These paths must reject invalid HTTP input before an identity lookup or
 * database call; the runtime intentionally has no services whatsoever.
 */
async function dispatch(path: string, method = "GET"): Promise<Response> {
  const input = request(path, method);
  return trainingDocumentationHttpResponse(
    input,
    {} as never,
    new URL(input.url),
  );
}

describe("training-documentation production HTTP input handling", () => {
  it.each([
    "/api/modules/training-documentation/day",
    "/api/modules/training-documentation/day?subjectId=athlete-1",
    "/api/modules/training-documentation/day?sessionDate=2026-11-17",
    "/api/modules/training-documentation/day?subjectId=athlete-1&sessionDate=invalid",
    "/api/modules/training-documentation/day?subjectId=athlete-1&sessionDate=2026-11-17&unused=1",
    "/api/modules/training-documentation/day?subjectId=athlete-1&subjectId=athlete-2&sessionDate=2026-11-17",
    "/api/modules/training-documentation/day?subjectId=athlete-1&sessionDate=2026-11-17&sessionDate=2026-11-18",
  ])("returns a controlled HTTP 400 for malformed day query: %s", async (path) => {
    const response = await dispatch(path);
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: {
        code: "INVALID_TRAINING_DOCUMENTATION",
        message: "The training documentation input is invalid.",
      },
    });
  });

  it.each([
    ["/api/modules/training-documentation/day", "POST", 405, "GET"],
    ["/api/modules/training-documentation/start", "GET", 405, "POST"],
    ["/api/modules/training-documentation", "POST", 405, "GET"],
    ["/api/modules/training-documentation/doc-1/update", "GET", 405, "POST"],
    ["/api/modules/training-documentation/not-a-route", "GET", 404, null],
  ] as const)("keeps route and method handling stable: %s %s", async (path, method, status, allow) => {
    const response = await dispatch(path, method);
    expect(response.status).toBe(status);
    expect(response.headers.get("allow")).toBe(allow);
  });
});
