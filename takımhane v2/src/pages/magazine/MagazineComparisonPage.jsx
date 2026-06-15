import { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/authStore'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import Select from '@/components/ui/Select'

// ── Constants ─────────────────────────────────────────────────────
const MAG_STATUS_MAP = {
  keep:          { label: 'Bırak',       cls: 'bg-emerald-600/20 border-emerald-500/50 text-emerald-300' },
  replace:       { label: 'Değiştir',    cls: 'bg-red-600/20 border-red-500/50 text-red-300' },
  life_critical: { label: 'Kritik Ömür', cls: 'bg-amber-600/20 border-amber-500/50 text-amber-300' },
  empty_slot:    { label: 'Boş Slot',    cls: 'bg-slate-700/60 border-slate-600 text-slate-400' },
}

const MEAS_RESULT_OPTS = [
  { value: 'PASS',        label: 'PASS — Toleransta' },
  { value: 'CONDITIONAL', label: 'ŞARTLI — Limit değerde' },
  { value: 'FAIL',        label: 'FAIL — Tolerans dışı' },
]

const MEAS_COLORS = { PASS: 'text-emerald-400', CONDITIONAL: 'text-amber-400', FAIL: 'text-red-400' }

const WO_STATUS_LABELS = {
  planned: 'Planlandı', preparation: 'Hazırlık', magazine_comparison: 'Magazin Karşılaştırma',
  measurement: 'Ölçüm', checkout: 'Zimmetleniyor', active: 'Aktif', completed: 'Tamamlandı', cancelled: 'İptal',
}

// ── Helpers ───────────────────────────────────────────────────────
function lifeColor(pct) {
  if (pct == null) return 'text-slate-500'
  if (pct > 50)   return 'text-emerald-400'
  if (pct > 20)   return 'text-amber-400'
  return 'text-red-400'
}

function calcDeviation(measured, nominal) {
  if (measured == null || nominal == null) return null
  return (Number(measured) - Number(nominal)).toFixed(3)
}

function deviationColor(dev, tolerance) {
  if (dev == null) return ''
  const abs = Math.abs(Number(dev))
  const tol = Number(tolerance ?? 0.05)
  if (abs > tol * 2) return 'text-red-400'
  if (abs > tol)     return 'text-amber-400'
  return 'text-emerald-400'
}

// ── Comparison row ────────────────────────────────────────────────
function ComparisonRow({ item, slotInfo, onStatusChange }) {
  const required  = item.tool_definitions
  const slotInst  = slotInfo?.tool_instances
  const slotDef   = slotInst?.tool_definitions

  const match = slotDef && slotDef.id === item.definition_id
  const hasLife = slotInst?.life_remaining_pct != null
  const lifeCrit = hasLife && slotInst.life_remaining_pct < 20

  const autoStatus = !slotInst
    ? 'empty_slot'
    : match
      ? (lifeCrit ? 'life_critical' : 'keep')
      : 'replace'

  const current = item.magazine_status ?? autoStatus

  return (
    <div className={`rounded-xl border p-4 transition-colors ${MAG_STATUS_MAP[current]?.cls ?? 'border-slate-700 bg-slate-800/40'}`}>
      <div className="flex items-start gap-4">
        {/* Pot number */}
        <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-slate-700 text-slate-300 font-bold text-sm">
          {item.pot_number ?? '?'}
        </div>

        {/* Required */}
        <div className="flex-1 min-w-0">
          <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-0.5">Gerekli</p>
          <p className="text-sm font-medium text-white truncate">{required?.name ?? '—'}</p>
          <p className="text-xs font-mono text-slate-500">{required?.internal_code ?? '—'}</p>
          {(item.nominal_length_mm || item.nominal_diameter_mm) && (
            <p className="text-xs text-slate-500 mt-0.5">
              {item.nominal_length_mm && `L=${item.nominal_length_mm}mm`}
              {item.nominal_diameter_mm && ` Ø${item.nominal_diameter_mm}mm`}
            </p>
          )}
        </div>

        {/* Arrow */}
        <div className="flex-shrink-0 pt-3 text-slate-600">vs</div>

        {/* Current slot */}
        <div className="flex-1 min-w-0">
          <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-0.5">Mevcut Pot</p>
          {!slotInst ? (
            <p className="text-sm text-slate-600 italic">Boş</p>
          ) : (
            <>
              <p className="text-sm font-medium text-white truncate">{slotDef?.name ?? '—'}</p>
              <p className="text-xs font-mono text-blue-300">{slotInst.barcode}</p>
              {hasLife && (
                <p className={`text-xs font-bold mt-0.5 ${lifeColor(slotInst.life_remaining_pct)}`}>
                  %{slotInst.life_remaining_pct.toFixed(0)} ömür
                </p>
              )}
            </>
          )}
        </div>

        {/* Match indicator */}
        <div className="flex-shrink-0 pt-2">
          {!slotInst
            ? <span className="text-lg">⬜</span>
            : match
              ? lifeCrit ? <span className="text-lg">⚠️</span> : <span className="text-lg">✅</span>
              : <span className="text-lg">🔄</span>
          }
        </div>

        {/* Status selector */}
        <div className="flex-shrink-0">
          <div className="flex flex-col gap-1">
            {Object.entries(MAG_STATUS_MAP).map(([v, { label }]) => (
              <button key={v} onClick={() => onStatusChange(item.id, v)}
                className={`rounded-lg border px-2 py-1 text-[10px] font-medium transition-colors whitespace-nowrap
                  ${current === v ? MAG_STATUS_MAP[v].cls : 'border-slate-700 text-slate-500 hover:text-slate-300'}`}>
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Measurement row ───────────────────────────────────────────────
function MeasurementRow({ item, values, onChange }) {
  const devL = calcDeviation(values.measured_length_mm, item.nominal_length_mm)
  const devD = calcDeviation(values.measured_diameter_mm, item.nominal_diameter_mm)
  const tolL = item.tool_definitions?.length_tolerance_mm
  const tolD = item.tool_definitions?.diameter_tolerance_mm

  return (
    <div className="rounded-xl border border-slate-700 bg-slate-800/40 p-4">
      <div className="flex items-start gap-4 flex-wrap">
        {/* Identity */}
        <div className="w-36 flex-shrink-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-slate-700 text-xs font-bold text-slate-300">
              {item.pot_number ?? '?'}
            </span>
          </div>
          <p className="text-xs font-medium text-white leading-tight">{item.tool_definitions?.name ?? '—'}</p>
          <p className="text-[10px] font-mono text-blue-300">{item.tool_instances?.barcode ?? 'atanmadı'}</p>
        </div>

        {/* Nominal */}
        <div className="w-28 flex-shrink-0">
          <p className="text-[10px] text-slate-500 mb-1 uppercase tracking-wider">Nominal</p>
          <p className="text-xs font-mono text-slate-400">L: {item.nominal_length_mm ?? '—'}</p>
          <p className="text-xs font-mono text-slate-400">Ø: {item.nominal_diameter_mm ?? '—'}</p>
          {tolL && <p className="text-[10px] text-slate-600 mt-1">±{tolL}mm</p>}
        </div>

        {/* Measured inputs */}
        <div className="flex gap-3 flex-1">
          <div className="w-32">
            <label className="text-[10px] text-slate-500 uppercase tracking-wider block mb-1">Ölçülen L (mm)</label>
            <input type="number" step="0.001"
              value={values.measured_length_mm ?? ''}
              onChange={(e) => onChange('measured_length_mm', e.target.value)}
              className="w-full rounded-lg border border-slate-600 bg-slate-700 px-2 py-1.5 text-xs font-mono text-slate-100 focus:border-blue-500 focus:outline-none" />
            {devL != null && (
              <p className={`text-[10px] font-mono mt-0.5 ${deviationColor(devL, tolL)}`}>
                Δ{devL > 0 ? '+' : ''}{devL}
              </p>
            )}
          </div>
          <div className="w-32">
            <label className="text-[10px] text-slate-500 uppercase tracking-wider block mb-1">Ölçülen Ø (mm)</label>
            <input type="number" step="0.001"
              value={values.measured_diameter_mm ?? ''}
              onChange={(e) => onChange('measured_diameter_mm', e.target.value)}
              className="w-full rounded-lg border border-slate-600 bg-slate-700 px-2 py-1.5 text-xs font-mono text-slate-100 focus:border-blue-500 focus:outline-none" />
            {devD != null && (
              <p className={`text-[10px] font-mono mt-0.5 ${deviationColor(devD, tolD)}`}>
                Δ{devD > 0 ? '+' : ''}{devD}
              </p>
            )}
          </div>
        </div>

        {/* Result */}
        <div className="w-44 flex-shrink-0">
          <label className="text-[10px] text-slate-500 uppercase tracking-wider block mb-1">Sonuç</label>
          <div className="flex flex-col gap-1">
            {MEAS_RESULT_OPTS.map(({ value, label }) => (
              <button key={value} onClick={() => onChange('measurement_result', value)}
                className={`rounded-lg border px-2 py-1 text-[10px] font-medium transition-colors text-left
                  ${values.measurement_result === value
                    ? value === 'PASS' ? 'border-emerald-500 bg-emerald-500/20 text-emerald-300'
                      : value === 'CONDITIONAL' ? 'border-amber-500 bg-amber-500/20 text-amber-300'
                      : 'border-red-500 bg-red-500/20 text-red-300'
                    : 'border-slate-700 text-slate-500 hover:text-slate-300'}`}>
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Main ──────────────────────────────────────────────────────────
export default function MagazineComparisonPage() {
  const { woId } = useParams()
  const navigate = useNavigate()
  const { profile } = useAuthStore()

  const [wo, setWo] = useState(null)
  const [items, setItems] = useState([])
  const [slotMap, setSlotMap] = useState({})   // { pot_number: magazine_slot_with_instance }
  const [magStatus, setMagStatus] = useState({}) // { item_id: magazine_status }
  const [measValues, setMeasValues] = useState({}) // { item_id: { measured_length_mm, measured_diameter_mm, measurement_result } }
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    const { data: woData } = await supabase
      .from('work_orders')
      .select('*, magazine_machines(id, name, magazine_capacity)')
      .eq('id', woId)
      .single()
    setWo(woData)

    const { data: itemData } = await supabase
      .from('wo_tool_items')
      .select('*, tool_definitions(id, internal_code, name, nominal_length_mm, nominal_diameter_mm, length_tolerance_mm, diameter_tolerance_mm), tool_instances(barcode, life_remaining_pct)')
      .eq('wo_id', woId)
      .order('pot_number')
    setItems(itemData ?? [])

    // Init magStatus from DB
    const ms = {}
    ;(itemData ?? []).forEach((i) => { if (i.magazine_status) ms[i.id] = i.magazine_status })
    setMagStatus(ms)

    // Init measValues from DB
    const mv = {}
    ;(itemData ?? []).forEach((i) => {
      mv[i.id] = {
        measured_length_mm: i.measured_length_mm ?? '',
        measured_diameter_mm: i.measured_diameter_mm ?? '',
        measurement_result: i.measurement_result ?? '',
      }
    })
    setMeasValues(mv)

    // Fetch magazine slots for the machine
    if (woData?.machine_id) {
      const { data: slots } = await supabase
        .from('magazine_slots')
        .select('pot_number, status, life_pct_at_load, tool_instances(barcode, life_remaining_pct, last_measurement_result, tool_definitions(id, internal_code, name))')
        .eq('machine_id', woData.machine_id)
      const sm = {}
      ;(slots ?? []).forEach((s) => { sm[s.pot_number] = s })
      setSlotMap(sm)
    }
    setLoading(false)
  }, [woId])

  useEffect(() => { load() }, [load])

  const handleMagStatus = (itemId, status) => {
    setMagStatus((p) => ({ ...p, [itemId]: status }))
  }

  const handleMeasChange = (itemId, field, value) => {
    setMeasValues((p) => ({ ...p, [itemId]: { ...p[itemId], [field]: value } }))
  }

  // Phase 1: Save magazine comparison and advance to measurement
  const saveComparison = async () => {
    setSaving(true); setError('')
    try {
      for (const item of items) {
        const status = magStatus[item.id] ?? 'keep'
        await supabase.from('wo_tool_items').update({ magazine_status: status }).eq('id', item.id)
      }
      await supabase.from('work_orders').update({ status: 'measurement' }).eq('id', woId)
      await load()
    } catch (e) { setError(e.message) }
    finally { setSaving(false) }
  }

  // Phase 2: Save measurements and advance to checkout
  const saveMeasurements = async () => {
    setSaving(true); setError('')
    try {
      for (const item of items) {
        const mv = measValues[item.id] ?? {}
        if (!mv.measurement_result) continue

        await supabase.from('wo_tool_items').update({
          measured_length_mm:  mv.measured_length_mm  !== '' ? Number(mv.measured_length_mm)  : null,
          measured_diameter_mm: mv.measured_diameter_mm !== '' ? Number(mv.measured_diameter_mm) : null,
          measurement_result: mv.measurement_result || null,
        }).eq('id', item.id)

        // Create tool_measurements record
        if (item.instance_id) {
          await supabase.from('tool_measurements').insert({
            facility_id:    profile.facility_id,
            instance_id:    item.instance_id,
            wo_id:          woId,
            context:        'SETUP',
            pot_number:     item.pot_number,
            length_mm:      mv.measured_length_mm  !== '' ? Number(mv.measured_length_mm)  : null,
            diameter_mm:    mv.measured_diameter_mm !== '' ? Number(mv.measured_diameter_mm) : null,
            delta_length_mm: mv.measured_length_mm !== '' && item.nominal_length_mm
              ? Number(mv.measured_length_mm) - Number(item.nominal_length_mm) : null,
            delta_diameter_mm: mv.measured_diameter_mm !== '' && item.nominal_diameter_mm
              ? Number(mv.measured_diameter_mm) - Number(item.nominal_diameter_mm) : null,
            result: mv.measurement_result || null,
            approved_by: mv.measurement_result ? profile.id : null,
          })
          // Update instance last measurement fields
          await supabase.from('tool_instances').update({
            last_length_mm:           mv.measured_length_mm  !== '' ? Number(mv.measured_length_mm)  : undefined,
            last_diameter_mm:         mv.measured_diameter_mm !== '' ? Number(mv.measured_diameter_mm) : undefined,
            last_measured_at:         new Date().toISOString(),
            last_measurement_result:  mv.measurement_result || undefined,
          }).eq('id', item.instance_id)
        }
      }
      await supabase.from('work_orders').update({ status: 'checkout' }).eq('id', woId)
      await load()
    } catch (e) { setError(e.message) }
    finally { setSaving(false) }
  }

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center bg-slate-900">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-slate-600 border-t-blue-500" />
      </div>
    )
  }

  if (!wo) {
    return (
      <div className="p-8 text-center text-slate-500">
        İş emri bulunamadı.
        <Button className="mt-4" onClick={() => navigate('/work-orders')}>İş Emirlerine Dön</Button>
      </div>
    )
  }

  const phase = wo.status
  const machineName = wo.magazine_machines?.name ?? '—'
  const readyCount  = items.filter((i) => (magStatus[i.id] ?? 'keep') !== 'replace').length
  const measDone    = items.filter((i) => measValues[i.id]?.measurement_result).length
  const passCount   = items.filter((i) => measValues[i.id]?.measurement_result === 'PASS').length
  const failCount   = items.filter((i) => measValues[i.id]?.measurement_result === 'FAIL').length

  return (
    <div className="min-h-full bg-slate-900">
      {/* Top bar */}
      <div className="sticky top-0 z-30 flex items-center gap-4 border-b border-slate-700/50 bg-slate-900/95 backdrop-blur px-6 py-3">
        <button onClick={() => navigate('/work-orders')} className="text-slate-500 hover:text-slate-300 transition-colors text-sm">
          ← İş Emirleri
        </button>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <span className="font-mono font-bold text-white">{wo.wo_code}</span>
            <span className="text-slate-500">·</span>
            <span className="text-slate-400 text-sm">{wo.part_name ?? wo.part_no ?? '—'}</span>
            <span className="text-slate-500">·</span>
            <span className="text-sm text-blue-400">{machineName}</span>
            <span className={`text-xs px-2 py-0.5 rounded-full border
              ${phase === 'magazine_comparison' ? 'border-amber-500/40 bg-amber-500/10 text-amber-400' :
                phase === 'measurement' ? 'border-blue-500/40 bg-blue-500/10 text-blue-400' :
                'border-emerald-500/40 bg-emerald-500/10 text-emerald-400'}`}>
              {WO_STATUS_LABELS[phase] ?? phase}
            </span>
          </div>
        </div>

        {/* Action button */}
        {phase === 'magazine_comparison' && (
          <Button onClick={saveComparison} loading={saving}>
            Karşılaştırmayı Tamamla → Ölçüm ({readyCount}/{items.length} hazır)
          </Button>
        )}
        {phase === 'measurement' && (
          <Button onClick={saveMeasurements} loading={saving}
            variant={failCount > 0 ? 'danger' : 'primary'}>
            Ölçümleri Kaydet → Zimmet ({measDone}/{items.length})
          </Button>
        )}
        {phase === 'checkout' && (
          <Button onClick={() => navigate('/work-orders')}>
            İş Emirlerine Dön — Zimmet Adımına Geç
          </Button>
        )}
      </div>

      <div className="p-6 space-y-6 max-w-5xl mx-auto">
        {error && (
          <div className="rounded-xl border border-red-500/30 bg-red-500/5 p-4 text-sm text-red-400">{error}</div>
        )}

        {/* Phase 1: Magazine Comparison */}
        {phase === 'magazine_comparison' && (
          <>
            <div className="flex items-center gap-6">
              <h2 className="text-lg font-semibold text-white">Magazin Karşılaştırma</h2>
              <div className="flex gap-3 text-xs">
                <span className="text-emerald-400">✅ {items.filter((i) => (magStatus[i.id] ?? 'keep') === 'keep').length} bırak</span>
                <span className="text-red-400">🔄 {items.filter((i) => (magStatus[i.id] ?? 'keep') === 'replace').length} değiştir</span>
                <span className="text-amber-400">⚠️ {items.filter((i) => (magStatus[i.id] ?? 'keep') === 'life_critical').length} kritik ömür</span>
                <span className="text-slate-500">⬜ {items.filter((i) => (magStatus[i.id] ?? 'keep') === 'empty_slot').length} boş slot</span>
              </div>
            </div>

            {items.length === 0 ? (
              <div className="card flex items-center justify-center p-16 text-slate-500">
                Bu WO'ya takım kalemi eklenmemiş
              </div>
            ) : (
              <div className="space-y-3">
                {items.map((item) => (
                  <ComparisonRow
                    key={item.id}
                    item={item}
                    slotInfo={item.pot_number ? slotMap[item.pot_number] : null}
                    onStatusChange={handleMagStatus}
                  />
                ))}
              </div>
            )}
          </>
        )}

        {/* Phase 2: Measurement */}
        {phase === 'measurement' && (
          <>
            <div className="flex items-center gap-6">
              <h2 className="text-lg font-semibold text-white">Presetter Ölçümleri</h2>
              <div className="flex gap-3 text-xs">
                <span className="text-emerald-400">PASS: {passCount}</span>
                <span className="text-amber-400">ŞARTLI: {items.filter((i) => measValues[i.id]?.measurement_result === 'CONDITIONAL').length}</span>
                <span className="text-red-400">FAIL: {failCount}</span>
                <span className="text-slate-500">Bekliyor: {items.length - measDone}</span>
              </div>
            </div>

            {failCount > 0 && (
              <div className="rounded-xl border border-red-500/30 bg-red-500/5 p-3 text-xs text-red-400">
                {failCount} kalemde FAIL sonuç var. Kaydedilecek ancak Zimmet adımında engellenecektir.
              </div>
            )}

            <div className="space-y-3">
              {items.map((item) => (
                <MeasurementRow
                  key={item.id}
                  item={item}
                  values={measValues[item.id] ?? {}}
                  onChange={(field, value) => handleMeasChange(item.id, field, value)}
                />
              ))}
            </div>
          </>
        )}

        {/* Phase 3: Checkout */}
        {phase === 'checkout' && (
          <div className="card flex flex-col items-center gap-4 p-12 text-center">
            <span className="text-5xl">✅</span>
            <p className="text-lg font-semibold text-white">Ölçümler tamamlandı</p>
            <p className="text-sm text-slate-400">
              {passCount} kalem PASS · {items.filter((i) => measValues[i.id]?.measurement_result === 'CONDITIONAL').length} ŞARTLI · {failCount} FAIL
            </p>
            <p className="text-sm text-slate-500">İş Emirleri sayfasına dönün ve takımları tek tek zimmetleyin.</p>
            <Button onClick={() => navigate('/work-orders')}>İş Emirlerine Dön</Button>
          </div>
        )}

        {/* Other statuses */}
        {!['magazine_comparison', 'measurement', 'checkout'].includes(phase) && (
          <div className="card flex flex-col items-center gap-4 p-12 text-center text-slate-500">
            <p>Bu WO şu an <strong className="text-slate-300">{WO_STATUS_LABELS[phase]}</strong> aşamasında.</p>
            <p className="text-xs">Magazin karşılaştırma yalnızca <em>magazine_comparison</em> aşamasında aktif olur.</p>
            <Button variant="secondary" onClick={() => navigate('/work-orders')}>Geri Dön</Button>
          </div>
        )}
      </div>
    </div>
  )
}
