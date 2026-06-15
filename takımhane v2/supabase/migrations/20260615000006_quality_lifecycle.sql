-- ============================================================
-- 006 QUALITY LIFECYCLE: calibrations, regrind_orders, scrap_records
-- ============================================================

-- ── Kalibrasyon (AS9100 Kırılım #6 — en yüksek Major NC riski) ──
create table public.calibrations (
  id                    uuid primary key default gen_random_uuid(),
  facility_id           uuid not null references public.facilities(id),
  instance_id           uuid not null references public.tool_instances(id),
  lab_supplier_id       uuid references public.suppliers(id),
  ume_ref_no            text,   -- Ulusal izlenebilirlik referansı (UME/NIST)
  calibration_date      date,
  next_calibration_date date,
  interval_days         int not null default 365,
  certificate_no        text,
  certificate_url       text,
  result                text check (result in ('pass', 'fail', 'conditional')),
  sent_at               timestamptz,
  returned_at           timestamptz,
  ncr_triggered         boolean not null default false,
  performed_by          uuid references public.profiles(id),
  approved_by           uuid references public.profiles(id),
  notes                 text,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create trigger calibrations_updated_at
  before update on public.calibrations
  for each row execute function public.handle_updated_at();

-- ── Bileme siparişleri (Yenileme Sekmesi) ───────────────────
create table public.regrind_orders (
  id            uuid primary key default gen_random_uuid(),
  facility_id   uuid not null references public.facilities(id),
  regrinder_id  uuid references public.suppliers(id),
  sent_at       date,
  deadline_date date,
  returned_at   date,
  status        text not null default 'preparing' check (status in (
    'preparing', 'sent', 'at_regrinder', 'returned', 'cancelled'
  )),
  cost          numeric(10,2),
  notes_before  text,
  notes_after   text,
  created_by    uuid references public.profiles(id),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create trigger regrind_orders_updated_at
  before update on public.regrind_orders
  for each row execute function public.handle_updated_at();

-- ── Bileme siparişi kalemleri ────────────────────────────────
create table public.regrind_order_items (
  id                  uuid primary key default gen_random_uuid(),
  regrind_order_id    uuid not null references public.regrind_orders(id) on delete cascade,
  instance_id         uuid not null references public.tool_instances(id),
  result              text check (result in ('success', 'scrap')),
  life_restored_pct   numeric(5,2),
  regrind_count_after int,
  notes               text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create trigger regrind_order_items_updated_at
  before update on public.regrind_order_items
  for each row execute function public.handle_updated_at();

-- ── Bertaraf kayıtları (silinemez — min. 10 yıl arşiv) ──────
create table public.scrap_records (
  id              uuid primary key default gen_random_uuid(),
  facility_id     uuid not null references public.facilities(id),
  instance_id     uuid not null references public.tool_instances(id),
  reason_code     text not null,  -- lookup_codes.category = 'scrap_reason'
  proposed_by     uuid references public.profiles(id),
  proposed_at     timestamptz not null default now(),
  approved_by     uuid references public.profiles(id),
  approved_at     timestamptz,
  photo_urls      text[] not null default '{}',
  wo_id           uuid references public.work_orders(id),
  is_locked       boolean not null default false,   -- dijital kilit: onayda true
  notes           text,
  created_at      timestamptz not null default now()
);

-- Bertaraf kaydı onaylandıktan sonra değiştirilemez
create rule no_update_locked_scrap as
  on update to public.scrap_records
  where old.is_locked = true
  do instead nothing;
