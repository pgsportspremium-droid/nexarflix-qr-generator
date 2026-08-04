-- Execute uma vez no SQL Editor do Supabase.
-- É seguro rodar mesmo após criar a tabela pelo Table Editor.

alter table public.companies
  add column if not exists updated_at timestamptz default now(),
  add column if not exists last_access_at timestamptz;

create unique index if not exists companies_code_unique
  on public.companies (code);

alter table public.companies
  alter column id set default gen_random_uuid(),
  alter column hits set default 0,
  alter column created_at set default now();

alter table public.companies
  alter column name set not null,
  alter column code set not null,
  alter column destination set not null,
  alter column hits set not null;
