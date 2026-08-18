import { describe, expect, it, vi } from "vitest";

import { principalId } from "@appbasis/permissions";

import {
  exportUlcLinzData,
  UlcLinzDataExportBlockedError,
  type UlcLinzDataExportDependencies,
  type UlcLinzDataExportRequest,
  type UlcLinzExportAuthorization,
  type UlcLinzExportDataset,
  type UlcLinzExportDatasetRecord,
} from "../worker/data-export";
import type { UlcLinzCurrentIdentity } from "../worker/authorization";

const IDENTITY_ID = "identity-1";
const ORGANIZATION_ID = "verein-1";
const SUBJECT_ID = "athlete-1";
const GENERATED_AT = new Date("2026-08-18T05:00:00.000Z");

function currentIdentity(
  access: UlcLinzCurrentIdentity["access"] = "full",
): UlcLinzCurrentIdentity {
  return {
    identity: {
      identityId: IDENTITY_ID,
      username: "athlete.user",
      displayName: "Athlete User",
      contactEmail: "athlete@example.test",
      personId: "person-1",
      mustChangePassword: access === "password-change-required",
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      updatedAt: new Date("2026-06-01T00:00:00.000Z"),
      passwordChangedAt: new Date("2026-01-01T00:00:00.000Z"),
      disabledAt: null,
      accountStatus: "active",
    },
    sessionToken: "appbasis.session=never-export-this",
    access,
  };
}

function memberRow(overrides: Record<string, unknown> = {}) {
  return {
    username: "athlete.user",
    displayName: "Athlete User",
    contactEmail: "athlete@example.test",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-06-01T00:00:00.000Z",
    ...overrides,
  };
}

function record(
  data: Readonly<Record<string, unknown>> = memberRow(),
  organizationId = ORGANIZATION_ID,
  subjectId = SUBJECT_ID,
): UlcLinzExportDatasetRecord {
  return { organizationId, subjectId, data };
}

function authorizationFor(
  request: UlcLinzDataExportRequest,
  sourceRole = request.scope === "organization"
    ? "admin"
    : request.scope === "managed"
      ? "parent"
      : "athlete",
): UlcLinzExportAuthorization {
  return {
    actorPrincipalId: principalId(IDENTITY_ID),
    organizationId: request.organizationId,
    sourceRole,
    scope: request.scope,
    subjectId: request.scope === "organization" ? null : request.subjectId,
  };
}

function dependencies(input?: {
  request?: UlcLinzDataExportRequest;
  authorization?: UlcLinzExportAuthorization;
  datasets?: readonly UlcLinzExportDataset[];
  auditError?: Error;
  now?: Date;
  order?: string[];
}): UlcLinzDataExportDependencies {
  const request =
    input?.request ??
    ({
      organizationId: ORGANIZATION_ID,
      scope: "self",
      subjectId: SUBJECT_ID,
    } as const);
  const order = input?.order ?? [];
  const defaultSubjectId = request.scope === "organization" ? SUBJECT_ID : request.subjectId;

  return {
    async authorizeExport() {
      order.push("authorize");
      return input?.authorization ?? authorizationFor(request);
    },
    async readDatasets() {
      order.push("read");
      return (
        input?.datasets ?? [
          {
            id: "member-contact",
            records: [record(memberRow(), request.organizationId, defaultSubjectId)],
          },
        ]
      );
    },
    async recordExportAudit() {
      order.push("audit");
      if (input?.auditError !== undefined) throw input.auditError;
    },
    now() {
      return input?.now ?? GENERATED_AT;
    },
  };
}

async function expectBlocked(
  run: () => Promise<unknown>,
  code: UlcLinzDataExportBlockedError["code"],
) {
  await expect(run()).rejects.toMatchObject({ code });
}

