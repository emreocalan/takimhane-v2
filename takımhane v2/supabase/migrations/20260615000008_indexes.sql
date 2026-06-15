-- ============================================================
-- 008 PERFORMANCE INDEXES
-- ============================================================

-- profiles
create index idx_profiles_facility   on public.profiles(facility_id);
create index idx_profiles_role       on public.profiles(role_id);
create index idx_profiles_status     on public.profiles(status);

-- storage_locations
create index idx_storage_loc_facility on public.storage_locations(facility_id);
create index idx_storage_loc_parent   on public.storage_locations(parent_id);

-- tool_definitions
create index idx_tool_def_facility  on public.tool_definitions(facility_id);
create index idx_tool_def_type      on public.tool_definitions(tool_type_id);
create index idx_tool_def_supplier  on public.tool_definitions(supplier_id);
create index idx_tool_def_active    on public.tool_definitions(is_active);

-- tool_instances (en sık sorgulanan tablo)
create index idx_ti_barcode         on public.tool_instances(barcode);
create index idx_ti_definition      on public.tool_instances(definition_id);
create index idx_ti_status          on public.tool_instances(status);
create index idx_ti_facility        on public.tool_instances(facility_id);
create index idx_ti_location        on public.tool_instances(location_id);
create index idx_ti_next_cal        on public.tool_instances(next_calibration_date);
create index idx_ti_life_pct        on public.tool_instances(life_remaining_pct);

-- work_orders
create index idx_wo_facility        on public.work_orders(facility_id);
create index idx_wo_status          on public.work_orders(status);
create index idx_wo_machine         on public.work_orders(machine_id);
create index idx_wo_code            on public.work_orders(wo_code);
create index idx_wo_planned_setup   on public.work_orders(planned_setup_at);

-- wo_tool_items
create index idx_woti_wo            on public.wo_tool_items(wo_id);
create index idx_woti_instance      on public.wo_tool_items(instance_id);

-- checkouts (açık zimmet sorguları kritik)
create index idx_co_instance        on public.checkouts(instance_id);
create index idx_co_open            on public.checkouts(is_open) where is_open = true;
create index idx_co_wo              on public.checkouts(wo_id);
create index idx_co_facility        on public.checkouts(facility_id);
create index idx_co_checked_out_by  on public.checkouts(checked_out_by);
create index idx_co_checkout_at     on public.checkouts(checkout_at desc);

-- magazine_slots
create index idx_ms_machine         on public.magazine_slots(machine_id);
create index idx_ms_instance        on public.magazine_slots(instance_id);

-- calibrations
create index idx_cal_instance       on public.calibrations(instance_id);
create index idx_cal_next_date      on public.calibrations(next_calibration_date);
create index idx_cal_facility       on public.calibrations(facility_id);

-- regrind_orders
create index idx_ro_facility        on public.regrind_orders(facility_id);
create index idx_ro_status          on public.regrind_orders(status);
create index idx_ro_deadline        on public.regrind_orders(deadline_date);

-- alarm_events
create index idx_ae_facility        on public.alarm_events(facility_id);
create index idx_ae_unresolved      on public.alarm_events(is_resolved) where is_resolved = false;
create index idx_ae_severity        on public.alarm_events(severity);
create index idx_ae_created         on public.alarm_events(created_at desc);
create index idx_ae_entity          on public.alarm_events(entity_type, entity_id);

-- tool_measurements
create index idx_tm_instance        on public.tool_measurements(instance_id);
create index idx_tm_context         on public.tool_measurements(context);
create index idx_tm_measured_at     on public.tool_measurements(measured_at desc);

-- audit_logs
create index idx_al_entity          on public.audit_logs(entity_type, entity_id);
create index idx_al_actor           on public.audit_logs(actor_id);
create index idx_al_facility        on public.audit_logs(facility_id);
create index idx_al_created         on public.audit_logs(created_at desc);
create index idx_al_module          on public.audit_logs(module);
