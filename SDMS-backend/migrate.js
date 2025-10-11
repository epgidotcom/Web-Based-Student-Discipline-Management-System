import { query } from './db.js';

export async function runMigrations() {
  const sql = `
  BEGIN
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'sdms_discipline'
        AND table_name = 'students'
        AND column_name = 'full_name'
    ) THEN
      BEGIN
        EXECUTE $$
          UPDATE sdms_discipline.students
          SET first_name = COALESCE(first_name, NULLIF(split_part(full_name,' ',1),'')),
              last_name  = COALESCE(last_name,
                            CASE
                              WHEN full_name LIKE '% %' THEN split_part(full_name,' ', array_length(string_to_array(full_name,' '),1))
                              ELSE full_name
                            END)
          WHERE full_name IS NOT NULL
        $$;
      EXCEPTION WHEN undefined_column THEN
        RAISE NOTICE 'Skipped name backfill: column full_name missing';
      END;
    END IF;
  END$$;

  DO $$
  BEGIN
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'sdms_discipline'
        AND table_name = 'students'
        AND column_name = 'grade_level'
    ) THEN
      BEGIN
        EXECUTE $$
          UPDATE sdms_discipline.students
          SET grade = COALESCE(grade, grade_level)
          WHERE grade IS NULL
        $$;
      EXCEPTION WHEN undefined_column THEN
        RAISE NOTICE 'Skipped grade backfill: column grade_level missing';
      END;
    END IF;
  END$$;
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

ALTER TABLE students ADD COLUMN IF NOT EXISTS first_name TEXT;
ALTER TABLE students ADD COLUMN IF NOT EXISTS middle_name TEXT;
ALTER TABLE students ADD COLUMN IF NOT EXISTS last_name TEXT;
ALTER TABLE students ADD COLUMN IF NOT EXISTS birthdate DATE;
ALTER TABLE students ADD COLUMN IF NOT EXISTS age INTEGER;
ALTER TABLE students ADD COLUMN IF NOT EXISTS address TEXT;
ALTER TABLE students ADD COLUMN IF NOT EXISTS grade TEXT;
ALTER TABLE students ADD COLUMN IF NOT EXISTS parent_contact TEXT;

UPDATE students
SET first_name = COALESCE(first_name, NULLIF(split_part(full_name,' ',1),'')),
    last_name  = COALESCE(last_name,
                  CASE
                    WHEN full_name LIKE '% %' THEN split_part(full_name,' ', array_length(string_to_array(full_name,' '),1))
                    ELSE full_name
                  END)
WHERE full_name IS NOT NULL;

UPDATE students SET grade = COALESCE(grade, grade_level) WHERE grade IS NULL;

DO $$
DECLARE
  pk_on_student_id BOOLEAN := FALSE;
  pk_constraint_name TEXT;
  student_id_attnum INT;
  dependent_fk_count INT := 0;
BEGIN
  SELECT a.attnum INTO student_id_attnum
  FROM pg_attribute a
  WHERE a.attrelid = 'sdms_discipline.students'::regclass AND a.attname = 'student_id' AND a.attnum > 0;

  SELECT c.conname,
         EXISTS (
           SELECT 1 FROM pg_attribute a
           JOIN pg_index i ON i.indrelid = a.attrelid AND a.attnum = ANY(i.indkey)
           WHERE i.indrelid = 'sdms_discipline.students'::regclass
             AND i.indisprimary
             AND a.attname = 'student_id'
         )
  INTO pk_constraint_name, pk_on_student_id
  FROM pg_constraint c
  WHERE c.conrelid = 'sdms_discipline.students'::regclass AND c.contype = 'p'
  LIMIT 1;

  IF pk_on_student_id THEN
    IF student_id_attnum IS NOT NULL THEN
      SELECT COUNT(*) INTO dependent_fk_count
      FROM pg_constraint c
      WHERE c.contype = 'f'
        AND c.confrelid = 'sdms_discipline.students'::regclass
        AND student_id_attnum = ANY (c.confkey);
    END IF;

    IF dependent_fk_count = 0 THEN
      EXECUTE 'ALTER TABLE sdms_discipline.students DROP CONSTRAINT ' || quote_ident(pk_constraint_name);
      EXECUTE 'ALTER TABLE sdms_discipline.students ADD CONSTRAINT students_pkey PRIMARY KEY (id)';
    ELSE
      IF NOT EXISTS (
        SELECT 1 FROM pg_indexes WHERE schemaname = 'sdms_discipline' AND indexname = 'idx_students_id_unique'
      ) THEN
        EXECUTE 'CREATE UNIQUE INDEX idx_students_id_unique ON sdms_discipline.students(id)';
      END IF;
    END IF;
  ELSE
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conrelid = 'sdms_discipline.students'::regclass AND contype = 'p'
    ) THEN
      EXECUTE 'ALTER TABLE sdms_discipline.students ADD CONSTRAINT students_pkey PRIMARY KEY (id)';
    END IF;
  END IF;
END$$;

ALTER TABLE sdms_discipline.students
  ALTER COLUMN first_name SET NOT NULL,
  ALTER COLUMN last_name SET NOT NULL;

CREATE TABLE IF NOT EXISTS past_offenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_name TEXT NOT NULL,
  label TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_past_offenses_student_name ON past_offenses(student_name);

CREATE TABLE IF NOT EXISTS violations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_name TEXT NOT NULL,
  grade_section TEXT,
  offense_type TEXT,
  sanction TEXT,
  description TEXT,
  violation TEXT,
  incident_date DATE,
  evidence JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_violations_student_name ON violations(student_name);
CREATE INDEX IF NOT EXISTS idx_violations_incident_date ON violations(incident_date);
ALTER TABLE violations ADD COLUMN IF NOT EXISTS student_id UUID;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='sdms_discipline' AND table_name='violations' AND column_name='date'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='sdms_discipline' AND table_name='violations' AND column_name='incident_date'
  ) THEN
    EXECUTE 'ALTER TABLE sdms_discipline.violations RENAME COLUMN date TO incident_date';
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='sdms_discipline' AND table_name='violations' AND column_name='violation_type'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='sdms_discipline' AND table_name='violations' AND column_name='offense_type'
  ) THEN
    EXECUTE 'ALTER TABLE sdms_discipline.violations RENAME COLUMN violation_type TO offense_type';
  END IF;
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Skipped legacy rename(s): %', SQLERRM;
END$$;

DO $$
BEGIN
  UPDATE sdms_discipline.violations v
  SET student_id = s.id
  FROM sdms_discipline.students s
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

DO $$
BEGIN
  ALTER TABLE sdms_discipline.violations
    ADD CONSTRAINT violations_student_fk
    FOREIGN KEY (student_id) REFERENCES sdms_discipline.students(id)
    ON DELETE SET NULL;
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Could not add FK violations_student_fk (maybe already exists or data mismatch): %', SQLERRM;
END$$;

CREATE INDEX IF NOT EXISTS idx_violations_student_id ON violations(student_id);

SET search_path TO sdms_communication, sdms_auth, sdms_discipline, public;

-- Shared enum (lives in public namespace)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'appeal_status_type') THEN
    CREATE TYPE appeal_status_type AS ENUM ('Pending','Approved','Rejected');
  END IF;
END$$;

-- Communication schema tables
CREATE TABLE IF NOT EXISTS appeals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES sdms_auth.accounts(id) ON DELETE CASCADE,
  student_id UUID REFERENCES sdms_discipline.students(id) ON DELETE SET NULL,
  violation_id UUID REFERENCES sdms_discipline.violations(id) ON DELETE SET NULL,
  lrn TEXT,
  student_name TEXT NOT NULL,
  section TEXT,
  violation_title TEXT,
  reason TEXT NOT NULL,
  status appeal_status_type DEFAULT 'Pending',
  decision_notes TEXT,
  decided_by UUID REFERENCES sdms_auth.accounts(id) ON DELETE SET NULL,
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
  sender_account_id UUID REFERENCES sdms_auth.accounts(id) ON DELETE SET NULL,
  sender_role TEXT NOT NULL CHECK (sender_role IN ('Admin','Teacher','Student')),
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_appeal_messages_appeal ON appeal_messages(appeal_id);
CREATE INDEX IF NOT EXISTS idx_appeal_messages_created ON appeal_messages(created_at);

CREATE TABLE IF NOT EXISTS messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_account_id UUID NOT NULL REFERENCES sdms_auth.accounts(id) ON DELETE CASCADE,
  receiver_account_id UUID NOT NULL REFERENCES sdms_auth.accounts(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  read_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(sender_account_id, receiver_account_id);
CREATE INDEX IF NOT EXISTS idx_messages_created ON messages(created_at DESC);

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

SET search_path TO public, sdms_auth, sdms_discipline, sdms_communication;

DROP VIEW IF EXISTS violation_stats;

CREATE OR REPLACE VIEW violation_stats AS
SELECT
  student_id,
  offense_type AS violation_type,
  COUNT(*) AS count
FROM sdms_discipline.violations
WHERE offense_type IS NOT NULL AND student_id IS NOT NULL
GROUP BY student_id, offense_type;
`;
  runMigrations().catch(e => {
    console.error('Migration failed', e);
    process.exit(1);
  });
}
