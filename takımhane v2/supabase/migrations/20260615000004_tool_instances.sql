-- ============================================================
-- 004 PHYSICAL INVENTORY: tool_instances, tool_instance_attributes
-- ============================================================

-- ── Fiziksel takımlar (ToolInstance — dinamik) ───────────────
create table public.tool_instances (
  id                        uuid primary key default gen_random_uuid(),
  facility_id               uuid not null references public.facilities(id),
  definition_id             uuid not null references public.tool_definitions(id),
  barcode                   text not null unique,
  serial_no                 text,
  lot_no                    text,
  coc_no                    text,                  -- Certificate of Conformance
  supplier_cert_url         text,
  status                    text not null default 'available' check (status in (
    'available', 'checked_out', 'calibration', 'regrind', 'quarantine', 'scrapped'
  )),
  location_id               uuid references public.storage_locations(id),
  -- Ömür takibi
  cumulative_usage_minutes  numeric(12,2) not null default 0,
  cumulative_usage_parts    int not null default 0,
  life_remaining_pct        numeric(5,2),
  regrind_count             int not null default 0,
  max_regrind_count         int,
  -- Presetter son ölçüm (watcher günceller)
  last_length_mm            numeric(8,3),
  last_diameter_mm          numeric(8,3),
  last_measured_at          timestamptz,
  last_measurement_result   text check (last_measurement_result in ('PASS', 'CONDITIONAL', 'FAIL')),
  -- Kalibrasyon
  next_calibration_date     date,
  received_at               timestamptz not null default now(),
  created_by                uuid references public.profiles(id),
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now()
);

create trigger tool_instances_updated_at
  before update on public.tool_instances
  for each row execute function public.handle_updated_at();

-- ── Instance attribute değerleri (EAV değerleri) ────────────
create table public.tool_instance_attributes (
  id                        uuid primary key default gen_random_uuid(),
  instance_id               uuid not null references public.tool_instances(id) on delete cascade,
  attribute_definition_id   uuid not null references public.tool_type_attribute_definitions(id),
  value_text                text,
  value_number              numeric,
  value_date                date,
  value_boolean             boolean,
  value_file_url            text,
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now(),
  constraint tia_instance_attr_uq unique (instance_id, attribute_definition_id)
);

create trigger tool_instance_attributes_updated_at
  before update on public.tool_instance_attributes
  for each row execute function public.handle_updated_at();
