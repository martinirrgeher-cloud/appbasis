import { describe, expect, it } from "vitest";

import { InMemoryTaskRepository, TaskValidationError } from "../src";

describe("tasks module public contract", () => {
  it("creates, lists and toggles tasks through the repository contract", async () => {
    const repository = new InMemoryTaskRepository();

    const created = await repository.create({ title: "First task" });
    expect(created).toMatchObject({
      id: "1",
      title: "First task",
      status: "open",
    });
    await expect(repository.list()).resolves.toEqual([created]);

    const toggled = await repository.toggleStatus(created.id);
    expect(toggled).toMatchObject({
      id: created.id,
      title: "First task",
      status: "completed",
    });
  });

  it("keeps task validation inside the module boundary", async () => {
    const repository = new InMemoryTaskRepository();

    await expect(repository.create({ title: "   " })).rejects.toBeInstanceOf(
      TaskValidationError,
    );
  });
});
