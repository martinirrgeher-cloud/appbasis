import { inflateSync } from "node:zlib";

const MAX_INFLATED_STREAM_BYTES = 10_000_000;
const MAX_EXTRACTED_BYTES = 20_000_000;
const MAX_PDF_OBJECTS = 10_000;
const MAX_PAGES = 100;
const MAX_OBJECT_STREAM_OBJECTS = 10_000;

const REVIEWED_SUBSTANTIVE_CLAUSES = Object.freeze([
  "Databricks agrees that when Databricks processes Customer Personal Data in its capacity as a processor on behalf of the Customer Databricks will comply with Applicable Data Protection Laws and process the Customer Personal Data as necessary to perform its obligations under the Agreement and only in accordance with Customer's documented instructions",
  "Databricks shall enter into a written agreement with its Subprocessors which includes data protection and security measures no less protective than the measures set forth in this DPA and remain fully liable for any breach of the Agreement and this DPA that is caused by an act error or omission of its Subprocessors",
  "In the event of a Security Breach Databricks will notify Customer in writing without undue delay and in no event later than seventy-two 72 hours after becoming aware of the Security Breach and promptly take reasonable steps to contain investigate and mitigate any adverse effects resulting from the Security Breach",
  "Where the transfer of Customer Personal Data to Databricks is a Restricted Transfer such transfer shall be governed by the Standard Contractual Clauses which shall be deemed incorporated into and form an integral part of the Agreement in accordance with Annex B of this DPA",
  "The Databricks Services do not include backup services or disaster recovery for Customer Personal Data Databricks does provide functionality within the Databricks Services that may permit Customer to backup certain Customer Personal Data on its own It is the Customer's obligation to backup any Customer Personal Data if desired",
  "Databricks will delete or assist Customer in deleting any Customer Personal Data within its possession or control within thirty 30 days following such request",
  "Module Two terms shall apply where Customer is the controller of Customer Personal Data and the Module Three terms shall apply where Customer is the processor of Customer Personal Data",
  "in Clause 9 option 2 general authorization is selected and the process and time period for prior notice of Sub-processor changes shall be as set out in Section 4.3 of the DPA",
  "Databricks DPA v3 2023-07-21",
]);

export function verifyReviewedDatabricksDpaSemanticBaseline(bytes) {
  const displayedText = extractActivePageDisplayedText(bytes);
  const compactText = compact(displayedText);
  if (
    compactText.length === 0 ||
    REVIEWED_SUBSTANTIVE_CLAUSES.some((clause) => !compactText.includes(compact(clause)))
  ) throw driftError();
  return true;
}

function extractActivePageDisplayedText(bytes) {
  const buffer = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const { objects, rootRef } = resolveActiveObjects(buffer);
  const catalog = requireObject(objects, rootRef);
  if (!/\/Type\s*\/Catalog\b/u.test(catalog.dictionary)) throw driftError();
  const pagesRef = parseSingleRef(catalog.dictionary, "Pages");
  if (pagesRef === null) throw driftError();

  const pageRefs = [];
  walkPageTree(objects, pagesRef, new Set(), pageRefs);
  if (pageRefs.length === 0 || pageRefs.length > MAX_PAGES) throw driftError();

  let extractedBytes = 0;
  const chunks = [];
  for (const pageRef of pageRefs) {
    const page = requireObject(objects, pageRef);
    if (!/\/Type\s*\/Page\b/u.test(page.dictionary)) throw driftError();
    const fontMaps = resolvePageFontMaps(objects, pageRef);
    const contentRefs = parseContentsRefs(page.dictionary);
    if (contentRefs.length === 0) throw driftError();
    const pageStreams = [];
    for (const contentRef of contentRefs) {
      const content = requireObject(objects, contentRef);
      if (content.stream === null) throw driftError();
      const decoded = decodeStream(content.dictionary, content.stream);
      if (decoded === null) continue;
      extractedBytes += decoded.byteLength;
      if (extractedBytes > MAX_EXTRACTED_BYTES) {
        throw new Error("ULC M5-G Databricks DPA PDF extraction exceeds its safety bound.");
      }
      pageStreams.push(decoded);
    }
    if (pageStreams.length === 0) throw driftError();
    chunks.push(extractDisplayedTextOperators(Buffer.concat(pageStreams).toString("latin1"), fontMaps));
  }
  return chunks.join(" ");
}

