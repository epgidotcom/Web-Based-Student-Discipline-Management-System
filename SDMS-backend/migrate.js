import { query } from './db.js';

export async function runMigrations() {
  const sql = `
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Accounts
CREATE TABLE IF NOT EXISTS accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('Admin','Teacher','Student')),
  grade TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Password reset tokens
CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_account ON password_reset_tokens(account_id);

-- Past offenses
CREATE TABLE IF NOT EXISTS past_offenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_name TEXT NOT NULL,
  label TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_past_offenses_student_name ON past_offenses(student_name);

-- Violations (new persistent store replacing in-memory frontend list)
CREATE TABLE IF NOT EXISTS violations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_name TEXT NOT NULL,
  grade_section TEXT,
  offense_type TEXT, -- renamed from violation_type
  sanction TEXT,
  description TEXT,
  violation TEXT, -- legacy single-field (optional)
  incident_date DATE, -- renamed from date
  evidence JSONB, -- array of data URL strings (base64) or future structured refs
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_violations_student_name ON violations(student_name);

-- Legacy rename handling (idempotent): date -> incident_date, violation_type -> offense_type
DO $$
BEGIN
  -- date -> incident_date
  IF EXISTS (
    SELECT 1 FROM information_schema.columns WHERE table_name='violations' AND column_name='date'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns WHERE table_name='violations' AND column_name='incident_date'
  ) THEN
    EXECUTE 'ALTER TABLE violations RENAME COLUMN date TO incident_date';
  END IF;
  -- violation_type -> offense_type
  IF EXISTS (
    SELECT 1 FROM information_schema.columns WHERE table_name='violations' AND column_name='violation_type'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns WHERE table_name='violations' AND column_name='offense_type'
  ) THEN
    EXECUTE 'ALTER TABLE violations RENAME COLUMN violation_type TO offense_type';
  END IF;
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Skipped legacy rename(s): %', SQLERRM;
END$$;

-- Drop obsolete index if still present
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_indexes WHERE tablename='violations' AND indexname='idx_violations_date'
  ) THEN
    EXECUTE 'DROP INDEX idx_violations_date';
  END IF;
END$$;

-- Create index on new incident_date column
CREATE INDEX IF NOT EXISTS idx_violations_incident_date ON violations(incident_date);

-- Add student_id column (UUID) to violations if missing and create FK to students(id)
ALTER TABLE violations ADD COLUMN IF NOT EXISTS student_id UUID;

-- Backfill student_id by name best-effort (matching full name concatenation) if null
DO $$
BEGIN
  UPDATE violations v
  SET student_id = s.id
  FROM students s
  WHERE v.student_id IS NULL
    AND LOWER(v.student_name) = LOWER(
      trim(
        COALESCE(s.first_name,'') || ' ' ||
        COALESCE(s.middle_name,'') || ' ' ||
        COALESCE(s.last_name,'')
      )
    );
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Skipped backfill of violations.student_id: %', SQLERRM;
END$$;

-- Add FK (ignore if cannot because of bad data)
DO $$
BEGIN
  ALTER TABLE violations
    ADD CONSTRAINT violations_student_fk
    FOREIGN KEY (student_id) REFERENCES students(id)
    ON DELETE SET NULL;
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Could not add FK violations_student_fk (maybe already exists or data mismatch): %', SQLERRM;
END$$;

-- Helpful index for lookups by student_id
CREATE INDEX IF NOT EXISTS idx_violations_student_id ON violations(student_id);

-- View will be recreated after schema reorganization to avoid dependency issues
DROP VIEW IF EXISTS violation_stats;

-- Appeals feature (status enum + table)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'appeal_status_type') THEN
    CREATE TYPE appeal_status_type AS ENUM ('Pending','Approved','Rejected');
  END IF;
END$$;

CREATE TABLE IF NOT EXISTS appeals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  student_id UUID REFERENCES students(id) ON DELETE SET NULL,
  violation_id UUID REFERENCES violations(id) ON DELETE SET NULL,
  lrn TEXT,
  student_name TEXT NOT NULL,
  section TEXT,
  violation_title TEXT,
  reason TEXT NOT NULL,
  status appeal_status_type DEFAULT 'Pending',
  decision_notes TEXT,
  decided_by UUID REFERENCES accounts(id) ON DELETE SET NULL,
  decided_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_appeals_account ON appeals(account_id);
CREATE INDEX IF NOT EXISTS idx_appeals_student ON appeals(student_id);
CREATE INDEX IF NOT EXISTS idx_appeals_status ON appeals(status);

CREATE TABLE IF NOT EXISTS appeal_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  appeal_id UUID NOT NULL REFERENCES appeals(id) ON DELETE CASCADE,
  sender_account_id UUID REFERENCES accounts(id) ON DELETE SET NULL,
  sender_role TEXT NOT NULL CHECK (sender_role IN ('Admin','Teacher','Student')),
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_appeal_messages_appeal ON appeal_messages(appeal_id);
CREATE INDEX IF NOT EXISTS idx_appeal_messages_created ON appeal_messages(created_at);

CREATE TABLE IF NOT EXISTS messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  receiver_account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  read_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(sender_account_id, receiver_account_id);
CREATE INDEX IF NOT EXISTS idx_messages_created ON messages(created_at DESC);

-- SMS logs
CREATE TABLE IF NOT EXISTS sms_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone TEXT NOT NULL,
  message TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS message_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id TEXT NOT NULL,
  student_id UUID,
  student_name TEXT,
  student_name_hash TEXT,
  violation_type TEXT,
  message_type TEXT,
  message_status TEXT NOT NULL,
  date_sent TIMESTAMPTZ NOT NULL DEFAULT now(),
  sender_account_id UUID,
  sender_name TEXT,
  phone_hash TEXT NOT NULL,
  error_detail TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_message_logs_message_id ON message_logs(message_id);
CREATE INDEX IF NOT EXISTS idx_message_logs_date_sent ON message_logs(date_sent);
ALTER TABLE message_logs ADD COLUMN IF NOT EXISTS student_name_hash TEXT;

-- Students (idempotent evolution)
CREATE TABLE IF NOT EXISTS students (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lrn TEXT UNIQUE,
  first_name TEXT NOT NULL,
  middle_name TEXT,
  last_name TEXT NOT NULL,
  birthdate DATE,
  age INTEGER,
  address TEXT,
  grade TEXT,
  section TEXT,
  parent_contact TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Add missing columns if legacy schema exists
ALTER TABLE students ADD COLUMN IF NOT EXISTS id UUID DEFAULT gen_random_uuid();
ALTER TABLE students ADD COLUMN IF NOT EXISTS first_name TEXT;
ALTER TABLE students ADD COLUMN IF NOT EXISTS middle_name TEXT;
ALTER TABLE students ADD COLUMN IF NOT EXISTS last_name TEXT;
ALTER TABLE students ADD COLUMN IF NOT EXISTS birthdate DATE;
ALTER TABLE students ADD COLUMN IF NOT EXISTS age INTEGER;
ALTER TABLE students ADD COLUMN IF NOT EXISTS address TEXT;
ALTER TABLE students ADD COLUMN IF NOT EXISTS grade TEXT;
ALTER TABLE students ADD COLUMN IF NOT EXISTS parent_contact TEXT;

-- Backfill split names from full_name only where needed
UPDATE students
SET first_name = COALESCE(first_name, NULLIF(split_part(full_name,' ',1),'')),
    last_name  = COALESCE(last_name,
                  CASE
                    WHEN full_name LIKE '% %' THEN split_part(full_name,' ', array_length(string_to_array(full_name,' '),1))
                    ELSE full_name
                  END)
WHERE full_name IS NOT NULL;

-- Backfill grade from grade_level if present
UPDATE students SET grade = COALESCE(grade, grade_level) WHERE grade IS NULL;

-- Ensure required constraints (id primary key)
-- Primary key normalization logic (safe & dependency-aware)
DO $$
DECLARE
  pk_on_student_id BOOLEAN := FALSE;
  pk_constraint_name TEXT;
  student_id_attnum INT;
  dependent_fk_count INT := 0;
BEGIN
  -- Locate attnum for legacy student_id column if it exists
  SELECT a.attnum INTO student_id_attnum
  FROM pg_attribute a
  WHERE a.attrelid = 'students'::regclass AND a.attname = 'student_id' AND a.attnum > 0;

  -- Determine current primary key constraint
  SELECT c.conname,
         EXISTS (
           SELECT 1 FROM pg_attribute a
           JOIN pg_index i ON i.indrelid = a.attrelid AND a.attnum = ANY(i.indkey)
           WHERE i.indrelid = 'students'::regclass
             AND i.indisprimary
             AND a.attname = 'student_id'
         )
  INTO pk_constraint_name, pk_on_student_id
  FROM pg_constraint c
  WHERE c.conrelid = 'students'::regclass AND c.contype = 'p'
  LIMIT 1;

  IF pk_on_student_id THEN
    -- Count foreign keys in other tables referencing students(student_id)
    IF student_id_attnum IS NOT NULL THEN
      SELECT COUNT(*) INTO dependent_fk_count
      FROM pg_constraint c
      WHERE c.contype = 'f'
        AND c.confrelid = 'students'::regclass
        AND student_id_attnum = ANY (c.confkey);
    END IF;

    IF dependent_fk_count = 0 THEN
      -- Safe to switch primary key to id
      EXECUTE 'ALTER TABLE students DROP CONSTRAINT ' || quote_ident(pk_constraint_name);
      EXECUTE 'ALTER TABLE students ADD CONSTRAINT students_pkey PRIMARY KEY (id)';
      RAISE NOTICE 'Primary key on students switched to (id).';
    ELSE
      -- Defer change; ensure a unique index on id instead
      IF NOT EXISTS (
        SELECT 1 FROM pg_indexes WHERE schemaname = current_schema() AND indexname = 'idx_students_id_unique'
      ) THEN
        EXECUTE 'CREATE UNIQUE INDEX idx_students_id_unique ON students(id)';
      END IF;
      RAISE NOTICE 'Skipped switching students primary key (student_id still PK) because % foreign key(s) depend on it. Unique index on id ensured instead.', dependent_fk_count;
    END IF;
  ELSE
    -- If PK already on id or table empty of PK (unlikely), ensure constraint exists
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conrelid = 'students'::regclass AND contype = 'p'
    ) THEN
      EXECUTE 'ALTER TABLE students ADD CONSTRAINT students_pkey PRIMARY KEY (id)';
    END IF;
  END IF;
END$$;

-- Enforce not nulls after backfill
ALTER TABLE students
  ALTER COLUMN first_name SET NOT NULL,
  ALTER COLUMN last_name SET NOT NULL;

-- Optional: keep legacy columns for now (student_id, full_name, grade_level). Remove manually later if desired.

-- Schema organization for production readiness (idempotent and safe)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'auth') THEN
    EXECUTE 'CREATE SCHEMA auth';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'discipline') THEN
    EXECUTE 'CREATE SCHEMA discipline';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'communication') THEN
    EXECUTE 'CREATE SCHEMA communication';
  END IF;
END$$;

-- Move tables into their target schemas without breaking existing code paths
DO $$
DECLARE
  auth_tables TEXT[] := ARRAY['accounts','password_reset_tokens','password_reset_token'];
  discipline_tables TEXT[] := ARRAY['students','violations','violation','past_offenses','appeals'];
  communication_tables TEXT[] := ARRAY['messages','message_logs'];
  tbl TEXT;
  app_user TEXT := current_user;
  target_schema TEXT;
BEGIN
  FOREACH tbl IN ARRAY auth_tables LOOP
    IF to_regclass('auth.' || tbl) IS NULL AND to_regclass('public.' || tbl) IS NOT NULL THEN
      target_schema := 'auth';
      BEGIN
        EXECUTE format('ALTER TABLE %I.%I OWNER TO %I', 'public', tbl, app_user);
      EXCEPTION WHEN others THEN
        RAISE NOTICE 'Could not change owner of %.%: %', 'public', tbl, SQLERRM;
      END;
      BEGIN
        EXECUTE format('ALTER TABLE %I.%I SET SCHEMA %I', 'public', tbl, target_schema);
        RAISE NOTICE 'Moved %.% to %', 'public', tbl, target_schema;
      EXCEPTION WHEN others THEN
        RAISE NOTICE 'Failed to move %.% to %: %', 'public', tbl, target_schema, SQLERRM;
      END;
    END IF;
  END LOOP;

  FOREACH tbl IN ARRAY discipline_tables LOOP
    IF to_regclass('discipline.' || tbl) IS NULL AND to_regclass('public.' || tbl) IS NOT NULL THEN
      target_schema := 'discipline';
      BEGIN
        EXECUTE format('ALTER TABLE %I.%I OWNER TO %I', 'public', tbl, app_user);
      EXCEPTION WHEN others THEN
        RAISE NOTICE 'Could not change owner of %.%: %', 'public', tbl, SQLERRM;
      END;
      BEGIN
        EXECUTE format('ALTER TABLE %I.%I SET SCHEMA %I', 'public', tbl, target_schema);
        RAISE NOTICE 'Moved %.% to %', 'public', tbl, target_schema;
      EXCEPTION WHEN others THEN
        RAISE NOTICE 'Failed to move %.% to %: %', 'public', tbl, target_schema, SQLERRM;
      END;
    END IF;
  END LOOP;

  FOREACH tbl IN ARRAY communication_tables LOOP
    IF to_regclass('communication.' || tbl) IS NULL AND to_regclass('public.' || tbl) IS NOT NULL THEN
      target_schema := 'communication';
      BEGIN
        EXECUTE format('ALTER TABLE %I.%I OWNER TO %I', 'public', tbl, app_user);
      EXCEPTION WHEN others THEN
        RAISE NOTICE 'Could not change owner of %.%: %', 'public', tbl, SQLERRM;
      END;
      BEGIN
        EXECUTE format('ALTER TABLE %I.%I SET SCHEMA %I', 'public', tbl, target_schema);
        RAISE NOTICE 'Moved %.% to %', 'public', tbl, target_schema;
      EXCEPTION WHEN others THEN
        RAISE NOTICE 'Failed to move %.% to %: %', 'public', tbl, target_schema, SQLERRM;
      END;
    END IF;
  END LOOP;
END$$;

-- Keep implicit SELECT * queries working by updating the database and role search_path
DO $$
DECLARE
  db_name TEXT := current_database();
  app_user TEXT := current_user;
BEGIN
  BEGIN
    EXECUTE format('ALTER DATABASE %I SET search_path = auth, discipline, communication, public', db_name);
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'Could not alter database search_path (insufficient privileges).';
  END;

  BEGIN
    EXECUTE format('ALTER ROLE %I IN DATABASE %I SET search_path = auth, discipline, communication, public', app_user, db_name);
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'Could not alter role search_path (insufficient privileges).';
  END;
END$$;

DO $$
DECLARE
  app_user TEXT := current_user;
BEGIN
  BEGIN
    EXECUTE format('GRANT USAGE ON SCHEMA auth TO %I', app_user);
    EXECUTE format('GRANT USAGE ON SCHEMA discipline TO %I', app_user);
    EXECUTE format('GRANT USAGE ON SCHEMA communication TO %I', app_user);
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'Could not grant schema usage to % for user % (insufficient privileges).', 'auth/discipline/communication', app_user;
  END;

  BEGIN
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA auth TO %I', app_user);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA discipline TO %I', app_user);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA communication TO %I', app_user);
    EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA auth GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO %I', app_user);
    EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA discipline GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO %I', app_user);
    EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA communication GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO %I', app_user);
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'Could not grant table privileges or default privileges to % (insufficient privileges).', app_user;
  END;
END$$;
-- Recreate violation_stats view using the relocated violations table if available
DO $$
BEGIN
  IF to_regclass('discipline.violations') IS NOT NULL THEN
    EXECUTE $$
      CREATE OR REPLACE VIEW violation_stats AS
      SELECT
        student_id,
        offense_type AS violation_type,
        COUNT(*) AS count
      FROM discipline.violations
      WHERE offense_type IS NOT NULL AND student_id IS NOT NULL
      GROUP BY student_id, offense_type
    $$;
  ELSIF to_regclass('public.violations') IS NOT NULL THEN
    EXECUTE $$
      CREATE OR REPLACE VIEW violation_stats AS
      SELECT
        student_id,
        offense_type AS violation_type,
        COUNT(*) AS count
      FROM public.violations
      WHERE offense_type IS NOT NULL AND student_id IS NOT NULL
      GROUP BY student_id, offense_type
    $$;
  END IF;
END$$;
`;
  await query(sql);
  console.log('Migration complete');
}

// If invoked directly via: node src/migrate.js
if (import.meta.url === `file://${process.argv[1]}`) {
  runMigrations().catch(e => {
    console.error('Migration failed', e);
    process.exit(1);
  });
}
