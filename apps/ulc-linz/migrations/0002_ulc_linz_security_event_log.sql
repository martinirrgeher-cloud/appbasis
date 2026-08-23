CREATE TABLE IF NOT EXISTS ulc_linz_security_event_log (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  schema_version integer NOT NULL CHECK (schema_version = 1),
  app_id text NOT NULL CHECK (app_id = 'ulc-linz'),
  category text NOT NULL CHECK (category = 'security'),
  event_type text NOT NULL CHECK (
    event_type IN ('identity.request.denied', 'authorization.denied')
  ),
  occurred_at timestamptz NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  actor_principal_id text,
  organization_id text,
  action text NOT NULL,
  target_type text NOT NULL,
  target_id text,
  operation text,
  http_status integer CHECK (http_status BETWEEN 400 AND 599),
  error_code text,
  reason_code text,
  retained_until timestamptz NOT NULL,
  CHECK (retained_until = occurred_at + interval '12 months'),
  CHECK (
    (event_type = 'identity.request.denied'
      AND actor_principal_id IS NULL
      AND organization_id IS NULL
      AND target_type = 'identity-endpoint'
      AND operation IS NOT NULL
      AND http_status IS NOT NULL
      AND error_code IS NOT NULL
      AND reason_code IS NULL)
    OR
    (event_type = 'authorization.denied'
      AND target_type = 'module'
      AND operation IS NULL
      AND http_status IS NULL
      AND error_code IS NULL
      AND reason_code IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS ulc_linz_security_event_log_retention_idx
  ON ulc_linz_security_event_log (retained_until);

CREATE INDEX IF NOT EXISTS ulc_linz_security_event_log_occurred_at_idx
  ON ulc_linz_security_event_log (occurred_at DESC);
