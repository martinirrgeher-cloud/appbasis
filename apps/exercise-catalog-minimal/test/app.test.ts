import { describe, expect, it } from "vitest";

import {
  EXERCISE_CATALOG_CAPABILITIES,
  ExerciseCatalogService,
  InMemoryExerciseCatalogRepository,
} from "@appbasis/exercise-catalog";
import type { IdentityHttpService } from "@appbasis/identity/http";
import {
  InMemoryPermissionStore,
  capabilityId,
  principalId,
} from "@appbasis/permissions";

import { createExerciseCatalogMinimalApp } from "../worker/app";
import {
  EXERCISE_CATALOG_MINIMAL_DEFINITION,
  EXERCISE_CATALOG_MINIMAL_ORGANIZATION_ID,
} from "../worker/catalog-config";

const currentIdentity = {
  identity: {
    identityId: "identity-1",
    username: "catalog.user",
    displayName: "Catalog User",
    contactEmail: null,
    personId: null,
    mustChangePassword: false,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    passwordChangedAt: new Date("2026-01-01T00:00:00.000Z"),
    disabledAt: null,
    accountStatus: "active" as const,
  },
  sessionToken: "appbasis.session=catalog-test-token",
  access: "full" as const,
};

const identity: IdentityHttpService = {
  async signInWithUsername() {
    return currentIdentity;
  },
  async getCurrentIdentity(sessionToken) {
    return sessionToken === currentIdentity.sessionToken
      ? currentIdentity
      : null;
  },
  async changeRequiredPassword() {
    return currentIdentity;
  },
};

describe("exercise-catalog minimal consumer", () => {
  it("is runnable and exposes health", async () => {
    const response = await createApp(true, true).request("/api/health");
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      status: "ok",
      appId: "exercise-catalog-minimal",
    });
  });

  it("keeps organization scope app-owned and separates view from edit", async () => {
    const catalog = createCatalog();
    const viewOnly = createApp(true, false, catalog);
    const editor = createApp(true, true, catalog);

    const unauthenticated = await viewOnly.request("/api/exercises");
    expect(unauthenticated.status).toBe(401);

    const deniedCreate = await viewOnly.request("/api/exercises", {
      method: "POST",
      headers: {
        cookie: currentIdentity.sessionToken,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        name: "Denied",
        categoryKey: "strength",
      }),
    });
    expect(deniedCreate.status).toBe(403);

    const created = await editor.request("/api/exercises", {
      method: "POST",
      headers: {
        cookie: currentIdentity.sessionToken,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        organizationId: "client-must-not-control-this",
        name: "Front squat",
        categoryKey: "strength",
        audienceIds: ["team-1"],
        parameters: [
          {
            key: "repetitions",
            label: "Repetitions",
            inputType: "number",
            defaultValue: "5",
          },
        ],
      }),
    });
    expect(created.status).toBe(201);
    const createdBody = (await created.json()) as {
      exercise: { id: string; organizationId: string };
    };
    expect(createdBody.exercise.organizationId).toBe(
      EXERCISE_CATALOG_MINIMAL_ORGANIZATION_ID,
    );

    const favorite = await viewOnly.request(
      "/api/exercises/" + createdBody.exercise.id + "/favorite",
      {
        method: "PUT",
        headers: {
          cookie: currentIdentity.sessionToken,
          "content-type": "application/json",
        },
        body: JSON.stringify({ favorite: true }),
      },
    );
    expect(favorite.status).toBe(200);

    const listed = await viewOnly.request("/api/exercises", {
      headers: { cookie: currentIdentity.sessionToken },
    });
    expect(listed.status).toBe(200);
    await expect(listed.json()).resolves.toMatchObject({
      exercises: [
        {
          isFavorite: true,
          item: {
            organizationId: EXERCISE_CATALOG_MINIMAL_ORGANIZATION_ID,
            name: "Front squat",
            audienceIds: ["team-1"],
            parameters: [{ key: "repetitions" }],
          },
        },
      ],
    });
  });

  it("maps domain validation failures to a stable 400 response", async () => {
    const response = await createApp(true, true).request("/api/exercises", {
      method: "POST",
      headers: {
        cookie: currentIdentity.sessionToken,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        name: "Sprint drill",
        categoryKey: "sprint",
      }),
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "INVALID_EXERCISE" },
    });
  });
});

function createCatalog() {
  let nextId = 0;
  return new ExerciseCatalogService({
    repository: new InMemoryExerciseCatalogRepository(),
    definition: EXERCISE_CATALOG_MINIMAL_DEFINITION,
    createId: () => "exercise-" + String(++nextId),
  });
}

function createApp(
  allowView: boolean,
  allowEdit: boolean,
  catalog = createCatalog(),
) {
  return createExerciseCatalogMinimalApp({
    identity,
    permissions: permissionStore(allowView, allowEdit),
    catalog,
    organizationId: EXERCISE_CATALOG_MINIMAL_ORGANIZATION_ID,
    secureCookies: false,
  });
}

function permissionStore(allowView: boolean, allowEdit: boolean) {
  const view = capabilityId(EXERCISE_CATALOG_CAPABILITIES.view);
  const edit = capabilityId(EXERCISE_CATALOG_CAPABILITIES.edit);
  return new InMemoryPermissionStore({
    knownCapabilities: [view, edit],
    roles: [],
    principals: [
      {
        principalId: principalId(currentIdentity.identity.identityId),
        roleIds: [],
        grants: [
          ...(allowView ? [view] : []),
          ...(allowEdit ? [edit] : []),
        ],
        revokes: [],
      },
    ],
  });
}
