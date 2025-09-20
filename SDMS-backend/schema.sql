-- Minimal schema to get started. Extend with your domain entities later.

create table if not exists students (
  id bigserial primary key,
  first_name text not null,
  last_name text not null,
  grade text,
  section text,
  created_at timestamptz default now()
);
