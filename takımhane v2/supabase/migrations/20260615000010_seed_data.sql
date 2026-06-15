-- ============================================================
-- 010 SEED DATA: roller, izinler, lookup kodları, varlık tipleri,
--               attribute tanımları, alarm eşikleri, bildirim şablonları
-- ============================================================

-- ── 5 sistem rolü ────────────────────────────────────────────
insert into public.roles (name, label, is_system) values
  ('admin',      'Yönetici',              true),
  ('supervisor', 'Takımhane Sorumlusu',   true),
  ('operator',   'Operatör',              true),
  ('quality',    'Kalite Mühendisi',      true),
  ('readonly',   'Salt Okunur',           true);

-- ── Modül izinleri ──────────────────────────────────────────
insert into public.permissions (module, action, label) values
  ('m1_auth',       'read',          'Kullanıcıları Görüntüle'),
  ('m1_auth',       'create',        'Kullanıcı Ekle'),
  ('m1_auth',       'update',        'Kullanıcı Düzenle'),
  ('m1_auth',       'delete',        'Kullanıcı Sil'),
  ('m2_dashboard',  'read',          'Dashboard Görüntüle'),
  ('m2_dashboard',  'quick_checkout','Hızlı Zimmet Ver'),
  ('m2_dashboard',  'quick_checkin', 'Takım İade Al'),
  ('m2_dashboard',  'tool_break',    'Takım Kır'),
  ('m3_work_orders','read',          'İş Emirlerini Görüntüle'),
  ('m3_work_orders','create',        'İş Emri Oluştur'),
  ('m3_work_orders','update',        'İş Emri Düzenle'),
  ('m3_work_orders','delete',        'İş Emri Sil'),
  ('m3_work_orders','checkout',      'WO Setup Checkout'),
  ('m4_checkouts',  'read',          'Zimmetleri Görüntüle'),
  ('m4_checkouts',  'create',        'Zimmet Ver'),
  ('m4_checkouts',  'checkin',       'Takım İade Al'),
  ('m5_regrind',    'read',          'Yenileme & Bertarafı Görüntüle'),
  ('m5_regrind',    'create',        'Bileme Siparişi Oluştur'),
  ('m5_regrind',    'approve_scrap', 'Bertaraf Onayla'),
  ('m6_catalog',    'read',          'Kataloğu Görüntüle'),
  ('m6_catalog',    'create',        'Katalog Ekle'),
  ('m6_catalog',    'update',        'Katalog Düzenle'),
  ('m7_stock',      'read',          'Fiziksel Stoku Görüntüle'),
  ('m7_stock',      'create',        'Takım Ekle'),
  ('m7_stock',      'update',        'Takım Güncelle'),
  ('m8_calibration','read',          'Kalibrasyonları Görüntüle'),
  ('m8_calibration','create',        'Kalibrasyon Oluştur'),
  ('m8_calibration','approve',       'Kalibrasyon Onayla'),
  ('m9_records',    'read',          'Kayıtları Görüntüle'),
  ('m9_records',    'export',        'Dışa Aktar'),
  ('m10_cnc',       'read',          'CNC & Depo Durumunu Görüntüle'),
  ('m10_cnc',       'update',        'Magazin Durumu Güncelle'),
  ('m11_admin',     'read',          'Sistem Tanımlarını Görüntüle'),
  ('m11_admin',     'manage',        'Sistem Tanımlarını Yönet');

