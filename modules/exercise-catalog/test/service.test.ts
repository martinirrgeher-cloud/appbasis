import { describe, expect, it } from "vitest";

import {
  ExerciseCatalogService,
  ExerciseCatalogValidationError,
  InMemoryExerciseCatalogRepository,
  createExerciseCatalogDefinition,
} from "../src/index";

const definition = createExerciseCatalogDefinition({
  categories: [
    { key: "strength", label: "Strength" },
    { key: "mobility", label: "Mobility" },
  ],
  parameterKeys: ["duration", "repetitions"],
});

describe("exercise catalog service", () => {
  it("keeps organizations isolated and persists parameters, audiences and favorites", async () => {
    const repository = new InMemoryExerciseCatalogRepository();
    let nextId = 0;
    const service = new ExerciseCatalogService({
      repository,
      definition,
      createId: () => "exercise-" + String(++nextId),
    });

    const first = await service.create("org-a", {
      name: "Front squat",
      categoryKey: "strength",
      equipment: ["Barbell"],
      audienceIds: ["group-a"],
      parameters: [
        {
          key: "repetitions",
          label: "Repetitions",
          inputType: "number",
          defaultValue: "5",
          minValue: 1,
          maxValue: 20,
          stepValue: 1,
          isRequired: true,
        },
      ],
    });
    await service.create("org-b", {
      name: "Front squat",
      categoryKey: "strength",
      audienceIds: ["group-b"],
    });

    expect(await service.setFavorite("org-a", "principal-1", first.id, true)).toBe(
      true,
    );

    const orgA = await service.list("org-a", "principal-1");
    expect(orgA).toHaveLength(1);
    expect(orgA[0]).toMatchObject({
      isFavorite: true,
      item: {
        organizationId: "org-a",
        audienceIds: ["group-a"],
        parameters: [{ key: "repetitions", defaultValue: "5" }],
      },
    });

    const orgB = await service.list("org-b", "principal-1");
    expect(orgB).toHaveLength(1);
    expect(orgB[0]).toMatchObject({
      isFavorite: false,
      item: { organizationId: "org-b", audienceIds: ["group-b"] },
    });
  });

  it("updates partially without reactivating archived items", async () => {
    const repository = new InMemoryExerciseCatalogRepository();
    const service = new ExerciseCatalogService({
      repository,
      definition,
      createId: () => "exercise-1",
    });
    const created = await service.create("org-a", {
      name: "Mobility flow",
      categoryKey: "mobility",
      goal: "Warm up",
    });

    await expect(service.deactivate("org-a", created.id)).resolves.toMatchObject({
      isActive: false,
    });
    await expect(
      service.update("org-a", created.id, { goal: "Hip mobility" }),
    ).resolves.toMatchObject({
      goal: "Hip mobility",
      isActive: false,
    });
  });

  it("fails closed for invalid configured categories and malformed scopes", async () => {
    const service = new ExerciseCatalogService({
      repository: new InMemoryExerciseCatalogRepository(),
      definition,
      createId: () => "exercise-1",
    });

    await expect(
      service.create("org-a", {
        name: "Sprint drill",
        categoryKey: "sprint",
      }),
    ).rejects.toBeInstanceOf(ExerciseCatalogValidationError);

    await expect(service.list(" org-a ")).rejects.toBeInstanceOf(
      ExerciseCatalogValidationError,
    );
  });

  it("returns not-found without creating orphan favorites", async () => {
    const repository = new InMemoryExerciseCatalogRepository();
    const service = new ExerciseCatalogService({
      repository,
      definition,
      createId: () => "exercise-1",
    });

    await expect(
      service.setFavorite("org-a", "principal-1", "missing", true),
    ).resolves.toBe(false);
    await expect(service.list("org-a", "principal-1")).resolves.toEqual([]);
  });
});
