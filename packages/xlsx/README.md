# XLSX helpers

`@appbasis/xlsx` contains deliberately small, low-level helpers that are shared
by more than one proven AppBasis exchange consumer.

Current scope:

- UTF-8 encoding for OpenXML package parts;
- XML 1.0-safe escaping;
- zero-based Excel column-name conversion;
- deterministic creation of a stored ZIP container for OpenXML/XLSX parts.

This package is **not** an import platform. It contains no domain headers,
matching rules, authorization, organization scope, preview/apply semantics,
persistence, import tokens or UI behavior. Those contracts stay with the
owning module/application.

The first two consumers are the athletes exchange and the ULC exercise-catalog
exchange. Reader/parser extraction remains a separate follow-up decision so
that the existing fail-closed ZIP/OpenXML validation is not weakened merely to
remove duplication.
