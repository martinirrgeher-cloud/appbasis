import assert from "node:assert/strict";
import test from "node:test";
import { deflateSync } from "node:zlib";

import { verifyReviewedDatabricksDpaSemanticBaseline } from "./databricks-dpa-semantic-baseline.mjs";

const REVIEWED_TEXT = [
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
].join(" ");

function streamObject(number, content, { compressed = true } = {}) {
  const stream = compressed ? deflateSync(Buffer.from(content, "latin1")) : Buffer.from(content, "latin1");
  const filter = compressed ? " /Filter /FlateDecode" : "";
  return Buffer.concat([
    Buffer.from(
      `${number} 0 obj\n<< /Length ${stream.byteLength}${filter} >>\nstream\n`,
      "latin1",
    ),
    stream,
    Buffer.from("\nendstream\nendobj\n", "latin1"),
  ]);
}

function pdfWithContent(content, { unreferencedContent = null } = {}) {
  const parts = [
    Buffer.from("%PDF-1.7\n", "latin1"),
    Buffer.from("1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n", "latin1"),
    Buffer.from("2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n", "latin1"),
    Buffer.from("3 0 obj\n<< /Type /Page /Parent 2 0 R /Contents 4 0 R >>\nendobj\n", "latin1"),
    streamObject(4, content),
  ];
  if (unreferencedContent !== null) parts.push(streamObject(5, unreferencedContent));
  parts.push(Buffer.from("trailer\n<< /Root 1 0 R >>\nstartxref\n0\n%%EOF\n", "latin1"));
  return Buffer.concat(parts);
}

function literal(value) {
  return value.replaceAll("\\", "\\\\").replaceAll("(", "\\(").replaceAll(")", "\\)");
}

test("accepts reviewed anchors only from the active page tree", () => {
  const bytes = pdfWithContent(`BT\n(${literal(REVIEWED_TEXT)}) Tj\nET`);
  assert.equal(verifyReviewedDatabricksDpaSemanticBaseline(bytes), true);
});

test("rejects a semantic fallback missing one reviewed section anchor", () => {
  const incomplete = REVIEWED_TEXT.replace("CCPA COMPLIANCE", "UNRELATED SECTION");
  const bytes = pdfWithContent(`BT\n(${literal(incomplete)}) Tj\nET`);
  assert.throws(
    () => verifyReviewedDatabricksDpaSemanticBaseline(bytes),
    /drifted from the reviewed official baseline/,
  );
});

test("rejects reviewed anchors hidden only in PDF comments", () => {
  const bytes = pdfWithContent(
    `BT\n% (${literal(REVIEWED_TEXT)}) Tj\n(UNRELATED DOCUMENT) Tj\nET`,
  );
  assert.throws(
    () => verifyReviewedDatabricksDpaSemanticBaseline(bytes),
    /drifted from the reviewed official baseline/,
  );
});

test("rejects reviewed anchors inside a text object without a text-showing operator", () => {
  const bytes = pdfWithContent(`BT\n(${literal(REVIEWED_TEXT)})\nET`);
  assert.throws(
    () => verifyReviewedDatabricksDpaSemanticBaseline(bytes),
    /drifted from the reviewed official baseline/,
  );
});

test("rejects anchors placed in an unreferenced indirect stream", () => {
  const bytes = pdfWithContent("BT\n(UNRELATED DOCUMENT) Tj\nET", {
    unreferencedContent: `BT\n(${literal(REVIEWED_TEXT)}) Tj\nET`,
  });
  assert.throws(
    () => verifyReviewedDatabricksDpaSemanticBaseline(bytes),
    /drifted from the reviewed official baseline/,
  );
});

test("accepts TJ-array displayed literals on an active page", () => {
  const bytes = pdfWithContent(`BT\n[(${literal(REVIEWED_TEXT)})] TJ\nET`);
  assert.equal(verifyReviewedDatabricksDpaSemanticBaseline(bytes), true);
});

test("fails closed when a page Flate stream expands beyond the safety bound", () => {
  const oversized = `BT\n(${literal(REVIEWED_TEXT)} ${"A".repeat(10_100_000)}) Tj\nET`;
  const bytes = pdfWithContent(oversized);
  assert.throws(
    () => verifyReviewedDatabricksDpaSemanticBaseline(bytes),
    /drifted from the reviewed official baseline/,
  );
});
