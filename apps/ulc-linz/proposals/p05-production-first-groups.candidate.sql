-- P05 REVIEW CANDIDATE ONLY. Not a registered migration.
-- Four non-personal groups, with three explicit attendance module mappings.
-- No Preview import, trainer/athlete row, permission change, deployment or live
-- application write. Never apply without confirming these group names.
-- Single atomic DO block. Existing unexpected data makes it fail closed.
DO $ulc_p05$
DECLARE
  target_org text;
  existing_groups integer;
  existing_mappings integer;
  exact_groups integer;
  exact_mappings integer;
BEGIN
  IF current_database() <> 'neondb' THEN
    RAISE EXCEPTION 'P05 refuses wrong database';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('ulc-linz-p05-first-groups', 0));
  IF (SELECT count(*) FROM pg_catalog.pg_tables WHERE schemaname='public') <> 69 THEN
    RAISE EXCEPTION 'P05 refuses unexpected ULC database schema';
  END IF;
  IF (SELECT count(DISTINCT organization_id) FROM public.ulc_linz_membership
      WHERE active AND ended_at IS NULL) <> 1 THEN
    RAISE EXCEPTION 'P05 requires exactly one active ULC organization';
  END IF;
  SELECT min(organization_id) INTO target_org
    FROM public.ulc_linz_membership WHERE active AND ended_at IS NULL;
  IF target_org IS NULL OR target_org = '' OR target_org <> btrim(target_org) THEN
    RAISE EXCEPTION 'P05 organization is invalid';
  END IF;
  -- A smoke principal is not a real ULC club organization. The earlier
  -- implementation accidentally accepted this only active membership.
  IF target_org ILIKE '%smoke%' OR target_org ILIKE '%preview%' OR target_org ILIKE '%test%' THEN
    RAISE EXCEPTION 'P05 refuses non-production organization';
  END IF;
  SELECT count(*) INTO existing_groups FROM public.appbasis_training_group;
  SELECT count(*) INTO existing_mappings FROM public.ulc_linz_training_module_group;
  IF existing_groups = 0 AND existing_mappings = 0 THEN
    IF (SELECT count(*) FROM public.appbasis_trainer) <> 0 OR
       (SELECT count(*) FROM public.appbasis_athlete) <> 0 OR
       (SELECT count(*) FROM public.ulc_linz_training_session) <> 0 THEN
      RAISE EXCEPTION 'P05 refuses nonempty production onboarding';
    END IF;
    INSERT INTO public.appbasis_training_group
      (id, organization_id, name, short_name, description, attendance_mode, is_active, sort_order)
    VALUES
      ('ulc-linz-kindertraining', target_org, 'Kindertraining', NULL, NULL, 'trainer_roll_call', true, 10),
      ('ulc-linz-u12', target_org, 'U12', NULL, NULL, 'trainer_roll_call', true, 20),
      ('ulc-linz-u14', target_org, 'U14', NULL, NULL, 'trainer_roll_call', true, 30),
      ('ulc-linz-irg', target_org, 'Gruppe Irrgeher', NULL, NULL, 'self_registration', true, 40);
    INSERT INTO public.ulc_linz_training_module_group
      (organization_id, module_id, group_id)
    VALUES
      (target_org, 'kindertraining', 'ulc-linz-kindertraining'),
      (target_org, 'u12', 'ulc-linz-u12'),
      (target_org, 'u14', 'ulc-linz-u14');
  ELSIF existing_groups <> 4 OR existing_mappings <> 3 THEN
    RAISE EXCEPTION 'P05 refuses partly initialized or unexpected group state';
  END IF;
  SELECT count(*) INTO exact_groups
  FROM (VALUES
    ('ulc-linz-kindertraining', 'Kindertraining', 'trainer_roll_call', 10),
    ('ulc-linz-u12', 'U12', 'trainer_roll_call', 20),
    ('ulc-linz-u14', 'U14', 'trainer_roll_call', 30),
    ('ulc-linz-irg', 'Gruppe Irrgeher', 'self_registration', 40)
  ) AS expected(id, name, mode, sort_order)
  JOIN public.appbasis_training_group g
    ON g.id=expected.id AND g.organization_id=target_org
   AND g.name=expected.name AND g.attendance_mode=expected.mode
   AND g.sort_order=expected.sort_order AND g.is_active
   AND g.short_name IS NULL AND g.description IS NULL;
  SELECT count(*) INTO exact_mappings
  FROM (VALUES
    ('kindertraining', 'ulc-linz-kindertraining'),
    ('u12', 'ulc-linz-u12'),
    ('u14', 'ulc-linz-u14')
  ) AS expected(module_id, group_id)
  JOIN public.ulc_linz_training_module_group m
    ON m.organization_id=target_org
   AND m.module_id=expected.module_id AND m.group_id=expected.group_id;
  IF exact_groups <> 4 OR exact_mappings <> 3 THEN
    RAISE EXCEPTION 'P05 group names or module mappings differ from reviewed set';
  END IF;
  -- No DELETE, UPDATE, GRANT, revoked-capability change or identity creation.
  -- All writes roll back atomically if a guard fails.
END
$ulc_p05$;