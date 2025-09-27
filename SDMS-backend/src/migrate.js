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
  violation_type TEXT,
  sanction TEXT,
  description TEXT,
  violation TEXT, -- legacy single-field (optional)
  date DATE,
  evidence JSONB, -- array of data URL strings (base64) or future structured refs
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_violations_student_name ON violations(student_name);
CREATE INDEX IF NOT EXISTS idx_violations_date ON violations(date);

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

-- View for frontend to easily detect repeat violation counts per student & type
CREATE OR REPLACE VIEW violation_stats AS
SELECT
  student_id,
  violation_type,
  COUNT(*) AS count
FROM violations
WHERE violation_type IS NOT NULL AND student_id IS NOT NULL
GROUP BY student_id, violation_type;

-- SMS logs
CREATE TABLE IF NOT EXISTS sms_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone TEXT NOT NULL,
  message TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Students (idempotent evolution)
CREATE TABLE IF NOT EXISTS students (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lrn TEXT UNIQUE,
  first_name TEXT NOT NULL,
  middle_name TEXT,
  last_name TEXT NOT NULL,
  birthdate DATE,
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
