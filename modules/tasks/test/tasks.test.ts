import { describe, expect, it } from "vitest";

import moduleDefinition from "../appbasis.module.json";
import {
  InMemoryTaskRepository,
  MODULE_CAPABILITIES,
  TASK_CAPABILITIES,
  TaskValidationError,
} from "../src";

describe("tasks module public contract", () => {
  it("derives its public capability contract from the FC4 manifest", () => {
    expect(MODULE_CAPABILITIES).toEqual(moduleDefinition.capabilities);
    expect(Object.values(TASK_CAPABILITIES).sort()).toEqual([
      ...MODULE_CAPABILITIES,
    ].sort());
    expect(TASK_CAPABILITIES).toEqual({ manage: "tasks:manage" });
  });

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
