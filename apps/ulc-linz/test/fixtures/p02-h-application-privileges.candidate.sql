-- P02-H candidate only: app-only least-privilege expansion on 17 of the 18
-- NEW post-51 relations. The 18th relation,
-- public.ulc_linz_training_subject_deletion, deliberately gets ZERO
-- permissions, including SELECT, to the ordinary application SQL role.
--
-- Use ONLY on an explicitly approved isolated copy. No production/Preview
-- execution, no schema/manifest activation and no grants to PUBLIC.
-- This file does NOT provision the privileged erasure coordinator.
-- Historical role privileges outside these 18 relations are unchanged.
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.appbasis_athlete_contact TO ulc_linz_application;
--> statement-breakpoint
GRANT SELECT ON TABLE public.appbasis_exercise_catalog_favorite_deletion TO ulc_linz_application;
--> statement-breakpoint
GRANT SELECT, INSERT ON TABLE public.appbasis_exercise_catalog_usage_subject TO ulc_linz_application;
--> statement-breakpoint
GRANT SELECT ON TABLE public.appbasis_training_block_favorite_deletion TO ulc_linz_application;
--> statement-breakpoint
GRANT SELECT, INSERT ON TABLE public.appbasis_training_block_usage_subject TO ulc_linz_application;
--> statement-breakpoint
GRANT SELECT ON TABLE public.appbasis_training_block_usage_subject_deletion TO ulc_linz_application;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON TABLE public.appbasis_training_documentation TO ulc_linz_application;
--> statement-breakpoint
GRANT SELECT, INSERT ON TABLE public.appbasis_training_documentation_revision TO ulc_linz_application;
--> statement-breakpoint
GRANT SELECT ON TABLE public.appbasis_training_documentation_subject_deletion TO ulc_linz_application;
--> statement-breakpoint
GRANT SELECT ON TABLE public.appbasis_training_plan_subject_deletion TO ulc_linz_application;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON TABLE public.ulc_linz_registration_calendar_exception TO ulc_linz_application;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON TABLE public.ulc_linz_registration_calendar_rule TO ulc_linz_application;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON TABLE public.ulc_linz_training_registration TO ulc_linz_application;
--> statement-breakpoint
GRANT SELECT, INSERT ON TABLE public.ulc_linz_training_registration_change TO ulc_linz_application;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.ulc_linz_training_trainer_attendance TO ulc_linz_application;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON TABLE public.ulc_linz_youth_content_category TO ulc_linz_application;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON TABLE public.ulc_linz_youth_group_category TO ulc_linz_application;
