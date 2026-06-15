/**
 * Checkout Service — TEK SERVİS KATMANI
 * İş Emirleri, Dashboard modalı ve Zimmet sayfası hepsi buradan çağırır.
 * Hiçbir modül kendi checkout mantığını yazmaz.
 */
import { supabase } from '@/lib/supabase'

export async function createCheckout({ instanceId, woId, checkoutType, machineId, potNumber, reasonCode, notes, checkedOutBy, facilityId, woItemId = null }) {
  // 1. Takım durumu + kalibrasyon kontrolü
  const { data: instance, error: instErr } = await supabase
    .from('tool_instances')
    .select('status, next_calibration_date, life_remaining_pct')
    .eq('id', instanceId)
    .single()

  if (instErr || !instance) throw new Error('Takım bulunamadı')
  if (instance.status === 'scrapped') throw new Error('Bertaraf edilmiş takım zimmetlenemez')
  if (instance.status === 'checked_out') throw new Error('Takım zaten zimmetli')
  if (instance.status === 'calibration') throw new Error('Takım kalibrasyonda')

  if (instance.next_calibration_date) {
    const expired = new Date(instance.next_calibration_date) < new Date()
    if (expired) throw new Error('Kalibrasyon süresi dolmuş — zimmet engellenmiştir')
  }

  // 2. Geçici zimmet değilse WO zorunlu
  if (checkoutType !== 'temporary' && !woId) {
    throw new Error('WO kodu zorunludur. "Hızlı WO Oluştur" veya "Geçici Zimmet" seçin.')
  }

  // 3. Checkout kaydı oluştur
  const { data: checkout, error: coErr } = await supabase
    .from('checkouts')
    .insert({
      facility_id: facilityId,
      instance_id: instanceId,
      wo_id: woId,
      wo_item_id: woItemId,
      checkout_type: checkoutType,
      machine_id: machineId,
      pot_number: potNumber,
      checked_out_by: checkedOutBy,
      reason_code: reasonCode,
      notes,
      is_open: true,
      is_temporary: checkoutType === 'temporary',
    })
    .select()
    .single()

  if (coErr) throw new Error(coErr.message)

  // 4. Takım statüsünü güncelle
  await supabase
    .from('tool_instances')
    .update({ status: 'checked_out' })
    .eq('id', instanceId)

  // 5. WO kalemini güncelle
  if (woItemId) {
    await supabase
      .from('wo_tool_items')
      .update({ checkout_status: 'checked_out', instance_id: instanceId })
      .eq('id', woItemId)
  }

  return checkout
}

export async function returnCheckout({ checkoutId, checkinCondition, usageMinutes, usageParts, checkedInBy, notes }) {
  const { data: checkout, error } = await supabase
    .from('checkouts')
    .select('id, instance_id, wo_item_id')
    .eq('id', checkoutId)
    .eq('is_open', true)
    .single()

  if (error || !checkout) throw new Error('Açık zimmet bulunamadı')

  const now = new Date().toISOString()

  await supabase.from('checkouts').update({
    checked_in_by: checkedInBy,
    checkin_at: now,
    checkin_condition: checkinCondition,
    usage_minutes: usageMinutes,
    usage_parts: usageParts,
    is_open: false,
    notes,
  }).eq('id', checkoutId)

  // Fetch current counters then increment
  const { data: inst } = await supabase
    .from('tool_instances')
    .select('cumulative_usage_minutes, cumulative_usage_parts')
    .eq('id', checkout.instance_id)
    .single()

  await supabase.from('tool_instances').update({
    status: 'available',
    cumulative_usage_minutes: (inst?.cumulative_usage_minutes ?? 0) + (usageMinutes ?? 0),
    cumulative_usage_parts:   (inst?.cumulative_usage_parts   ?? 0) + (usageParts   ?? 0),
  }).eq('id', checkout.instance_id)

  if (checkout.wo_item_id) {
    await supabase
      .from('wo_tool_items')
      .update({ checkout_status: 'returned' })
      .eq('id', checkout.wo_item_id)
  }
}

export async function createQuickWO({ facilityId, machineId, operatorId, partNo }) {
  const ts = Date.now().toString(36).toUpperCase()
  const woCode = `QW-${ts}`

  const { data, error } = await supabase
    .from('work_orders')
    .insert({
      facility_id: facilityId,
      wo_code: woCode,
      part_no: partNo,
      machine_id: machineId,
      assigned_operator_id: operatorId,
      is_quick_wo: true,
      status: 'active',
    })
    .select()
    .single()

  if (error) throw new Error(error.message)
  return data
}