function resolveActiveObjects(buffer) {
  const scanned = parseIndirectObjects(buffer);
  const xref = parseActiveXrefStream(buffer, scanned);
  if (xref === null) {
    expandObjectStreams(scanned);
    return { objects: scanned, rootRef: parseClassicTrailerRootRef(buffer) };
  }
  if (xref.entries === null) {
    // Compatibility with the bounded synthetic XRef fixture used by this repository.
    // A real XRef stream with /W is handled authoritatively below.
    expandObjectStreams(scanned);
    return { objects: scanned, rootRef: xref.rootRef };
  }
  return { objects: materializeActiveXrefObjects(buffer, xref.entries), rootRef: xref.rootRef };
}

function parseIndirectObjects(buffer) {
  const text = buffer.toString("latin1");
  const objects = new Map();
  const header = /(?:^|[\r\n])(\d+)\s+(\d+)\s+obj\b/gu;
  let match;
  while ((match = header.exec(text)) !== null) {
    if (objects.size >= MAX_PDF_OBJECTS) throw driftError();
    const objectStart = header.lastIndex;
    const end = text.indexOf("endobj", objectStart);
    if (end === -1) throw driftError();
    const key = `${match[1]} ${match[2]}`;
    if (!objects.has(key)) objects.set(key, parseObjectBody(buffer.subarray(objectStart, end)));
    header.lastIndex = end + "endobj".length;
  }
  if (objects.size === 0) throw driftError();
  return objects;
}

function parseObjectAtOffset(buffer, offset, expectedNumber = null, expectedGeneration = null) {
  if (!Number.isSafeInteger(offset) || offset < 0 || offset >= buffer.byteLength) throw driftError();
  const tail = buffer.subarray(offset);
  const text = tail.toString("latin1");
  const header = text.match(/^(\d+)\s+(\d+)\s+obj\b/u);
  if (header === null) throw driftError();
  const objectNumber = Number.parseInt(header[1], 10);
  const generation = Number.parseInt(header[2], 10);
  if (expectedNumber !== null && objectNumber !== expectedNumber) throw driftError();
  if (expectedGeneration !== null && generation !== expectedGeneration) throw driftError();
  const bodyStart = header[0].length;
  const end = text.indexOf("endobj", bodyStart);
  if (end === -1) throw driftError();
  return parseObjectBody(tail.subarray(bodyStart, end));
}

function parseObjectBody(bodyBuffer) {
  const lfMarker = Buffer.from("stream\n", "ascii");
  const crlfMarker = Buffer.from("stream\r\n", "ascii");
  const lfStart = bodyBuffer.indexOf(lfMarker);
  const crlfStart = bodyBuffer.indexOf(crlfMarker);
  let start = lfStart;
  let marker = lfMarker;
  if (start === -1 || (crlfStart !== -1 && crlfStart < start)) {
    start = crlfStart;
    marker = crlfMarker;
  }
  if (start === -1) return Object.freeze({ dictionary: bodyBuffer.toString("latin1"), stream: null });
  const contentStart = start + marker.byteLength;
  const lfEnd = bodyBuffer.indexOf(Buffer.from("\nendstream", "ascii"), contentStart);
  const crlfEnd = bodyBuffer.indexOf(Buffer.from("\r\nendstream", "ascii"), contentStart);
  let contentEnd = lfEnd;
  if (contentEnd === -1 || (crlfEnd !== -1 && crlfEnd < contentEnd)) contentEnd = crlfEnd;
  if (contentEnd === -1) throw driftError();
  return Object.freeze({
    dictionary: bodyBuffer.subarray(0, start).toString("latin1"),
    stream: bodyBuffer.subarray(contentStart, contentEnd),
  });
}

