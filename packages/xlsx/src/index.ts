import { inflateRawSync } from "node:zlib";

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

const ZIP_UINT16_MAX = 0xffff;
const ZIP_UINT32_MAX = 0xffffffff;
const XLSX_MAX_COLUMN_INDEX = 16_383;

export function xlsxColumnName(index: number): string {
  if (
    !Number.isSafeInteger(index) ||
    index < 0 ||
    index > XLSX_MAX_COLUMN_INDEX
  ) {
    throw new RangeError(
      "XLSX column index must be between 0 and 16383.",
    );
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
  if (files.length > ZIP_UINT16_MAX) {
    throw new Error("XLSX package contains too many parts for ZIP32.");
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
    if (name.length > ZIP_UINT16_MAX) {
      throw new Error("XLSX package part name is too long for ZIP32.");
    }
    if (file.content.byteLength > ZIP_UINT32_MAX) {
      throw new Error("XLSX package part is too large for ZIP32.");
    }
    if (localOffset > ZIP_UINT32_MAX) {
      throw new Error("XLSX package offset exceeds ZIP32.");
    }
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
    if (centralSize > ZIP_UINT32_MAX || localOffset > ZIP_UINT32_MAX) {
      throw new Error("XLSX package exceeds ZIP32 limits.");
    }
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


export interface XlsxSheetRow {
  readonly rowNumber: number;
  readonly cells: readonly string[];
}

export interface ReadXlsxWorkbookOptions {
  readonly sheetNames?: readonly string[];
  readonly decodeDates?: boolean;
  readonly maxZipEntries?: number;
  readonly maxUncompressedBytes?: number;
  readonly maxEntryBytes?: number;
  readonly maxColumnIndex?: number;
}

export class XlsxReadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "XlsxReadError";
  }
}

interface XlsxZipEntry {
  readonly name: string;
  readonly flags: number;
  readonly method: number;
  readonly crc: number;
  readonly compressedSize: number;
  readonly uncompressedSize: number;
  readonly localOffset: number;
}

interface XlsxWorkbookDateContext {
  readonly date1904: boolean;
  readonly dateStyleIndexes: ReadonlySet<number>;
}

const DEFAULT_MAX_ZIP_ENTRIES = 128;
const DEFAULT_MAX_UNCOMPRESSED_BYTES = 32 * 1024 * 1024;
const DEFAULT_MAX_ENTRY_BYTES = 16 * 1024 * 1024;
const DEFAULT_MAX_COLUMN_INDEX = 255;
const ZIP_ENCRYPTION_FLAGS = 0x0001 | 0x0040 | 0x2000;
const ZIP_DATA_DESCRIPTOR_SIGNATURE = 0x08074b50;
const ZIP64_EXTRA_FIELD_ID = 0x0001;
const DAY_MILLISECONDS = 24 * 60 * 60 * 1_000;
const BUILTIN_DATE_NUMBER_FORMAT_IDS = new Set([
  14, 15, 16, 17, 22,
  27, 28, 29, 30, 31, 32, 33, 34, 35, 36,
  50, 51, 52, 53, 54, 55, 56, 57, 58,
]);

export async function readXlsxWorkbook(
  bytes: Uint8Array,
  options: ReadXlsxWorkbookOptions = {},
): Promise<ReadonlyMap<string, readonly XlsxSheetRow[]>> {
  const limits = normalizeReaderLimits(options);
  const entries = readZipDirectory(bytes, limits);
  for (const entry of entries.values()) {
    await readZipEntry(bytes, entry, limits.maxEntryBytes);
  }
  const workbookXml = await readZipText(
    bytes,
    entries,
    "xl/workbook.xml",
    limits.maxEntryBytes,
  );
  const relationshipsXml = await readZipText(
    bytes,
    entries,
    "xl/_rels/workbook.xml.rels",
    limits.maxEntryBytes,
  );
  const sharedStrings = entries.has("xl/sharedStrings.xml")
    ? parseSharedStrings(
        await readZipText(
          bytes,
          entries,
          "xl/sharedStrings.xml",
          limits.maxEntryBytes,
        ),
      )
    : [];

  const decodeDates = options.decodeDates === true;
  const dateContext: XlsxWorkbookDateContext = decodeDates
    ? Object.freeze({
        date1904: workbookUses1904DateSystem(workbookXml),
        dateStyleIndexes: entries.has("xl/styles.xml")
          ? parseDateStyleIndexes(
              await readZipText(
                bytes,
                entries,
                "xl/styles.xml",
                limits.maxEntryBytes,
              ),
            )
          : new Set<number>(),
      })
    : Object.freeze({
        date1904: false,
        dateStyleIndexes: new Set<number>(),
      });

  const requestedSheets =
    options.sheetNames === undefined ? null : new Set(options.sheetNames);
  const relations = parseRelationships(relationshipsXml);
  const sheets = parseWorkbookSheets(workbookXml);
  const result = new Map<string, readonly XlsxSheetRow[]>();

  for (const sheet of sheets) {
    if (requestedSheets !== null && !requestedSheets.has(sheet.name)) continue;
    const target = relations.get(sheet.relationshipId);
    if (target === undefined) {
      throw new XlsxReadError("Eine Tabellenbeziehung der XLSX-Datei fehlt.");
    }
    const path = resolveZipPath("xl/workbook.xml", target);
    const xml = await readZipText(
      bytes,
      entries,
      path,
      limits.maxEntryBytes,
    );
    if (result.has(sheet.name)) {
      throw new XlsxReadError(
        "Die XLSX-Datei enthält doppelte Tabellenblattnamen.",
      );
    }
    result.set(
      sheet.name,
      Object.freeze(
        parseWorksheet(
          xml,
          sharedStrings,
          dateContext,
          decodeDates,
          limits.maxColumnIndex,
        ),
      ),
    );
  }

  return result;
}

function normalizeReaderLimits(options: ReadXlsxWorkbookOptions): {
  readonly maxZipEntries: number;
  readonly maxUncompressedBytes: number;
  readonly maxEntryBytes: number;
  readonly maxColumnIndex: number;
} {
  return Object.freeze({
    maxZipEntries: positiveIntegerLimit(
      options.maxZipEntries,
      DEFAULT_MAX_ZIP_ENTRIES,
      "maxZipEntries",
    ),
    maxUncompressedBytes: positiveIntegerLimit(
      options.maxUncompressedBytes,
      DEFAULT_MAX_UNCOMPRESSED_BYTES,
      "maxUncompressedBytes",
    ),
    maxEntryBytes: positiveIntegerLimit(
      options.maxEntryBytes,
      DEFAULT_MAX_ENTRY_BYTES,
      "maxEntryBytes",
    ),
    maxColumnIndex: nonNegativeIntegerLimit(
      options.maxColumnIndex,
      DEFAULT_MAX_COLUMN_INDEX,
      "maxColumnIndex",
    ),
  });
}

function positiveIntegerLimit(
  value: number | undefined,
  fallback: number,
  name: string,
): number {
  const resolved = value ?? fallback;
  if (!Number.isSafeInteger(resolved) || resolved <= 0) {
    throw new RangeError(name + " must be a positive safe integer.");
  }
  return resolved;
}

function nonNegativeIntegerLimit(
  value: number | undefined,
  fallback: number,
  name: string,
): number {
  const resolved = value ?? fallback;
  if (!Number.isSafeInteger(resolved) || resolved < 0) {
    throw new RangeError(name + " must be a non-negative safe integer.");
  }
  return resolved;
}

function readZipDirectory(
  bytes: Uint8Array,
  limits: {
    readonly maxZipEntries: number;
    readonly maxUncompressedBytes: number;
    readonly maxEntryBytes: number;
  },
): ReadonlyMap<string, XlsxZipEntry> {
  if (bytes.byteLength < 22 || readUint32(bytes, 0) !== 0x04034b50) {
    throw new XlsxReadError("Die Datei ist kein gültiger XLSX-ZIP-Container.");
  }

  const minimum = Math.max(0, bytes.byteLength - 65_557);
  let endOffset = -1;
  for (let offset = bytes.byteLength - 22; offset >= minimum; offset -= 1) {
    if (readUint32(bytes, offset) === 0x06054b50) {
      endOffset = offset;
      break;
    }
  }
  if (endOffset < 0) {
    throw new XlsxReadError("Das ZIP-Endverzeichnis fehlt.");
  }

  const disk = readUint16(bytes, endOffset + 4);
  const centralDisk = readUint16(bytes, endOffset + 6);
  const entriesOnDisk = readUint16(bytes, endOffset + 8);
  const count = readUint16(bytes, endOffset + 10);
  const centralSize = readUint32(bytes, endOffset + 12);
  const centralOffset = readUint32(bytes, endOffset + 16);
  const commentLength = readUint16(bytes, endOffset + 20);
  if (
    disk !== 0 ||
    centralDisk !== 0 ||
    entriesOnDisk !== count ||
    endOffset + 22 + commentLength !== bytes.byteLength ||
    count === 0xffff ||
    centralSize === 0xffffffff ||
    centralOffset === 0xffffffff ||
    count > limits.maxZipEntries ||
    centralOffset + centralSize !== endOffset
  ) {
    throw new XlsxReadError("Der XLSX-ZIP-Container wird nicht unterstützt.");
  }

  const result = new Map<string, XlsxZipEntry>();
  let offset = centralOffset;
  let totalUncompressed = 0;
  for (let index = 0; index < count; index += 1) {
    if (readUint32(bytes, offset) !== 0x02014b50) {
      throw new XlsxReadError("Das ZIP-Zentralverzeichnis ist beschädigt.");
    }
    const flags = readUint16(bytes, offset + 8);
    const method = readUint16(bytes, offset + 10);
    const crc = readUint32(bytes, offset + 16);
    const compressedSize = readUint32(bytes, offset + 20);
    const uncompressedSize = readUint32(bytes, offset + 24);
    const nameLength = readUint16(bytes, offset + 28);
    const extraLength = readUint16(bytes, offset + 30);
    const commentLength = readUint16(bytes, offset + 32);
    const diskStart = readUint16(bytes, offset + 34);
    const localOffset = readUint32(bytes, offset + 42);
    const entryEnd = offset + 46 + nameLength + extraLength + commentLength;

    if (
      entryEnd > bytes.byteLength ||
      diskStart !== 0 ||
      compressedSize === 0xffffffff ||
      uncompressedSize === 0xffffffff ||
      localOffset === 0xffffffff ||
      (flags & ZIP_ENCRYPTION_FLAGS) !== 0 ||
      (method !== 0 && method !== 8) ||
      uncompressedSize > limits.maxEntryBytes
    ) {
      throw new XlsxReadError(
        "Ein ZIP-Eintrag der XLSX-Datei wird nicht unterstützt.",
      );
    }

    const nameStart = offset + 46;
    const nameEnd = nameStart + nameLength;
    const extraEnd = nameEnd + extraLength;
    const name = decodeUtf8(bytes.slice(nameStart, nameEnd));
    assertSupportedZipExtraFields(bytes.slice(nameEnd, extraEnd));
    const normalized = normalizeZipPath(name);
    if (
      normalized !== name ||
      normalized.startsWith("/") ||
      normalized.includes("\\")
    ) {
      throw new XlsxReadError("Ein ZIP-Pfad der XLSX-Datei ist ungültig.");
    }

    totalUncompressed += uncompressedSize;
    if (totalUncompressed > limits.maxUncompressedBytes) {
      throw new XlsxReadError("Die entpackte XLSX-Datei ist zu groß.");
    }
    if (result.has(name)) {
      throw new XlsxReadError(
        "Die XLSX-Datei enthält doppelte ZIP-Einträge.",
      );
    }

    result.set(
      name,
      Object.freeze({
        name,
        flags,
        method,
        crc,
        compressedSize,
        uncompressedSize,
        localOffset,
      }),
    );
    offset = entryEnd;
  }

  if (offset !== centralOffset + centralSize) {
    throw new XlsxReadError("Das ZIP-Zentralverzeichnis ist inkonsistent.");
  }

  for (const entry of result.values()) {
    validateZipEntryEnvelope(bytes, entry, centralOffset);
  }

  return result;
}

async function readZipText(
  bytes: Uint8Array,
  entries: ReadonlyMap<string, XlsxZipEntry>,
  name: string,
  maxEntryBytes: number,
): Promise<string> {
  const entry = entries.get(name);
  if (entry === undefined) {
    throw new XlsxReadError(
      "Ein erforderlicher XLSX-Bestandteil fehlt.",
    );
  }
  const data = await readZipEntry(bytes, entry, maxEntryBytes);
  const text = decodeUtf8(data);
  assertXml10Text(text);
  if (/<!DOCTYPE|<!ENTITY/i.test(text)) {
    throw new XlsxReadError(
      "Nicht unterstützte XML-Deklarationen in der XLSX-Datei.",
    );
  }
  return sanitizeXmlForRegexParsing(text);
}

async function readZipEntry(
  bytes: Uint8Array,
  entry: XlsxZipEntry,
  maxEntryBytes: number,
): Promise<Uint8Array> {
  const envelope = validateZipEntryEnvelope(bytes, entry, bytes.byteLength);
  const compressed = bytes.slice(envelope.dataOffset, envelope.dataEnd);
  const result =
    entry.method === 0
      ? compressed
      : inflateRaw(compressed, entry.uncompressedSize, maxEntryBytes);
  if (
    result.byteLength !== entry.uncompressedSize ||
    crc32(result) !== entry.crc
  ) {
    throw new XlsxReadError("Ein ZIP-Eintrag ist beschädigt.");
  }
  return result;
}

function validateZipEntryEnvelope(
  bytes: Uint8Array,
  entry: XlsxZipEntry,
  archiveDataEnd: number,
): { readonly dataOffset: number; readonly dataEnd: number } {
  const offset = entry.localOffset;
  if (
    offset + 30 > archiveDataEnd ||
    offset + 30 > bytes.byteLength ||
    readUint32(bytes, offset) !== 0x04034b50
  ) {
    throw new XlsxReadError("Ein lokaler ZIP-Header ist beschädigt.");
  }

  const localFlags = readUint16(bytes, offset + 6);
  const localMethod = readUint16(bytes, offset + 8);
  const localCrc = readUint32(bytes, offset + 14);
  const localCompressedSize = readUint32(bytes, offset + 18);
  const localUncompressedSize = readUint32(bytes, offset + 22);
  const nameLength = readUint16(bytes, offset + 26);
  const extraLength = readUint16(bytes, offset + 28);
  const nameStart = offset + 30;
  const nameEnd = nameStart + nameLength;
  const extraEnd = nameEnd + extraLength;
  if (extraEnd > archiveDataEnd || extraEnd > bytes.byteLength) {
    throw new XlsxReadError("Ein lokaler ZIP-Header ist beschädigt.");
  }

  const localName = decodeUtf8(bytes.slice(nameStart, nameEnd));
  assertSupportedZipExtraFields(bytes.slice(nameEnd, extraEnd));
  const usesDataDescriptor = (localFlags & 0x0008) !== 0;
  if (
    localMethod !== entry.method ||
    localFlags !== entry.flags ||
    localName !== entry.name ||
    (!usesDataDescriptor &&
      (localCrc !== entry.crc ||
        localCompressedSize !== entry.compressedSize ||
        localUncompressedSize !== entry.uncompressedSize))
  ) {
    throw new XlsxReadError(
      "Lokaler ZIP-Header und Zentralverzeichnis widersprechen sich.",
    );
  }

  const dataOffset = extraEnd;
  const dataEnd = dataOffset + entry.compressedSize;
  if (dataEnd > archiveDataEnd || dataEnd > bytes.byteLength) {
    throw new XlsxReadError("Ein ZIP-Eintrag ist unvollständig.");
  }
  if (usesDataDescriptor) {
    validateDataDescriptor(bytes, dataEnd, entry, archiveDataEnd);
  }

  return Object.freeze({ dataOffset, dataEnd });
}

function assertSupportedZipExtraFields(extra: Uint8Array): void {
  let offset = 0;
  while (offset < extra.byteLength) {
    if (offset + 4 > extra.byteLength) {
      throw new XlsxReadError("Ein ZIP-Extra-Feld ist beschädigt.");
    }
    const headerId = readUint16(extra, offset);
    const dataSize = readUint16(extra, offset + 2);
    offset += 4;
    if (offset + dataSize > extra.byteLength) {
      throw new XlsxReadError("Ein ZIP-Extra-Feld ist beschädigt.");
    }
    if (headerId === ZIP64_EXTRA_FIELD_ID) {
      throw new XlsxReadError("ZIP64-Einträge werden nicht unterstützt.");
    }
    offset += dataSize;
  }
}

function validateDataDescriptor(
  bytes: Uint8Array,
  offset: number,
  entry: XlsxZipEntry,
  archiveDataEnd: number,
): void {
  const matches = (valueOffset: number): boolean => {
    if (
      valueOffset < 0 ||
      valueOffset + 12 > archiveDataEnd ||
      valueOffset + 12 > bytes.byteLength
    ) {
      return false;
    }
    return (
      readUint32(bytes, valueOffset) === entry.crc &&
      readUint32(bytes, valueOffset + 4) === entry.compressedSize &&
      readUint32(bytes, valueOffset + 8) === entry.uncompressedSize
    );
  };

  const hasSignature =
    offset + 4 <= archiveDataEnd &&
    offset + 4 <= bytes.byteLength &&
    readUint32(bytes, offset) === ZIP_DATA_DESCRIPTOR_SIGNATURE;

  if (
    (hasSignature && matches(offset + 4)) ||
    (!hasSignature && matches(offset))
  ) {
    return;
  }

  // CRC32 may itself equal the optional descriptor signature. In that rare
  // case a descriptor without the signature must still be accepted.
  if (hasSignature && matches(offset)) return;

  throw new XlsxReadError(
    "Ein ZIP-Daten-Deskriptor widerspricht dem Zentralverzeichnis.",
  );
}

function inflateRaw(
  compressed: Uint8Array,
  expectedLength: number,
  maxEntryBytes: number,
): Uint8Array {
  try {
    const input = new Uint8Array(compressed.byteLength);
    input.set(compressed);
    const inflated = inflateRawSync(input, {
      maxOutputLength: Math.max(
        1,
        Math.min(expectedLength, maxEntryBytes),
      ),
    });
    if (inflated.byteLength !== expectedLength) {
      throw new XlsxReadError(
        "Ein entpackter XLSX-Bestandteil hat eine unerwartete Größe.",
      );
    }
    const result = new Uint8Array(inflated.byteLength);
    result.set(inflated);
    return result;
  } catch (error) {
    if (error instanceof XlsxReadError) throw error;
    throw new XlsxReadError(
      "Ein komprimierter XLSX-Bestandteil konnte nicht gelesen werden.",
    );
  }
}

function assertXml10Text(value: string): void {
  for (let index = 0; index < value.length; index += 1) {
    const codePoint = value.codePointAt(index);
    if (codePoint === undefined || !isXml10CodePoint(codePoint)) {
      throw new XlsxReadError(
        "Ein XLSX-XML-Bestandteil enthält ein ungültiges XML-Zeichen.",
      );
    }
    if (codePoint > 0xffff) index += 1;
  }
}

function sanitizeXmlForRegexParsing(xml: string): string {
  let cursor = 0;
  let result = "";

  while (cursor < xml.length) {
    const commentStart = xml.indexOf("<!--", cursor);
    const processingStart = xml.indexOf("<?", cursor);
    const cdataStart = xml.indexOf("<![CDATA[", cursor);
    const starts = [commentStart, processingStart, cdataStart].filter(
      (value) => value >= 0,
    );
    if (starts.length === 0) {
      const strayCommentEnd = xml.indexOf("-->", cursor);
      if (strayCommentEnd >= 0) {
        throw new XlsxReadError(
          "Ein XML-Kommentar der XLSX-Datei ist ungültig.",
        );
      }
      return result + xml.slice(cursor);
    }

    const start = Math.min(...starts);
    const strayCommentEnd = xml.indexOf("-->", cursor);
    if (strayCommentEnd >= 0 && strayCommentEnd < start) {
      throw new XlsxReadError(
        "Ein XML-Kommentar der XLSX-Datei ist ungültig.",
      );
    }
    result += xml.slice(cursor, start);

    if (start === cdataStart) {
      throw new XlsxReadError(
        "CDATA wird in XLSX-XML-Bestandteilen nicht unterstützt.",
      );
    }

    if (start === commentStart) {
      const end = xml.indexOf("-->", start + 4);
      if (end < 0) {
        throw new XlsxReadError(
          "Ein XML-Kommentar der XLSX-Datei ist nicht abgeschlossen.",
        );
      }
      const body = xml.slice(start + 4, end);
      if (body.includes("--")) {
        throw new XlsxReadError(
          "Ein XML-Kommentar der XLSX-Datei ist ungültig.",
        );
      }
      cursor = end + 3;
      continue;
    }

    const end = xml.indexOf("?>", start + 2);
    if (end < 0) {
      throw new XlsxReadError(
        "Eine XML-Processing-Instruction der XLSX-Datei ist nicht abgeschlossen.",
      );
    }
    cursor = end + 2;
  }

  return result;
}

function parseWorkbookSheets(
  xml: string,
): readonly { readonly name: string; readonly relationshipId: string }[] {
  const result: { name: string; relationshipId: string }[] = [];
  for (const match of xml.matchAll(/<sheet\b[^>]*\/?>/g)) {
    const tag = match[0];
    const name = xmlAttribute(tag, "name");
    const relationshipId = xmlAttribute(tag, "r:id");
    if (name !== null && relationshipId !== null) {
      result.push({ name, relationshipId });
    }
  }
  if (result.length === 0) {
    throw new XlsxReadError(
      "Die XLSX-Datei enthält keine Tabellenblätter.",
    );
  }
  return Object.freeze(result);
}

function parseRelationships(xml: string): ReadonlyMap<string, string> {
  const result = new Map<string, string>();
  for (const match of xml.matchAll(/<Relationship\b[^>]*\/?>/g)) {
    const tag = match[0];
    const id = xmlAttribute(tag, "Id");
    const target = xmlAttribute(tag, "Target");
    const mode = xmlAttribute(tag, "TargetMode");
    if (id !== null && target !== null && mode !== "External") {
      if (result.has(id)) {
        throw new XlsxReadError(
          "Die XLSX-Datei enthält doppelte Relationship-IDs.",
        );
      }
      result.set(id, target);
    }
  }
  return result;
}

function parseSharedStrings(xml: string): readonly string[] {
  const result: string[] = [];
  for (const match of xml.matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>/g)) {
    result.push(xmlTextRuns(match[1] ?? ""));
  }
  return Object.freeze(result);
}

