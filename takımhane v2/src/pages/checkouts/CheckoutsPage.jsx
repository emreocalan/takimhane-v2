import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/authStore'
import { returnCheckout } from '@/services/checkout'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import Select from '@/components/ui/Select'
import Modal from '@/components/ui/Modal'
import { Table, StatusBadge } from '@/components/ui/Table'

// ── Constants ─────────────────────────────────────────────────────
const CONDITION_MAP = {
  good:    { label: 'İyi',     cls: 'badge-ok' },
  worn:    { label: 'Aşınmış', cls: 'badge-warning' },
  damaged: { label: 'Hasarlı', cls: 'badge-critical' },
  broken:  { label: 'Kırık',   cls: 'badge-critical' },
}

const TYPE_MAP = {
  wo_setup:  { label: 'WO Setup',   cls: 'badge-info' },
  quick:     { label: 'Hızlı',      cls: 'badge-info' },
  temporary: { label: 'Geçici',     cls: 'badge-warning' },
}

const CONDITION_OPTS = Object.entries(CONDITION_MAP).map(([value, { label }]) => ({ value, label }))

// ── Return Modal ──────────────────────────────────────────────────
function ReturnModal({ checkout, onClose, onDone }) {
  const { profile } = useAuthStore()
  const [form, setForm] = useState({ checkin_condition: 'good', usage_minutes: '', usage_parts: '', notes: '' })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }))

  const submit = async () => {
    setSaving(true); setError('')
    try {
      await returnCheckout({
        checkoutId: checkout.id,
        checkinCondition: form.checkin_condition,
        usageMinutes: form.usage_minutes !== '' ? Number(form.usage_minutes) : null,
        usageParts: form.usage_parts !== '' ? Number(form.usage_parts) : null,
        checkedInBy: profile.id,
        notes: form.notes || null,
      })
      onDone()
    } catch (e) { setError(e.message) }
    finally { setSaving(false) }
  }

  const barcode  = checkout.tool_instances?.barcode ?? '—'
  const defName  = checkout.tool_instances?.tool_definitions?.name ?? '—'
  const woCode   = checkout.work_orders?.wo_code ?? null
  const duration = checkout.checkout_at
    ? Math.round((Date.now() - new Date(checkout.checkout_at)) / 60000)
    : null

  return (
    <Modal open onClose={onClose} title="İade Al" size="sm"
      footer={<><Button variant="secondary" onClick={onClose}>İptal</Button><Button onClick={submit} loading={saving}>İade Et</Button></>}>
      <div className="space-y-4">
        <div className="rounded-xl bg-slate-700/40 p-4 space-y-1 text-sm">
          <p className="font-medium text-white">{defName}</p>
          <p className="font-mono text-blue-300">{barcode}</p>
          {woCode && <p className="text-slate-400">WO: <span className="font-mono">{woCode}</span></p>}
          {duration != null && (
            <p className="text-slate-500 text-xs">
              Zimmet süresi: {duration >= 60 ? `${Math.floor(duration / 60)}s ${duration % 60}d` : `${duration} dakika`}
            </p>
          )}
        </div>

        <Select label="İade Durumu" required options={CONDITION_OPTS} value={form.checkin_condition}
          onChange={(e) => set('checkin_condition', e.target.value)} />
        <div className="grid grid-cols-2 gap-3">
          <Input label="Kullanım (dakika)" type="number" value={form.usage_minutes}
            onChange={(e) => set('usage_minutes', e.target.value)} placeholder={duration ?? ''} />
          <Input label="Üretilen Parça" type="number" value={form.usage_parts}
            onChange={(e) => set('usage_parts', e.target.value)} />
        </div>
        <Input label="Notlar" value={form.notes} onChange={(e) => set('notes', e.target.value)} />
        {error && <p className="text-sm text-red-400">{error}</p>}
      </div>
    </Modal>
  )
}

