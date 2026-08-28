import { inflateSync } from "node:zlib";

const MAX_INFLATED_STREAM_BYTES = 10_000_000;
const MAX_EXTRACTED_BYTES = 20_000_000;
const MAX_PDF_OBJECTS = 10_000;
const MAX_PAGES = 100;

const REVIEWED_DISPLAYED_TEXT_ANCHORS = Object.freeze([
  "DATA PROCESSING ADDENDUM",
  "Databricks Master Cloud Services Agreement",
  "Applicable Data Protection Laws",
  "PROCESSING OF PERSONAL DATA",
  "CONFIDENTIALITY",
  "SUBPROCESSING",
  "Data Protection Impact Assessments",
  "SECURITY",
  "AUDITS AND RECORDS",
  "TRANSFER OF PERSONAL DATA",
  "BACKUP, DELETION & RETURN",
  "CCPA COMPLIANCE",
  "ANNEX A",
  "Categories of personal data transferred",
  "Sensitive data transferred",
  "Period for which the personal data will be retained",
  "ANNEX B",
  "STANDARD CONTRACTUAL CLAUSES",
  "Modules 2 and 3",
  "Databricks DPA v3 (2023-07-21)",
]);

export function verifyReviewedDatabricksDpaSemanticBaseline(bytes) {
  const displayedText = extractActivePageDisplayedText(bytes);
  const compactText = compact(displayedText);
  if (
    compactText.length === 0 ||
    REVIEWED_DISPLAYED_TEXT_ANCHORS.some(
      (anchor) => !compactText.includes(compact(anchor)),
    )
  ) {
    throw new Error(
      "ULC M5-G Databricks DPA drifted from the reviewed official baseline.",
    );
  }
  return true;
}

function extractActivePageDisplayedText(bytes) {
  const buffer = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const objects = parseIndirectObjects(buffer);
  const rootRef = parseTrailerRootRef(buffer);
  const catalog = requireObject(objects, rootRef);
  if (!/\/Type\s*\/Catalog\b/u.test(catalog.dictionary)) {
    throw driftError();
  }
  const pagesRef = parseSingleRef(catalog.dictionary, "Pages");
  if (pagesRef === null) throw driftError();

  const pageRefs = [];
  const visited = new Set();
  walkPageTree(objects, pagesRef, visited, pageRefs);
  if (pageRefs.length === 0 || pageRefs.length > MAX_PAGES) throw driftError();

  let extractedBytes = 0;
  const chunks = [];
  for (const pageRef of pageRefs) {
    const page = requireObject(objects, pageRef);
    if (!/\/Type\s*\/Page\b/u.test(page.dictionary)) throw driftError();
    const contentRefs = parseContentsRefs(page.dictionary);
    if (contentRefs.length === 0) throw driftError();
    for (const contentRef of contentRefs) {
      const content = requireObject(objects, contentRef);
      if (content.stream === null) throw driftError();
      const decoded = decodeStream(content.dictionary, content.stream);
      if (decoded === null) continue;
      extractedBytes += decoded.byteLength;
      if (extractedBytes > MAX_EXTRACTED_BYTES) {
        throw new Error(
          "ULC M5-G Databricks DPA PDF extraction exceeds its safety bound.",
        );
      }
      chunks.push(extractDisplayedTextOperators(decoded.toString("latin1")));
    }
  }
  return chunks.join(" ");
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
    if (objects.has(key)) throw driftError();
    const bodyStart = objectStart;
    const bodyEnd = end;
    const bodyBuffer = buffer.subarray(bodyStart, bodyEnd);
    const parsed = parseObjectBody(bodyBuffer);
    objects.set(key, parsed);
    header.lastIndex = end + "endobj".length;
  }
  if (objects.size === 0) throw driftError();
  return objects;
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
  if (start === -1) {
    return Object.freeze({
      dictionary: bodyBuffer.toString("latin1"),
      stream: null,
    });
  }

  const contentStart = start + marker.byteLength;
  const lfEnd = bodyBuffer.indexOf(Buffer.from("\nendstream", "ascii"), contentStart);
  const crlfEnd = bodyBuffer.indexOf(Buffer.from("\r\nendstream", "ascii"), contentStart);
  let contentEnd = lfEnd;
  if (contentEnd === -1 || (crlfEnd !== -1 && crlfEnd < contentEnd)) {
    contentEnd = crlfEnd;
  }
  if (contentEnd === -1) throw driftError();
  return Object.freeze({
    dictionary: bodyBuffer.subarray(0, start).toString("latin1"),
    stream: bodyBuffer.subarray(contentStart, contentEnd),
  });
}

