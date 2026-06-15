-- ============================================================
-- 009 ROW LEVEL SECURITY
-- ============================================================

-- Yardımcı fonksiyonlar
create or replace function public.current_facility_id()
returns uuid language sql stable security definer as $$
  select facility_id from public.profiles where id = auth.uid();
$$;

create or replace function public.current_user_role()
returns text language sql stable security definer as $$
  select r.name
  from public.profiles p
  join public.roles r on r.id = p.role_id
  where p.id = auth.uid();
$$;

-- RLS aktif et
alter table public.facilities                     enable row level security;
alter table public.roles                          enable row level security;
alter table public.permissions                    enable row level security;
alter table public.role_permissions               enable row level security;
alter table public.profiles                       enable row level security;
alter table public.lookup_codes                   enable row level security;
alter table public.storage_locations              enable row level security;
alter table public.suppliers                      enable row level security;
alter table public.magazine_machines              enable row level security;
alter table public.tool_types                     enable row level security;
alter table public.tool_type_attribute_definitions enable row level security;
alter table public.tool_definitions               enable row level security;
alter table public.tool_definition_documents      enable row level security;
alter table public.tool_instances                 enable row level security;
alter table public.tool_instance_attributes       enable row level security;
alter table public.work_orders                    enable row level security;
alter table public.wo_tool_items                  enable row level security;
alter table public.checkouts                      enable row level security;
alter table public.magazine_slots                 enable row level security;
alter table public.shift_handover_notes           enable row level security;
alter table public.calibrations                   enable row level security;
alter table public.regrind_orders                 enable row level security;
alter table public.regrind_order_items            enable row level security;
alter table public.scrap_records                  enable row level security;
alter table public.alarm_thresholds               enable row level security;
alter table public.alarm_events                   enable row level security;
alter table public.notification_templates         enable row level security;
alter table public.tool_measurements              enable row level security;
alter table public.audit_logs                     enable row level security;

-- ── Facility ─────────────────────────────────────────────────
create policy "facility_select" on public.facilities
  for select to authenticated using (id = public.current_facility_id());

-- ── Global okuma (roller, izinler, tipler) ──────────────────
create policy "roles_select"        on public.roles        for select to authenticated using (true);
create policy "permissions_select"  on public.permissions  for select to authenticated using (true);
create policy "role_perms_select"   on public.role_permissions for select to authenticated using (true);
create policy "tool_types_select"   on public.tool_types   for select to authenticated using (true);
create policy "ttad_select"         on public.tool_type_attribute_definitions for select to authenticated using (true);
create policy "suppliers_select"    on public.suppliers    for select to authenticated using (true);
create policy "notif_tmpl_select"   on public.notification_templates for select to authenticated using (true);

-- ── Profiller ────────────────────────────────────────────────
create policy "profiles_select" on public.profiles
  for select to authenticated using (facility_id = public.current_facility_id());

create policy "profiles_update_self" on public.profiles
  for update to authenticated using (id = auth.uid());

-- ── Lookup codes (global + tesis) ───────────────────────────
create policy "lookup_select" on public.lookup_codes
  for select to authenticated
  using (facility_id is null or facility_id = public.current_facility_id());