function workbookUses1904DateSystem(xml: string): boolean {
  const workbookProperties = /<workbookPr\b[^>]*\/?>/.exec(xml)?.[0];
  if (workbookProperties === undefined) return false;
  const value = xmlAttribute(workbookProperties, "date1904");
  if (value === null) return false;
  const normalized = value.toLocaleLowerCase("en");
  if (normalized === "1" || normalized === "true") return true;
  if (normalized === "0" || normalized === "false") return false;
  throw new XlsxReadError("Das XLSX-Datumssystem ist ungültig.");
}

function parseDateStyleIndexes(xml: string): ReadonlySet<number> {
  const customFormats = new Map<number, string>();
  for (const match of xml.matchAll(/<numFmt\b[^>]*\/?>/g)) {
    const tag = match[0];
    const id = nonNegativeIntegerAttribute(tag, "numFmtId");
    const code = xmlAttribute(tag, "formatCode");
    if (id !== null && code !== null) customFormats.set(id, code);
  }

  const cellXfs = /<cellXfs\b[^>]*>([\s\S]*?)<\/cellXfs>/.exec(xml)?.[1];
  if (cellXfs === undefined) return new Set<number>();

  const result = new Set<number>();
  let styleIndex = 0;
  for (const match of cellXfs.matchAll(/<xf\b[^>]*\/?>/g)) {
    const tag = match[0];
    const numFmtId = nonNegativeIntegerAttribute(tag, "numFmtId") ?? 0;
    const customFormat = customFormats.get(numFmtId);
    if (
      BUILTIN_DATE_NUMBER_FORMAT_IDS.has(numFmtId) ||
      (customFormat !== undefined && isDateNumberFormat(customFormat))
    ) {
      result.add(styleIndex);
    }
    styleIndex += 1;
  }
  return result;
}

