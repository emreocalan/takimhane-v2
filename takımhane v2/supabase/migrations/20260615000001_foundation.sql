-- ============================================================
-- 001 FOUNDATION: facilities, roles, permissions, profiles, lookup_codes
-- ============================================================

create extension if not exists "pgcrypto";

-- Updated_at trigger helper (used throughout)
create or replace function public.handle_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ── Tesis ──────────────────────────────────────────────────
create table public.facilities (
  id              uuid primary key default gen_random_uuid(),
  code            text not null unique,
  name            text not null,
  address         text,
  as9100_cert_no  text,
  is_active       boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create trigger facilities_updated_at
  before update on public.facilities
  for each row execute function public.handle_updated_at();

-- ── Roller ────────────────────────────────────────────────
create table public.roles (
  id          uuid primary key default gen_random_uuid(),
  name        text not null unique,   -- admin | supervisor | operator | quality | readonly
  label       text not null,
  is_system   boolean not null default false,
  created_at  timestamptz not null default now()
);

-- ── İzinler (modül × aksiyon matrisi) ─────────────────────
create table public.permissions (
  id      uuid primary key default gen_random_uuid(),
  module  text not null,
  action  text not null,
  label   text not null,
  constraint permissions_module_action_uq unique (module, action)
);

create table public.role_permissions (
  role_id       uuid not null references public.roles(id) on delete cascade,
  permission_id uuid not null references public.permissions(id) on delete cascade,
  primary key (role_id, permission_id)
);

-- ── Kullanıcı profilleri (auth.users extend) ───────────────
create table public.profiles (
  id            uuid primary key references auth.users(id) on delete cascade,
  facility_id   uuid references public.facilities(id),
  employee_no   text,
  full_name     text not null,
  role_id       uuid references public.roles(id),
  shift         text check (shift in ('morning', 'afternoon', 'night', 'flexible')),
  rfid_card_no  text unique,
  pin_hash      text,
  status        text not null default 'active' check (status in ('active', 'on_leave', 'inactive')),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create trigger profiles_updated_at
  before update on public.profiles
  for each row execute function public.handle_updated_at();

-- ── Kod listeleri (admin panelden özelleştirilebilir) ───────
create table public.lookup_codes (
  id                  uuid primary key default gen_random_uuid(),
  category            text not null,   -- checkout_reason | scrap_reason | tool_status | machine_status | ncr_reason
  code                text not null,
  label               text not null,
  display_order       int not null default 0,
  is_system_reserved  boolean not null default false,
  is_active           boolean not null default true,
  facility_id         uuid references public.facilities(id),  -- null = global
  created_at          timestamptz not null default now()
);

-- Partial unique indexes for nullable facility_id
create unique index lookup_codes_global_uq
  on public.lookup_codes(category, code) where facility_id is null;
create unique index lookup_codes_facility_uq
  on public.lookup_codes(category, code, facility_id) where facility_id is not null;