function parseTrailerRootRef(buffer) {
  const tail = buffer
    .subarray(Math.max(0, buffer.byteLength - 65_536))
    .toString("latin1");
  const trailers = [...tail.matchAll(/\btrailer\s*<<(.*?)>>/gsu)];
  if (trailers.length === 0) throw driftError();
  const trailer = trailers.at(-1)[1];
  const root = trailer.match(/\/Root\s+(\d+)\s+(\d+)\s+R\b/u);
  if (root === null) throw driftError();
  return `${root[1]} ${root[2]}`;
}

function walkPageTree(objects, ref, visited, pages) {
  if (visited.has(ref) || visited.size >= MAX_PDF_OBJECTS) throw driftError();
  visited.add(ref);
  const object = requireObject(objects, ref);
  const dictionary = object.dictionary;
  if (/\/Type\s*\/Page\b/u.test(dictionary)) {
    pages.push(ref);
    return;
  }
  if (!/\/Type\s*\/Pages\b/u.test(dictionary)) throw driftError();
  const kids = parseRefArray(dictionary, "Kids");
  if (kids.length === 0) throw driftError();
  for (const kid of kids) walkPageTree(objects, kid, visited, pages);
}

function parseContentsRefs(dictionary) {
  const array = parseRefArray(dictionary, "Contents", { optional: true });
  if (array.length > 0) return array;
  const single = parseSingleRef(dictionary, "Contents");
  return single === null ? [] : [single];
}

function parseSingleRef(dictionary, key) {
  const match = dictionary.match(
    new RegExp(`\\/${key}\\s+(\\d+)\\s+(\\d+)\\s+R\\b`, "u"),
  );
  return match === null ? null : `${match[1]} ${match[2]}`;
}

function parseRefArray(dictionary, key, { optional = false } = {}) {
  const match = dictionary.match(
    new RegExp(`\\/${key}\\s*\\[([\\s\\S]*?)\\]`, "u"),
  );
  if (match === null) return optional ? [] : [];
  const refs = [];
  for (const ref of match[1].matchAll(/(\d+)\s+(\d+)\s+R\b/gu)) {
    refs.push(`${ref[1]} ${ref[2]}`);
  }
  return refs;
}

function requireObject(objects, ref) {
  const value = objects.get(ref);
  if (value === undefined) throw driftError();
  return value;
}

function decodeStream(dictionary, streamBytes) {
  if (/\/Filter\b/u.test(dictionary) && !/\/FlateDecode\b/u.test(dictionary)) {
    return null;
  }
  if (!/\/FlateDecode\b/u.test(dictionary)) return streamBytes;
  try {
    return inflateSync(streamBytes, {
      maxOutputLength: MAX_INFLATED_STREAM_BYTES,
    });
  } catch {
    return null;
  }
}

function extractDisplayedTextOperators(value) {
  const displayed = [];
  for (const textObject of value.matchAll(/\bBT\b([\s\S]*?)\bET\b/gu)) {
    const body = stripPdfComments(textObject[1]);
    for (const direct of body.matchAll(
      /(\((?:\\[\s\S]|[^\\()])*\))\s*(?:Tj|'|")(?=\s|$)/gu,
    )) {
      displayed.push(extractPdfLiteralStrings(direct[1]));
    }
    for (const array of body.matchAll(/\[([\s\S]*?)\]\s*TJ\b/gu)) {
      displayed.push(extractPdfLiteralStrings(array[1]));
    }
  }
  return displayed.join(" ");
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
    } else if (char === "%") {
      inComment = true;
    } else {
      result += char;
    }
  }
  return result;
}

function extractPdfLiteralStrings(value) {
  const strings = [];
  let current = "";
  let depth = 0;
  let escaped = false;
  for (let index = 0; index < value.length; index += 1) {
    const char = value[index];
    if (depth === 0) {
      if (char === "(") {
        depth = 1;
        current = "";
      }
      continue;
    }
    if (escaped) {
      if (/[0-7]/u.test(char)) {
        let octal = char;
        while (octal.length < 3 && /[0-7]/u.test(value[index + 1] ?? "")) {
          index += 1;
          octal += value[index];
        }
        current += String.fromCharCode(Number.parseInt(octal, 8));
      } else if (char === "n") current += "\n";
      else if (char === "r") current += "\r";
      else if (char === "t") current += "\t";
      else if (char === "b") current += "\b";
      else if (char === "f") current += "\f";
      else current += char;
      escaped = false;
      continue;
    }
    if (char === "\\") escaped = true;
    else if (char === "(") {
      depth += 1;
      current += char;
    } else if (char === ")") {
      depth -= 1;
      if (depth === 0) strings.push(current);
      else current += char;
    } else current += char;
  }
  return strings.join(" ");
}

function compact(value) {
  return value.toLowerCase().replaceAll(/[^a-z0-9]+/gu, "");
}

function driftError() {
  return new Error(
    "ULC M5-G Databricks DPA drifted from the reviewed official baseline.",
  );
}
