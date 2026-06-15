import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/authStore'
import { createCheckout } from '@/services/checkout'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import Select from '@/components/ui/Select'
import Modal from '@/components/ui/Modal'
import { Table, StatusBadge } from '@/components/ui/Table'

// ── Status map ────────────────────────────────────────────────────
const STATUS_MAP = {
  available:    { label: 'Müsait',      cls: 'badge-ok' },
  checked_out:  { label: 'Zimmette',    cls: 'badge-warning' },
  calibration:  { label: 'Kalibrasyon', cls: 'badge-info' },
  regrind:      { label: 'Bilemede',    cls: 'badge-info' },
  quarantine:   { label: 'Karantina',   cls: 'badge-critical' },
  scrapped:     { label: 'Bertaraf',    cls: 'badge-critical' },
}

const STATUS_OPTIONS = Object.entries(STATUS_MAP).map(([value, { label }]) => ({ value, label }))

const LIFE_COLOR = (pct) => {
  if (pct == null) return 'text-slate-500'
  if (pct > 50) return 'text-emerald-400'
  if (pct > 20) return 'text-amber-400'
  return 'text-red-400'
}

const MEAS_MAP = {
  PASS:        { label: 'PASS',        cls: 'badge-ok' },
  CONDITIONAL: { label: 'ŞARTLI',      cls: 'badge-warning' },
  FAIL:        { label: 'FAIL',        cls: 'badge-critical' },
}

// ── Add Instance Form ─────────────────────────────────────────────
const EMPTY_ADD = {
  barcode: '', definition_id: '', serial_no: '', lot_no: '', coc_no: '',
  location_id: '', max_regrind_count: '', next_calibration_date: '',
}

// ── Checkout modal ────────────────────────────────────────────────
function CheckoutModal({ instance, onClose, onDone }) {
  const { profile } = useAuthStore()
  const [checkoutReason, setCheckoutReason] = useState('')
  const [reasons, setReasons] = useState([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    supabase.from('lookup_codes').select('code, label').eq('category', 'checkout_reason').eq('is_active', true).order('display_order')
      .then(({ data }) => setReasons(data ?? []))
  }, [])

  const submit = async () => {
    setSaving(true); setError('')
    try {
      await createCheckout({
        instanceId: instance.id,
        checkoutType: 'temporary',
        checkedOutBy: profile.id,
        reasonCode: checkoutReason || null,
        woId: null,
        facilityId: profile.facility_id,
      })
      onDone()
    } catch (e) { setError(e.message) }
    finally { setSaving(false) }
  }

  return (
    <Modal open onClose={onClose} title={`Zimmet — ${instance.barcode}`} size="sm"
      footer={<><Button variant="secondary" onClick={onClose}>İptal</Button><Button onClick={submit} loading={saving}>Zimmet Ver</Button></>}>
      <div className="space-y-4">
        <div className="rounded-xl bg-slate-700/50 p-4 text-sm space-y-1">
          <p className="text-white font-medium">{instance.tool_definitions?.name}</p>
          <p className="text-slate-400 font-mono text-xs">{instance.barcode}</p>
          {instance.life_remaining_pct != null && (
            <p className={`text-xs font-medium ${LIFE_COLOR(instance.life_remaining_pct)}`}>
              Kalan ömür: %{instance.life_remaining_pct.toFixed(1)}
            </p>
          )}
        </div>
        <Select label="Zimmet Sebebi" options={reasons.map((r) => ({ value: r.code, label: r.label }))}
          value={checkoutReason} onChange={(e) => setCheckoutReason(e.target.value)} />
        {error && <p className="text-sm text-red-400">{error}</p>}
      </div>
    </Modal>
  )
}

