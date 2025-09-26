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
DO $$
BEGIN
  -- Drop old primary key on student_id if exists
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'students'::regclass AND contype = 'p'
      AND conname = 'students_pkey'
  ) THEN
    BEGIN
      -- Check if current PK uses student_id; if so drop
      IF EXISTS (
        SELECT 1 FROM pg_attribute a
        JOIN pg_index i ON i.indrelid = a.attrelid AND a.attnum = ANY(i.indkey)
        WHERE i.indrelid = 'students'::regclass AND i.indisprimary AND a.attname = 'student_id'
      ) THEN
        ALTER TABLE students DROP CONSTRAINT students_pkey;
      END IF;
    END;
  END IF;
END$$;

-- Recreate PK on id if not already
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'students'::regclass AND contype = 'p'
      AND conname = 'students_pkey') THEN
    ALTER TABLE students ADD CONSTRAINT students_pkey PRIMARY KEY (id);
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