function isDateNumberFormat(formatCode: string): boolean {
  const semantic = formatCode
    .replace(/"[^"]*"/g, "")
    .replace(/\\./g, "")
    .replace(/_.?/g, "")
    .replace(/\*./g, "")
    .replace(/\[[^\]]*\]/g, "")
    .toLocaleLowerCase("en");
  return /[dy]/.test(semantic);
}

function nonNegativeIntegerAttribute(
  tag: string,
  name: string,
): number | null {
  const value = xmlAttribute(tag, name);
  if (value === null) return null;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new XlsxReadError(
      "Ein numerisches XLSX-Attribut ist ungültig.",
    );
  }
  return parsed;
}

function parseWorksheet(
  xml: string,
  sharedStrings: readonly string[],
  dateContext: XlsxWorkbookDateContext,
  decodeDates: boolean,
  maxColumnIndex: number,
): XlsxSheetRow[] {
  const result: XlsxSheetRow[] = [];
  let fallbackRow = 1;
  for (const rowMatch of xml.matchAll(
    /<row\b([^>]*)>([\s\S]*?)<\/row>/g,
  )) {
    const attributes = rowMatch[1] ?? "";
    const body = rowMatch[2] ?? "";
    const explicitRow = numericAttribute(attributes, "r");
    const rowNumber = explicitRow ?? fallbackRow;
    fallbackRow = rowNumber + 1;

    const cells: string[] = [];
    let fallbackColumn = 0;
    for (const cellMatch of body.matchAll(
      /<c\b([^>]*)>([\s\S]*?)<\/c>|<c\b([^>]*)\/>/g,
    )) {
      const cellAttributes = cellMatch[1] ?? cellMatch[3] ?? "";
      const cellBody = cellMatch[2] ?? "";
      const reference = xmlAttribute(
        "<c " + cellAttributes + ">",
        "r",
      );
      const column =
        reference === null ? fallbackColumn : cellColumn(reference);
      if (column < 0 || column > maxColumnIndex) {
        throw new XlsxReadError(
          "Eine XLSX-Zelle liegt außerhalb des unterstützten Bereichs.",
        );
      }
      fallbackColumn = column + 1;
      cells[column] = cellValue(
        cellAttributes,
        cellBody,
        sharedStrings,
        dateContext,
        decodeDates,
      );
    }
    result.push(
      Object.freeze({
        rowNumber,
        cells: Object.freeze(
          trimTrailingEmpty(cells.map((value) => value ?? "")),
        ),
      }),
    );
  }
  return result;
}

