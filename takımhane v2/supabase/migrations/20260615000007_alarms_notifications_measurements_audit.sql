-- ============================================================
-- 007 ALARMS, NOTIFICATIONS, MEASUREMENTS, AUDIT LOG
-- ============================================================

-- ── Alarm eşik değerleri (tesis bazında, Edge Function okur) ──
create table public.alarm_thresholds (
  id              uuid primary key default gen_random_uuid(),
  facility_id     uuid references public.facilities(id),  -- null = global
  threshold_key   text not null,
  label           text not null,
  value_number    numeric,
  value_text      text,
  unit            text,   -- 'days' | 'hours' | 'pct' | 'ratio'
  updated_by      uuid references public.profiles(id),
  updated_at      timestamptz not null default now()
);

create unique index alarm_thresholds_global_uq
  on public.alarm_thresholds(threshold_key) where facility_id is null;
create unique index alarm_thresholds_facility_uq
  on public.alarm_thresholds(facility_id, threshold_key) where facility_id is not null;

-- ── Alarm olayları (Edge Function + pg_cron üretir) ─────────
create table public.alarm_events (
  id            uuid primary key default gen_random_uuid(),
  facility_id   uuid not null references public.facilities(id),
  alarm_type    text not null,
  severity      text not null check (severity in ('critical', 'warning', 'info')),
  entity_type   text,
  entity_id     uuid,
  title         text not null,
  body          text,
  is_read       boolean not null default false,
  read_by       uuid references public.profiles(id),
  read_at       timestamptz,
  is_resolved   boolean not null default false,
  resolved_by   uuid references public.profiles(id),
  resolved_at   timestamptz,
  created_at    timestamptz not null default now()
);

-- ── Bildirim şablonları (DB'de — geliştirici müdahalesi olmadan admin düzenler) ──
create table public.notification_templates (
  id                uuid primary key default gen_random_uuid(),
  alarm_type        text not null,
  channel           text not null check (channel in ('email', 'in_app', 'sms')),
  subject_template  text,
  body_template     text not null,
  target_roles      text[] not null default '{}',
  is_active         boolean not null default true,
  updated_by        uuid references public.profiles(id),
  updated_at        timestamptz not null default now(),
  constraint notification_templates_type_channel_uq unique (alarm_type, channel)
);

-- ── Presetter ölçümleri (E460N — GKK / SETUP / CHECKIN) ─────
create table public.tool_measurements (
  id                uuid primary key default gen_random_uuid(),
  facility_id       uuid not null references public.facilities(id),
  instance_id       uuid references public.tool_instances(id),
  wo_id             uuid references public.work_orders(id),
  measured_at       timestamptz not null default now(),
  context           text not null check (context in ('GKK', 'SETUP', 'CHECKIN')),
  pot_number        int,
  length_mm         numeric(8,3),
  diameter_mm       numeric(8,3),
  r2_mm             numeric(8,3),
  delta_length_mm   numeric(8,3),    -- giriş vs çıkış farkı (CHECKIN)
  delta_diameter_mm numeric(8,3),
  result            text check (result in ('PASS', 'CONDITIONAL', 'FAIL')),
  approved_by       uuid references public.profiles(id),
  source_file       text,   -- 'TI-0047.H'
  notes             text,
  created_at        timestamptz not null default now()
);

-- ── Denetim izi (silinemez, değiştirilemez — 10 yıl zorunlu) ──
create table public.audit_logs (
  id            uuid primary key default gen_random_uuid(),
  facility_id   uuid references public.facilities(id),
  actor_id      uuid references public.profiles(id),
  actor_name    text,    -- denormalize: kullanıcı silinse bile kayıt kalsın
  module        text not null,
  action        text not null,
  entity_type   text not null,
  entity_id     uuid,
  entity_label  text,   -- barkod, WO kodu gibi insan-okunur tanımlayıcı
  old_values    jsonb,
  new_values    jsonb,
  ip_address    inet,
  user_agent    text,
  created_at    timestamptz not null default now()
);

-- Audit log değiştirilemez / silinemez
create rule no_delete_audit_logs as on delete to public.audit_logs do instead nothing;
create rule no_update_audit_logs as on update to public.audit_logs do instead nothing;
