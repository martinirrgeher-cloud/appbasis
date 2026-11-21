import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";

/**
 * P04-C: strictly synthetic offline rehearsal; never accepts a source DB,
 * archive bytes, OAuth token, file path or a live Google Drive adapter.
 *
 * The ephemeral AES-GCM key tests cryptographic integrity only.
 * Actual production archives MUST have a separately reviewed age/X25519
 * implementation and key custody. This is not the production format.
 */
const MARKER = Buffer.from("ULC-P04C-SYNTHETIC-ONLY-1", "ascii");
const AAD = Buffer.from("ulc-linz:p04c:synthetic-backup:v1", "ascii");
const NONCE_BYTES = 12;
const AUTH_TAG_BYTES = 16;
const MIN_CIPHERTEXT_BYTES = MARKER.length + NONCE_BYTES + AUTH_TAG_BYTES + 1;
const FIXTURE = Buffer.from(
  JSON.stringify({
    fixture: "synthetic-ulc-backup-only",
    formatVersion: 1,
    tables: [
      { owner: "athletes", count: 2 },
      { owner: "ulc-linz-lifecycle", count: 3 },
    ],
    data: "SYNTHETIC-VALUES-NOT-PERSONAL-DATA",
  }),
  "utf8",
);

export interface SyntheticDriveStore {
  readonly kind: "synthetic-local-memory-only";
  uploadEncryptedFixture(input: {
    readonly name: string;
    readonly ciphertext: Uint8Array;
  }): Promise<{ readonly fileId: string }>;
  downloadEncryptedFixture(fileId: string): Promise<Uint8Array | null>;
  permanentlyDeleteFixture(fileId: string): Promise<void>;
}

export interface SyntheticRehearsalReceipt {
  readonly result: "synthetic-rehearsal-passed";
  readonly archiveKind: "not-a-production-backup";
  readonly encryption: "node-aes-256-gcm-synthetic-only";
  readonly integritySha256: string;
  readonly ciphertextBytes: number;
  readonly readBackVerified: true;
  readonly decryptedFixtureVerified: true;
  readonly permanentDeleteVerified: true;
  readonly uploadedPlaintext: false;
  readonly productionReady: false;
}

export class SyntheticBackupRehearsalError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SyntheticBackupRehearsalError";
  }
}

export async function runSyntheticDriveBackupRehearsal(
  store: SyntheticDriveStore,
): Promise<SyntheticRehearsalReceipt> {
  if (
    store === null ||
    typeof store !== "object" ||
    store.kind !== "synthetic-local-memory-only" ||
    typeof store.uploadEncryptedFixture !== "function" ||
    typeof store.downloadEncryptedFixture !== "function" ||
    typeof store.permanentlyDeleteFixture !== "function"
  ) {
    throw new SyntheticBackupRehearsalError(
      "Only a synthetic local-memory Drive adapter is permitted.",
    );
  }

  const key = randomBytes(32);
  try {
    const nonce = randomBytes(NONCE_BYTES);
    const cipher = createCipheriv("aes-256-gcm", key, nonce, {
      authTagLength: AUTH_TAG_BYTES,
    });
    cipher.setAAD(AAD);
    const ciphertext = Buffer.concat([
      MARKER,
      nonce,
      cipher.update(FIXTURE),
      cipher.final(),
      cipher.getAuthTag(),
    ]);
    const digest = createHash("sha256").update(ciphertext).digest();

    const uploaded = await store.uploadEncryptedFixture({
      name: "ulc-linz-synthetic-rehearsal.p04c.bin",
      ciphertext: new Uint8Array(ciphertext),
    });
    if (
      !uploaded ||
      typeof uploaded.fileId !== "string" ||
      !/^[A-Za-z0-9_-]{1,128}$/.test(uploaded.fileId)
    ) {
      throw new SyntheticBackupRehearsalError(
        "Synthetic Drive returned an invalid encrypted file ID.",
      );
    }
    const fileId = uploaded.fileId;
    const downloaded = await store.downloadEncryptedFixture(fileId);
    if (!downloaded || !(downloaded instanceof Uint8Array)) {
      throw new SyntheticBackupRehearsalError(
        "Encrypted fixture could not be read back.",
      );
    }
    const restored = Buffer.from(downloaded);
    const actualDigest = createHash("sha256").update(restored).digest();
    if (
      restored.length !== ciphertext.length ||
      !timingSafeEqual(actualDigest, digest)
    ) {
      throw new SyntheticBackupRehearsalError(
        "Encrypted fixture integrity verification failed.",
      );
    }
    const original = decryptSyntheticFixture(restored, key);
    if (
      original.length !== FIXTURE.length ||
      !timingSafeEqual(
        createHash("sha256").update(original).digest(),
        createHash("sha256").update(FIXTURE).digest(),
      )
    ) {
      throw new SyntheticBackupRehearsalError(
        "Synthetic fixture could not be recovered exactly.",
      );
    }

    // Permanent delete is deliberately after read-back AND decryption.
    await store.permanentlyDeleteFixture(fileId);
    const afterDelete = await store.downloadEncryptedFixture(fileId);
    if (afterDelete !== null) {
      throw new SyntheticBackupRehearsalError(
        "Synthetic Drive fixture is still recoverable after permanent delete.",
      );
    }

    return Object.freeze({
      result: "synthetic-rehearsal-passed",
      archiveKind: "not-a-production-backup",
      encryption: "node-aes-256-gcm-synthetic-only",
      integritySha256: digest.toString("hex"),
      ciphertextBytes: ciphertext.length,
      readBackVerified: true,
      decryptedFixtureVerified: true,
      permanentDeleteVerified: true,
      uploadedPlaintext: false,
      productionReady: false,
    });
  } catch (cause) {
    if (cause instanceof SyntheticBackupRehearsalError) throw cause;
    // Never expose provider/crypto exceptions that may contain secrets.
    throw new SyntheticBackupRehearsalError(
      "Synthetic backup rehearsal failed closed.",
    );
  } finally {
    key.fill(0);
  }
}

function decryptSyntheticFixture(
  ciphertext: Buffer,
  key: Buffer,
): Buffer {
  if (
    ciphertext.length < MIN_CIPHERTEXT_BYTES ||
    !ciphertext.subarray(0, MARKER.length).equals(MARKER)
  ) {
    throw new SyntheticBackupRehearsalError(
      "Synthetic encrypted artifact format is invalid.",
    );
  }
  const nonce = ciphertext.subarray(
    MARKER.length,
    MARKER.length + NONCE_BYTES,
  );
  const encrypted = ciphertext.subarray(
    MARKER.length + NONCE_BYTES,
    ciphertext.length - AUTH_TAG_BYTES,
  );
  const tag = ciphertext.subarray(ciphertext.length - AUTH_TAG_BYTES);
  const decipher = createDecipheriv("aes-256-gcm", key, nonce, {
    authTagLength: AUTH_TAG_BYTES,
  });
  decipher.setAAD(AAD);
  decipher.setAuthTag(tag);
  try {
    return Buffer.concat([decipher.update(encrypted), decipher.final()]);
  } catch {
    throw new SyntheticBackupRehearsalError(
      "Synthetic encrypted artifact authentication failed.",
    );
  }
}
