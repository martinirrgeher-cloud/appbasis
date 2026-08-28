import assert from "node:assert/strict";
import test from "node:test";
import { deflateSync } from "node:zlib";

import { verifyReviewedDatabricksDpaSemanticBaseline } from "./databricks-dpa-semantic-baseline.mjs";

const REVIEWED_TEXT = [
  "Databricks agrees that when Databricks processes Customer Personal Data in its capacity as a processor on behalf of the Customer Databricks will comply with Applicable Data Protection Laws and process the Customer Personal Data as necessary to perform its obligations under the Agreement and only in accordance with Customer's documented instructions",
  "Databricks shall enter into a written agreement with its Subprocessors which includes data protection and security measures no less protective than the measures set forth in this DPA and remain fully liable for any breach of the Agreement and this DPA that is caused by an act error or omission of its Subprocessors",
  "In the event of a Security Breach Databricks will notify Customer in writing without undue delay and in no event later than seventy-two 72 hours after becoming aware of the Security Breach and promptly take reasonable steps to contain investigate and mitigate any adverse effects resulting from the Security Breach",
  "Where the transfer of Customer Personal Data to Databricks is a Restricted Transfer such transfer shall be governed by the Standard Contractual Clauses which shall be deemed incorporated into and form an integral part of the Agreement in accordance with Annex B of this DPA",
  "The Databricks Services do not include backup services or disaster recovery for Customer Personal Data Databricks does provide functionality within the Databricks Services that may permit Customer to backup certain Customer Personal Data on its own It is the Customer's obligation to backup any Customer Personal Data if desired",
  "Databricks will delete or assist Customer in deleting any Customer Personal Data within its possession or control within thirty 30 days following such request",
  "Module Two terms shall apply where Customer is the controller of Customer Personal Data and the Module Three terms shall apply where Customer is the processor of Customer Personal Data",
  "in Clause 9 option 2 general authorization is selected and the process and time period for prior notice of Sub-processor changes shall be as set out in Section 4.3 of the DPA",
  "Databricks DPA v3 2023-07-21",
].join(" ");

function streamObject(number, content, { compressed = true, dictionary = "" } = {}) {
  const raw = Buffer.isBuffer(content) ? content : Buffer.from(content, "latin1");
  const stream = compressed ? deflateSync(raw) : raw;
  const filter = compressed ? " /Filter /FlateDecode" : "";
  return Buffer.concat([
    Buffer.from(`${number} 0 obj\n<< /Length ${stream.byteLength}${filter}${dictionary} >>\nstream\n`, "latin1"),
    stream,
    Buffer.from("\nendstream\nendobj\n", "latin1"),
  ]);
}

function basePdf(content, { pageDictionary = "", extraObjects = [] } = {}) {
  return Buffer.concat([
    Buffer.from("%PDF-1.7\n", "latin1"),
    Buffer.from("1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n", "latin1"),
    Buffer.from("2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n", "latin1"),
    Buffer.from(`3 0 obj\n<< /Type /Page /Parent 2 0 R /Contents 4 0 R${pageDictionary} >>\nendobj\n`, "latin1"),
    streamObject(4, content),
    ...extraObjects,
    Buffer.from("trailer\n<< /Root 1 0 R >>\nstartxref\n0\n%%EOF\n", "latin1"),
  ]);
}

function pdfWithContentArray(contents, { pageDictionary = "", extraObjects = [] } = {}) {
  const refs = contents.map((_, index) => `${4 + index} 0 R`).join(" ");
  const streams = contents.map((content, index) => streamObject(4 + index, content));
  return Buffer.concat([
    Buffer.from("%PDF-1.7\n", "latin1"),
    Buffer.from("1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n", "latin1"),
    Buffer.from("2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n", "latin1"),
    Buffer.from(`3 0 obj\n<< /Type /Page /Parent 2 0 R /Contents [${refs}]${pageDictionary} >>\nendobj\n`, "latin1"),
    ...streams,
    ...extraObjects,
    Buffer.from("trailer\n<< /Root 1 0 R >>\nstartxref\n0\n%%EOF\n", "latin1"),
  ]);
}

function xrefStreamPdf(content) {
  const catalog = "<< /Type /Catalog /Pages 2 0 R >>";
  const pages = "<< /Type /Pages /Kids [3 0 R] /Count 1 >>";
  const page = "<< /Type /Page /Parent 2 0 R /Contents 4 0 R >>";
  const bodies = [catalog, pages, page];
  let offset = 0;
  const pairs = [];
  for (let index = 0; index < bodies.length; index += 1) {
    pairs.push(`${index + 1} ${offset}`);
    offset += Buffer.byteLength(`${bodies[index]} `, "latin1");
  }
  const header = `${pairs.join(" ")} `;
  const objectStreamBody = `${header}${bodies.join(" ")}`;
  const prefix = Buffer.concat([
    Buffer.from("%PDF-1.7\n", "latin1"),
    streamObject(4, content),
    streamObject(5, objectStreamBody, {
      dictionary: ` /Type /ObjStm /N 3 /First ${Buffer.byteLength(header, "latin1")}`,
    }),
  ]);
  const xrefOffset = prefix.byteLength;
  const xref = streamObject(6, Buffer.alloc(0), {
    compressed: false,
    dictionary: " /Type /XRef /Root 1 0 R /Size 7",
  });
  return Buffer.concat([
    prefix,
    xref,
    Buffer.from(`startxref\n${xrefOffset}\n%%EOF\n`, "latin1"),
  ]);
}

