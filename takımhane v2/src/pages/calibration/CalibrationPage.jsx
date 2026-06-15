import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/authStore'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import Select from '@/components/ui/Select'
import Modal from '@/components/ui/Modal'
import { Table, StatusBadge } from '@/components/ui/Table'

// ── Constants ─────────────────────────────────────────────────────
const RESULT_MAP = {
  pass:        { label: 'Geçti',   cls: 'badge-ok' },
  conditional: { label: 'Şartlı', cls: 'badge-warning' },
  fail:        { label: 'Kaldı',  cls: 'badge-critical' },
}

const urgencyOf = (dateStr) => {
  if (!dateStr) return 'overdue'
  const days = Math.ceil((new Date(dateStr) - Date.now()) / 86400000)
  if (days < 0) return 'overdue'
  if (days <= 14) return 'soon'
  if (days <= 30) return 'upcoming'
  return 'ok'
}

const URGENCY = {
  overdue:  { label: 'Vadesi Geçmiş', ring: 'border-red-500/50 bg-red-500/5',    badge: 'badge-critical' },
  soon:     { label: '0–14 gün',      ring: 'border-red-400/40 bg-red-400/5',    badge: 'badge-critical' },
  upcoming: { label: '15–30 gün',     ring: 'border-amber-500/40 bg-amber-500/5', badge: 'badge-warning' },
  ok:       { label: 'OK',            ring: 'border-slate-700',                   badge: 'badge-ok' },
}

// ── Send-to-lab modal ─────────────────────────────────────────────
function SendModal({ tool, labSuppliers, onClose, onDone }) {
  const { profile } = useAuthStore()
  const [form, setForm] = useState({ lab_supplier_id: '', ume_ref_no: '', interval_days: 365, notes: '' })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }))

  const submit = async () => {
    setSaving(true); setError('')
    try {
      const { error: err } = await supabase.from('calibrations').insert({
        facility_id: profile.facility_id,
        instance_id: tool.id,
        lab_supplier_id: form.lab_supplier_id || null,
        ume_ref_no: form.ume_ref_no || null,
        interval_days: Number(form.interval_days),
        sent_at: new Date().toISOString(),
        notes: form.notes || null,
      })
      if (err) throw err
      await supabase.from('tool_instances').update({ status: 'calibration' }).eq('id', tool.id)
      onDone()
    } catch (e) { setError(e.message) }
    finally { setSaving(false) }
  }

  return (
    <Modal open onClose={onClose} title="Kalibrasyona Gönder" size="sm"
      footer={<><Button variant="secondary" onClick={onClose}>İptal</Button><Button onClick={submit} loading={saving}>Gönder</Button></>}>
      <div className="space-y-4">
        <div className="rounded-xl bg-slate-700/40 p-3 text-sm">
          <p className="font-medium text-white">{tool.tool_definitions?.name ?? '—'}</p>
          <p className="font-mono text-blue-300 text-xs">{tool.barcode}</p>
          {tool.next_calibration_date && (
            <p className="text-xs text-slate-500 mt-1">
              Mevcut vade: {new Date(tool.next_calibration_date).toLocaleDateString('tr-TR')}
            </p>
          )}
        </div>
        <Select label="Kalibrasyon Laboratuvarı"
          options={labSuppliers.map((s) => ({ value: s.id, label: s.name }))}
          value={form.lab_supplier_id} onChange={(e) => set('lab_supplier_id', e.target.value)} />
        <Input label="UME / TÜRKAK Referans No" value={form.ume_ref_no}
          onChange={(e) => set('ume_ref_no', e.target.value)} placeholder="UME-2026-XXXXX" />
        <Input label="Kalibrasyon Aralığı (gün)" type="number" value={form.interval_days}
          onChange={(e) => set('interval_days', e.target.value)} />
        <Input label="Notlar" value={form.notes} onChange={(e) => set('notes', e.target.value)} />
        {error && <p className="text-sm text-red-400">{error}</p>}
      </div>
    </Modal>
  )
}

