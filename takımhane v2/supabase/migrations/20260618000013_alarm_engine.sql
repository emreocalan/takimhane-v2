-- ── Migration 013: Alarm Engine ───────────────────────────────────────────────
-- Adds entity_label column (used by AlarmsPage frontend) and the run_alarm_engine()
-- SQL function. Schedule via pg_cron once enabled in Supabase Dashboard.

-- 1. entity_label column for display in UI (was missing from original schema)
ALTER TABLE public.alarm_events
  ADD COLUMN IF NOT EXISTS entity_label text;

-- 2. Core alarm engine function (SECURITY DEFINER → bypasses RLS, runs as owner)
CREATE OR REPLACE FUNCTION public.run_alarm_engine()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  fac              RECORD;
  inst             RECORD;
  co               RECORD;
  rg               RECORD;

  cal_warn_days    int;
  cal_crit_days    int;
  life_warn_pct    numeric;
  life_crit_pct    numeric;
  checkout_max_hrs int;
  regrind_max_days int;

  inserted_count   int := 0;
BEGIN
  FOR fac IN SELECT id FROM public.facilities WHERE is_active = true LOOP

    -- Load thresholds with fallback defaults
    SELECT
      COALESCE(MAX(CASE WHEN threshold_key = 'calibration_warning_days'  THEN value_number END), 30)::int,
      COALESCE(MAX(CASE WHEN threshold_key = 'calibration_critical_days' THEN value_number END), 7)::int,
      COALESCE(MAX(CASE WHEN threshold_key = 'life_warning_pct'          THEN value_number END), 20),
      COALESCE(MAX(CASE WHEN threshold_key = 'life_critical_pct'         THEN value_number END), 10),
      COALESCE(MAX(CASE WHEN threshold_key = 'checkout_max_hours'        THEN value_number END), 24)::int,
      COALESCE(MAX(CASE WHEN threshold_key = 'regrind_max_days'          THEN value_number END), 14)::int
    INTO cal_warn_days, cal_crit_days, life_warn_pct, life_crit_pct, checkout_max_hrs, regrind_max_days
    FROM public.alarm_thresholds
    WHERE facility_id = fac.id;

    -- ── 1. Calibration due ───────────────────────────────────────────────────
    FOR inst IN
      SELECT ti.id, ti.barcode, ti.next_calibration_date, td.name AS tool_name
      FROM public.tool_instances ti
      JOIN public.tool_definitions td ON td.id = ti.definition_id
      WHERE ti.facility_id = fac.id
        AND ti.status NOT IN ('scrapped', 'calibration')
        AND ti.next_calibration_date IS NOT NULL
        AND ti.next_calibration_date <= (CURRENT_DATE + cal_warn_days)
    LOOP
      CONTINUE WHEN EXISTS (
        SELECT 1 FROM public.alarm_events
        WHERE facility_id = fac.id AND entity_id = inst.id
          AND alarm_type = 'calibration_due' AND is_resolved = false
      );

      INSERT INTO public.alarm_events
        (facility_id, alarm_type, severity, entity_type, entity_id, entity_label, title, body)
      VALUES (
        fac.id,
        'calibration_due',
        CASE WHEN inst.next_calibration_date <= (CURRENT_DATE + cal_crit_days)
             THEN 'critical' ELSE 'warning' END,
        'tool_instance',
        inst.id,
        inst.tool_name || ' [' || inst.barcode || ']',
        CASE WHEN inst.next_calibration_date < CURRENT_DATE
             THEN 'Kalibrasyon Vadesi Geçmiş: ' || inst.tool_name
             ELSE 'Kalibrasyon Yaklaşıyor: '    || inst.tool_name END,
        'Barkod: ' || inst.barcode || ' | Vade: ' || inst.next_calibration_date::text
          || CASE WHEN inst.next_calibration_date < CURRENT_DATE
                  THEN ' — VADESİ GEÇMİŞ!'
                  ELSE ' — ' || (inst.next_calibration_date - CURRENT_DATE)::text || ' gün kaldı' END
      );
      inserted_count := inserted_count + 1;
    END LOOP;

    -- ── 2. Low life ──────────────────────────────────────────────────────────
    FOR inst IN
      SELECT ti.id, ti.barcode, ti.life_remaining_pct, td.name AS tool_name
      FROM public.tool_instances ti
      JOIN public.tool_definitions td ON td.id = ti.definition_id
      WHERE ti.facility_id = fac.id
        AND ti.status NOT IN ('scrapped', 'regrind', 'calibration', 'quarantine', 'broken')
        AND ti.life_remaining_pct IS NOT NULL
        AND ti.life_remaining_pct < life_warn_pct
    LOOP
      CONTINUE WHEN EXISTS (
        SELECT 1 FROM public.alarm_events
        WHERE facility_id = fac.id AND entity_id = inst.id
          AND alarm_type = 'low_life' AND is_resolved = false
      );

      INSERT INTO public.alarm_events
        (facility_id, alarm_type, severity, entity_type, entity_id, entity_label, title, body)
      VALUES (
        fac.id,
        'low_life',
        CASE WHEN inst.life_remaining_pct < life_crit_pct THEN 'critical' ELSE 'warning' END,
        'tool_instance',
        inst.id,
        inst.tool_name || ' [' || inst.barcode || ']',
        'Düşük Takım Ömrü: ' || inst.tool_name,
        'Barkod: ' || inst.barcode
          || ' | Kalan ömür: %' || ROUND(inst.life_remaining_pct, 1)::text
          || ' — Bileme veya bertaraf planı oluşturun'
      );
      inserted_count := inserted_count + 1;
    END LOOP;

    -- ── 3. Broken / quarantine ───────────────────────────────────────────────
    FOR inst IN
      SELECT ti.id, ti.barcode, ti.status, td.name AS tool_name
      FROM public.tool_instances ti
      JOIN public.tool_definitions td ON td.id = ti.definition_id
      WHERE ti.facility_id = fac.id
        AND ti.status IN ('broken', 'quarantine')
    LOOP
      CONTINUE WHEN EXISTS (
        SELECT 1 FROM public.alarm_events
        WHERE facility_id = fac.id AND entity_id = inst.id
          AND alarm_type = 'tool_quarantine' AND is_resolved = false
      );

      INSERT INTO public.alarm_events
        (facility_id, alarm_type, severity, entity_type, entity_id, entity_label, title, body)
      VALUES (
        fac.id,
        'tool_quarantine',
        'critical',
        'tool_instance',
        inst.id,
        inst.tool_name || ' [' || inst.barcode || ']',
        CASE inst.status
          WHEN 'broken'     THEN 'Kırık Takım: '    || inst.tool_name
          WHEN 'quarantine' THEN 'Karantina: '      || inst.tool_name
        END,
        'Barkod: ' || inst.barcode
          || ' | Durum: ' || inst.status
          || ' — Bertaraf süreci başlatın'
      );
      inserted_count := inserted_count + 1;
    END LOOP;

    -- ── 4. Long open checkout ────────────────────────────────────────────────
    FOR co IN
      SELECT c.id, c.checkout_at,
             ti.barcode, td.name AS tool_name,
             p.full_name AS person_name
      FROM public.checkouts c
      JOIN public.tool_instances  ti ON ti.id = c.instance_id
      JOIN public.tool_definitions td ON td.id = ti.definition_id
      LEFT JOIN public.profiles    p  ON p.id  = c.checked_out_by
      WHERE c.facility_id = fac.id
        AND c.is_open = true
        AND c.checkout_at < (now() - (checkout_max_hrs || ' hours')::interval)
    LOOP
      CONTINUE WHEN EXISTS (
        SELECT 1 FROM public.alarm_events
        WHERE facility_id = fac.id AND entity_id = co.id
          AND alarm_type = 'long_checkout' AND is_resolved = false
      );

      INSERT INTO public.alarm_events
        (facility_id, alarm_type, severity, entity_type, entity_id, entity_label, title, body)
      VALUES (
        fac.id,
        'long_checkout',
        'warning',
        'checkout',
        co.id,
        co.tool_name || ' [' || co.barcode || ']',
        'Uzun Süreli Zimmet: ' || co.tool_name,
        'Barkod: ' || co.barcode
          || ' | Kullanan: '  || COALESCE(co.person_name, '—')
          || ' | '            || (EXTRACT(EPOCH FROM (now() - co.checkout_at)) / 3600)::int::text
          || ' saattir açık — iade alınmadı'
      );
      inserted_count := inserted_count + 1;
    END LOOP;

    -- ── 5. Overdue regrind ───────────────────────────────────────────────────
    FOR rg IN
      SELECT ro.id, ro.sent_at, s.name AS regrinder_name
      FROM public.regrind_orders ro
      LEFT JOIN public.suppliers s ON s.id = ro.regrinder_id
      WHERE ro.facility_id = fac.id
        AND ro.status IN ('sent', 'at_regrinder')
        AND ro.sent_at IS NOT NULL
        AND ro.sent_at < (CURRENT_DATE - regrind_max_days)
    LOOP
      CONTINUE WHEN EXISTS (
        SELECT 1 FROM public.alarm_events
        WHERE facility_id = fac.id AND entity_id = rg.id
          AND alarm_type = 'regrind_overdue' AND is_resolved = false
      );

      INSERT INTO public.alarm_events
        (facility_id, alarm_type, severity, entity_type, entity_id, entity_label, title, body)
      VALUES (
        fac.id,
        'regrind_overdue',
        'warning',
        'regrind_order',
        rg.id,
        COALESCE(rg.regrinder_name, 'Bileyici') || ' — ' || rg.sent_at::text,
        'Bileme Süresi Aşıldı',
        'Bileyici: ' || COALESCE(rg.regrinder_name, '—')
          || ' | Gönderildi: ' || rg.sent_at::text
          || ' | ' || (CURRENT_DATE - rg.sent_at)::text || ' gün geçti'
      );
      inserted_count := inserted_count + 1;
    END LOOP;

  END LOOP; -- facilities

  -- ── Auto-resolve: clear alarms whose condition no longer applies ─────────

  -- Calibration: tool now calibrated/scrapped, or date pushed forward
  UPDATE public.alarm_events ae SET is_resolved = true, resolved_at = now()
  WHERE ae.alarm_type = 'calibration_due' AND ae.is_resolved = false
    AND NOT EXISTS (
      SELECT 1 FROM public.tool_instances ti
      WHERE ti.id = ae.entity_id
        AND ti.status NOT IN ('scrapped', 'calibration')
        AND ti.next_calibration_date IS NOT NULL
        AND ti.next_calibration_date <= CURRENT_DATE + 30
    );

  -- Low life: tool scrapped, in regrind, or life restored
  UPDATE public.alarm_events ae SET is_resolved = true, resolved_at = now()
  WHERE ae.alarm_type = 'low_life' AND ae.is_resolved = false
    AND NOT EXISTS (
      SELECT 1 FROM public.tool_instances ti
      WHERE ti.id = ae.entity_id
        AND ti.status NOT IN ('scrapped', 'regrind', 'calibration', 'quarantine', 'broken')
        AND ti.life_remaining_pct IS NOT NULL
        AND ti.life_remaining_pct < 20
    );

  -- Quarantine/broken: status changed
  UPDATE public.alarm_events ae SET is_resolved = true, resolved_at = now()
  WHERE ae.alarm_type = 'tool_quarantine' AND ae.is_resolved = false
    AND NOT EXISTS (
      SELECT 1 FROM public.tool_instances ti
      WHERE ti.id = ae.entity_id AND ti.status IN ('broken', 'quarantine')
    );

  -- Long checkout: checkout closed
  UPDATE public.alarm_events ae SET is_resolved = true, resolved_at = now()
  WHERE ae.alarm_type = 'long_checkout' AND ae.is_resolved = false
    AND NOT EXISTS (
      SELECT 1 FROM public.checkouts c
      WHERE c.id = ae.entity_id AND c.is_open = true
    );

  -- Regrind overdue: order returned
  UPDATE public.alarm_events ae SET is_resolved = true, resolved_at = now()
  WHERE ae.alarm_type = 'regrind_overdue' AND ae.is_resolved = false
    AND NOT EXISTS (
      SELECT 1 FROM public.regrind_orders ro
      WHERE ro.id = ae.entity_id AND ro.status IN ('sent', 'at_regrinder')
    );

  RETURN jsonb_build_object('inserted', inserted_count, 'run_at', now());
END $$;

-- 3. Grant execute to authenticated users (admins can trigger manually)
GRANT EXECUTE ON FUNCTION public.run_alarm_engine() TO authenticated;

-- 4. pg_cron schedule (requires pg_cron enabled in Supabase Dashboard → Database → Extensions)
-- Run alarm engine every 30 minutes
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.schedule(
      'alarm-engine-30min',
      '*/30 * * * *',
      'SELECT public.run_alarm_engine()'
    );
    RAISE NOTICE 'pg_cron schedule created: alarm-engine-30min';
  ELSE
    RAISE NOTICE 'pg_cron not enabled — enable in Supabase Dashboard → Database → Extensions, then run: SELECT cron.schedule(''alarm-engine-30min'', ''*/30 * * * *'', ''SELECT public.run_alarm_engine()'');';
  END IF;
END $$;

COMMENT ON FUNCTION public.run_alarm_engine() IS
  'Alarm Engine (Migration 013): checks calibration_due, low_life, tool_quarantine, long_checkout, regrind_overdue. Auto-resolves cleared conditions. Scheduled via pg_cron every 30 min.';
