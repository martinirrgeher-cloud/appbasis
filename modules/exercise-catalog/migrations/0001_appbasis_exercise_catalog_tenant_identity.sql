ALTER TABLE appbasis_exercise_catalog_item
  DROP CONSTRAINT appbasis_exercise_catalog_item_pkey,
  ADD CONSTRAINT appbasis_exercise_catalog_item_pk
    PRIMARY KEY (organization_id, id);
