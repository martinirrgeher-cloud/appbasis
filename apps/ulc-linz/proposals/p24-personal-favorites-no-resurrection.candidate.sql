-- P2–P4 REVIEW CANDIDATE ONLY. No live migration, policy or deployment.
-- Protect the TWO published module-owner personal favorite tables from
-- direct-SQL resurrection after their existing 35-day deletion markers.
-- Uses the EXACT advisory lock identity as the respective protected
-- PostgresRepository mark/delete methods; no new persistent personal data.
-- Must never be registered as an existing migration or applied to Preview/Prod
-- without fresh operator-approved forward migration and full role/restore audit.
CREATE FUNCTION public.ulc_p24_personal_favorite_write_fence()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $favorite$
BEGIN
  IF TG_OP = 'UPDATE' AND
     (NEW.organization_id IS DISTINCT FROM OLD.organization_id OR
      NEW.principal_id IS DISTINCT FROM OLD.principal_id) THEN
    RAISE EXCEPTION 'Personal favorite ownership is immutable.'
      USING ERRCODE = '23514';
  END IF;
  IF NEW.organization_id IS NULL OR NEW.principal_id IS NULL OR
     char_length(NEW.organization_id) NOT BETWEEN 1 AND 200 OR
     char_length(NEW.principal_id) NOT BETWEEN 1 AND 200 OR
     NEW.organization_id <> btrim(NEW.organization_id) OR
     NEW.principal_id <> btrim(NEW.principal_id) THEN
    RAISE EXCEPTION 'Personal favorite owner scope invalid.'
      USING ERRCODE = '23514';
  END IF;

  -- Same transaction lock as markPrincipalDeletedAndDeleteFavorites()
  -- and markPrincipalDeletedAndDeletePersonalCatalogData().
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      pg_catalog.jsonb_build_array(NEW.organization_id,NEW.principal_id)::text, 0
    )
  );
  IF TG_TABLE_NAME = 'appbasis_exercise_catalog_favorite' THEN
    IF EXISTS (
      SELECT 1 FROM public.appbasis_exercise_catalog_favorite_deletion
      WHERE organization_id = NEW.organization_id
        AND principal_id = NEW.principal_id
    ) THEN
      RAISE EXCEPTION 'Personal catalog favorite is blocked by deletion marker.'
        USING ERRCODE = '23514';
    END IF;
  ELSIF TG_TABLE_NAME = 'appbasis_training_block_favorite' THEN
    IF EXISTS (
      SELECT 1 FROM public.appbasis_training_block_favorite_deletion
      WHERE organization_id = NEW.organization_id
        AND principal_id = NEW.principal_id
    ) THEN
      RAISE EXCEPTION 'Personal block favorite is blocked by deletion marker.'
        USING ERRCODE = '23514';
    END IF;
  ELSE
    RAISE EXCEPTION 'Unsupported personal favorite fence owner.'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$favorite$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.ulc_p24_personal_favorite_write_fence() FROM PUBLIC;
--> statement-breakpoint
CREATE TRIGGER ulc_p24_catalog_personal_favorite_fence
BEFORE INSERT OR UPDATE ON public.appbasis_exercise_catalog_favorite
FOR EACH ROW EXECUTE FUNCTION public.ulc_p24_personal_favorite_write_fence();
--> statement-breakpoint
CREATE TRIGGER ulc_p24_block_personal_favorite_fence
BEFORE INSERT OR UPDATE ON public.appbasis_training_block_favorite
FOR EACH ROW EXECUTE FUNCTION public.ulc_p24_personal_favorite_write_fence();
