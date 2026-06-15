import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/authStore'
import Input from '@/components/ui/Input'
import Select from '@/components/ui/Select'
import { Table, StatusBadge } from '@/components/ui/Table'

// ── Constants ─────────────────────────────────────────────────────
const MEAS_RESULT_MAP = {
  PASS:        { label: 'PASS',    cls: 'badge-ok' },
  CONDITIONAL: { label: 'ŞARTLI', cls: 'badge-warning' },
  FAIL:        { label: 'FAIL',   cls: 'badge-critical' },
}

const CONTEXT_MAP = {
  GKK:    { label: 'GKK (Giriş)',  cls: 'badge-info' },
  SETUP:  { label: 'Setup',        cls: 'badge-warning' },
  CHECKIN:{ label: 'İade',         cls: 'badge-ok' },
}

const MODULE_COLORS = {
  checkout:    'text-blue-400',
  calibration: 'text-purple-400',
  regrind:     'text-amber-400',
  stock:       'text-emerald-400',
  scrap:       'text-red-400',
  work_order:  'text-cyan-400',
}

function timeStr(dateStr) {
  return new Date(dateStr).toLocaleString('tr-TR', { dateStyle: 'short', timeStyle: 'short' })
}

// ── Audit Log Tab ─────────────────────────────────────────────────
function AuditTab({ facilityId }) {
  const [logs, setLogs] = useState([])
  const [loading, setLoading] = useState(true)
  const [module, setModule] = useState('')
  const [search, setSearch] = useState('')
  const [dateFrom, setDateFrom] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    let q = supabase
      .from('audit_logs')
      .select('id, created_at, actor_name, module, action, entity_type, entity_label, new_values, old_values')
      .eq('facility_id', facilityId)
      .order('created_at', { ascending: false })
      .limit(300)

    if (module)   q = q.eq('module', module)
    if (dateFrom) q = q.gte('created_at', dateFrom)

    const { data } = await q
    setLogs(data ?? [])
    setLoading(false)
  }, [facilityId, module, dateFrom])

  useEffect(() => { load() }, [load])

  const filtered = logs.filter((l) => {
    if (!search) return true
    const q = search.toLowerCase()
    return (l.entity_label ?? '').toLowerCase().includes(q)
      || (l.actor_name ?? '').toLowerCase().includes(q)
      || (l.action ?? '').toLowerCase().includes(q)
  })

  const modules = [...new Set(logs.map((l) => l.module).filter(Boolean))]

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3">
        <Input placeholder="Varlık, kullanıcı veya aksiyon ara…" value={search}
          onChange={(e) => setSearch(e.target.value)} className="w-56" />
        <Select options={[{ value: '', label: 'Tüm Modüller' }, ...modules.map((m) => ({ value: m, label: m }))]}
          value={module} onChange={(e) => setModule(e.target.value)} />
        <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
        {(module || dateFrom) && (
          <button onClick={() => { setModule(''); setDateFrom('') }}
            className="text-xs text-slate-500 hover:text-slate-300 transition-colors">
            Filtreleri Temizle
          </button>
        )}
      </div>

      <div className="rounded-xl border border-slate-700 overflow-hidden">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-slate-700 bg-slate-800/50">
              {['Zaman', 'Kullanıcı', 'Modül', 'Aksiyon', 'Varlık', 'Değer'].map((h) => (
                <th key={h} className="px-3 py-2 text-left text-slate-400 font-medium">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-700/40">
            {loading ? (
              <tr><td colSpan={6} className="px-3 py-8 text-center text-slate-500">Yükleniyor…</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={6} className="px-3 py-8 text-center text-slate-500">Kayıt yok</td></tr>
            ) : filtered.map((l) => (
              <tr key={l.id} className="bg-slate-800/40 hover:bg-slate-700/40 transition-colors">
                <td className="px-3 py-2 text-slate-500 whitespace-nowrap">{timeStr(l.created_at)}</td>
                <td className="px-3 py-2 text-slate-300">{l.actor_name ?? '—'}</td>
                <td className="px-3 py-2">
                  <span className={`font-medium ${MODULE_COLORS[l.module] ?? 'text-slate-400'}`}>{l.module}</span>
                </td>
                <td className="px-3 py-2 text-slate-300">{l.action}</td>
                <td className="px-3 py-2">
                  <span className="text-slate-500">{l.entity_type} · </span>
                  <span className="font-mono text-slate-200">{l.entity_label ?? '—'}</span>
                </td>
                <td className="px-3 py-2 text-slate-500 max-w-xs truncate">
                  {l.new_values ? JSON.stringify(l.new_values).slice(0, 60) : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-slate-600">
        Audit log kayıtları değiştirilemez ve silinemez (AS9100 §7.5 — 10 yıl arşiv).
        {filtered.length > 0 && ` ${filtered.length} kayıt gösteriliyor.`}
      </p>
    </div>
  )
}

// ── Measurements Tab ──────────────────────────────────────────────
function MeasurementsTab({ facilityId }) {
  const [measurements, setMeasurements] = useState([])
  const [loading, setLoading] = useState(true)
  const [context, setContext] = useState('')
  const [search, setSearch] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    let q = supabase
      .from('tool_measurements')
      .select('*, tool_instances(barcode, tool_definitions(internal_code, name)), work_orders(wo_code)')
      .eq('facility_id', facilityId)
      .order('measured_at', { ascending: false })
      .limit(200)
    if (context) q = q.eq('context', context)
    const { data } = await q
    setMeasurements(data ?? [])
    setLoading(false)
  }, [facilityId, context])

  useEffect(() => { load() }, [load])

  const filtered = measurements.filter((m) => {
    if (!search) return true
    const q = search.toLowerCase()
    return (m.tool_instances?.barcode ?? '').toLowerCase().includes(q)
      || (m.tool_instances?.tool_definitions?.name ?? '').toLowerCase().includes(q)
      || (m.work_orders?.wo_code ?? '').toLowerCase().includes(q)
  })

  const columns = [
    { key: 'measured_at', label: 'Zaman', width: 130, render: (v) => <span className="text-xs text-slate-400">{timeStr(v)}</span> },
    { key: 'tool_instances', label: 'Takım', render: (v) => (
      <div>
        <p className="text-slate-200 text-xs">{v?.tool_definitions?.name ?? '—'}</p>
        <p className="font-mono text-blue-300 text-[11px]">{v?.barcode ?? '—'}</p>
      </div>
    )},
    { key: 'context',    label: 'Bağlam',   width: 90,  render: (v) => <StatusBadge status={v} map={CONTEXT_MAP} /> },
    { key: 'pot_number', label: 'Pot',       width: 50,  render: (v) => v ?? '—' },
    { key: 'length_mm',  label: 'L (mm)',    width: 80,  render: (v) => v != null ? <span className="font-mono text-xs">{v}</span> : '—' },
    { key: 'diameter_mm',label: 'Ø (mm)',    width: 80,  render: (v) => v != null ? <span className="font-mono text-xs">{v}</span> : '—' },
    { key: 'delta_length_mm', label: 'ΔL',  width: 70,  render: (v) => v != null
      ? <span className={`font-mono text-xs font-bold ${Math.abs(v) > 0.05 ? 'text-amber-400' : 'text-slate-400'}`}>{v > 0 ? '+' : ''}{v}</span>
      : '—'
    },
    { key: 'result',     label: 'Sonuç',     width: 90,  render: (v) => v ? <StatusBadge status={v} map={MEAS_RESULT_MAP} /> : '—' },
    { key: 'work_orders', label: 'WO',       width: 110, render: (v) => v ? <span className="font-mono text-xs text-slate-400">{v.wo_code}</span> : '—' },
    { key: 'source_file', label: 'Dosya',    width: 100, render: (v) => v ? <span className="font-mono text-[10px] text-slate-500">{v}</span> : '—' },
  ]

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3">
        <Input placeholder="Barkod veya takım adı ara…" value={search}
          onChange={(e) => setSearch(e.target.value)} className="w-56" />
        <div className="flex gap-1 rounded-lg bg-slate-800 p-1">
          {[['', 'Tümü'], ['GKK', 'GKK'], ['SETUP', 'Setup'], ['CHECKIN', 'İade']].map(([v, l]) => (
            <button key={v} onClick={() => setContext(v)}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${context === v ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-slate-200'}`}>
              {l}
            </button>
          ))}
        </div>
      </div>
      <Table columns={columns} data={filtered}
        emptyText={loading ? 'Yükleniyor…' : 'Ölçüm kaydı yok — Presetter entegrasyonu aktif değil'} />
    </div>
  )
}

// ── Checkout History Tab ──────────────────────────────────────────
function CheckoutHistoryTab({ facilityId }) {
  const [checkouts, setCheckouts] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [dateFrom, setDateFrom] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    let q = supabase
      .from('checkouts')
      .select(`
        id, checkout_at, checkin_at, checkout_type, checkin_condition, usage_minutes, usage_parts, is_open,
        tool_instances(barcode, tool_definitions(internal_code, name)),
        work_orders(wo_code),
        profiles!checkouts_checked_out_by_fkey(full_name)
      `)
      .eq('facility_id', facilityId)
      .order('checkout_at', { ascending: false })
      .limit(300)

    if (dateFrom) q = q.gte('checkout_at', dateFrom)
    const { data } = await q
    setCheckouts(data ?? [])
    setLoading(false)
  }, [facilityId, dateFrom])

  useEffect(() => { load() }, [load])

  const filtered = checkouts.filter((c) => {
    if (!search) return true
    const q = search.toLowerCase()
    return (c.tool_instances?.barcode ?? '').toLowerCase().includes(q)
      || (c.tool_instances?.tool_definitions?.name ?? '').toLowerCase().includes(q)
      || (c.work_orders?.wo_code ?? '').toLowerCase().includes(q)
      || (c.profiles?.full_name ?? '').toLowerCase().includes(q)
  })

  const CONDITION_MAP = {
    good:    { label: 'İyi',     cls: 'badge-ok' },
    worn:    { label: 'Aşınmış', cls: 'badge-warning' },
    damaged: { label: 'Hasarlı', cls: 'badge-critical' },
    broken:  { label: 'Kırık',   cls: 'badge-critical' },
  }

  const columns = [
    { key: 'checkout_at', label: 'Zimmet', width: 120, render: (v) => <span className="text-xs text-slate-400">{timeStr(v)}</span> },
    { key: 'tool_instances', label: 'Takım', render: (v) => (
      <div>
        <p className="text-slate-200 text-xs">{v?.tool_definitions?.name ?? '—'}</p>
        <p className="font-mono text-blue-300 text-[11px]">{v?.barcode ?? '—'}</p>
      </div>
    )},
    { key: 'profiles',    label: 'Kullanan',  width: 120, render: (v) => v?.full_name ?? '—' },
    { key: 'work_orders', label: 'WO',        width: 110, render: (v) => v ? <span className="font-mono text-xs text-slate-400">{v.wo_code}</span> : '—' },
    { key: 'checkin_at',  label: 'İade',      width: 120, render: (v) => v ? <span className="text-xs text-slate-400">{timeStr(v)}</span> : <span className="badge-warning text-[10px]">Açık</span> },
    { key: 'usage_minutes', label: 'Süre (dk)', width: 80, render: (v) => v ?? '—' },
    { key: 'usage_parts',   label: 'Parça',    width: 60, render: (v) => v ?? '—' },
    { key: 'checkin_condition', label: 'Durum', width: 90, render: (v) => v ? <StatusBadge status={v} map={CONDITION_MAP} /> : '—' },
  ]

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3">
        <Input placeholder="Takım, WO veya kullanıcı ara…" value={search}
          onChange={(e) => setSearch(e.target.value)} className="w-56" />
        <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
        {dateFrom && (
          <button onClick={() => setDateFrom('')} className="text-xs text-slate-500 hover:text-slate-300">Temizle</button>
        )}
      </div>
      <Table columns={columns} data={filtered}
        emptyText={loading ? 'Yükleniyor…' : 'Zimmet kaydı yok'} />
      <p className="text-xs text-slate-600">{filtered.length} kayıt · Son 300 hareket</p>
    </div>
  )
}

// ── Main ──────────────────────────────────────────────────────────
export default function RecordsPage() {
  const { profile } = useAuthStore()
  const [tab, setTab] = useState('audit')

  const fid = profile?.facility_id

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Kayıtlar & Denetim</h1>
        <p className="mt-1 text-sm text-slate-400">M1 — Audit log · Presetter ölçümleri · Zimmet geçmişi</p>
      </div>

      <div className="flex gap-1 rounded-lg bg-slate-800 p-1 w-fit">
        {[
          ['audit',    'Denetim İzi'],
          ['measurements', 'Presetter Ölçümleri'],
          ['checkouts', 'Zimmet Geçmişi'],
        ].map(([id, label]) => (
          <button key={id} onClick={() => setTab(id)}
            className={`rounded-md px-4 py-1.5 text-xs font-medium transition-colors ${tab === id ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-slate-200'}`}>
            {label}
          </button>
        ))}
      </div>

      {fid && tab === 'audit'        && <AuditTab         facilityId={fid} />}
      {fid && tab === 'measurements' && <MeasurementsTab  facilityId={fid} />}
      {fid && tab === 'checkouts'    && <CheckoutHistoryTab facilityId={fid} />}
    </div>
  )
}
