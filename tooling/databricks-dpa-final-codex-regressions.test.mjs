import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { verifyReviewedDatabricksDpaSemanticBaseline } from "./databricks-dpa-semantic-baseline.mjs";

const moduleSource = readFileSync(new URL("./databricks-dpa-semantic-baseline.mjs", import.meta.url), "utf8");
const clauseBlock = moduleSource.match(/const REVIEWED_SUBSTANTIVE_CLAUSES = Object\.freeze\(\[([\s\S]*?)\]\);/u)?.[1] ?? "";
const REVIEWED_TEXT = [...clauseBlock.matchAll(/^\s*("(?:\\.|[^"\\])*")\s*,?\s*$/gmu)].map((match) => JSON.parse(match[1])).join(" ");
if (REVIEWED_TEXT.length === 0) throw new Error("Could not load reviewed Databricks DPA clauses for regression tests.");

function literal(value) {
  return value.replaceAll("\\", "\\\\").replaceAll("(", "\\(").replaceAll(")", "\\)");
}

function streamObject(number, content) {
  const body = Buffer.from(content, "latin1");
  return Buffer.concat([
    Buffer.from(`${number} 0 obj\n<< /Length ${body.byteLength} >>\nstream\n`, "latin1"),
    body,
    Buffer.from("\nendstream\nendobj\n", "latin1"),
  ]);
}

function legacyPdf(content) {
  return Buffer.concat([
    Buffer.from("%PDF-1.7\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n3 0 obj\n<< /Type /Page /Parent 2 0 R /Contents 4 0 R >>\nendobj\n", "latin1"),
    streamObject(4, content),
    Buffer.from("trailer\n<< /Root 1 0 R >>\nstartxref\n0\n%%EOF\n", "latin1"),
  ]);
}

function xrefLine(offset, generation = 0, inUse = true) {
  return `${String(offset).padStart(10, "0")} ${String(generation).padStart(5, "0")} ${inUse ? "n" : "f"} \n`;
}

function incrementalClassicXrefPdf() {
  const parts = [Buffer.from("%PDF-1.7\n", "latin1")];
  const offsets = [0];
  const pushObject = (buffer) => {
    offsets.push(Buffer.concat(parts).byteLength);
    parts.push(buffer);
  };
  pushObject(Buffer.from("1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n", "latin1"));
  pushObject(Buffer.from("2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n", "latin1"));
  pushObject(Buffer.from("3 0 obj\n<< /Type /Page /Parent 2 0 R /Contents 4 0 R >>\nendobj\n", "latin1"));
  pushObject(streamObject(4, `BT\n(${literal(REVIEWED_TEXT)}) Tj\nET`));

  const firstXref = Buffer.concat(parts).byteLength;
  parts.push(Buffer.from(
    `xref\n0 5\n${xrefLine(0, 65535, false)}${xrefLine(offsets[1])}${xrefLine(offsets[2])}${xrefLine(offsets[3])}${xrefLine(offsets[4])}trailer\n<< /Size 5 /Root 1 0 R >>\nstartxref\n${firstXref}\n%%EOF\n`,
    "latin1",
  ));

  const changed = REVIEWED_TEXT.replace("in no event later than seventy-two 72 hours", "within a commercially reasonable period");
  const replacementOffset = Buffer.concat(parts).byteLength;
  parts.push(streamObject(4, `BT\n(${literal(changed)}) Tj\nET`));
  const secondXref = Buffer.concat(parts).byteLength;
  parts.push(Buffer.from(
    `xref\n4 1\n${xrefLine(replacementOffset)}trailer\n<< /Size 5 /Root 1 0 R /Prev ${firstXref} >>\nstartxref\n${secondXref}\n%%EOF\n`,
    "latin1",
  ));
  return Buffer.concat(parts);
}

test("rejects stale reviewed content when a classic incremental xref selects a changed replacement", () => {
  assert.throws(
    () => verifyReviewedDatabricksDpaSemanticBaseline(incrementalClassicXrefPdf()),
    /drifted from the reviewed official baseline/,
  );
});

test("preserves a pending clipping path across q until the path-ending operator commits it", () => {
  const bytes = legacyPdf(`0 0 0 0 re W q n\nBT\n(${literal(REVIEWED_TEXT)}) Tj\nET\nQ`);
  assert.throws(
    () => verifyReviewedDatabricksDpaSemanticBaseline(bytes),
    /drifted from the reviewed official baseline/,
  );
});