// ── Return-from-lab modal ─────────────────────────────────────────
function ReturnModal({ cal, onClose, onDone }) {
  const { profile } = useAuthStore()
  const today = new Date().toISOString().slice(0, 10)
  const nextDefault = new Date(Date.now() + (cal.interval_days ?? 365) * 86400000).toISOString().slice(0, 10)
  const [form, setForm] = useState({
    calibration_date: today,
    next_calibration_date: nextDefault,
    certificate_no: '',
    certificate_url: '',
    result: 'pass',
    notes: '',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }))

  const submit = async () => {
    if (!form.calibration_date || !form.next_calibration_date || !form.result) {
      setError('Kalibrasyon tarihi, sonraki vade ve sonuç zorunludur.'); return
    }
    setSaving(true); setError('')
    try {
      const { error: e1 } = await supabase.from('calibrations').update({
        calibration_date: form.calibration_date,
        next_calibration_date: form.next_calibration_date,
        certificate_no: form.certificate_no || null,
        certificate_url: form.certificate_url || null,
        result: form.result,
        returned_at: new Date().toISOString(),
        ncr_triggered: form.result === 'fail',
        approved_by: profile.id,
        notes: form.notes || null,
      }).eq('id', cal.id)
      if (e1) throw e1

      const newStatus = form.result === 'fail' ? 'quarantine' : 'available'
      const { error: e2 } = await supabase.from('tool_instances').update({
        status: newStatus,
        next_calibration_date: form.next_calibration_date,
      }).eq('id', cal.instance_id)
      if (e2) throw e2

      onDone()
    } catch (e) { setError(e.message) }
    finally { setSaving(false) }
  }

  const barcode = cal.tool_instances?.barcode ?? '—'
  const name    = cal.tool_instances?.tool_definitions?.name ?? '—'

  return (
    <Modal open onClose={onClose} title="Kalibrasyondan İade Al" size="sm"
      footer={<><Button variant="secondary" onClick={onClose}>İptal</Button><Button onClick={submit} loading={saving}>Kaydet</Button></>}>
      <div className="space-y-4">
        <div className="rounded-xl bg-slate-700/40 p-3 text-sm">
          <p className="font-medium text-white">{name}</p>
          <p className="font-mono text-blue-300 text-xs">{barcode}</p>
          <p className="text-slate-500 text-xs mt-1">Gönderilme: {cal.sent_at ? new Date(cal.sent_at).toLocaleDateString('tr-TR') : '—'}</p>
        </div>
        <Select label="Sonuç" required
          options={[{ value: 'pass', label: 'Geçti' }, { value: 'conditional', label: 'Şartlı Kabul' }, { value: 'Kaldı', label: 'fail' }]}
          value={form.result} onChange={(e) => set('result', e.target.value)} />
        <div className="grid grid-cols-2 gap-3">
          <Input label="Kalibrasyon Tarihi" type="date" required value={form.calibration_date}
            onChange={(e) => set('calibration_date', e.target.value)} />
          <Input label="Sonraki Vade" type="date" required value={form.next_calibration_date}
            onChange={(e) => set('next_calibration_date', e.target.value)} />
        </div>
        <Input label="Sertifika No" value={form.certificate_no} onChange={(e) => set('certificate_no', e.target.value)} />
        <Input label="Sertifika URL" value={form.certificate_url} onChange={(e) => set('certificate_url', e.target.value)} placeholder="https://…" />
        <Input label="Notlar" value={form.notes} onChange={(e) => set('notes', e.target.value)} />
        {form.result === 'fail' && (
          <p className="rounded-lg bg-red-500/10 border border-red-500/30 p-3 text-xs text-red-400">
            Sonuç KALDI — takım Karantina'ya alınacak ve NCR tetiklenecek.
          </p>
        )}
        {error && <p className="text-sm text-red-400">{error}</p>}
      </div>
    </Modal>
  )
}

// ── Upcoming row ──────────────────────────────────────────────────
function UpcomingRow({ tool, onSend }) {
  const urgency = urgencyOf(tool.next_calibration_date)
  const u = URGENCY[urgency]
  const days = tool.next_calibration_date
    ? Math.ceil((new Date(tool.next_calibration_date) - Date.now()) / 86400000)
    : null

  return (
    <div className={`flex items-center gap-4 rounded-xl border p-3 ${u.ring}`}>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-white truncate">{tool.tool_definitions?.name ?? '—'}</p>
        <p className="text-xs font-mono text-blue-300">{tool.barcode}</p>
      </div>
      <div className="text-right flex-shrink-0">
        {days != null ? (
          <p className={`text-sm font-bold ${urgency === 'ok' ? 'text-emerald-400' : urgency === 'upcoming' ? 'text-amber-400' : 'text-red-400'}`}>
            {days < 0 ? `${Math.abs(days)} gün geçti` : days === 0 ? 'Bugün' : `${days} gün`}
          </p>
        ) : (
          <p className="text-xs text-slate-500">vade yok</p>
        )}
        <p className="text-xs text-slate-500">{tool.next_calibration_date ?? '—'}</p>
      </div>
      <Button size="sm" variant="secondary" onClick={() => onSend(tool)}>Gönder</Button>
    </div>
  )
}

