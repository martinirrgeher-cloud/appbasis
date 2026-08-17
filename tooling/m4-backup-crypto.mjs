import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { open, rm } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const MAGIC = Buffer.from("ABM4GCM1", "ascii");
const IV_BYTES = 12;
const TAG_BYTES = 16;
const HEADER_BYTES = MAGIC.length + IV_BYTES;
const CHUNK_BYTES = 1024 * 1024;

export function parseM4BackupEncryptionKey(value) {
  if (typeof value !== "string" || !/^[0-9a-f]{64}$/.test(value)) {
    throw new Error("APPBASIS_M4_BACKUP_ENCRYPTION_KEY must be 64 lowercase hex characters.");
  }
  return Buffer.from(value, "hex");
}

export async function writeM4FileFully(file, value) {
  if (!file || typeof file.write !== "function" || !Buffer.isBuffer(value)) {
    throw new Error("M4 backup output write is invalid.");
  }

  let offset = 0;
  while (offset < value.length) {
    const result = await file.write(value, offset, value.length - offset, null);
    if (
      !result ||
      !Number.isInteger(result.bytesWritten) ||
      result.bytesWritten <= 0 ||
      result.bytesWritten > value.length - offset
    ) {
      throw new Error("M4 backup output write did not advance.");
    }
    offset += result.bytesWritten;
  }
}

export async function encryptM4BackupFile({
  inputPath,
  outputPath,
  keyHex,
  randomBytesImpl = randomBytes,
} = {}) {
  const key = parseM4BackupEncryptionKey(keyHex);
  requiredDistinctPaths(inputPath, outputPath);
  if (typeof randomBytesImpl !== "function") {
    throw new Error("randomBytesImpl must be a function.");
  }

  const iv = Buffer.from(randomBytesImpl(IV_BYTES));
  if (iv.length !== IV_BYTES) {
    throw new Error("M4 backup IV generation failed.");
  }

  let input;
  let output;
  let outputCreated = false;
  try {
    input = await open(inputPath, "r");
    output = await open(outputPath, "wx", 0o600);
    outputCreated = true;
    await writeM4FileFully(output, MAGIC);
    await writeM4FileFully(output, iv);

    const cipher = createCipheriv("aes-256-gcm", key, iv);
    const buffer = Buffer.allocUnsafe(CHUNK_BYTES);
    let position = 0;
    while (true) {
      const { bytesRead } = await input.read(buffer, 0, buffer.length, position);
      if (bytesRead === 0) break;
      position += bytesRead;
      const encrypted = cipher.update(buffer.subarray(0, bytesRead));
      if (encrypted.length > 0) await writeM4FileFully(output, encrypted);
    }
    const final = cipher.final();
    if (final.length > 0) await writeM4FileFully(output, final);
    await writeM4FileFully(output, cipher.getAuthTag());
    await output.sync();
    return Object.freeze({ algorithm: "AES-256-GCM", bytesRead: position });
  } catch (error) {
    try {
      await output?.close();
    } catch {
      // Preserve the original sanitized encryption failure.
    }
    output = undefined;
    if (outputCreated) {
      await rm(outputPath, { force: true }).catch(() => {});
    }
    throw new Error("M4 backup encryption failed.", { cause: error });
  } finally {
    await input?.close().catch(() => {});
    await output?.close().catch(() => {});
  }
}

export async function decryptM4BackupFile({ inputPath, outputPath, keyHex } = {}) {
  const key = parseM4BackupEncryptionKey(keyHex);
  requiredDistinctPaths(inputPath, outputPath);

  let input;
  let output;
  let outputCreated = false;
  try {
    input = await open(inputPath, "r");
    const stat = await input.stat();
    if (stat.size <= HEADER_BYTES + TAG_BYTES) {
      throw new Error("encrypted backup is too small");
    }

    const header = Buffer.alloc(HEADER_BYTES);
    const headerRead = await input.read(header, 0, header.length, 0);
    if (headerRead.bytesRead !== header.length || !header.subarray(0, MAGIC.length).equals(MAGIC)) {
      throw new Error("encrypted backup header is invalid");
    }
    const iv = header.subarray(MAGIC.length);

    const tag = Buffer.alloc(TAG_BYTES);
    const tagRead = await input.read(tag, 0, tag.length, stat.size - TAG_BYTES);
    if (tagRead.bytesRead !== tag.length) {
      throw new Error("encrypted backup tag is invalid");
    }

    output = await open(outputPath, "wx", 0o600);
    outputCreated = true;
    const decipher = createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(tag);

    const ciphertextBytes = stat.size - HEADER_BYTES - TAG_BYTES;
    const buffer = Buffer.allocUnsafe(CHUNK_BYTES);
    let consumed = 0;
    while (consumed < ciphertextBytes) {
      const wanted = Math.min(buffer.length, ciphertextBytes - consumed);
      const { bytesRead } = await input.read(
        buffer,
        0,
        wanted,
        HEADER_BYTES + consumed,
      );
      if (bytesRead === 0) throw new Error("encrypted backup ended unexpectedly");
      consumed += bytesRead;
      const decrypted = decipher.update(buffer.subarray(0, bytesRead));
      if (decrypted.length > 0) await writeM4FileFully(output, decrypted);
    }
    const final = decipher.final();
    if (final.length > 0) await writeM4FileFully(output, final);
    await output.sync();
    return Object.freeze({ algorithm: "AES-256-GCM", bytesWritten: ciphertextBytes });
  } catch (error) {
    try {
      await output?.close();
    } catch {
      // Preserve the original sanitized decryption failure.
    }
    output = undefined;
    if (outputCreated) {
      await rm(outputPath, { force: true }).catch(() => {});
    }
    throw new Error("M4 backup decryption failed.", { cause: error });
  } finally {
    await input?.close().catch(() => {});
    await output?.close().catch(() => {});
  }
}

function requiredDistinctPaths(inputPath, outputPath) {
  if (
    typeof inputPath !== "string" ||
    inputPath.length === 0 ||
    typeof outputPath !== "string" ||
    outputPath.length === 0 ||
    resolve(inputPath) === resolve(outputPath)
  ) {
    throw new Error("M4 backup input and output paths are invalid.");
  }
}

function isMainModule() {
  if (typeof process.argv[1] !== "string") return false;
  return import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
}

if (isMainModule()) {
  try {
    const mode = process.argv[2];
    const options = {
      inputPath: process.argv[3],
      outputPath: process.argv[4],
      keyHex: process.env.APPBASIS_M4_BACKUP_ENCRYPTION_KEY,
    };
    const result = mode === "encrypt"
      ? await encryptM4BackupFile(options)
      : mode === "decrypt"
        ? await decryptM4BackupFile(options)
        : (() => { throw new Error("Expected command mode encrypt or decrypt."); })();
    process.stdout.write(`${JSON.stringify(result)}\n`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : "M4 backup crypto failed.");
    process.exitCode = 1;
  }
}
