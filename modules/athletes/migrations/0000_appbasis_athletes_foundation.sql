CREATE TABLE appbasis_training_group (
  id text PRIMARY KEY,
  organization_id text NOT NULL,
  name text NOT NULL CHECK (length(btrim(name)) BETWEEN 2 AND 100),
  short_name text CHECK (short_name IS NULL OR length(btrim(short_name)) BETWEEN 1 AND 20),
  description text CHECK (description IS NULL OR length(description) <= 1000),
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 100 CHECK (sort_order BETWEEN 0 AND 10000),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, name)
);

CREATE TABLE appbasis_athlete (
  id text PRIMARY KEY,
  organization_id text NOT NULL,
  first_name text NOT NULL CHECK (length(btrim(first_name)) BETWEEN 1 AND 80),
  last_name text NOT NULL CHECK (length(btrim(last_name)) BETWEEN 1 AND 80),
  birth_year integer CHECK (birth_year IS NULL OR birth_year BETWEEN 1900 AND 2100),
  notes text CHECK (notes IS NULL OR length(notes) <= 3000),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE appbasis_trainer (
  id text PRIMARY KEY,
  organization_id text NOT NULL,
  first_name text NOT NULL CHECK (length(btrim(first_name)) BETWEEN 1 AND 80),
  last_name text NOT NULL CHECK (length(btrim(last_name)) BETWEEN 1 AND 80),
  phone text CHECK (phone IS NULL OR length(phone) <= 80),
  email text CHECK (email IS NULL OR length(email) <= 320),
  notes text CHECK (notes IS NULL OR length(notes) <= 3000),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE appbasis_athlete_group_membership (
  organization_id text NOT NULL,
  athlete_id text NOT NULL,
  group_id text NOT NULL,
  started_on date NOT NULL,
  ended_on date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, athlete_id, group_id, started_on),
  CHECK (ended_on IS NULL OR ended_on >= started_on)
);

CREATE TABLE appbasis_trainer_group_membership (
  organization_id text NOT NULL,
  trainer_id text NOT NULL,
  group_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, trainer_id, group_id)
);