// ── Detail / Status change modal ──────────────────────────────────
function InstanceDetailModal({ instance, locations, onClose, onDone }) {
  const [status, setStatus] = useState(instance.status)
  const [locationId, setLocationId] = useState(instance.location_id ?? '')
  const [notes, setNotes] = useState(instance.notes ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const save = async () => {
    setSaving(true); setError('')
    try {
      const { error: err } = await supabase.from('tool_instances').update({
        status, location_id: locationId || null, notes: notes || null,
      }).eq('id', instance.id)
      if (err) throw err
      onDone()
    } catch (e) { setError(e.message) }
    finally { setSaving(false) }
  }

  const defName = instance.tool_definitions?.name ?? '—'
  const defCode = instance.tool_definitions?.internal_code ?? '—'

  return (
    <Modal open onClose={onClose} title={`Kayıt Detayı — ${instance.barcode}`} size="lg"
      footer={<><Button variant="secondary" onClick={onClose}>Kapat</Button><Button onClick={save} loading={saving}>Güncelle</Button></>}>
      <div className="space-y-5">
        {/* Info header */}
        <div className="grid grid-cols-2 gap-4 rounded-xl bg-slate-700/40 p-4 text-sm">
          <div>
            <p className="text-xs text-slate-500">Takım Tanımı</p>
            <p className="font-medium text-white">{defName}</p>
            <p className="text-xs font-mono text-slate-400">{defCode}</p>
          </div>
          <div>
            <p className="text-xs text-slate-500">Barkod / Seri</p>
            <p className="font-mono text-blue-300">{instance.barcode}</p>
            {instance.serial_no && <p className="text-xs text-slate-400">S/N: {instance.serial_no}</p>}
            {instance.lot_no    && <p className="text-xs text-slate-400">Lot: {instance.lot_no}</p>}
          </div>
          {instance.last_length_mm != null && (
            <div>
              <p className="text-xs text-slate-500">Son Presetter Ölçümü</p>
              <p className="font-mono text-sm text-white">
                L={instance.last_length_mm}mm  Ø={instance.last_diameter_mm ?? '?'}mm
              </p>
              {instance.last_measurement_result && (
                <span className={`text-[10px] font-bold ${MEAS_MAP[instance.last_measurement_result]?.cls ?? ''}`}>
                  {MEAS_MAP[instance.last_measurement_result]?.label}
                </span>
              )}
            </div>
          )}
          {instance.life_remaining_pct != null && (
            <div>
              <p className="text-xs text-slate-500">Kalan Ömür</p>
              <p className={`text-xl font-bold ${LIFE_COLOR(instance.life_remaining_pct)}`}>
                %{instance.life_remaining_pct.toFixed(1)}
              </p>
              <div className="mt-1 h-1.5 w-full rounded-full bg-slate-600">
                <div className={`h-1.5 rounded-full transition-all ${instance.life_remaining_pct > 50 ? 'bg-emerald-500' : instance.life_remaining_pct > 20 ? 'bg-amber-500' : 'bg-red-500'}`}
                  style={{ width: `${Math.min(100, instance.life_remaining_pct)}%` }} />
              </div>
            </div>
          )}
          {instance.next_calibration_date && (
            <div>
              <p className="text-xs text-slate-500">Sonraki Kalibrasyon</p>
              <p className="font-medium text-white">{new Date(instance.next_calibration_date).toLocaleDateString('tr-TR')}</p>
            </div>
          )}
          <div>
            <p className="text-xs text-slate-500">Bileme Sayısı</p>
            <p className="text-white">{instance.regrind_count} / {instance.max_regrind_count ?? '∞'}</p>
          </div>
        </div>

        {/* Editable fields */}
        <div className="grid grid-cols-2 gap-4">
          <Select label="Durum" options={STATUS_OPTIONS} value={status} onChange={(e) => setStatus(e.target.value)} />
          <Select label="Depo Konumu"
            options={locations.map((l) => ({ value: l.id, label: l.name ?? l.code }))}
            value={locationId} onChange={(e) => setLocationId(e.target.value)} />
          <Input label="Notlar" value={notes} onChange={(e) => setNotes(e.target.value)} className="col-span-2" />
        </div>
        {error && <p className="text-sm text-red-400">{error}</p>}
      </div>
    </Modal>
  )
}

// ── Main component ────────────────────────────────────────────────
export default function StockPage() {
  const { profile } = useAuthStore()
  const [instances, setInstances] = useState([])
  const [definitions, setDefinitions] = useState([])
  const [locations, setLocations] = useState([])
  const [filterStatus, setFilterStatus] = useState('all')
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [addModal, setAddModal] = useState(false)
  const [detailInstance, setDetailInstance] = useState(null)
  const [checkoutInstance, setCheckoutInstance] = useState(null)
  const [form, setForm] = useState(EMPTY_ADD)
  const [saving, setSaving] = useState(false)
  const [addError, setAddError] = useState('')
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }))

  const load = useCallback(async () => {
    if (!profile?.facility_id) return
    setLoading(true)
    const { data } = await supabase
      .from('tool_instances')
      .select(`
        *,
        tool_definitions(id, internal_code, name, tool_types(name, color)),
        storage_locations(id, name, code, level)
      `)
      .eq('facility_id', profile.facility_id)
      .order('created_at', { ascending: false })
    setInstances(data ?? [])
    setLoading(false)
  }, [profile?.facility_id])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    if (!profile?.facility_id) return
    Promise.all([
      supabase.from('tool_definitions').select('id, internal_code, name').eq('facility_id', profile.facility_id).eq('is_active', true).order('internal_code'),
      supabase.from('storage_locations').select('id, name, code, level').eq('facility_id', profile.facility_id).order('name'),
    ]).then(([{ data: d }, { data: l }]) => {
      setDefinitions(d ?? [])
      setLocations(l ?? [])
    })
  }, [profile?.facility_id])

  const openAdd = () => { setForm(EMPTY_ADD); setAddError(''); setAddModal(true) }

  const saveNew = async () => {
    if (!form.barcode || !form.definition_id) { setAddError('Barkod ve takım tanımı zorunludur.'); return }
    setSaving(true); setAddError('')
    try {
      const { error: err } = await supabase.from('tool_instances').insert({
        facility_id: profile.facility_id,
        definition_id: form.definition_id,
        barcode: form.barcode.trim(),
        serial_no: form.serial_no || null,
        lot_no: form.lot_no || null,
        coc_no: form.coc_no || null,
        location_id: form.location_id || null,
        max_regrind_count: form.max_regrind_count !== '' ? Number(form.max_regrind_count) : null,
        next_calibration_date: form.next_calibration_date || null,
        status: 'available',
      })
      if (err) throw err
      await load(); setAddModal(false)
    } catch (e) { setAddError(e.message) }
    finally { setSaving(false) }
  }

  // Barcode scan listener
  useEffect(() => {
    const onScan = (e) => {
      if (addModal) {
        set('barcode', e.detail)
      }
    }
    window.addEventListener('barcode-scan', onScan)
    return () => window.removeEventListener('barcode-scan', onScan)
  }, [addModal])

  // ── Counts for filter tabs ────────────────────────────────────
  const counts = instances.reduce((acc, i) => { acc[i.status] = (acc[i.status] ?? 0) + 1; return acc }, {})

  const filtered = instances.filter((i) => {
    if (filterStatus !== 'all' && i.status !== filterStatus) return false
    if (search) {
      const q = search.toLowerCase()
      return i.barcode.toLowerCase().includes(q)
        || (i.tool_definitions?.name ?? '').toLowerCase().includes(q)
        || (i.tool_definitions?.internal_code ?? '').toLowerCase().includes(q)
        || (i.serial_no ?? '').toLowerCase().includes(q)
    }
    return true
  })

  const columns = [
    { key: 'barcode', label: 'Barkod', width: 130, render: (v) => <span className="font-mono text-blue-300">{v}</span> },
    { key: 'tool_definitions', label: 'Takım', render: (v) => (
      <div>
        <p className="text-slate-200 text-sm">{v?.name ?? '—'}</p>
        <p className="text-slate-500 text-xs font-mono">{v?.internal_code ?? ''}</p>
      </div>
    )},
    { key: 'status', label: 'Durum', width: 110, render: (v) => <StatusBadge status={v} map={STATUS_MAP} /> },
    { key: 'storage_locations', label: 'Konum', render: (v) => v?.name ?? v?.code ?? '—' },
    { key: 'life_remaining_pct', label: 'Ömür', width: 80, render: (v) => v != null
      ? <span className={`font-medium ${LIFE_COLOR(v)}`}>%{v.toFixed(0)}</span>
      : <span className="text-slate-600">—</span>
    },
    { key: 'last_measurement_result', label: 'Ölçüm', width: 80, render: (v) => v
      ? <span className={`text-xs font-bold ${MEAS_MAP[v]?.cls ?? ''}`}>{MEAS_MAP[v]?.label ?? v}</span>
      : <span className="text-slate-600">—</span>
    },
    {
      key: '_actions', label: '', width: 100,
      render: (_, row) => row.status === 'available' ? (
        <button onClick={(e) => { e.stopPropagation(); setCheckoutInstance(row) }}
          className="rounded-lg bg-blue-600 hover:bg-blue-500 px-3 py-1 text-xs font-medium text-white transition-colors">
          Zimmet Ver
        </button>
      ) : null,
    },
  ]

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Fiziksel Stok</h1>
          <p className="mt-1 text-sm text-slate-400">M7 — {instances.length} kayıtlı takım</p>
        </div>
        <Button onClick={openAdd} icon="+">Takım Kayıt Et</Button>
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3">
        <Input placeholder="Barkod, takım adı veya kod ara…" value={search} onChange={(e) => setSearch(e.target.value)} className="w-64" />
        <div className="flex flex-wrap gap-1 rounded-lg bg-slate-800 p-1">
          <button onClick={() => setFilterStatus('all')}
            className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${filterStatus === 'all' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-slate-200'}`}>
            Tümü ({instances.length})
          </button>
          {Object.entries(STATUS_MAP).map(([s, { label }]) => {
            const cnt = counts[s] ?? 0
            if (!cnt) return null
            return (
              <button key={s} onClick={() => setFilterStatus(s)}
                className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${filterStatus === s ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-slate-200'}`}>
                {label} ({cnt})
              </button>
            )
          })}
        </div>
      </div>

      <Table columns={columns} data={filtered} onRowClick={(row) => setDetailInstance(row)}
        emptyText={loading ? 'Yükleniyor…' : 'Stok kaydı yok — "Takım Kayıt Et" ile ekleyin'} />

      {/* Add Modal */}
      <Modal open={addModal} onClose={() => setAddModal(false)} title="Yeni Takım Kaydı" size="lg"
        footer={<><Button variant="secondary" onClick={() => setAddModal(false)}>İptal</Button><Button onClick={saveNew} loading={saving}>Kaydet</Button></>}>
        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2">
            <Input label="Barkod" required value={form.barcode} onChange={(e) => set('barcode', e.target.value)}
              placeholder="Okutun veya yazın…" hint="Barkod okuyucu ile taratabilirsiniz" />
          </div>
          <Select label="Takım Tanımı (Katalog)" required
            options={definitions.map((d) => ({ value: d.id, label: `${d.internal_code} — ${d.name}` }))}
            value={form.definition_id} onChange={(e) => set('definition_id', e.target.value)}
            className="col-span-2" />
          <Input label="Seri No" value={form.serial_no} onChange={(e) => set('serial_no', e.target.value)} />
          <Input label="Lot No" value={form.lot_no} onChange={(e) => set('lot_no', e.target.value)} />
          <Input label="CoC No" value={form.coc_no} onChange={(e) => set('coc_no', e.target.value)} hint="Certificate of Conformance" />
          <Select label="Depo Konumu"
            options={locations.map((l) => ({ value: l.id, label: l.name ?? l.code }))}
            value={form.location_id} onChange={(e) => set('location_id', e.target.value)} />
          <Input label="Maks. Bileme Sayısı" type="number" value={form.max_regrind_count}
            onChange={(e) => set('max_regrind_count', e.target.value)} />
          <Input label="Sonraki Kalibrasyon Tarihi" type="date" value={form.next_calibration_date}
            onChange={(e) => set('next_calibration_date', e.target.value)} />
        </div>
        {addError && <p className="mt-3 text-sm text-red-400">{addError}</p>}
      </Modal>

      {/* Checkout modal */}
      {checkoutInstance && (
        <CheckoutModal instance={checkoutInstance} onClose={() => setCheckoutInstance(null)}
          onDone={() => { setCheckoutInstance(null); load() }} />
      )}

      {/* Detail / status modal */}
      {detailInstance && (
        <InstanceDetailModal instance={detailInstance} locations={locations}
          onClose={() => setDetailInstance(null)}
          onDone={() => { setDetailInstance(null); load() }} />
      )}
    </div>
  )
}