function cellValue(
  attributes: string,
  body: string,
  sharedStrings: readonly string[],
  dateContext: XlsxWorkbookDateContext,
  decodeDates: boolean,
): string {
  const cellTag = "<c " + attributes + ">";
  const type = xmlAttribute(cellTag, "t");
  if (type === "inlineStr") return xmlTextRuns(body);
  const raw = firstTagText(body, "v");
  if (raw === null) return "";
  if (type === "s") {
    const index = Number(raw);
    if (
      !Number.isSafeInteger(index) ||
      index < 0 ||
      index >= sharedStrings.length
    ) {
      throw new XlsxReadError(
        "Ein Shared-String-Verweis der XLSX-Datei ist ungültig.",
      );
    }
    return sharedStrings[index]!;
  }
  if (type === "b") return raw === "1" ? "ja" : "nein";

  const decoded = decodeXmlEntities(raw);
  if (!decodeDates) return decoded;

  if (type === "d") {
    const explicitDate = /^(\d{4}-\d{2}-\d{2})(?:T.*)?$/.exec(decoded);
    return explicitDate?.[1] ?? decoded;
  }

  const styleIndex = nonNegativeIntegerAttribute(cellTag, "s") ?? 0;
  if (
    (type === null || type === "n") &&
    dateContext.dateStyleIndexes.has(styleIndex)
  ) {
    return excelSerialToIsoDate(decoded, dateContext.date1904) ?? decoded;
  }
  return decoded;
}

