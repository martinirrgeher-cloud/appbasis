import { createHash } from "node:crypto";

import { describe, expect, it } from "vitest";

import {
  runSyntheticDriveBackupRehearsal,
  SyntheticBackupRehearsalError,
  type SyntheticDriveStore,
} from "../backup/drive-synthetic-rehearsal";

class MemoryOnlyDriveFixture implements SyntheticDriveStore {
  readonly kind = "synthetic-local-memory-only" as const;
  readonly objects = new Map<string, Uint8Array>();
  readonly snapshots: Uint8Array[] = [];
  readonly operations: string[] = [];
  failAt: "upload" | "download" | "delete" | null = null;
  corruptOnRead = false;
  removeOnDelete = true;
  returnInvalidFileId = false;
  returnMissingOnRead = false;

  async uploadEncryptedFixture({
    name,
    ciphertext,
  }: {
    readonly name: string;
    readonly ciphertext: Uint8Array;
  }): Promise<{ readonly fileId: string }> {
    this.operations.push("upload");
    if (this.failAt === "upload") {
      throw new Error("PRIVATE_FICTIONAL_TOKEN_MUST_NOT_LEAK");
    }
    expect(name).toBe("ulc-linz-synthetic-rehearsal.p04c.bin");
    expect(ciphertext).toBeInstanceOf(Uint8Array);
    const copy = new Uint8Array(ciphertext);
    this.objects.set("synthetic-1", copy);
    this.snapshots.push(copy);
    return { fileId: this.returnInvalidFileId ? "danger/../id" : "synthetic-1" };
  }

  async downloadEncryptedFixture(fileId: string): Promise<Uint8Array | null> {
    this.operations.push("download");
    if (this.failAt === "download") {
      throw new Error("PRIVATE_FICTIONAL_TOKEN_MUST_NOT_LEAK");
    }
    if (this.returnMissingOnRead) return null;
    const object = this.objects.get(fileId);
    if (!object) return null;
    const copy = new Uint8Array(object);
    if (this.corruptOnRead) copy[copy.length - 18]! ^= 1;
    return copy;
  }

  async permanentlyDeleteFixture(fileId: string): Promise<void> {
    this.operations.push("permanent-delete");
    if (this.failAt === "delete") {
      throw new Error("PRIVATE_FICTIONAL_TOKEN_MUST_NOT_LEAK");
    }
    if (this.removeOnDelete) this.objects.delete(fileId);
  }
}

describe("P04-C synthetic Drive offsite workflow – no real accounts or data", () => {
  it("encrypts only a fixed synthetic fixture, verifies read-back + decrypt and permanently deletes it", async () => {
    const storage = new MemoryOnlyDriveFixture();
    const result = await runSyntheticDriveBackupRehearsal(storage);
    expect(result).toMatchObject({
      result: "synthetic-rehearsal-passed",
      archiveKind: "not-a-production-backup",
      encryption: "node-aes-256-gcm-synthetic-only",
      readBackVerified: true,
      decryptedFixtureVerified: true,
      permanentDeleteVerified: true,
      uploadedPlaintext: false,
      productionReady: false,
    });
    expect(result.integritySha256).toMatch(/^[a-f0-9]{64}$/);
    expect(result.ciphertextBytes).toBeGreaterThan(100);
    expect(storage.operations).toEqual([
      "upload", "download", "permanent-delete", "download",
    ]);
    expect(storage.objects.size).toBe(0);
    const cipher = storage.snapshots[0]!;
    expect(Buffer.from(cipher).toString("utf8")).not.toContain(
      "SYNTHETIC-VALUES-NOT-PERSONAL-DATA",
    );
    expect(
      createHash("sha256").update(cipher).digest("hex"),
    ).toBe(result.integritySha256);
  });

  it("uses a new randomized authenticated ciphertext for each rehearsal", async () => {
    const first = new MemoryOnlyDriveFixture();
    const second = new MemoryOnlyDriveFixture();
    const a = await runSyntheticDriveBackupRehearsal(first);
    const b = await runSyntheticDriveBackupRehearsal(second);
    expect(a.integritySha256).not.toBe(b.integritySha256);
    expect(first.snapshots[0]).not.toEqual(second.snapshots[0]);
  });

  it("rejects any adapter other than the local synthetic-memory fixture", async () => {
    const realAdapter = {
      kind: "google-drive",
      uploadEncryptedFixture: async () => ({ fileId: "real" }),
      downloadEncryptedFixture: async () => new Uint8Array(),
      permanentlyDeleteFixture: async () => {},
    };
    await expect(runSyntheticDriveBackupRehearsal(
      realAdapter as unknown as SyntheticDriveStore,
    )).rejects.toThrow(/Only a synthetic local-memory Drive adapter/);
  });

  it("refuses a missing or malformed upload response before download or deletion", async () => {
    const storage = new MemoryOnlyDriveFixture();
    storage.returnInvalidFileId = true;
    await expect(runSyntheticDriveBackupRehearsal(storage)).rejects.toBeInstanceOf(
      SyntheticBackupRehearsalError,
    );
    expect(storage.operations).toEqual(["upload"]);
  });

  it("fails closed on corrupted encrypted read-back and does not prune", async () => {
    const storage = new MemoryOnlyDriveFixture();
    storage.corruptOnRead = true;
    await expect(runSyntheticDriveBackupRehearsal(storage)).rejects.toThrow(
      /integrity verification failed/,
    );
    expect(storage.operations).toEqual(["upload", "download"]);
    expect(storage.objects.has("synthetic-1")).toBe(true);
  });

  it("fails closed when upload completed but read-back is unavailable", async () => {
    const storage = new MemoryOnlyDriveFixture();
    storage.returnMissingOnRead = true;
    await expect(runSyntheticDriveBackupRehearsal(storage)).rejects.toThrow(
      /could not be read back/,
    );
    expect(storage.operations).toEqual(["upload", "download"]);
    expect(storage.objects.has("synthetic-1")).toBe(true);
  });

  it("rejects a delete acknowledgement that did not remove the object", async () => {
    const storage = new MemoryOnlyDriveFixture();
    storage.removeOnDelete = false;
    await expect(runSyntheticDriveBackupRehearsal(storage)).rejects.toThrow(
      /still recoverable after permanent delete/,
    );
    expect(storage.operations).toEqual([
      "upload", "download", "permanent-delete", "download",
    ]);
    expect(storage.objects.has("synthetic-1")).toBe(true);
  });

  it("does not leak lower-layer errors from failed upload, download or delete", async () => {
    for (const phase of ["upload", "download", "delete"] as const) {
      const storage = new MemoryOnlyDriveFixture();
      storage.failAt = phase;
      const error = await runSyntheticDriveBackupRehearsal(storage).catch(
        (cause: unknown) => cause,
      );
      expect(error).toBeInstanceOf(SyntheticBackupRehearsalError);
      expect((error as Error).message).toBe(
        "Synthetic backup rehearsal failed closed.",
      );
      expect((error as Error).message).not.toContain(
        "PRIVATE_FICTIONAL_TOKEN_MUST_NOT_LEAK",
      );
      if (phase !== "delete") {
        expect(storage.operations).not.toContain("permanent-delete");
      }
    }
  });
});
