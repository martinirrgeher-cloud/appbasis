# Übungskatalog

Generic AppBasis standard-module foundation.

E6G-A defines the module contract, configurable domain validation and module-owned schema. It does not adopt the existing ULC Linz tables.

Categories and allowed parameter keys come from a public domain definition; the generic schema contains no athletics-specific enumerations. Audience assignments and favorite principals are opaque integration IDs, so the module owns neither Athletes groups nor Identity tables and creates no cross-owner foreign keys.

ULC Linz continues to use its existing `ulc_linz_exercise_*` tables until a separate ownership-adoption gate proves the data transfer.