function parseActiveXrefStream(buffer, scanned) {
  const offset = parseStartXrefOffset(buffer);
  const fromOffset = buffer.subarray(offset).toString("latin1");
  const header = fromOffset.match(/^(\d+)\s+(\d+)\s+obj\b/u);
  if (header === null) return null;
  const ref = `${header[1]} ${header[2]}`;
  const xrefObject = scanned.get(ref) ?? parseObjectAtOffset(buffer, offset, Number.parseInt(header[1], 10), Number.parseInt(header[2], 10));
  if (!/\/Type\s*\/XRef\b/u.test(xrefObject.dictionary)) return null;
  const rootRef = parseRootRefFromDictionary(xrefObject.dictionary);
  const widths = parseIntegerArray(xrefObject.dictionary, "W");
  if (widths === null) return { rootRef, entries: null };
  if (widths.length !== 3 || widths.some((width) => width < 0 || width > 8)) throw driftError();
  if (xrefObject.stream === null) throw driftError();
  const decoded = decodeStream(xrefObject.dictionary, xrefObject.stream);
  if (decoded === null) throw driftError();
  const size = parseRequiredInteger(xrefObject.dictionary, "Size");
  const index = parseIntegerArray(xrefObject.dictionary, "Index") ?? [0, size];
  if (index.length === 0 || index.length % 2 !== 0) throw driftError();
  const entries = new Map();
  let cursor = 0;
  for (let pair = 0; pair < index.length; pair += 2) {
    const firstObject = index[pair];
    const count = index[pair + 1];
    if (firstObject < 0 || count < 0 || firstObject + count > MAX_PDF_OBJECTS + 1) throw driftError();
    for (let offsetIndex = 0; offsetIndex < count; offsetIndex += 1) {
      const fields = widths.map((width, fieldIndex) => {
        if (width === 0) return fieldIndex === 0 ? 1 : 0;
        if (cursor + width > decoded.byteLength) throw driftError();
        let value = 0;
        for (let indexByte = 0; indexByte < width; indexByte += 1) value = value * 256 + decoded[cursor + indexByte];
        cursor += width;
        if (!Number.isSafeInteger(value)) throw driftError();
        return value;
      });
      entries.set(firstObject + offsetIndex, { type: fields[0], field2: fields[1], field3: fields[2] });
    }
  }
  if (cursor !== decoded.byteLength) throw driftError();
  return { rootRef, entries };
}

function materializeActiveXrefObjects(buffer, entries) {
  const objects = new Map();
  for (const [objectNumber, entry] of entries) {
    if (entry.type !== 1) continue;
    if (objects.size >= MAX_PDF_OBJECTS) throw driftError();
    objects.set(`${objectNumber} ${entry.field3}`, parseObjectAtOffset(buffer, entry.field2, objectNumber, entry.field3));
  }
  const objectStreamCache = new Map();
  for (const [objectNumber, entry] of entries) {
    if (entry.type !== 2) continue;
    if (entry.field3 < 0 || entry.field3 >= MAX_OBJECT_STREAM_OBJECTS),²H†@Lƒ(ctor, new Set());
  if (resources === null) return new Map();
  const fontDictionary = extractNamedDictionary(resources, "Font");
  if (fontDictionary === null) return new Map();
  const result = new Map();
  for (const match of fontDictionary.matchAll(/\/([A-Za-z0-9_.+-]+)\s+(\d+)\s+(\d+)\s+R\b/gu)) {
    const font = requireObject(objects, `${match[2]} ${match[3]}`);
    const toUnicodeRef = parseSingleRef(font.dictionary, "ToUnicode");
    if (toUnicodeRef === null) continue;
    const cmapObject = requireObject(objects, toUnicodeRef);
    if (cmapObject.stream === null) continue;
    const decoded = decodeStream(cmapObject.dictionary, cmapObject.stream);
    if (decoded === null) continue;
    const cmap = parseToUnicodeCmap(decoded.toString("latin1"));
    if (cmap.size > 0) result.set(match[1], cmap);
  }
  return result;
}

function resolveInheritedResources(objects, ref, visited) {
  if (visited.has(ref)) throw driftError();
  visited.add(ref);
  const object = requireObject(objects, ref);
  const inline = extractNamedDictionary(object.dictionary, "Resources");
  if (inline !== null) return inline;
  const resourceRef = parseSingleRef(object.dictionary, "Resources");
  if (resourceRef !== null) return requireObject(objects, resourceRef).dictionary;
  const parent = parseSingleRef(object.dictionary, "Parent");
  return parent === null ? null : resolveInheritedResources(objects, parent, visited);
}

function extractNamedDictionary(dictionary, key) {
  const token = `/${key}`;
  const keyIndex = dictionary.indexOf(token);
  if (keyIndex === -1) return null;
  const start = dictionary.indexOf("<<", keyIndex + token.length);
  if (start === -1) return null;
  let depth = 0;
  for (let index = start; index < dictionary.length - 1; index += 1) {
    const pair = dictionary.slice(index, index + 2);
    if (pair === "<<") {
      depth += 1;
      index += 1;
    } else if (pair === ">>") {
      depth -= 1;
      if (depth === 0) return dictionary.slice(start + 2, index);
      index += 1;
    }
  }
  return null;
}

function parseToUnicodeCmap(value) {
  const map = new Map();
  for (const block of value.matchAll(/beginbfchar([\s\S]*?)endbfchar/gu)) {
    for (const entry of block[1].matchAll(/<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>/gu)) map.set(entry[1].toUpperCase(), decodeUnicodeHex(entry[2]));
  }
  for (const block of value.matchAll(/beginbfrange([s\S]*?)endbfrange/gu)) {
    for (const entry of block[1].matchAll(/<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>/gu)) {
      const start = Number.parseInt(entry[1], 16);
      const end = Number.parseInt(entry[2], 16);
      const target = Number.parseInt(entry[3], 16);
      const width = entry[1].length;
      if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || end < start || end - start > 4096) continue;
      for (let code = start; code <= end; code += 1) map.set(code.toString(16).toUpperCase().padStart(width, "0"), String.fromCodePoint(target + code - start));
    }
  }
  return map;
}