// ── Main component ────────────────────────────────────────────────
export default function CheckoutsPage() {
  const { profile } = useAuthStore()
  const [checkouts, setCheckouts] = useState([])
  const [tab, setTab] = useState('open')
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [returning, setReturning] = useState(null)

  const load = useCallback(async () => {
    if (!profile?.facility_id) return
    setLoading(true)

    const query = supabase
      .from('checkouts')
      .select(`
        *,
        tool_instances(barcode, tool_definitions(internal_code, name)),
        work_orders(wo_code, part_no, part_name),
        profiles!checkouts_checked_out_by_fkey(full_name),
        checked_in_profile:profiles!checkouts_checked_in_by_fkey(full_name)
      `)
      .eq('facility_id', profile.facility_id)
      .order('checkout_at', { ascending: false })

    if (tab === 'open') {
      query.eq('is_open', true)
    } else {
      // Closed: last 7 days
      const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
      query.eq('is_open', false).gte('checkin_at', since)
    }

    const { data } = await query.limit(200)
    setCheckouts(data ?? [])
    setLoading(false)
  }, [profile?.facility_id, tab])

  useEffect(() => { load() }, [load])

  // Realtime: yeni zimmet açıldığında güncelle
  useEffect(() => {
    if (!profile?.facility_id) return
    const channel = supabase
      .channel('checkouts-realtime')
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'checkouts',
        filter: `facility_id=eq.${profile.facility_id}`,
      }, () => load())
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [profile?.facility_id, load])

  const filtered = checkouts.filter((c) => {
    if (!search) return true
    const q = search.toLowerCase()
    return (c.tool_instances?.barcode ?? '').toLowerCase().includes(q)
      || (c.tool_instances?.tool_definitions?.name ?? '').toLowerCase().includes(q)
      || (c.work_orders?.wo_code ?? '').toLowerCase().includes(q)
      || (c.profiles?.full_name ?? '').toLowerCase().includes(q)
  })

  const openColumns = [
    { key: 'tool_instances', label: 'Takım', render: (v) => (
      <div>
        <p className="text-slate-200 text-sm">{v?.tool_definitions?.name ?? '—'}</p>
        <p className="font-mono text-blue-300 text-xs">{v?.barcode ?? '—'}</p>
      </div>
    )},
    { key: 'work_orders', label: 'İş Emri', width: 130, render: (v) => v
      ? <div>
          <p className="font-mono text-slate-300 text-xs">{v.wo_code}</p>
          <p className="text-slate-500 text-xs">{v.part_no ?? ''}</p>
        </div>
      : <span className="text-slate-600">—</span>
    },
    { key: 'checkout_type', label: 'Tip', width: 90, render: (v) => <StatusBadge status={v} map={TYPE_MAP} /> },
    { key: 'profiles', label: 'Zimmetleyen', width: 130, render: (v) => v?.full_name ?? '—' },
    { key: 'checkout_at', label: 'Zaman', width: 130, render: (v) => {
        const mins = Math.round((Date.now() - new Date(v)) / 60000)
        const label = mins < 60 ? `${mins}d önce` : mins < 1440 ? `${Math.floor(mins / 60)}s önce` : new Date(v).toLocaleDateString('tr-TR')
        return <span className="text-slate-400 text-xs">{label}</span>
    }},
    {
      key: '_return', label: '', width: 90,
      render: (_, row) => (
        <button onClick={(e) => { e.stopPropagation(); setReturning(row) }}
          className="rounded-lg bg-emerald-700 hover:bg-emerald-600 px-3 py-1 text-xs font-medium text-white transition-colors">
          İade Al
        </button>
      ),
    },
  ]

  const closedColumns = [
    { key: 'tool_instances', label: 'Takım', render: (v) => (
      <div>
        <p className="text-slate-200 text-sm">{v?.tool_definitions?.name ?? '—'}</p>
        <p className="font-mono text-blue-300 text-xs">{v?.barcode ?? '—'}</p>
      </div>
    )},
    { key: 'work_orders', label: 'İş Emri', width: 110, render: (v) => v ? <span className="font-mono text-xs text-slate-300">{v.wo_code}</span> : <span className="text-slate-600">—</span> },
    { key: 'profiles', label: 'Zimmetleyen', width: 120, render: (v) => v?.full_name ?? '—' },
    { key: 'checkin_condition', label: 'Durum', width: 90, render: (v) => v ? <StatusBadge status={v} map={CONDITION_MAP} /> : <span className="text-slate-600">—</span> },
    { key: 'usage_minutes', label: 'Süre (dk)', width: 80, render: (v) => v ?? '—' },
    { key: 'usage_parts',   label: 'Parça',     width: 60, render: (v) => v ?? '—' },
    { key: 'checkin_at', label: 'İade', width: 130, render: (v) => v ? new Date(v).toLocaleString('tr-TR', { dateStyle: 'short', timeStyle: 'short' }) : '—' },
  ]

  const openCount   = tab === 'open'   ? filtered.length : '?'
  const closedCount = tab === 'closed' ? filtered.length : '?'

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Zimmetler & İadeler</h1>
          <p className="mt-1 text-sm text-slate-400">M4 — Açık zimmet takibi</p>
        </div>
        {tab === 'open' && (
          <div className={`flex items-center gap-2 rounded-xl px-4 py-2 ${filtered.length > 0 ? 'bg-amber-500/10 border border-amber-500/30' : 'bg-slate-800'}`}>
            <span className={`text-2xl font-bold ${filtered.length > 0 ? 'text-amber-400' : 'text-slate-400'}`}>{filtered.length}</span>
            <span className="text-sm text-slate-400">açık zimmet</span>
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Input placeholder="Takım, WO kodu veya kişi ara…" value={search} onChange={(e) => setSearch(e.target.value)} className="w-64" />
        <div className="flex gap-1 rounded-lg bg-slate-800 p-1">
          <button onClick={() => setTab('open')}
            className={`rounded-md px-4 py-1.5 text-xs font-medium transition-colors ${tab === 'open' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-slate-200'}`}>
            Açık Zimmetler
          </button>
          <button onClick={() => setTab('closed')}
            className={`rounded-md px-4 py-1.5 text-xs font-medium transition-colors ${tab === 'closed' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-slate-200'}`}>
            Son 7 Günlük İadeler
          </button>
        </div>
      </div>

      <Table
        columns={tab === 'open' ? openColumns : closedColumns}
        data={filtered}
        emptyText={loading ? 'Yükleniyor…' : tab === 'open' ? 'Açık zimmet yok' : 'Son 7 günde iade kaydı yok'}
      />

      {returning && (
        <ReturnModal
          checkout={returning}
          onClose={() => setReturning(null)}
          onDone={() => { setReturning(null); load() }}
        />
      )}
    </div>
  )
}
