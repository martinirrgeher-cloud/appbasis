# XLSX helpers

`@appbasis/xlsx` contains deliberately small, low-level OpenXML/XLSX helpers
shared by more than one proven AppBasis exchange consumer.

Current writer scope:

- UTF-8 encoding for OpenXML package parts;
- XML 1.0-safe escaping;
- zero-based Excel column-name conversion;
- deterministic ZIP32 stored packaging.

Current reader scope:

- fail-closed ZIP32 directory and local-header validation;
- configurable entry-count, per-entry, total-uncompressed and column limits;
- stored and DEFLATE-compressed entries through the Workers-compatible
  `node:zlib` path;
- path traversal, duplicate entries, encryption, ZIP64, unsupported compression,
  size drift and CRC drift are rejected;
- XML must be strict UTF-8 and may not contain DOCTYPE/ENTITY declarations;
- workbook relationships, shared strings, inline strings, booleans and scalar
  cell values;
- optional Excel date decoding using number formats and the 1900/1904 date
  systems.

This package is **not** an import platform. It contains no domain headers,
matching rules, authorization, organization scope, preview/apply semantics,
persistence, import tokens or UI behavior. File-size limits such as the
5-MB product rule and row-count/domain rules remain with the owning consumer.

The first two consumers are the athletes exchange and the ULC exercise-catalog
exchange. Athletes opts into date decoding; the exercise catalog intentionally
keeps numeric cells as raw scalar text.
