import { inflateSync } from "node:zlib";

const MAX_INFLATED_STREAM_BYTES = 10_000_000;
const MAX_EXTRACTED_BYTES = 20_000_000;

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
  const compactText = compact(extractDisplayedPdfText(bytes));
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

function extractDisplayedPdfText(bytes) {
  const buffer = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const chunks = [];
  const streamStartLf = Buffer.from("stream\n", "ascii");
  const streamStartCrLf = Buffer.from("stream\r\n", "ascii");
  const streamEndLf = Buffer.from("\nendstream", "ascii");
  const streamEndCrLf = Buffer.from("\r\nendstream", "ascii");
  let extractedBytes = 0;
  let offset = 0;

  while (offset < buffer.length) {
    const lfStart = buffer.indexOf(streamStartLf, offset);
    const crlfStart = buffer.indexOf(streamStartCrLf, offset);
    let marker = streamStartLf;
    let start = lfStart;
    if (start === -1 || (crlfStart !== -1 && crlfStart < start)) {
      marker = streamStartCrLf;
      start = crlfStart;
    }
    if (start === -1) break;

    const contentStart = start + marker.length;
    const lfEnd = buffer.indexOf(streamEndLf, contentStart);
    const crlfEnd = buffer.indexOf(streamEndCrLf, contentStart);
    let contentEnd = lfEnd;
    let endMarkerLength = streamEndLf.length;
    if (contentEnd === -1 || (crlfEnd !== -1 && crlfEnd < contentEnd)) {
      contentEnd = crlfEnd;
      endMarkerLength = streamEndCrLf.length;
    }
    if (contentEnd === -1) break;

    const dictionary = buffer
      .subarray(Math.max(0, start - 1024), start)
      .toString("latin1");
    const streamBytes = buffer.subarray(contentStart, contentEnd);
    let extracted;
    if (/\/FlateDecode\b/u.test(dictionary)) {
      try {
        extracted = inflateSync(streamBytes, {
          maxOutputLength: MAX_INFLATED_STREAM_BYTES,
        });
      } catch {
        offset = contentEnd + endMarkerLength;
        continue;
      }
    } else {
      extracted = streamBytes;
    }

    if (extractedBytes + extracted.byteLength > MAX_EXTRACTED_BYTES) {
      throw new Error(
        "ULC M5-G Databricks DPA PDF extraction exceeds its safety bound.",
      );
    }
    extractedBytes += extracted.byteLength;
    chunks.push(extractDisplayedTextOperators(extracted.toString("latin1")));
    offset = contentEnd + endMarkerLength;
  }

  return chunks.join(" ");
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