function excelSerialToIsoDate(
  value: string,
  date1904: boolean,
): string | null {
  const serial = Number(value);
  if (!Number.isFinite(serial) || serial < 0) return null;
  const wholeDays = Math.floor(serial);

  let milliseconds: number;
  if (date1904) {
    milliseconds = Date.UTC(1904, 0, 1) + wholeDays * DAY_MILLISECONDS;
  } else {
    if (wholeDays <= 0 || wholeDays === 60) return null;
    milliseconds =
      Date.UTC(1899, 11, 31) +
      (wholeDays < 60 ? wholeDays : wholeDays - 1) * DAY_MILLISECONDS;
  }

  const iso = new Date(milliseconds).toISOString().slice(0, 10);
  return iso >= "1900-01-01" && iso <= "2100-12-31" ? iso : null;
}

function xmlTextRuns(fragment: string): string {
  return Array.from(
    fragment.matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g),
  )
    .map((match) => decodeXmlEntities(match[1] ?? ""))
    .join("");
}

function firstTagText(
  fragment: string,
  tagName: string,
): string | null {
  const match = new RegExp(
    "<" + tagName + "\\b[^>]*>([\\s\\S]*?)<\\/" + tagName + ">",
  ).exec(fragment);
  return match === null ? null : match[1] ?? "";
}

