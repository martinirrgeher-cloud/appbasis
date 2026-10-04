export interface StoredXlsxPart {
  readonly name: string;
  readonly content: Uint8Array;
}

export function xlsxUtf8(value: string): Uint8Array {
  return new TextEncoder().encode(value);
}

export function xlsxXmlEscape(value: string): string {
  return xml10SafeText(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

export function xlsxColumnName(index: number): string {
  if (!Number.isSafeInteger(index) || index < 0) {
    throw new RangeError("XLSX column index must be a non-negative safe integer.");
  }
  let value = index + 1;
  let result = "";
  while (value > 0) {
    const remainder = (value - 1) % 26;
    result = String.fromCharCode(65 + remainder) + result;
    value = Math.floor((value - 1) / 26);
  }
  return result;
}

export function createStoredXlsxZip(
  files: readonly StoredXlsxPart[],
): Uint8Array {
  if (files.length === 0) {
    throw new Error("XLSX package must contain at least one part.");
  }

  const names = new Set<string>();
  const localParts: Uint8Array[] = [];
  const centralParts: Uint8Array[] = [];
  let localOffset = 0;
  let centralSize = 0;

  for (const file of files) {
    if (
      file.name.length === 0 ||
      file.name.startsWith("/") ||
      file.name.includes("\\") ||
      file.name.split("/").some((part) => part === "" || part === "." || part === "..")
    ) {
      throw new Error("XLSX package part name is invalid.");
    }
    if (names.has(file.name)) {
      throw new Error("XLSX package contains duplicate part names.");
    }
    names.add(file.name);

    const name = xlsxUtf8(file.name);
    const checksum = crc32(file.content);

    const localHeader = new Uint8Array(30 + name.length);
    const localView = new DataView(localHeader.buffer);
    localView.setUint32(0, 0x04034b50, true);
    localView.setUint16(4, 20, true);
    localView.setUint16(6, 0x0800, true);
    localView.setUint16(8, 0, true);
    localView.setUint16(10, 0, true);
    localView.setUint16(12, 33, true);
    localView.setUint32(14, checksum, true);
    localView.setUint32(18, file.content.length, true);
    localView.setUint32(22, file.content.length, true);
    localView.setUint16(26, name.length, true);
    localView.setUint16(28, 0, true);
    localHeader.set(name, 30);
    localParts.push(localHeader, file.content);

    const centralHeader = new Uint8Array(46 + name.length);
    const centralView = new DataView(centralHeader.buffer);
    centralView.setUint32(0, 0x02014b50, true);
    centralView.setUint16(4, 20, true);
    centralView.setUint16(6, 20, true);
    centralView.setUint16(8, 0x0800, true);
    centralView.setUint16(10, 0, true);
    centralView.setUint16(12, 0, true);
    centralView.setUint16(14, 33, true);
    centralView.setUint32(16, checksum, true);
    centralView.setUint32(20, file.content.length, true);
    centralView.setUint32(24, file.content.length, true);
    centralView.setUint16(28, name.length, true);
    centralView.setUint16(30, 0, true);
    centralView.setUint16(32, 0, true);
    centralView.setUint16(34, 0, true);
    centralView.setUint16(36, 0, true);
    centralView.setUint32(38, 0, true);
    centralView.setUint32(42, localOffset, true);
    centralHeader.set(name, 46);
    centralParts.push(centralHeader);

    centralSize += centralHeader.length;
    localOffset += localHeader.length + file.content.length;
  }

  const end = new Uint8Array(22);
  const endView = new DataView(end.buffer);
  endView.setUint32(0, 0x06054b50, true);
  endView.setUint16(4, 0, true);
  endView.setUint16(6, 0, true);
  endView.setUint16(8, files.length, true);
  endView.setUint16(10, files.length, true);
  endView.setUint32(12, centralSize, true);
  endView.setUint32(16, localOffset, true);
  endView.setUint16(20, 0, true);

  return concatBytes([...localParts, ...centralParts, end]);
}

function xml10SafeText(value: string): string {
  let result = "";
  for (let index = 0; index < value.length; index += 1) {
    const codePoint = value.codePointAt(index);
    if (codePoint === undefined) continue;
    if (codePoint > 0xffff) index += 1;
    const allowed =
      codePoint === 0x09 ||
      codePoint === 0x0a ||
      codePoint === 0x0d ||
      (codePoint >= 0x20 && codePoint <= 0xd7ff) ||
      (codePoint >= 0xe000 && codePoint <= 0xfffd) ||
      (codePoint >= 0x10000 && codePoint <= 0x10ffff);
    result += allowed ? String.fromCodePoint(codePoint) : "\ufffd";
  }
  return result;
}

function concatBytes(parts: readonly Uint8Array[]): Uint8Array {
  const length = parts.reduce((sum, part) => sum + part.length, 0);
  const result = new Uint8Array(length);
  let offset = 0;
  for (const part of parts) {
    result.set(part, offset);
    offset += part.length;
  }
  return result;
}

const CRC32_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let index = 0; index < 256; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) {
      value =
        (value & 1) === 1
          ? (value >>> 1) ^ 0xedb88320
          : value >>> 1;
    }
    table[index] = value >>> 0;
  }
  return table;
})();

function crc32(bytes: Uint8Array): number {
  let value = 0xffffffff;
  for (const byte of bytes) {
    value = (value >>> 8) ^ CRC32_TABLE[(value ^ byte) & 0xff]!;
  }
  return (value ^ 0xffffffff) >>> 0;
}