function xrefEntry(type, field2, field3) {
  const entry = Buffer.alloc(7);
  entry.writeUInt8(type, 0);
  entry.writeUInt32BE(field2, 1);
  entry.writeUInt16BE(field3, 5);
  return entry;
}

function xrefStreamWithStaleReviewedCatalog(activeContent) {
  const chunks = [Buffer.from("%PDF-1.7\n", "latin1")];
  let length = chunks[0].byteLength;
  const offsets = new Map();
  const append = (number, value) => {
    offsets.set(number, length);
    chunks.push(value);
    length += value.byteLength;
  };

  append(1, Buffer.from("1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n", "latin1"));
  append(2, Buffer.from("2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n", "latin1"));
  append(3, Buffer.from("3 0 obj\n<< /Type /Page /Parent 2 0 R /Contents 4 0 R >>\nendobj\n", "latin1"));
  append(4, streamObject(4, `BT\n(${literal(REVIEWED_TEXT)}) Tj\nET`));

  const bodies = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /Contents 7 0 R >>",
  ];
  let objectOffset = 0;
  const pairs = [];
  for (let index = 0; index < bodies.length; index += 1) {
    pairs.push(`${index + 1} ${objectOffset}`);
    objectOffset += Buffer.byteLength(`${bodies[index]} `, "latin1");
  }
  const objectHeader = `${pairs.join(" ")} `;
  append(5, streamObject(5, `${objectHeader}${bodies.join(" ")}`, {
    dictionary: ` /Type /ObjStm /N 3 /First ${Buffer.byteLength(objectHeader, "latin1")}`,
  }));
  append(7, streamObject(7, activeContent));

  const xrefOffset = length;
  const entries = Buffer.concat([
    xrefEntry(0, 0, 65535),
    xrefEntry(2, 5, 0),
    xrefEntry(2, 5, 1),
    xrefEntry(2, 5, 2),
    xrefEntry(1, offsets.get(4), 0),
    xrefEntry(1, offsets.get(5), 0),
    xrefEntry(1, xrefOffset, 0),
    xrefEntry(1, offsets.get(7), 0),
  ]);
  append(6, streamObject(6, entries, {
    compressed: false,
    dictionary: " /Type /XRef /Root 1 0 R /Size 8 /W [1 4 2] /Index [0 8]",
  }));

  return Buffer.concat([
    ...chunks,
    Buffer.from(`startxref\n${xrefOffset}\n%%EOF\n`, "latin1"),
  ]);
}

function literal(value) {
  return value.replaceAll("\\", "\\\\").replaceAll("(", "\\(").replaceAll(")", "\\)");
}

function hex(value) {
  return Buffer.from(value, "latin1").toString("hex").toUpperCase();
}

test("accepts the reviewed substantive clauses from active page content", () => {
  const bytes = basePdf(`BT\n(${literal(REVIEWED_TEXT)}) Tj\nET`);
  assert.equal(verifyReviewedDatabricksDpaSemanticBaseline(bytes), true);
});

test("rejects changed operative language even when headings and version could remain unchanged", () => {
  const changed = REVIEWED_TEXT.replace("in no event later than seventy-two 72 hours", "within a commercially reasonable period");
  assert.throws(
    () => verifyReviewedDatabricksDpaSemanticBaseline(basePdf(`BT\n(${literal(changed)}) Tj\nET`)),
    /drifted from the reviewed official baseline/,
  );
});

test("accepts hexadecimal Tj operands for semantically identical text", () => {
  const bytes = basePdf(`BT\n<${hex(REVIEWED_TEXT)}> Tj\nET`);
  assert.equal(verifyReviewedDatabricksDpaSemanticBaseline(bytes), true);
});

test("accepts a ToUnicode-mapped glyph stream on the active page", () => {
  const source = Buffer.from(REVIEWED_TEXT, "latin1");
  const pairs = [...source].map((byte) => `<${byte.toString(16).padStart(2, "0")}> <${byte.toString(16).padStart(4, "0")}>`).join("\n");
  const cmap = `begincmap\n${source.length} beginbfchar\n${pairs}\nendbfchar\nendcmap`;
  const font = Buffer.from("5 0 obj\n<< /Type /Font /Subtype /Type0 /ToUnicode 6 0 R >>\nendobj\n", "latin1");
  const cmapObject = streamObject(6, cmap);
  const pageDictionary = " /Resources << /Font << /F1 5 0 R >> >>";
  const bytes = basePdf(`BT\n/F1 10 Tf\n<${hex(REVIEWED_TEXT)}> Tj\nET`, {
    pageDictionary,
    extraObjects: [font, cmapObject],
  });
  assert.equal(verifyReviewedDatabricksDpaSemanticBaseline(bytes), true);
});