function xmlAttribute(tag: string, name: string): string | null {
  const double = new RegExp(
    "(?:^|\\s)" + name + '="([^"]*)"',
  ).exec(tag);
  if (double !== null) return decodeXmlEntities(double[1] ?? "");
  const single = new RegExp(
    "(?:^|\\s)" + name + "='([^']*)'",
  ).exec(tag);
  return single === null ? null : decodeXmlEntities(single[1] ?? "");
}

function numericAttribute(
  attributes: string,
  name: string,
): number | null {
  const value = xmlAttribute("<x " + attributes + ">", name);
  if (value === null) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

function decodeXmlEntities(value: string): string {
  if (
    /&(?!#x[0-9a-f]+;|#\d+;|amp;|lt;|gt;|quot;|apos;)/i.test(value)
  ) {
    throw new XlsxReadError(
      "Eine XML-Zeichenreferenz der XLSX-Datei ist ungültig.",
    );
  }
  return value.replace(
    /&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi,
    (_entity, token: string) => {
      switch (token.toLocaleLowerCase("en")) {
        case "amp":
          return "&";
        case "lt":
          return "<";
        case "gt":
          return ">";
        case "quot":
          return '"';
        case "apos":
          return "'";
        default: {
          const numeric =
            token.startsWith("#x") || token.startsWith("#X")
              ? Number.parseInt(token.slice(2), 16)
              : Number.parseInt(token.slice(1), 10);
          if (!isXml10CodePoint(numeric)) {
            throw new XlsxReadError(
              "Eine XML-Zeichenreferenz der XLSX-Datei ist ungültig.",
            );
          }
          return String.fromCodePoint(numeric);
        }
      }
    },
  );
}

function isXml10CodePoint(value: number): boolean {
  return (
    Number.isSafeInteger(value) &&
    (value === 0x09 ||
      value === 0x0a ||
      value === 0x0d ||
      (value >= 0x20 && value <= 0xd7ff) ||
      (value >= 0xe000 && value <= 0xfffd) ||
      (value >= 0x10000 && value <= 0x10ffff))
  );
}

function resolveZipPath(baseFile: string, target: string): string {
  const candidate = target.startsWith("/")
    ? target.slice(1)
    : baseFile.slice(0, baseFile.lastIndexOf("/") + 1) + target;
  return normalizeZipPath(candidate);
}

function normalizeZipPath(path: string): string {
  const result: string[] = [];
  for (const part of path.replaceAll("\\", "/").split("/")) {
    if (part === "" || part === ".") continue;
    if (part === "..") {
      if (result.length === 0) {
        throw new XlsxReadError(
          "Ein XLSX-Pfad verlässt den ZIP-Container.",
        );
      }
      result.pop();
      continue;
    }
    result.push(part);
  }
  return result.join("/");
}

function cellColumn(reference: string): number {
  const match = /^([A-Z]+)\d+$/i.exec(reference);
  if (match === null) {
    throw new XlsxReadError(
      "Eine XLSX-Zellreferenz ist ungültig.",
    );
  }
  let value = 0;
  for (const char of match[1]!.toUpperCase()) {
    value = value * 26 + char.charCodeAt(0) - 64;
  }
  return value - 1;
}

function decodeUtf8(bytes: Uint8Array): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new XlsxReadError(
      "Ein XLSX-Bestandteil ist nicht gültig UTF-8-kodiert.",
    );
  }
}

function readUint16(bytes: Uint8Array, offset: number): number {
  if (offset < 0 || offset + 2 > bytes.byteLength) {
    throw new XlsxReadError("Die XLSX-Datei ist abgeschnitten.");
  }
  return new DataView(
    bytes.buffer,
    bytes.byteOffset + offset,
    2,
  ).getUint16(0, true);
}

function readUint32(bytes: Uint8Array, offset: number): number {
  if (offset < 0 || offset + 4 > bytes.byteLength) {
    throw new XlsxReadError("Die XLSX-Datei ist abgeschnitten.");
  }
  return new DataView(
    bytes.buffer,
    bytes.byteOffset + offset,
    4,
  ).getUint32(0, true);
}

function trimTrailingEmpty(values: readonly string[]): string[] {
  const result = [...values];
  while (
    result.length > 0 &&
    result[result.length - 1] === ""
  ) {
    result.pop();
  }
  return result;
}
