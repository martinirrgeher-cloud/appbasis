# Übungskatalog

Generic AppBasis standard module.

E6G-A defines the module contract, configurable domain validation and
module-owned schema. Categories and allowed parameter keys come from a public
domain definition; the generic schema contains no athletics-specific
enumerations. Audience assignments and favorite principals are opaque
integration IDs, so the module owns neither Athletes groups nor Identity tables
and creates no cross-owner foreign keys.

E6G-B adds the public repository/service boundary:

- in-memory and PostgreSQL repositories;
- organization scope repeated on every PostgreSQL read/write;
- atomic item + parameter + audience writes;
- personal favorites scoped by organization and opaque principal ID;
- service-level Create/Update/Deactivate/Favorite operations that always
  normalize persisted items against the configured E6G-A definition.

ULC Linz continues to use its existing `ulc_linz_exercise_*` tables until a
separate ownership-adoption gate proves the data transfer. E6G-B does not copy,
claim or mutate the ULC-owned catalog schema.
