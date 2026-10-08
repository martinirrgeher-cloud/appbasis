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
  difficulties: [
    { key: "easy", label: "Easy" },
    { key: "hard", label: "Hard" },
  ],
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

  it("supports similarities, duplicate warnings, usage history and private media metadata", async () => {
    const repository = new InMemoryExerciseCatalogRepository();
    let nextId = 0;
    const service = new ExerciseCatalogService({
      repository,
      definition,
      createId: () => "generated-" + String(++nextId),
    });

    const first = await service.create("org-a", {
      name: "Flying sprint 30 m",
      categoryKey: "mobility",
      difficultyKey: "easy",
      equipment: ["cones"],
      videoUrls: ["https://example.test/one"],
    });
    const second = await service.create("org-a", {
      name: "Flying sprint 40 m",
      categoryKey: "mobility",
      equipment: ["cones"],
      similarExerciseIds: [first.id],
    });

    await expect(service.findById("org-a", first.id)).resolves.toMatchObject({
      item: {
        similarExerciseIds: [second.id],
      },
    });

    const duplicates = await service.findDuplicateCandidates("org-a", {
      name: "Flying sprint 35 m",
      categoryKey: "mobility",
      equipment: ["cones"],
    });
    expect(duplicates.map((candidate) => candidate.exerciseId)).toEqual(
      expect.arrayContaining([first.id, second.id]),
    );

    const usage = await service.recordUsage("org-a", first.id, {
      sourceKind: "manual",
      sourceRef: "training-1",
    });
    expect(usage).toMatchObject({
      organizationId: "org-a",
      exerciseId: first.id,
      sourceKind: "manual",
      sourceRef: "training-1",
    });
    await expect(service.listUsageSummaries("org-a")).resolves.toEqual([
      expect.objectContaining({
        exerciseId: first.id,
        usageCount: 1,
      }),
    ]);

    const media = await service.registerPrivateMedia("org-a", first.id, {
      id: "media-1",
      fileName: "clip.mp4",
      storageKey: "exercise-catalog/org-a/item/media-1",
      contentType: "video/mp4",
      sizeBytes: 1234,
    });
    expect(media).toMatchObject({
      id: "media-1",
      exerciseId: first.id,
      fileName: "clip.mp4",
    });
    await expect(service.listPrivateMedia("org-a", first.id)).resolves.toEqual([
      expect.objectContaining({ id: "media-1" }),
    ]);
    await expect(
      service.deletePrivateMedia("org-a", first.id, "media-1"),
    ).resolves.toMatchObject({ id: "media-1" });
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