-- ── Varsayılan lookup kodları ────────────────────────────────
insert into public.lookup_codes (category, code, label, display_order, is_system_reserved) values
  ('checkout_reason', 'KIRILMA',    'Kırılma',    1, true),
  ('checkout_reason', 'ASINMA',     'Aşınma',     2, true),
  ('checkout_reason', 'KAYIP',      'Kayıp',      3, true),
  ('checkout_reason', 'EK_IHTIYAC', 'Ek İhtiyaç', 4, false),
  ('checkout_reason', 'SETUP',      'Setup',      5, true),
  ('scrap_reason', 'OMUR_DOLUMU',           'Ömür Dolumu',           1, true),
  ('scrap_reason', 'KIRILMA',               'Kırılma',               2, true),
  ('scrap_reason', 'BOYUT_DISI',            'Boyut Dışı',            3, true),
  ('scrap_reason', 'KALIBRASYON_BASARISIZ', 'Kalibrasyon Başarısız', 4, true),
  ('scrap_reason', 'HASAR',                 'Hasar',                 5, false),
  ('tool_status', 'available',   'Kullanılabilir', 1, true),
  ('tool_status', 'checked_out', 'Zimmetli',       2, true),
  ('tool_status', 'calibration', 'Kalibrasyonda',  3, true),
  ('tool_status', 'regrind',     'Bilemede',       4, true),
  ('tool_status', 'quarantine',  'Karantina',      5, true),
  ('tool_status', 'scrapped',    'Bertaraf',       6, true),
  ('machine_status', 'active',      'Aktif',   1, true),
  ('machine_status', 'maintenance', 'Bakımda', 2, true),
  ('machine_status', 'fault',       'Arıza',   3, true),
  ('machine_status', 'passive',     'Pasif',   4, true),
  ('ncr_reason', 'BOYUT_UYUMSUZ',      'Boyut Uyumsuz',      1, false),
  ('ncr_reason', 'KALIBRASYON_DISI',   'Kalibrasyon Dışı',   2, false),
  ('ncr_reason', 'YETKISIZ_KULLANIM', 'Yetkisiz Kullanım',  3, false),
  ('ncr_reason', 'BELGE_EKSIK',        'Belge Eksik',        4, false);

-- ── 6 sistem varlık tipi ────────────────────────────────────
insert into public.tool_types (code, name, icon, color, allows_regrind, requires_calibration, is_system, display_order) values
  ('KESICI_TAKIM', 'Kesici Takım', 'scissors',    '#EF4444', true,  false, true, 1),
  ('TUTUCU',       'Tutucu',       'grip',         '#3B82F6', false, false, true, 2),
  ('OLCUM_ALETI',  'Ölçüm Aleti', 'ruler',        '#10B981', false, true,  true, 3),
  ('FIKSTUR',      'Fikstür',      'box',          '#8B5CF6', false, false, true, 4),
  ('MASTAR',       'Mastar',       'check-circle', '#F59E0B', false, true,  true, 5),
  ('SARF',         'Sarf Malzeme','package',       '#6B7280', false, false, true, 6);

-- ── Attribute tanımları — Kesici Takım ──────────────────────
with kt as (select id from public.tool_types where code = 'KESICI_TAKIM')
insert into public.tool_type_attribute_definitions
  (tool_type_id, field_key, field_label, field_type, is_required, unit, display_order, applies_to_definition)
select kt.id, v.field_key, v.field_label, v.field_type, v.is_required, v.unit, v.ord, true
from kt, (values
  ('diameter_mm',       'Çap (mm)',        'number', true,  'mm', 1),
  ('cutting_length_mm', 'Kesme Boyu (mm)', 'number', false, 'mm', 2),
  ('helix_angle_deg',   'Helis Açısı (°)', 'number', false, '°',  3),
  ('flute_count',       'Diş Sayısı',      'number', false, null, 4),
  ('coating',           'Kaplama',         'text',   false, null, 5),
  ('shank_type',        'Sap Tipi',        'select', false, null, 6)
) as v(field_key, field_label, field_type, is_required, unit, ord);

-- ── Attribute tanımları — Ölçüm Aleti ───────────────────────
with oa as (select id from public.tool_types where code = 'OLCUM_ALETI')
insert into public.tool_type_attribute_definitions
  (tool_type_id, field_key, field_label, field_type, is_required, unit, display_order, applies_to_definition)
