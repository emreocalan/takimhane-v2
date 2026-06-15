-- ============================================================
-- 003 TOOL CATALOG: tool_types, attribute_definitions, tool_definitions, documents
-- ============================================================

-- ── Varlık tipleri (admin panelden dinamik) ─────────────────
create table public.tool_types (
  id                    uuid primary key default gen_random_uuid(),
  code                  text not null unique,
  name                  text not null,
  icon                  text,
  color                 text,
  allows_regrind        boolean not null default false,
  requires_calibration  boolean not null default false,
  is_active             boolean not null default true,
  is_system             boolean not null default false,
  display_order         int not null default 0,
  created_at            timestamptz not null default now()
);

-- ── Attribute tanımları — Hibrit EAV (admin panelinden alanlar eklenir) ──
create table public.tool_type_attribute_definitions (
  id                    uuid primary key default gen_random_uuid(),
  tool_type_id          uuid not null references public.tool_types(id) on delete cascade,
  field_key             text not null,
  field_label           text not null,
  field_type            text not null check (field_type in ('text', 'number', 'date', 'select', 'multiselect', 'boolean', 'file', 'barcode')),
  is_required           boolean not null default false,
  options               jsonb,           -- select / multiselect seçenekleri
  unit                  text,
  validation_rules      jsonb,
  display_order         int not null default 0,
  applies_to_definition boolean not null default true,   -- katalog seviye
  applies_to_instance   boolean not null default false,  -- fiziksel takım seviye
  created_at            timestamptz not null default now(),
  constraint ttad_type_key_uq unique (tool_type_id, field_key)
);

-- ── Takım tanımları / katalog (ToolDefinition — statik) ─────
create table public.tool_definitions (
  id                      uuid primary key default gen_random_uuid(),
  facility_id             uuid not null references public.facilities(id),
  tool_type_id            uuid not null references public.tool_types(id),
  internal_code           text not null,
  name                    text not null,
  iso_din_code            text,
  manufacturer            text,
  manufacturer_part_no    text,
  supplier_id             uuid references public.suppliers(id),
  nominal_length_mm       numeric(8,3),
  nominal_diameter_mm     numeric(8,3),
  length_tolerance_mm     numeric(6,3),
  diameter_tolerance_mm   numeric(6,3),
  theoretical_life_minutes  numeric(12,2),
  theoretical_life_parts    int,
  theoretical_life_meters   numeric(10,2),
  min_stock_level           int not null default 0,
  reorder_point             int not null default 0,
  image_url                 text,
  notes                     text,
  is_active                 boolean not null default true,
  created_by                uuid references public.profiles(id),
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now(),
  constraint tool_definitions_facility_code_uq unique (facility_id, internal_code)
);

create trigger tool_definitions_updated_at
  before update on public.tool_definitions
  for each row execute function public.handle_updated_at();

-- ── Teknik belgeler (PDF, çizim, katalog) ───────────────────
create table public.tool_definition_documents (
  id              uuid primary key default gen_random_uuid(),
  definition_id   uuid not null references public.tool_definitions(id) on delete cascade,
  document_type   text not null check (document_type in ('drawing', 'catalog', 'datasheet', 'certificate', 'other')),
  file_name       text not null,
  file_url        text not null,
  uploaded_by     uuid references public.profiles(id),
  created_at      timestamptz not null default now()
);
