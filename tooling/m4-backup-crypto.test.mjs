import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  decryptM4BackupFile,
  encryptM4BackupFile,
  parseM4BackupEncryptionKey,
  writeM4FileFully,
} from "./m4-backup-crypto.mjs";

const KEY = "11".repeat(32);
const OTHER_KEY = "22".repeat(32);
const IV = Buffer.from("0102030405060708090a0b0c", "hex");

async function tempPaths() {
  const dir = await mkdtemp(join(tmpdir(), "appbasis-m4-crypto-"));
  return {
    input: join(dir, "input.tar"),
    encrypted: join(dir, "backup.tar.aesgcm"),
    restored: join(dir, "restored.tar"),
    wrong: join(dir, "wrong.tar"),
  };
}

test("encrypts and decrypts an M4 backup with authenticated AES-256-GCM", async () => {
  const paths = await tempPaths();
  const source = Buffer.concat([
    Buffer.from("appbasis-m4-backup\n"),
    Buffer.alloc(2 * 1024 * 1024 + 17, 0x5a),
  ]);
  await writeFile(paths.input, source);

  const encrypted = await encryptM4BackupFile({
    inputPath: paths.input,
    outputPath: paths.encrypted,
    keyHex: KEY,
    randomBytesImpl: () => IV,
  });
  assert.equal(encrypted.algorithm, "AES-256-GCM");
  assert.equal(encrypted.bytesRead, source.length);
  assert.notDeepEqual(await readFile(paths.encrypted), source);

  await decryptM4BackupFile({
    inputPath: paths.encrypted,
    outputPath: paths.restored,
    keyHex: KEY,
  });
  assert.deepEqual(await readFile(paths.restored), source);
});

test("retries short file writes until every byte is written", async () => {
  const source = Buffer.from("short-write-regression");
  const written = [];
  const calls = [];
  const fakeFile = {
    async write(buffer, offset, length, position) {
      assert.equal(buffer, source);
      assert.equal(position, null);
      calls.push({ offset, length });
      const bytesWritten = Math.min(3, length);
      written.push(buffer.subarray(offset, offset + bytesWritten));
      return { bytesWritten, buffer };
    },
  };

  await writeM4FileFully(fakeFile, source);

  assert.deepEqual(Buffer.concat(written), source);
  assert.ok(calls.length > 1);
  assert.deepEqual(calls[0], { offset: 0, length: source.length });
  assert.equal(calls.at(-1).offset + calls.at(-1).length, source.length);
});

test("fails closed when a short write stops making progress", async () => {
  await assert.rejects(
    writeM4FileFully(
      { async write() { return { bytesWritten: 0 }; } },
      Buffer.from("must-not-truncate"),
    ),
    /did not advance/,
  );
});

test("rejects a wrong key without leaving unauthenticated plaintext", async () => {
  const paths = await tempPaths();
  await writeFile(paths.input, "sensitive backup material");
  await encryptM4BackupFile({
    inputPath: paths.input,
    outputPath: paths.encrypted,
    keyHex: KEY,
    randomBytesImpl: () => IV,
  });

  await assert.rejects(
    decryptM4BackupFile({
      inputPath: paths.encrypted,
      outputPath: paths.wrong,
      keyHex: OTHER_KEY,
    }),
    /decryption failed/,
  );
  await assert.rejects(readFile(paths.wrong), /ENOENT/);
});

test("rejects tampered ciphertext and removes partial plaintext", async () => {
  const paths = await tempPaths();
  await writeFile(paths.input, "backup material that must authenticate");
  await encryptM4BackupFile({
    inputPath: paths.input,
    outputPath: paths.encrypted,
    keyHex: KEY,
    randomBytesImpl: () => IV,
  });

  const tampered = await readFile(paths.encrypted);
  tampered[22] ^= 0xff;
  await writeFile(paths.encrypted, tampered);

  await assert.rejects(
    decryptM4BackupFile({
      inputPath: paths.encrypted,
      outputPath: paths.wrong,
      keyHex: KEY,
    }),
    /decryption failed/,
  );
  await assert.rejects(readFile(paths.wrong), /ENOENT/);
});

test("never deletes a pre-existing exclusive output on encryption or decryption failure", async () => {
  const encryptionPaths = await tempPaths();
  await writeFile(encryptionPaths.input, "new backup material");
  await writeFile(encryptionPaths.encrypted, "keep-existing-encrypted-output");

  await assert.rejects(
    encryptM4BackupFile({
      inputPath: encryptionPaths.input,
      outputPath: encryptionPaths.encrypted,
      keyHex: KEY,
      randomBytesImpl: () => IV,
    }),
    /encryption failed/,
  );
  assert.equal(
    await readFile(encryptionPaths.encrypted, "utf8"),
    "keep-existing-encrypted-output",
  );

  const decryptionPaths = await tempPaths();
  await writeFile(decryptionPaths.input, "backup material");
  await encryptM4BackupFile({
    inputPath: decryptionPaths.input,
    outputPath: decryptionPaths.encrypted,
    keyHex: KEY,
    randomBytesImpl: () => IV,
  });
  await writeFile(decryptionPaths.restored, "keep-existing-restore-output");

  await assert.rejects(
    decryptM4BackupFile({
      inputPath: decryptionPaths.encrypted,
      outputPath: decryptionPaths.restored,
      keyHex: KEY,
    }),
    /decryption failed/,
  );
  assert.equal(
    await readFile(decryptionPaths.restored, "utf8"),
    "keep-existing-restore-output",
  );
});

test("requires exactly one lowercase 256-bit hexadecimal key", () => {
  assert.equal(parseM4BackupEncryptionKey(KEY).length, 32);
  for (const value of ["", "AA".repeat(32), "11".repeat(31), "gg".repeat(32)]) {
    assert.throws(() => parseM4BackupEncryptionKey(value), /64 lowercase hex/);
  }
});