select oa.id, v.field_key, v.field_label, v.field_type, v.is_required, v.unit, v.ord, true
from oa, (values
  ('measurement_range', 'Ölçüm Aralığı',             'text',   true,  null,  1),
  ('resolution_mm',     'Çözünürlük',                'number', false, 'mm',  2),
  ('cal_interval_days', 'Kalibrasyon Aralığı (gün)', 'number', true,  'gün', 3)
) as v(field_key, field_label, field_type, is_required, unit, ord);

-- ── Attribute tanımları — Tutucu ────────────────────────────
with tu as (select id from public.tool_types where code = 'TUTUCU')
insert into public.tool_type_attribute_definitions
  (tool_type_id, field_key, field_label, field_type, is_required, unit, display_order, applies_to_definition)
select tu.id, v.field_key, v.field_label, v.field_type, v.is_required, v.unit, v.ord, true
from tu, (values
  ('connection_type', 'Bağlantı Tipi', 'select', true,  null,  1),
  ('tir_mm',          'TIR Değeri',    'number', false, 'mm',  2),
  ('max_rpm',         'Max Devir',     'number', false, 'rpm', 3)
) as v(field_key, field_label, field_type, is_required, unit, ord);

-- ── Global alarm eşikleri (11F) ──────────────────────────────
insert into public.alarm_thresholds (threshold_key, label, value_number, unit) values
  ('calibration_warning_1_days',   'Kalibrasyon Uyarı 1 (gün)',      30,  'days'),
  ('calibration_warning_2_days',   'Kalibrasyon Uyarı 2 (gün)',       7,  'days'),
  ('life_warning_pct',             'Ömür Uyarı Eşiği (%)',           20,  'pct'),
  ('open_checkout_alarm_hours',    'Açık Zimmet Alarm (saat)',        24,  'hours'),
  ('regrind_deadline_warning_days','Bileme Termin Uyarısı (gün)',      2,  'days'),
  ('dead_stock_days',              'Ölü Stok Sınırı (gün)',          90,  'days'),
  ('presetter_tolerance_factor',   'Presetter Tolerans Faktörü',      0.8, 'ratio');

-- ── Varsayılan bildirim şablonları ───────────────────────────
insert into public.notification_templates (alarm_type, channel, subject_template, body_template, target_roles) values
  ('calibration_due_30',  'in_app', null, '{{tool_name}} ({{barcode}}) kalibrasyonu 30 gün içinde dolacak. Son tarih: {{due_date}}', ARRAY['admin','quality']),
  ('calibration_due_7',   'in_app', null, '⚠ {{tool_name}} ({{barcode}}) kalibrasyonu 7 gün içinde dolacak!', ARRAY['admin','quality','supervisor']),
  ('calibration_overdue', 'in_app', null, '🔴 {{tool_name}} ({{barcode}}) kalibrasyon süresi doldu! Kullanım engellendi.', ARRAY['admin','quality','supervisor']),
  ('low_stock',           'in_app', null, '{{definition_name}} stok seviyesi minimum altında. Mevcut: {{current_stock}}, Min: {{min_stock}}', ARRAY['admin','supervisor']),
  ('life_critical',       'in_app', null, '{{barcode}} takımında kalan ömür %{{life_pct}} — değişim önerilir.', ARRAY['supervisor']),
  ('open_checkout_24h',   'in_app', null, '{{barcode}} 24 saattir iade edilmedi. Zimmetli: {{operator_name}}', ARRAY['supervisor']),
  ('regrind_overdue',     'in_app', null, '{{barcode}} bilemede gecikiyor. Termin: {{deadline}}, Bugün: {{today}}', ARRAY['supervisor']),
  ('tool_break',          'in_app', null, '💥 {{operator_name}} {{barcode}} takımını kırdı. WO: {{wo_code}}', ARRAY['supervisor','admin']),
  ('emergency_request',   'in_app', null, '⚡ Acil takım talebi: {{tool_name}} — {{operator_name}} ({{machine_code}})', ARRAY['admin','supervisor']);
