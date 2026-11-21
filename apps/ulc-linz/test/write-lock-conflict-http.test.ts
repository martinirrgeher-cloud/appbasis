import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  isUlcRetryableDatabaseLockConflict,
  ulcWriteLockConflictHttpResponse,
} from "../worker/write-lock-conflict-http";
import { trainingWriteGuardHttpResponse } from "../worker/training-write-http-error";

function postgresError(
  code: string,
  message = "private DB: athlete alice, secret query and storage key",
): Error {
  return Object.assign(new Error(message), {
    code,
    detail: "private tenant and table identifiers",
    query: "SELECT hidden data",
    parameters: ["sensitive"],
  });
}

describe("P24 retryable database lock conflicts", () => {
  it("maps direct PostgreSQL NOWAIT 55P03 into generic 409 without leaking DB information", async () => {
    const response = ulcWriteLockConflictHttpResponse(postgresError("55P03"));
    expect(response?.status).toBe(409);
    expect(response?.headers.get("cache-control")).toBe("private, no-store");
    const body = await response?.json();
    expect(body).toEqual({
      error: {
        code: "ULC_WRITE_TEMPORARILY_BUSY",
        message: "The record is being updated or removed. Nothing was saved. Keep your changes, reload the current state and retry.",
      },
    });
    const serialized = JSON.stringify(body);
    for (const sensitive of ["alice", "secret", "SELECT", "parameters", "tenant", "storage key", "55P03"]) {
      expect(serialized).not.toContain(sensitive);
    }
    expect(response?.headers.get("retry-after")).toBeNull();
  });

  it("recognizes wrapped PostgreSQL errors but never explores unlimited or cyclic causes", async () => {
    const inner = postgresError("55P03");
    const outer = new Error("app repository error", { cause: new Error("driver", { cause: inner }) });
    expect(isUlcRetryableDatabaseLockConflict(outer)).toBe(true);
    const result = trainingWriteGuardHttpResponse(outer);
    expect(result?.status).toBe(409);
    expect((await result?.json()).error.code).toBe("ULC_WRITE_TEMPORARILY_BUSY");

    const cyclic: Error & { cause?: unknown } = new Error("recursive cause");
    cyclic.cause = cyclic;
    expect(isUlcRetryableDatabaseLockConflict(cyclic)).toBe(false);
    expect(ulcWriteLockConflictHttpResponse(cyclic)).toBeNull();
    const deep = new Error("a", {
      cause: new Error("b", {
        cause: new Error("c", {
          cause: new Error("d", { cause: postgresError("55P03") }),
        }),
      }),
    });
    expect(isUlcRetryableDatabaseLockConflict(deep)).toBe(false);
  });

  it.each(["23514", "23505", "40001", "40P01", "28P01", "42P01"])(
    "does not convert other SQLSTATE %s into a transient deletion lock",
    (code) => {
      expect(ulcWriteLockConflictHttpResponse(postgresError(code))).toBeNull();
      expect(trainingWriteGuardHttpResponse(postgresError(code))).toBeNull();
    },
  );

  it("does not accept arbitrary error text or unrelated primitives as a lock conflict", () => {
    for (const error of [
      new Error("55P03"),
      new Error("could not obtain lock on row"),
      null,
      undefined,
      0,
      "55P03",
      Object.assign(new Error("bad"), { code: 55_003 }),
    ]) {
      expect(isUlcRetryableDatabaseLockConflict(error)).toBe(false);
      expect(ulcWriteLockConflictHttpResponse(error)).toBeNull();
    }
  });

  it("covers all five guarded HTTP write families without automatic replay or broad error swallowing", () => {
    const source = readFileSync(new URL("../worker/index.ts", import.meta.url), "utf8");
    const documentation = readFileSync(
      new URL("../worker/training-documentation-http.ts", import.meta.url), "utf8",
    );
    const training = readFileSync(
      new URL("../worker/training-write-http-error.ts", import.meta.url), "utf8",
    );
    for (const helper of ["trainingBlockErrorResponse", "exerciseCatalogErrorResponse"]) {
      const pos = source.indexOf("function " + helper + "(error: unknown): Response {");
      expect(pos).toBeGreaterThan(0);
      expect(source.slice(pos, pos + 250)).toContain("ulcWriteLockConflictHttpResponse(error)");
    }
    expect(source).toContain("const transient = ulcWriteLockConflictHttpResponse(error);");
    expect(source).toContain("runtime.selfRegistration.save(");
    expect(source).toContain("runtime.selfRegistration.saveProxy(");
    expect(training).toContain("ulcWriteLockConflictHttpResponse(error)");
    expect(source).toContain("trainingWriteGuardHttpResponse(error)");
    expect(documentation).toContain("function errorResponse(error: unknown): Response {\n  const transient = ulcWriteLockConflictHttpResponse(error);");
    const helper = readFileSync(new URL("../worker/write-lock-conflict-http.ts", import.meta.url), "utf8");
    expect(helper).not.toMatch(/fetch\(|setTimeout\(|\bwhile\s*\(|retry\s*\(/);
    expect(helper).toContain('"55P03"');
    expect(helper).toContain('status: 409');
  });
});