// ── Main ──────────────────────────────────────────────────────────
export default function CalibrationPage() {
  const { profile } = useAuthStore()
  const [tab, setTab] = useState('upcoming')
  const [upcoming, setUpcoming] = useState([])
  const [inProgress, setInProgress] = useState([])
  const [history, setHistory] = useState([])
  const [labSuppliers, setLabSuppliers] = useState([])
  const [loading, setLoading] = useState(true)
  const [sendTool, setSendTool] = useState(null)
  const [returnCal, setReturnCal] = useState(null)
  const [search, setSearch] = useState('')

  const load = useCallback(async () => {
    if (!profile?.facility_id) return
    setLoading(true)
    const fid = profile.facility_id
    const in30 = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10)

    const [{ data: up }, { data: ip }, { data: hist }, { data: labs }] = await Promise.all([
      // Tools with upcoming/overdue calibration (available status, not at lab)
      supabase.from('tool_instances')
        .select('id, barcode, next_calibration_date, status, tool_definitions(name, internal_code), tool_types(requires_calibration)')
        .eq('facility_id', fid)
        .neq('status', 'scrapped')
        .neq('status', 'calibration')
        .or(`next_calibration_date.lte.${in30},next_calibration_date.is.null`)
        .order('next_calibration_date', { ascending: true, nullsFirst: true })
        .limit(100),

      // Calibrations in progress (sent but not returned)
      supabase.from('calibrations')
        .select('*, tool_instances(barcode, tool_definitions(internal_code, name)), suppliers(name)')
        .eq('facility_id', fid)
        .not('sent_at', 'is', null)
        .is('returned_at', null)
        .order('sent_at', { ascending: false }),

      // Completed calibrations (last 90 days)
      supabase.from('calibrations')
        .select('*, tool_instances(barcode, tool_definitions(internal_code, name)), suppliers(name)')
        .eq('facility_id', fid)
        .not('returned_at', 'is', null)
        .order('returned_at', { ascending: false })
        .limit(50),

      // Cal labs
      supabase.from('suppliers')
        .select('id, name')
        .contains('supplier_types', ['calibration_lab'])
        .eq('approval_status', 'active')
        .order('name'),
    ])

    setUpcoming(up ?? [])
    setInProgress(ip ?? [])
    setHistory(hist ?? [])
    setLabSuppliers(labs ?? [])
    setLoading(false)
  }, [profile?.facility_id])

  useEffect(() => { load() }, [load])

  const filteredUpcoming = upcoming.filter((t) => {
    if (!search) return true
    const q = search.toLowerCase()
    return t.barcode.toLowerCase().includes(q) || (t.tool_definitions?.name ?? '').toLowerCase().includes(q)
  })

  const overdueCount  = upcoming.filter((t) => urgencyOf(t.next_calibration_date) === 'overdue').length
  const soonCount     = upcoming.filter((t) => ['soon', 'upcoming'].includes(urgencyOf(t.next_calibration_date))).length

  const histColumns = [
    { key: 'tool_instances', label: 'Takım', render: (v) => (
      <div>
        <p className="text-slate-200 text-sm">{v?.tool_definitions?.name ?? '—'}</p>
        <p className="font-mono text-blue-300 text-xs">{v?.barcode ?? '—'}</p>
      </div>
    )},
    { key: 'suppliers',            label: 'Lab',           render: (v) => v?.name ?? '—' },
    { key: 'calibration_date',     label: 'Kal. Tarihi',   width: 110, render: (v) => v ? new Date(v).toLocaleDateString('tr-TR') : '—' },
    { key: 'next_calibration_date', label: 'Sonraki Vade', width: 110, render: (v) => v ? new Date(v).toLocaleDateString('tr-TR') : '—' },
    { key: 'certificate_no',       label: 'Sertifika No',  render: (v) => v ? <span className="font-mono text-xs">{v}</span> : '—' },
    { key: 'result',               label: 'Sonuç',         width: 90,  render: (v) => v ? <StatusBadge status={v} map={RESULT_MAP} /> : '—' },
    { key: 'ncr_triggered',        label: 'NCR',           width: 50,  render: (v) => v ? <span className="badge-critical">NCR</span> : '' },
  ]

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Kalibrasyon</h1>
          <p className="mt-1 text-sm text-slate-400">M8 — AS9100 §7.1.5 uyumlu kalibrasyon takibi</p>
        </div>
        <div className="flex gap-3">
          {overdueCount > 0 && <span className="badge-critical">{overdueCount} vadesi geçmiş</span>}
          {soonCount > 0    && <span className="badge-warning">{soonCount} yaklaşıyor</span>}
          {inProgress.length > 0 && <span className="badge-info">{inProgress.length} laboruvarda</span>}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 rounded-lg bg-slate-800 p-1 w-fit">
        {[
          ['upcoming',    `Vadesi Gelenler (${upcoming.length})`],
          ['in_progress', `Laboratuvarda (${inProgress.length})`],
          ['history',     `Tarihçe (${history.length})`],
        ].map(([id, label]) => (
          <button key={id} onClick={() => setTab(id)}
            className={`rounded-md px-4 py-1.5 text-xs font-medium transition-colors ${tab === id ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-slate-200'}`}>
            {label}
          </button>
        ))}
      </div>

      {/* Upcoming tab */}
      {tab === 'upcoming' && (
        <div className="space-y-3">
          <Input placeholder="Barkod veya takım adı ara…" value={search} onChange={(e) => setSearch(e.target.value)} className="w-64" />
          {loading ? (
            <p className="text-slate-500 text-sm">Yükleniyor…</p>
          ) : filteredUpcoming.length === 0 ? (
            <div className="card flex items-center justify-center p-16 text-slate-500">
              Kalibrasyon gerektiren takım yok ✓
            </div>
          ) : (
            <div className="space-y-2">
              {filteredUpcoming.map((t) => (
                <UpcomingRow key={t.id} tool={t} onSend={setSendTool} />
              ))}
            </div>
          )}
        </div>
      )}

      {/* In-progress tab */}
      {tab === 'in_progress' && (
        <div className="space-y-3">
          {loading ? (
            <p className="text-slate-500 text-sm">Yükleniyor…</p>
          ) : inProgress.length === 0 ? (
            <div className="card flex items-center justify-center p-16 text-slate-500">
              Laboratuvarda takım yok
            </div>
          ) : inProgress.map((cal) => (
            <div key={cal.id} className="card flex items-center gap-4 p-4">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-white">{cal.tool_instances?.tool_definitions?.name ?? '—'}</p>
                <p className="font-mono text-blue-300 text-xs">{cal.tool_instances?.barcode ?? '—'}</p>
                {cal.suppliers && <p className="text-xs text-slate-500 mt-0.5">Lab: {cal.suppliers.name}</p>}
              </div>
              <div className="text-right text-xs text-slate-500 flex-shrink-0">
                <p>Gönderilme</p>
                <p className="text-slate-300">{cal.sent_at ? new Date(cal.sent_at).toLocaleDateString('tr-TR') : '—'}</p>
                {cal.ume_ref_no && <p className="font-mono mt-1">{cal.ume_ref_no}</p>}
              </div>
              <Button size="sm" onClick={() => setReturnCal(cal)}>İade Edildi</Button>
            </div>
          ))}
        </div>
      )}

      {/* History tab */}
      {tab === 'history' && (
        <Table columns={histColumns} data={history}
          emptyText={loading ? 'Yükleniyor…' : 'Kalibrasyon kaydı yok'} />
      )}

      {sendTool && (
        <SendModal tool={sendTool} labSuppliers={labSuppliers}
          onClose={() => setSendTool(null)} onDone={() => { setSendTool(null); load() }} />
      )}
      {returnCal && (
        <ReturnModal cal={returnCal}
          onClose={() => setReturnCal(null)} onDone={() => { setReturnCal(null); load() }} />
      )}
    </div>
  )
}