-- ── Tesis-kapsamlı tablolar (read) ──────────────────────────
create policy "storage_loc_select"  on public.storage_locations  for select to authenticated using (facility_id = public.current_facility_id());
create policy "machines_select"     on public.magazine_machines   for select to authenticated using (facility_id = public.current_facility_id());
create policy "tool_def_select"     on public.tool_definitions    for select to authenticated using (facility_id = public.current_facility_id());
create policy "tool_inst_select"    on public.tool_instances      for select to authenticated using (facility_id = public.current_facility_id());
create policy "wo_select"           on public.work_orders         for select to authenticated using (facility_id = public.current_facility_id());
create policy "checkout_select"     on public.checkouts           for select to authenticated using (facility_id = public.current_facility_id());
create policy "mag_slots_select"    on public.magazine_slots      for select to authenticated using (facility_id = public.current_facility_id());
create policy "cal_select"          on public.calibrations        for select to authenticated using (facility_id = public.current_facility_id());
create policy "regrind_select"      on public.regrind_orders      for select to authenticated using (facility_id = public.current_facility_id());
create policy "scrap_select"        on public.scrap_records       for select to authenticated using (facility_id = public.current_facility_id());
create policy "alarm_ev_select"     on public.alarm_events        for select to authenticated using (facility_id = public.current_facility_id());
create policy "alarm_thr_select"    on public.alarm_thresholds    for select to authenticated using (facility_id is null or facility_id = public.current_facility_id());
create policy "measurements_select" on public.tool_measurements   for select to authenticated using (facility_id = public.current_facility_id());
create policy "audit_select"        on public.audit_logs          for select to authenticated using (facility_id = public.current_facility_id());
create policy "handover_select"     on public.shift_handover_notes for select to authenticated using (facility_id = public.current_facility_id());

-- ── Join üzerinden okuma ─────────────────────────────────────
create policy "woti_select" on public.wo_tool_items for select to authenticated
  using (wo_id in (select id from public.work_orders where facility_id = public.current_facility_id()));

create policy "tia_select" on public.tool_instance_attributes for select to authenticated
  using (instance_id in (select id from public.tool_instances where facility_id = public.current_facility_id()));

create policy "tdd_select" on public.tool_definition_documents for select to authenticated
  using (definition_id in (select id from public.tool_definitions where facility_id = public.current_facility_id()));

create policy "roi_select" on public.regrind_order_items for select to authenticated
  using (regrind_order_id in (select id from public.regrind_orders where facility_id = public.current_facility_id()));

-- ── Yazma — Operatör ve üstü ────────────────────────────────
create policy "tool_inst_write" on public.tool_instances for all to authenticated
  using (facility_id = public.current_facility_id() and public.current_user_role() in ('admin','supervisor','operator'));

create policy "checkout_write" on public.checkouts for all to authenticated
  using (facility_id = public.current_facility_id() and public.current_user_role() in ('admin','supervisor','operator'));

create policy "wo_write" on public.work_orders for all to authenticated
  using (facility_id = public.current_facility_id() and public.current_user_role() in ('admin','supervisor','operator'));

create policy "mag_slots_write" on public.magazine_slots for all to authenticated
  using (facility_id = public.current_facility_id() and public.current_user_role() in ('admin','supervisor','operator'));

create policy "handover_write" on public.shift_handover_notes for all to authenticated
  using (facility_id = public.current_facility_id() and public.current_user_role() in ('admin','supervisor','operator'));

-- ── Yazma — Kalite ve üstü ──────────────────────────────────
create policy "cal_write" on public.calibrations for all to authenticated
  using (facility_id = public.current_facility_id() and public.current_user_role() in ('admin','supervisor','quality'));

create policy "scrap_write" on public.scrap_records for all to authenticated
  using (facility_id = public.current_facility_id() and public.current_user_role() in ('admin','supervisor','quality'));

create policy "regrind_write" on public.regrind_orders for all to authenticated
  using (facility_id = public.current_facility_id() and public.current_user_role() in ('admin','supervisor','quality'));

-- ── Yazma — Supervisor ve üstü ──────────────────────────────
create policy "tool_def_write"  on public.tool_definitions   for all to authenticated
  using (facility_id = public.current_facility_id() and public.current_user_role() in ('admin','supervisor'));

create policy "storage_write"   on public.storage_locations  for all to authenticated
  using (facility_id = public.current_facility_id() and public.current_user_role() in ('admin','supervisor'));

-- ── Yazma — Sadece Admin ─────────────────────────────────────
create policy "machines_write"  on public.magazine_machines   for all to authenticated
  using (facility_id = public.current_facility_id() and public.current_user_role() = 'admin');

create policy "suppliers_write" on public.suppliers for all to authenticated
  using (public.current_user_role() = 'admin');

create policy "alarm_thr_write" on public.alarm_thresholds for all to authenticated
  using (public.current_user_role() = 'admin');