describe("ULC Linz M5-E data export", () => {
  it("exports one authorized self record as canonical JSON and supplementary CSV", async () => {
    const request = {
      organizationId: ORGANIZATION_ID,
      scope: "self" as const,
      subjectId: SUBJECT_ID,
    };
    const audit = vi.fn(async (_input: unknown) => {});
    const order: string[] = [];
    const deps = dependencies({ request, order });
    deps.recordExportAudit = async (input) => {
      order.push("audit");
      await audit(input);
    };

    const result = await exportUlcLinzData(currentIdentity(), deps, request);

    expect(order).toEqual(["authorize", "read", "audit"]);
    expect(result.json).toEqual({
      schemaVersion: 1,
      appId: "ulc-linz",
      generatedAt: "2026-08-18T05:00:00.000Z",
      organizationId: ORGANIZATION_ID,
      scope: "self",
      subjectId: SUBJECT_ID,
      datasets: { "member-contact": [memberRow()] },
    });
    expect(result.csv["member-contact.csv"]).toBe(
      '"username","displayName","contactEmail","createdAt","updatedAt"\r\n' +
        '"athlete.user","Athlete User","athlete@example.test","2026-01-01T00:00:00.000Z","2026-06-01T00:00:00.000Z"\r\n',
    );
    expect(JSON.stringify(result)).not.toContain("never-export-this");
    expect(audit).toHaveBeenCalledWith({
      actorPrincipalId: principalId(IDENTITY_ID),
      organizationId: ORGANIZATION_ID,
      scope: "self",
      subjectId: SUBJECT_ID,
      generatedAt: "2026-08-18T05:00:00.000Z",
      schemaVersion: 1,
      datasetIds: ["member-contact"],
      result: "success",
    });
  });

  it("supports managed scope only with an exact parent authorization proof", async () => {
    const request = {
      organizationId: ORGANIZATION_ID,
      scope: "managed" as const,
      subjectId: "child-1",
    };

    await expect(
      exportUlcLinzData(currentIdentity(), dependencies({ request }), request),
    ).resolves.toMatchObject({ json: { scope: "managed", subjectId: "child-1" } });

    await expectBlocked(
      () =>
        exportUlcLinzData(
          currentIdentity(),
          dependencies({ request, authorization: authorizationFor(request, "trainer") }),
          request,
        ),
      "AUTHORIZATION_MISMATCH",
    );
  });

  it("supports organization export only for admin proof and same-organization records", async () => {
    const request = { organizationId: ORGANIZATION_ID, scope: "organization" as const };
    const datasets = [
      {
        id: "member-contact",
        records: [
          record(memberRow()),
          record(
            memberRow({
              username: "second.user",
              displayName: 'Second "User"',
              contactEmail: null,
            }),
            ORGANIZATION_ID,
            "athlete-2",
          ),
        ],
      },
    ];

    const result = await exportUlcLinzData(
      currentIdentity(),
      dependencies({ request, datasets }),
      request,
    );
    expect(result.json.subjectId).toBeNull();
    expect(result.json.datasets["member-contact"]).toHaveLength(2);
    expect(result.csv["member-contact.csv"]).toContain('"Second ""User"""');

    await expectBlocked(
      () =>
        exportUlcLinzData(
          currentIdentity(),
          dependencies({ request, authorization: authorizationFor(request, "trainer") }),
          request,
        ),
      "AUTHORIZATION_MISMATCH",
    );
  });

  it("neutralizes spreadsheet formulas only in supplementary CSV", async () => {
    const request = {
      organizationId: ORGANIZATION_ID,
      scope: "self" as const,
      subjectId: SUBJECT_ID,
    };
    const dangerousName = "  =2+2";
    const result = await exportUlcLinzData(
      currentIdentity(),
      dependencies({
        request,
        datasets: [
          {
            id: "member-contact",
            records: [record(memberRow({ displayName: dangerousName }))],
          },
        ],
      }),
      request,
    );

    expect(result.json.datasets["member-contact"]?.[0]?.displayName).toBe(dangerousName);
    expect(result.csv["member-contact.csv"]).toContain('"\'  =2+2"');
  });

  it("blocks wrong-organization and wrong-subject dataset records", async () => {
    const request = {
      organizationId: ORGANIZATION_ID,
      scope: "self" as const,
      subjectId: SUBJECT_ID,
    };

    await expectBlocked(
      () =>
        exportUlcLinzData(
          currentIdentity(),
          dependencies({
            request,
            datasets: [{ id: "member-contact", records: [record(memberRow(), "verein-2")] }],
          }),
          request,
        ),
      "AUTHORIZATION_MISMATCH",
    );

    await expectBlocked(
      () =>
        exportUlcLinzData(
          currentIdentity(),
          dependencies({
            request,
            datasets: [
              { id: "member-contact", records: [record(memberRow(), ORGANIZATION_ID, "athlete-2")] },
            ],
          }),
          request,
        ),
      "AUTHORIZATION_MISMATCH",
    );
  });

  it("blocks password-change state before authorization", async () => {
    const authorizeExport = vi.fn(async () => authorizationFor({
      organizationId: ORGANIZATION_ID,
      scope: "self",
      subjectId: SUBJECT_ID,
    }));
    const deps = dependencies();
    deps.authorizeExport = authorizeExport;

    await expect(
      exportUlcLinzData(currentIdentity("password-change-required"), deps, {
        organizationId: ORGANIZATION_ID,
        scope: "self",
        subjectId: SUBJECT_ID,
      }),
    ).rejects.toMatchObject({ code: "PASSWORD_CHANGE_REQUIRED" });
    expect(authorizeExport).not.toHaveBeenCalled();
  });

  it("rejects mismatched authorization before any dataset read", async () => {
    const request = {
      organizationId: ORGANIZATION_ID,
      scope: "self" as const,
      subjectId: SUBJECT_ID,
    };
    const readDatasets = vi.fn(async () => []);
    const deps = dependencies({
      request,
      authorization: { ...authorizationFor(request), organizationId: "verein-2" },
    });
    deps.readDatasets = readDatasets;

    await expectBlocked(
      () => exportUlcLinzData(currentIdentity(), deps, request),
      "AUTHORIZATION_MISMATCH",
    );
    expect(readDatasets).not.toHaveBeenCalled();
  });

  it("fails closed for missing, unknown or duplicate datasets", async () => {
    const request = {
      organizationId: ORGANIZATION_ID,
      scope: "self" as const,
      subjectId: SUBJECT_ID,
    };
    await expectBlocked(
      () => exportUlcLinzData(currentIdentity(), dependencies({ request, datasets: [] }), request),
      "DATASET_INCOMPLETE",
    );
    await expectBlocked(
      () =>
        exportUlcLinzData(
          currentIdentity(),
          dependencies({
            request,
            datasets: [
              { id: "member-contact", records: [record()] },
              { id: "future-module", records: [record()] },
            ],
          }),
          request,
        ),
      "DATASET_NOT_ALLOWED",
    );
    await expectBlocked(
      () =>
        exportUlcLinzData(
          currentIdentity(),
          dependencies({
            request,
            datasets: [
              { id: "member-contact", records: [record()] },
              { id: "member-contact", records: [record()] },
            ],
          }),
          request,
        ),
      "DATASET_NOT_ALLOWED",
    );
  });

  it("rejects undeclared credential fields instead of silently sanitizing them", async () => {
    const request = {
      organizationId: ORGANIZATION_ID,
      scope: "self" as const,
      subjectId: SUBJECT_ID,
    };
    await expectBlocked(
      () =>
        exportUlcLinzData(
          currentIdentity(),
          dependencies({
            request,
            datasets: [
              {
                id: "member-contact",
                records: [record(memberRow({ password: "should-never-export" }))],
              },
            ],
          }),
          request,
        ),
      "UNSAFE_EXPORT_DATA",
    );
  });

  it("does not invoke accessor-backed export fields", async () => {
    let getterCalls = 0;
    const row = memberRow();
    Object.defineProperty(row, "displayName", {
      enumerable: true,
      get() {
        getterCalls += 1;
        return "unsafe";
      },
    });
    const request = {
      organizationId: ORGANIZATION_ID,
      scope: "self" as const,
      subjectId: SUBJECT_ID,
    };

    await expectBlocked(
      () =>
        exportUlcLinzData(
          currentIdentity(),
          dependencies({
            request,
            datasets: [{ id: "member-contact", records: [record(row)] }],
          }),
          request,
        ),
      "UNSAFE_EXPORT_DATA",
    );
    expect(getterCalls).toBe(0);
  });

  it("does not return export content when required audit fails", async () => {
    const request = {
      organizationId: ORGANIZATION_ID,
      scope: "self" as const,
      subjectId: SUBJECT_ID,
    };
    await expectBlocked(
      () =>
        exportUlcLinzData(
          currentIdentity(),
          dependencies({ request, auditError: new Error("audit unavailable") }),
          request,
        ),
      "AUDIT_FAILED",
    );
  });

  it("rejects malformed request identifiers and invalid server timestamps", async () => {
    await expectBlocked(
      () =>
        exportUlcLinzData(currentIdentity(), dependencies(), {
          organizationId: " verein-1",
          scope: "self",
          subjectId: SUBJECT_ID,
        }),
      "INVALID_REQUEST",
    );

    const request = {
      organizationId: ORGANIZATION_ID,
      scope: "self" as const,
      subjectId: SUBJECT_ID,
    };
    await expectBlocked(
      () =>
        exportUlcLinzData(
          currentIdentity(),
          dependencies({ request, now: new Date(Number.NaN) }),
          request,
        ),
      "INVALID_REQUEST",
    );
  });
});
