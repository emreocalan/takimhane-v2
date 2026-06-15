-- ============================================================
-- 002 INFRASTRUCTURE: storage_locations, suppliers, magazine_machines
-- ============================================================

-- ── Depo lokasyonları (Bölge → Dolap → Raf → Göz) ─────────
create table public.storage_locations (
  id              uuid primary key default gen_random_uuid(),
  facility_id     uuid not null references public.facilities(id),
  parent_id       uuid references public.storage_locations(id),
  level           text not null check (level in ('region', 'cabinet', 'shelf', 'slot')),
  code            text not null,
  name            text,
  location_type   text check (location_type in ('cutting_tool', 'gauge', 'fixture', 'consumable', 'mixed')),
  capacity        int,
  is_active       boolean not null default true,
  created_at      timestamptz not null default now(),
  constraint storage_locations_facility_code_uq unique (facility_id, code)
);

-- ── Tedarikçiler & ASL ──────────────────────────────────────
create table public.suppliers (
  id                  uuid primary key default gen_random_uuid(),
  code                text not null unique,
  name                text not null,
  supplier_types      text[] not null default '{}',  -- tool_vendor | regrinder | calibration_lab
  is_as9100_approved  boolean not null default false,
  approval_status     text not null default 'active' check (approval_status in ('active', 'suspended', 'pending')),
  turkak_accred_no    text,   -- ISO/IEC 17025 akreditasyon no
  contact_phone       text,
  contact_email       text,
  address             text,
  avg_delivery_days   int,
  notes               text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create trigger suppliers_updated_at
  before update on public.suppliers
  for each row execute function public.handle_updated_at();

-- ── CNC Tezgahları ──────────────────────────────────────────
create table public.magazine_machines (
  id                    uuid primary key default gen_random_uuid(),
  facility_id           uuid not null references public.facilities(id),
  code                  text not null,
  name                  text not null,
  machine_type          text not null check (machine_type in ('vmc', 'hmc', 'lathe', 'grinding', 'edm', 'other')),
  brand                 text,
  model                 text,
  magazine_capacity     int not null default 30,
  tool_connection_type  text check (tool_connection_type in ('bt30', 'bt40', 'bt50', 'hsk_a63', 'cat40', 'other')),
  max_tool_diameter_mm  numeric(6,1),
  max_tool_length_mm    numeric(6,1),
  location_area         text,
  status                text not null default 'active' check (status in ('active', 'maintenance', 'fault', 'passive')),
  dnc_ip                text,
  dnc_port              int,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  constraint magazine_machines_facility_code_uq unique (facility_id, code)
);

create trigger magazine_machines_updated_at
  before update on public.magazine_machines
  for each row execute function public.handle_updated_at();
