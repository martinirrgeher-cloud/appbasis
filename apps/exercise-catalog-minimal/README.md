# AppBasis Exercise Catalog Minimal

Isolated E6G-B consumer for the generic `exercise-catalog` standard module.

The app proves that the module can run without ULC code:

- identity and permissions are consumed only through their public platform
  contracts;
- organization scope is supplied by the app, never by request payloads;
- the catalog definition is app-configured and intentionally not
  athletics-specific;
- module-owned PostgreSQL tables are the only catalog persistence used;
- view/edit permissions are separate and personal favorites require view only.

This app is test-only evidence for the standard-module contract. It is not a ULC
adoption path and has no preview or production deployment gate.