function decodeUnicodeHex(hex) {
  if (hex.length % 4 !== 0) return Buffer.from(hex, "hex").toString("latin1");
  let result = "";
  for (let index = 0; index < hex.length; index += 4) result += String.fromCharCode(Number.parseInt(hex.slice(index, index + 4), 16));
  return result;
}

function parseSingleRef(dictionary, key) {
  const match = dictionary.match(new RegExp(`\\/${key}\\s+(\\d+)\\s+(\\“+id\\b,`, "u"));
  return match === null ? null : `${match[1]} ${match[2]}`;
}

function parseRefArray(dictionary, key) {
  const match = dictionary.match(new RegExp(`\\/${key}\\s*\\[([\\s\\]]*?)\\]`, "u"));
  if (match === null) return [];
  return [...match[1].matchAll(/(\d+)\s+(\d+)\s+R\b/gu)].map((ref) => `${ref[1]} ${ref[2]}`);
}

function requireObject(objects, ref) {
  const value = objects.get(ref);
  if (value === undefined) throw driftError();
  return value;
}

function decodeStream(dictionary, streamBytes) {
  if (/\/Filter\b/u.test(dictionary) && !/\/FlateDecode\b/u.test(dictionary)) return null;
  if (!/\/FlateDecode\b/u.test(dictionary)) return streamBytes;
  try {
    return inflateSync(streamBytes, { maxOutputLength: MAX_INFLATED_STREAM_BYTES });
  } catch {
    return null;
  }
}

function extractDisplayedTextOperators(value, fontMaps) {
  const displayed = [];
  const source = stripPdfComments(value);
  const stateStack = [];
  let state = { renderingMode: 0, activeFont: null, clipSafe: true };
  let insideText = false;
  let pendingClip = false;
  let textClipPending = false;
  const pathEndingOperators = new Set(["n", "S", "s", "f", "F", "f* ", "B", "B* ", "b", "b* "]);
  const tokenPattern = /\bBT\b|\bET\b\b|\bq\b|\bQ\b|\bW\*?\b|\b(?:n|S|s|f|F|f\*|B|B\*|b|b\*)\b|\/([A-Za-z0-9_.+-]+)\s+[+-]?(?:\d+(?:\.\d*)?|\.\d+)\s+Tf\b|([0-7])\s+Tr\b|(\((?:\\[\s\S]|[^\\()])*\)|<[0-9A-Fa-f\s]+>)\s*(Tj|'|")|\[([\s\S]*?)\]\s*TJ\b/gu;
  for (const token of source.matchAll(tokenPattern)) {
    const raw = token[0];
    if (raw === "q") {
      stateStack.push({ ...state });
      pendingClip = false;
    } else if (raw === "Q") {
      if (stateStack.length === 0) throw driftError();
      state = stateStack.pop();
      pendingClip = false;
      textClipPending = false;
    } else if (raw === "BT") {
      if (insideText) throw driftError();
      insideText = true;
      textClipPending = false;
    } else if (raw === "ET") {
      if (!insideText) throw driftError();
      insideText = false;
      if (textClipPending) state.clipSafe = false;
      textClipPending = false;
    } else if (raw === "W" || raw === "W*") {
      pendingClip = true;
    } else if (pathEndingOperators.has(raw)) {
      if (pendingClip) state.clipSafe = false;
      pendingClip = false;
    } else if (token[1] !== undefined) {
      if (insideText) state.activeFont = token[1];
    } else if (token[2] !== undefined) {
      if (insideText) state.renderingMode = Number.parseInt(token[2], 10);
    } else if (token[3] !== undefined) {
      if (insideText && state.renderingMode >= 4) textClipPending = true;
      if (insideText && state.clipSafe && state.renderingMode !== 3 && state.renderingMode !== 7) displayed.push(decodePdfTextOperand(token[3], fontMaps.get(state.activeFont)));
    } else if (token[5] !== undefined) {
      if (insideText && state.renderingMode >= 4) textClipPending = true;
      if (insideText && state.clipSafe && state.renderingMode !== 3 && state.renderingMode !== 7) displayed.push(decodePdfTextArray(token[5], fontMaps.get(state.activeFont)));
    }
  }
  if (insideText || stateStack.length !== 0) throw driftError();
  return displayed.join(" ");
}

function decodePdfTextArray(value, cmap) {
  const parts = [];
  for (const operand of value.matchAll(/\((?:\\[\s\S]|[^\\()])*\)|<[0-9A-Fa-f\s]+>/gu)) parts.push(decodePdfTextOperand(operand[0], cmap));
  return parts.join("");
}

function decodePdfTextOperand(operand, cmap) {
  const bytes = operand.startsWith("<") ? Buffer.from(operand.slice(1, -1).replaceAll(/\s+/gu, ""), "hex") : extractPdfLiteralBytes(operand);
  if (cmap instanceof Map && cmap.size > 0) return decodeWithCmap(bytes, cmap);
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
    let result = "";
    for (let index = 2; index + 1 < bytes.length; index += 2) result += String.fromCharCode(bytes.readUInt16BE(index));
    return result;
  }
  return bytes.toString("latin1");
}

