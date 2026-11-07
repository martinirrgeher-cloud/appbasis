import { describe, expect, it, vi } from "vitest";
import { PostgresUlcTrainingSessionRepository } from "../worker/training-session-postgres";
import { UlcTrainingValidationError } from "../worker/training-session-domain";

describe("ULC trainer-presence persistence", () => {
  it("reads trainer IDs only for the exact organization, youth module, group and session", async () => {
    const query = vi.fn(async () => [{ trainer_id: "trainer-a" }]);
    const repo = new PostgresUlcTrainingSessionRepository({
      unsafe: query,
    }, () => "session-id");
    const ids = await repo.readTrainerPresence(
      "verein-1", "u12", "group-1", "session-1",
    );
    expect(ids).toEqual(["trainer-a"]);
    expect(query).toHaveBeenCalledOnce();
    const [sql, args] = query.mock.calls[0] as unknown as [string, unknown[]];
    expect(sql).toContain("ulc_linz_training_trainer_attendance");
    expect(sql).toContain("INNER JOIN ulc_linz_training_session");
    expect(sql).toContain("attendance.organization_id = $1");
    expect(sql).toContain("session.module_id = $3");
    expect(sql).toContain("session.group_id = $4");
    expect(args).toEqual(["verein-1", "session-1", "u12", "group-1"]);
  });

  it("saves a validated group trainer list atomically without removing historical non-members", async () => {
    const writes: Array<{ sql: string; params: readonly unknown[] | undefined }> = [];
    const repo = new PostgresUlcTrainingSessionRepository({
      async unsafe(sql, parameters) {
        writes.push({ sql, params: parameters });
        if (sql.includes("FROM ulc_linz_training_registration")) return [];
        return [{
          id: "session-1", organization_id: "verein-1",
          module_id: "u12", group_id: "group-1", session_date: "2026-11-07",
          state: "scheduled", note: "Training", revision: "10",
          saved_attendance_count: 0, deleted_stale_attendance_count: 0,
          saved_trainer_count: 1, deleted_stale_trainer_count: 1,
        }];
      },
    }, () => "session-id");
    const snapshot = await repo.saveSession(
      "verein-1", { moduleId: "u12", groupId: "group-1",
        sessionDate: "2026-11-07", note: "Training" },
      [], "9", [], [], ["trainer-a"], ["trainer-a", "trainer-b"],
    );
    expect(writes).toHaveLength(2);
    const { sql, params } = writes[0]!;
    expect(sql).toContain("saved_trainers AS");
    expect(sql).toContain("deleted_stale_trainers AS");
    expect(sql).toContain("trainer.trainer_id IN (SELECT trainer_id FROM eligible_trainers)");
    expect(sql).toContain("trainer.trainer_id NOT IN (SELECT trainer_id FROM selected_trainers)");
    expect(sql).toContain("FROM saved_session AS session");
    expect(sql).toContain("xmin::text = $9::text");
    expect(params?.[11]).toBe('["trainer-a"]');
    expect(params?.[12]).toBe('["trainer-a","trainer-b"]');
    expect(snapshot.trainingTrainerIds).toEqual(["trainer-a"]);
  });

  it("rejects invalid and unassigned IDs without persisting a partial roster", async () => {
    const query = vi.fn(async () => []);
    const repo = new PostgresUlcTrainingSessionRepository({ unsafe: query }, () => "sid");
    for (const list of [["a", "a"], ["foreign"], [""]]) {
      await expect(repo.saveSession("verein-1", {
        moduleId: "u12", groupId: "group-1", sessionDate: "2026-11-07",
      }, [], null, [], [], list, ["a"])).rejects.toBeInstanceOf(UlcTrainingValidationError);
    }
    expect(query).not.toHaveBeenCalled();
  });
});