test("accepts a text object split across ordered page content streams", () => {
  const bytes = pdfWithContentArray(["BT\n", `(${literal(REVIEWED_TEXT)}) Tj\nET`]);
  assert.equal(verifyReviewedDatabricksDpaSemanticBaseline(bytes), true);
});

test("rejects reviewed clauses painted with invisible text rendering mode", () => {
  const bytes = basePdf(`BT\n(UNRELATED VISIBLE CONTRACT) Tj\n3 Tr\n(${literal(REVIEWED_TEXT)}) Tj\nET`);
  assert.throws(() => verifyReviewedDatabricksDpaSemanticBaseline(bytes), /drifted from the reviewed official baseline/);
});

test("rejects reviewed clauses used only as a clipping text path", () => {
  const bytes = basePdf(`BT\n(UNRELATED VISIBLE CONTRACT) Tj\n7 Tr\n(${literal(REVIEWED_TEXT)}) Tj\nET`);
  assert.throws(() => verifyReviewedDatabricksDpaSemanticBaseline(bytes), /drifted from the reviewed official baseline/);
});

test("rejects invisible rendering mode persisted across text objects", () => {
  const bytes = basePdf(`BT\n3 Tr\nET\nBT\n(${literal(REVIEWED_TEXT)}) Tj\nET`);
  assert.throws(() => verifyReviewedDatabricksDpaSemanticBaseline(bytes), /drifted from the reviewed official baseline/);
});

test("restores rendering state through q and Q", () => {
  const bytes = basePdf(`q\nBT\n3 Tr\nET\nQ\nBT\n(${literal(REVIEWED_TEXT)}) Tj\nET`);
  assert.equal(verifyReviewedDatabricksDpaSemanticBaseline(bytes), true);
});

test("rejects reviewed clauses under an unknown clipping path", () => {
  const bytes = basePdf(`q\n0 0 m\nW n\nBT\n(${literal(REVIEWED_TEXT)}) Tj\nET\nQ`);
  assert.throws(() => verifyReviewedDatabricksDpaSemanticBaseline(bytes), /drifted from the reviewed official baseline/);
});

test("rejects reviewed clauses after a clipping path finalized by fill", () => {
  const bytes = basePdf(`0 0 0 0 re W f\nBT\n(${literal(REVIEWED_TEXT)}) Tj\nET`);
  assert.throws(() => verifyReviewedDatabricksDpaSemanticBaseline(bytes), /drifted from the reviewed official baseline/);
});

test("applies text clipping when ET closes the text object", () => {
  const bytes = basePdf(`BT\n7 Tr\n(X) Tj\nET\nBT\n0 Tr\n(${literal(REVIEWED_TEXT)}) Tj\nET`);
  assert.throws(() => verifyReviewedDatabricksDpaSemanticBaseline(bytes), /drifted from the reviewed official baseline/);
});

test("accepts a cross-reference stream with catalog objects in an object stream", () => {
  const bytes = xrefStreamPdf(`BT\n(${literal(REVIEWED_TEXT)}) Tj\nET`);
  assert.equal(verifyReviewedDatabricksDpaSemanticBaseline(bytes), true);
});

test("uses active compressed objects from xref entries instead of stale direct objects", () => {
  const changed = REVIEWED_TEXT.replace("in no event later than seventy-two 72 hours", "within a commercially reasonable period");
  const bytes = xrefStreamWithStaleReviewedCatalog(`BT\n(${literal(changed)}) Tj\nET`);
  assert.throws(() => verifyReviewedDatabricksDpaSemanticBaseline(bytes), /drifted from the reviewed official baseline/);
});

test("rejects substantive clauses hidden in an unreferenced stream", () => {
  const hidden = streamObject(5, `BT\n(${literal(REVIEWED_TEXT)}) Tj\nET`);
  const bytes = basePdf("BT\n(UNRELATED DOCUMENT) Tj\nET", { extraObjects: [hidden] });
  assert.throws(() => verifyReviewedDatabricksDpaSemanticBaseline(bytes), /drifted from the reviewed official baseline/);
});

test("rejects substantive clauses hidden only in PDF comments", () => {
  const bytes = basePdf(`BT\n% (${literal(REVIEWED_TEXT)}) Tj\n(UNRELATED DOCUMENT) Tj\nET`);
  assert.throws(() => verifyReviewedDatabricksDpaSemanticBaseline(bytes), /drifted from the reviewed official baseline/);
});

test("fails closed when a page Flate stream expands beyond the safety bound", () => {
  const oversized = `BT\n(${literal(REVIEWED_TEXT)} ${"A".repeat(10_100_000)}) Tj\nET`;
  assert.throws(() => verifyReviewedDatabricksDpaSemanticBaseline(basePdf(oversized)), /drifted from the reviewed official baseline/);
});