function decodeWithCmap(bytes, cmap) {
  const keysByLength = [...new Set([...cmap.keys()].map((key) => key.length / 2))].sort((a, b) => b - a);
  let result = "";
  let index = 0;
  while (index < bytes.length) {
    let matched = false;
    for (const byteLength of keysByLength) {
      if (index + byteLength > bytes.length) continue;
      const key = bytes.subarray(index, index + byteLength).toString("hex").toUpperCase();
      const mapped = cmap.get(key);
      if (mapped !== undefined) {
        result += mapped;
        index += byteLength;
        matched = true;
        break;
      }
    }
    if (!matched) {
      result += String.fromCharCode(bytes[index]);
      index += 1;
    }
  }
  return result;
}

function stripPdfComments(value) {
  let result = "";
  let depth = 0;
  let escaped = false;
  let inComment = false;
  for (const char of value) {
    if (inComment) {
      if (char === "\n" || char === "\r") {
        inComment = false;
        result += char;
      }
      continue;
    }
    if (depth > 0) {
      result += char;
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === "(") depth += 1;
      else if (char === ")") depth -= 1;
      continue;
    }
    if (char === "(") {
      depth = 1;
      result += char;
    } else if (char === "%") inComment = true;
    else result += char;
  }
  return result;
}

function extractPdfLiteralBytes(value) {
  const bytes = [];
  let depth = 0;
  let escaped = false;
  for (let index = 0; index < value.length; index += 1) {
    const char = value[index];
    if (depth === 0) {
      if (char === "(") depth = 1;
      continue;
    }
    if (escaped) {
      if (/[0-7]/u.test(char)) {
        let octal = char;
        while (octal.length < 3 && /[0-7]/u.test(value[index + 1] ?? "")) {
          index += 1;
          octal += value[index];
        }
        bytes.push(Number.parseInt(octal, 8));
      } else if (char === "n") bytes.push(0x0a);
      else if (char === "r") bytes.push(0x0d);
      else if (char === "t") bytes.push(0x09);
      else if (char === "b") bytes.push(0x08);
      else if (char === "f") bytes.push(0x0c);
      else bytes.push(char.charCodeAt(0) & 0xff);
      escaped = false;
      continue;
    }
    if (char === "\\") escaped = true;
    else if (char === "(") {
      depth += 1;
      bytes.push(char.charCodeAt(0));
    } else if (char === ")") {
      depth -= 1;
      if (depth > 0) bytes.push(char.charCodeAt(0));
    } else bytes.push(char.charCodeAt(0) & 0xff);
  }
  return Buffer.from(bytes);
}

function compact(value) {
  return value.normalize("NFKD").replaceAll(/[â€™â€˜]/gu, "'").toLowerCase().replaceAll(/[^a-z0-9]+/gu, "");
}

function driftError() {
  return new Error("ULC M5-G Databricks DPA drifted from the reviewed official baseline.");
}
