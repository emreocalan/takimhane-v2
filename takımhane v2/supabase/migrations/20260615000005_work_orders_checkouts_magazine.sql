-- ============================================================
-- 005 OPERATIONS: work_orders, wo_tool_items, checkouts, magazine_slots, shift_handover_notes
-- ============================================================

-- ── İş Emirleri (tüm sistemi birbirine bağlayan merkezi entity) ──
create table public.work_orders (
  id                    uuid primary key default gen_random_uuid(),
  facility_id           uuid not null references public.facilities(id),
  wo_code               text not null,
  part_no               text,
  part_name             text,
  customer_project      text,
  nc_program_ref        text,
  machine_id            uuid references public.magazine_machines(id),
  assigned_operator_id  uuid references public.profiles(id),
  planned_setup_at      timestamptz,
  status                text not null default 'planned' check (status in (
    'planned', 'preparation', 'magazine_comparison', 'measurement', 'checkout', 'active', 'completed', 'cancelled'
  )),
  is_quick_wo           boolean not null default false,   -- "Hızlı WO Oluştur" ile oluşturulduysa
  notes                 text,
  completed_at          timestamptz,
  created_by            uuid references public.profiles(id),
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  constraint work_orders_facility_code_uq unique (facility_id, wo_code)
);

create trigger work_orders_updated_at
  before update on public.work_orders
  for each row execute function public.handle_updated_at();

-- ── WO takım kalemleri (pot numarası ile) ───────────────────
create table public.wo_tool_items (
  id                    uuid primary key default gen_random_uuid(),
  wo_id                 uuid not null references public.work_orders(id) on delete cascade,
  definition_id         uuid not null references public.tool_definitions(id),
  instance_id           uuid references public.tool_instances(id),
  pot_number            int,
  quantity              int not null default 1,
  nominal_length_mm     numeric(8,3),
  nominal_diameter_mm   numeric(8,3),
  measured_length_mm    numeric(8,3),
  measured_diameter_mm  numeric(8,3),
  measurement_result    text check (measurement_result in ('PASS', 'CONDITIONAL', 'FAIL', 'PENDING')),
  magazine_status       text check (magazine_status in ('keep', 'replace', 'empty_slot', 'life_critical')),
  checkout_status       text not null default 'pending' check (checkout_status in ('pending', 'checked_out', 'returned', 'skipped')),
  notes                 text,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create trigger wo_tool_items_updated_at
  before update on public.wo_tool_items
  for each row execute function public.handle_updated_at();

-- ── Checkout (tek servis katmanı — tüm modüller bunu çağırır) ──
create table public.checkouts (
  id                uuid primary key default gen_random_uuid(),
  facility_id       uuid not null references public.facilities(id),
  instance_id       uuid not null references public.tool_instances(id),
  wo_id             uuid references public.work_orders(id),          -- ZORUNLU (geçici hariç)
  wo_item_id        uuid references public.wo_tool_items(id),
  checkout_type     text not null check (checkout_type in ('wo_setup', 'quick', 'temporary')),
  machine_id        uuid references public.magazine_machines(id),
  pot_number        int,
  checked_out_by    uuid not null references public.profiles(id),
  checkout_at       timestamptz not null default now(),
  reason_code       text,   -- lookup_codes.category = 'checkout_reason'
  checked_in_by     uuid references public.profiles(id),
  checkin_at        timestamptz,
  checkin_condition text check (checkin_condition in ('good', 'worn', 'damaged', 'broken')),
  usage_minutes     numeric(10,2),
  usage_parts       int,
  is_open           boolean not null default true,
  is_temporary      boolean not null default false,
  notes             text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create trigger checkouts_updated_at
  before update on public.checkouts
  for each row execute function public.handle_updated_at();

-- ── Magazin slot durumları (sadece M10 yazar) ───────────────
create table public.magazine_slots (
  id                uuid primary key default gen_random_uuid(),
  facility_id       uuid not null references public.facilities(id),
  machine_id        uuid not null references public.magazine_machines(id),
  pot_number        int not null,
  instance_id       uuid references public.tool_instances(id),
  assigned_wo_id    uuid references public.work_orders(id),
  status            text not null default 'empty' check (status in ('occupied', 'empty', 'reserved')),
  life_pct_at_load  numeric(5,2),
  loaded_at         timestamptz,
  loaded_by         uuid references public.profiles(id),
  updated_at        timestamptz not null default now(),
  constraint magazine_slots_machine_pot_uq unique (machine_id, pot_number)
);

-- ── Vardiya devir teslim notları (M10) ──────────────────────
create table public.shift_handover_notes (
  id          uuid primary key default gen_random_uuid(),
  facility_id uuid not null references public.facilities(id),
  machine_id  uuid references public.magazine_machines(id),
  author_id   uuid not null references public.profiles(id),
  shift       text check (shift in ('morning', 'afternoon', 'night')),
  note_date   date not null default current_date,
  content     text not null,
  created_at  timestamptz not null default now()
);
