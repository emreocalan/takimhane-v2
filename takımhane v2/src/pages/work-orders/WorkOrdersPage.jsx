import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/authStore'
import { createCheckout, createQuickWO } from '@/services/checkout'
import toast from '@/lib/toast'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import Select from '@/components/ui/Select'
import Modal from '@/components/ui/Modal'
import { Table, StatusBadge } from '@/components/ui/Table'

// ── Constants ─────────────────────────────────────────────────────
const WO_STATUS_FLOW = ['planned', 'preparation', 'magazine_comparison', 'measurement', 'checkout', 'active', 'completed']

const WO_STATUS_MAP = {
  planned:              { label: 'Planlandı',       cls: 'badge-info' },
  preparation:          { label: 'Hazırlık',         cls: 'badge-info' },
  magazine_comparison:  { label: 'Magazin Karş.',    cls: 'badge-warning' },
  measurement:          { label: 'Ölçüm',            cls: 'badge-warning' },
  checkout:             { label: 'Zimmetleniyor',    cls: 'badge-warning' },
  active:               { label: 'Aktif',            cls: 'badge-ok' },
  completed:            { label: 'Tamamlandı',       cls: 'badge-ok' },
  cancelled:            { label: 'İptal',            cls: 'badge-critical' },
}

const ITEM_STATUS_MAP = {
  pending:     { label: 'Bekliyor',   cls: 'badge-info' },
  checked_out: { label: 'Zimmette',   cls: 'badge-warning' },
  returned:    { label: 'İade',       cls: 'badge-ok' },
  skipped:     { label: 'Atlandı',    cls: 'badge-critical' },
}

const MEAS_MAP = {
  PASS:        { label: 'PASS',    cls: 'badge-ok' },
  CONDITIONAL: { label: 'ŞARTLI', cls: 'badge-warning' },
  FAIL:        { label: 'FAIL',   cls: 'badge-critical' },
  PENDING:     { label: '—',      cls: '' },
}

const EMPTY_WO = {
  wo_code: '', part_no: '', part_name: '', customer_project: '',
  nc_program_ref: '', machine_id: '', assigned_operator_id: '',
  planned_setup_at: '', notes: '',
}

// ── WO Detail Modal ───────────────────────────────────────────────
function WODetailModal({ wo, machines, profiles, definitions, facilityId, onClose, onRefresh }) {
  const { profile } = useAuthStore()
  const navigate = useNavigate()
  const [items, setItems] = useState([])
  const [tab, setTab] = useState('info')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [confirmCancel, setConfirmCancel] = useState(false)
  const [addItemForm, setAddItemForm] = useState({ definition_id: '', pot_number: '', nominal_length_mm: '', nominal_diameter_mm: '' })
  const [addingItem, setAddingItem] = useState(false)
  const [addItemError, setAddItemError] = useState('')
  const setAI = (k, v) => setAddItemForm((f) => ({ ...f, [k]: v }))

  const loadItems = useCallback(async () => {
    const { data } = await supabase
      .from('wo_tool_items')
      .select('*, tool_definitions(internal_code, name), tool_instances(barcode, life_remaining_pct)')
      .eq('wo_id', wo.id)
      .order('pot_number')
    setItems(data ?? [])
  }, [wo.id])

  useEffect(() => { loadItems() }, [loadItems])

  const nextStatus = WO_STATUS_FLOW[WO_STATUS_FLOW.indexOf(wo.status) + 1]

  const advanceStatus = async () => {
    if (!nextStatus) return
    setSaving(true); setError('')
    try {
      const patch = { status: nextStatus }
      if (nextStatus === 'completed') patch.completed_at = new Date().toISOString()
      const { error: err } = await supabase.from('work_orders').update(patch).eq('id', wo.id)
      if (err) throw err
      toast.success(`Durum: ${WO_STATUS_MAP[nextStatus]?.label}`)
      onRefresh()
    } catch (e) { setError(e.message); toast.error(e.message) }
    finally { setSaving(false) }
  }

  const cancelWO = async () => {
    setSaving(true)
    try {
      await supabase.from('work_orders').update({ status: 'cancelled' }).eq('id', wo.id)
      toast.info('İş emri iptal edildi.')
      onRefresh()
    } finally { setSaving(false); setConfirmCancel(false) }
  }

  const addItem = async () => {
    if (!addItemForm.definition_id) { setAddItemError('Takım tanımı seçin.'); return }
    setAddingItem(true); setAddItemError('')
    try {
      const { error: err } = await supabase.from('wo_tool_items').insert({
        wo_id: wo.id,
        definition_id: addItemForm.definition_id,
        pot_number: addItemForm.pot_number ? Number(addItemForm.pot_number) : null,
        nominal_length_mm: addItemForm.nominal_length_mm ? Number(addItemForm.nominal_length_mm) : null,
        nominal_diameter_mm: addItemForm.nominal_diameter_mm ? Number(addItemForm.nominal_diameter_mm) : null,
        checkout_status: 'pending',
        measurement_result: 'PENDING',
      })
      if (err) throw err
      setAddItemForm({ definition_id: '', pot_number: '', nominal_length_mm: '', nominal_diameter_mm: '' })
      await loadItems()
    } catch (e) { setAddItemError(e.message) }
    finally { setAddingItem(false) }
  }

  const checkoutItem = async (item) => {
    if (item.checkout_status === 'checked_out') { setError('Bu kalem zaten zimmette.'); return }
    if (!item.instance_id) { setError('Bu kaleme henüz fiziksel takım atanmamış.'); return }
    try {
      await createCheckout({
        instanceId: item.instance_id,
        checkoutType: 'wo_setup',
        woId: wo.id,
        woItemId: item.id,
        machineId: wo.machine_id,
        potNumber: item.pot_number,
        checkedOutBy: profile.id,
        facilityId,
      })
      await loadItems()
    } catch (e) { setError(e.message) }
  }

  const machine  = machines.find((m) => m.id === wo.machine_id)
  const operator = profiles.find((p) => p.id === wo.assigned_operator_id)

  const itemColumns = [
    { key: 'pot_number',       label: 'Pot', width: 50, render: (v) => v ?? '—' },
    { key: 'tool_definitions', label: 'Takım', render: (v) => (
      <div>
        <p className="text-slate-200 text-sm">{v?.name ?? '—'}</p>
        <p className="text-xs font-mono text-slate-500">{v?.internal_code ?? ''}</p>
      </div>
    )},
    { key: 'tool_instances',   label: 'Barkod', width: 110, render: (v) => v
      ? <span className="font-mono text-blue-300 text-xs">{v.barcode}</span>
      : <span className="text-slate-600 text-xs">atanmadı</span>
    },
    { key: 'measurement_result', label: 'Ölçüm', width: 80, render: (v) => v && v !== 'PENDING'
      ? <span className={`text-xs font-bold ${MEAS_MAP[v]?.cls}`}>{MEAS_MAP[v]?.label}</span>
      : <span className="text-slate-600">—</span>
    },
    { key: 'checkout_status',  label: 'Durum', width: 100, render: (v) => <StatusBadge status={v} map={ITEM_STATUS_MAP} /> },
    {
      key: '_action', label: '', width: 100,
      render: (_, row) => row.checkout_status === 'pending' && row.instance_id
        ? <button onClick={(e) => { e.stopPropagation(); checkoutItem(row) }}
            className="rounded-lg bg-blue-600 hover:bg-blue-500 px-3 py-1 text-xs font-medium text-white transition-colors">
            Zimmet Ver
          </button>
        : null,
    },
  ]

  return (
    <Modal open onClose={onClose} size="xl"
      title={<span className="font-mono">{wo.wo_code} <span className="text-sm text-slate-400 font-sans">— {wo.part_name ?? wo.part_no ?? 'İsimsiz'}</span></span>}
      footer={
        <div className="flex w-full items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            {wo.status !== 'cancelled' && wo.status !== 'completed' && !confirmCancel && (
              <Button variant="danger" size="sm" onClick={() => setConfirmCancel(true)}>İptal Et</Button>
            )}
            {confirmCancel && (
              <>
                <span className="text-xs text-red-400">Emin misiniz?</span>
                <Button variant="danger" size="sm" onClick={cancelWO} loading={saving}>Evet, İptal Et</Button>
                <Button variant="secondary" size="sm" onClick={() => setConfirmCancel(false)}>Vazgeç</Button>
              </>
            )}
          </div>
          <div className="flex gap-2">
            {['magazine_comparison', 'measurement'].includes(wo.status) && (
              <Button variant="secondary" size="sm" onClick={() => { onClose(); navigate(`/magazine/${wo.id}`) }}>
                🔍 Magazin Karşılaştırma
              </Button>
            )}
            <Button variant="secondary" onClick={onClose}>Kapat</Button>
            {nextStatus && wo.status !== 'cancelled' && (
              <Button onClick={advanceStatus} loading={saving}>
                → {WO_STATUS_MAP[nextStatus]?.label}
              </Button>
            )}
          </div>
        </div>
      }>
      {/* Status stepper */}
      <div className="mb-4 flex items-center gap-1 overflow-x-auto pb-2">
        {WO_STATUS_FLOW.map((s, i) => {
          const idx = WO_STATUS_FLOW.indexOf(wo.status)
          const done = i < idx
          const active = s === wo.status
          return (
            <div key={s} className="flex items-center gap-1 flex-shrink-0">
              <div className={`rounded-full px-2 py-0.5 text-[10px] font-medium whitespace-nowrap
                ${active ? 'bg-blue-600 text-white' : done ? 'bg-emerald-700/60 text-emerald-300' : 'bg-slate-700 text-slate-500'}`}>
                {WO_STATUS_MAP[s]?.label}
              </div>
              {i < WO_STATUS_FLOW.length - 1 && <span className="text-slate-600 text-xs">›</span>}
            </div>
          )
        })}
        {wo.status === 'cancelled' && <span className="badge-critical ml-2">İPTAL</span>}
      </div>

      {error && <p className="mb-3 text-sm text-red-400">{error}</p>}

      {/* Tabs */}
      <div className="mb-4 flex gap-1 rounded-lg bg-slate-800 p-1 w-fit">
        {[['info', 'Bilgiler'], ['items', `Takımlar (${items.length})`]].map(([id, label]) => (
          <button key={id} onClick={() => setTab(id)}
            className={`rounded-md px-4 py-1.5 text-xs font-medium transition-colors ${tab === id ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-slate-200'}`}>
            {label}
          </button>
        ))}
      </div>

      {tab === 'info' && (
        <div className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
          {[
            ['WO Kodu',     wo.wo_code],
            ['Parça No',    wo.part_no ?? '—'],
            ['Parça Adı',   wo.part_name ?? '—'],
            ['Proje',       wo.customer_project ?? '—'],
            ['NC Program',  wo.nc_program_ref ?? '—'],
            ['Tezgah',      machine?.name ?? '—'],
            ['Operatör',    operator?.full_name ?? '—'],
            ['Setup Tarihi', wo.planned_setup_at ? new Date(wo.planned_setup_at).toLocaleString('tr-TR') : '—'],
            ['Oluşturulma',  new Date(wo.created_at).toLocaleString('tr-TR')],
            ['Tamamlanma',  wo.completed_at ? new Date(wo.completed_at).toLocaleString('tr-TR') : '—'],
          ].map(([label, value]) => (
            <div key={label}>
              <p className="text-xs text-slate-500">{label}</p>
              <p className="text-slate-200">{value}</p>
            </div>
          ))}
          {wo.notes && (
            <div className="col-span-2">
              <p className="text-xs text-slate-500">Notlar</p>
              <p className="text-slate-200">{wo.notes}</p>
            </div>
          )}
        </div>
      )}

      {tab === 'items' && (
        <div className="space-y-4">
          <Table columns={itemColumns} data={items} emptyText="Henüz takım kalemi eklenmedi" />

          {wo.status !== 'completed' && wo.status !== 'cancelled' && (
            <div className="rounded-xl border border-slate-700 bg-slate-800/40 p-4">
              <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-500">Kalem Ekle</p>
              <div className="grid grid-cols-2 gap-3">
                <Select label="Takım Tanımı" required
                  options={definitions.map((d) => ({ value: d.id, label: `${d.internal_code} — ${d.name}` }))}
                  value={addItemForm.definition_id} onChange={(e) => setAI('definition_id', e.target.value)}
                  className="col-span-2" />
                <Input label="Pot No" type="number" value={addItemForm.pot_number} onChange={(e) => setAI('pot_number', e.target.value)} />
                <Input label="Nominal Uzunluk (mm)" type="number" value={addItemForm.nominal_length_mm} onChange={(e) => setAI('nominal_length_mm', e.target.value)} />
                <Input label="Nominal Çap (mm)" type="number" value={addItemForm.nominal_diameter_mm} onChange={(e) => setAI('nominal_diameter_mm', e.target.value)} />
                <div className="flex items-end">
                  <Button onClick={addItem} loading={addingItem} icon="+">Ekle</Button>
                </div>
              </div>
              {addItemError && <p className="mt-2 text-sm text-red-400">{addItemError}</p>}
            </div>
          )}
        </div>
      )}
    </Modal>
  )
}

// ── Main component ────────────────────────────────────────────────
export default function WorkOrdersPage() {
  const { profile } = useAuthStore()
  const [wos, setWos] = useState([])
  const [machines, setMachines] = useState([])
  const [profiles, setProfiles] = useState([])
  const [definitions, setDefinitions] = useState([])
  const [filterStatus, setFilterStatus] = useState('active_only')
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [createModal, setCreateModal] = useState(false)
  const [selectedWO, setSelectedWO] = useState(null)
  const [form, setForm] = useState(EMPTY_WO)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }))

  const load = useCallback(async () => {
    if (!profile?.facility_id) return
    setLoading(true)
    const { data } = await supabase
      .from('work_orders')
      .select('*, magazine_machines(id, name), profiles!work_orders_assigned_operator_id_fkey(id, full_name)')
      .eq('facility_id', profile.facility_id)
      .order('created_at', { ascending: false })
    setWos(data ?? [])
    setLoading(false)
  }, [profile?.facility_id])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    if (!profile?.facility_id) return
    Promise.all([
      supabase.from('magazine_machines').select('id, name').eq('facility_id', profile.facility_id).eq('is_active', true).order('name'),
      supabase.from('profiles').select('id, full_name').eq('facility_id', profile.facility_id).eq('status', 'active').order('full_name'),
      supabase.from('tool_definitions').select('id, internal_code, name').eq('facility_id', profile.facility_id).eq('is_active', true).order('internal_code'),
    ]).then(([{ data: m }, { data: p }, { data: d }]) => {
      setMachines(m ?? [])
      setProfiles(p ?? [])
      setDefinitions(d ?? [])
    })
  }, [profile?.facility_id])

  const openCreate = () => { setForm(EMPTY_WO); setError(''); setCreateModal(true) }

  const saveNew = async () => {
    if (!form.wo_code) { setError('WO kodu zorunludur.'); return }
    setSaving(true); setError('')
    try {
      const { error: err } = await supabase.from('work_orders').insert({
        facility_id: profile.facility_id,
        wo_code: form.wo_code.trim(),
        part_no: form.part_no || null,
        part_name: form.part_name || null,
        customer_project: form.customer_project || null,
        nc_program_ref: form.nc_program_ref || null,
        machine_id: form.machine_id || null,
        assigned_operator_id: form.assigned_operator_id || null,
        planned_setup_at: form.planned_setup_at || null,
        notes: form.notes || null,
        status: 'planned',
        created_by: profile.id,
      })
      if (err) throw err
      await load(); setCreateModal(false)
      toast.success('İş emri oluşturuldu.')
    } catch (e) { setError(e.message); toast.error(e.message) }
    finally { setSaving(false) }
  }

  const ACTIVE_STATUSES = ['planned', 'preparation', 'magazine_comparison', 'measurement', 'checkout', 'active']

  const filtered = wos.filter((w) => {
    if (filterStatus === 'active_only' && !ACTIVE_STATUSES.includes(w.status)) return false
    if (filterStatus === 'completed' && w.status !== 'completed') return false
    if (filterStatus === 'cancelled' && w.status !== 'cancelled') return false
    if (search) {
      const q = search.toLowerCase()
      return w.wo_code.toLowerCase().includes(q)
        || (w.part_no ?? '').toLowerCase().includes(q)
        || (w.part_name ?? '').toLowerCase().includes(q)
    }
    return true
  })

  const counts = {
    active_only: wos.filter((w) => ACTIVE_STATUSES.includes(w.status)).length,
    completed:   wos.filter((w) => w.status === 'completed').length,
    cancelled:   wos.filter((w) => w.status === 'cancelled').length,
  }

  const columns = [
    { key: 'wo_code',  label: 'WO Kodu',   width: 140, render: (v) => <span className="font-mono text-blue-300">{v}</span> },
    { key: 'part_no',  label: 'Parça No',   width: 110, render: (v) => v ?? '—' },
    { key: 'part_name', label: 'Parça Adı', render: (v) => v ?? '—' },
    { key: 'magazine_machines', label: 'Tezgah', width: 120, render: (v) => v?.name ?? '—' },
    { key: 'planned_setup_at', label: 'Setup', width: 130, render: (v) => v ? new Date(v).toLocaleDateString('tr-TR') : '—' },
    { key: 'status', label: 'Durum', width: 140, render: (v) => <StatusBadge status={v} map={WO_STATUS_MAP} /> },
  ]

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">İş Emirleri</h1>
          <p className="mt-1 text-sm text-slate-400">M3 — {wos.length} iş emri</p>
        </div>
        <Button onClick={openCreate} icon="+">Yeni İş Emri</Button>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Input placeholder="WO kodu, parça no veya adı ara…" value={search} onChange={(e) => setSearch(e.target.value)} className="w-64" />
        <div className="flex gap-1 rounded-lg bg-slate-800 p-1">
          {[['active_only', 'Aktif'], ['completed', 'Tamamlandı'], ['cancelled', 'İptal']].map(([id, label]) => (
            <button key={id} onClick={() => setFilterStatus(id)}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${filterStatus === id ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-slate-200'}`}>
              {label} ({counts[id]})
            </button>
          ))}
        </div>
      </div>

      <Table columns={columns} data={filtered} onRowClick={(row) => setSelectedWO(row)}
        emptyText={loading ? 'Yükleniyor…' : 'İş emri yok'} />

      {/* Create Modal */}
      <Modal open={createModal} onClose={() => setCreateModal(false)} title="Yeni İş Emri" size="lg"
        footer={<><Button variant="secondary" onClick={() => setCreateModal(false)}>İptal</Button><Button onClick={saveNew} loading={saving}>Oluştur</Button></>}>
        <div className="grid grid-cols-2 gap-4">
          <Input label="WO Kodu" required value={form.wo_code} onChange={(e) => set('wo_code', e.target.value)} placeholder="WO-2026-001" className="col-span-2" />
          <Input label="Parça No" value={form.part_no} onChange={(e) => set('part_no', e.target.value)} />
          <Input label="Parça Adı" value={form.part_name} onChange={(e) => set('part_name', e.target.value)} />
          <Input label="Müşteri/Proje" value={form.customer_project} onChange={(e) => set('customer_project', e.target.value)} />
          <Input label="NC Program Ref" value={form.nc_program_ref} onChange={(e) => set('nc_program_ref', e.target.value)} />
          <Select label="Tezgah" options={machines.map((m) => ({ value: m.id, label: m.name }))}
            value={form.machine_id} onChange={(e) => set('machine_id', e.target.value)} />
          <Select label="Operatör" options={profiles.map((p) => ({ value: p.id, label: p.full_name }))}
            value={form.assigned_operator_id} onChange={(e) => set('assigned_operator_id', e.target.value)} />
          <Input label="Planlanan Setup Tarihi" type="datetime-local" value={form.planned_setup_at}
            onChange={(e) => set('planned_setup_at', e.target.value)} className="col-span-2" />
          <Input label="Notlar" value={form.notes} onChange={(e) => set('notes', e.target.value)} className="col-span-2" />
        </div>
        {error && <p className="mt-3 text-sm text-red-400">{error}</p>}
      </Modal>

      {selectedWO && (
        <WODetailModal
          wo={selectedWO}
          machines={machines}
          profiles={profiles}
          definitions={definitions}
          facilityId={profile.facility_id}
          onClose={() => setSelectedWO(null)}
          onRefresh={() => { load(); setSelectedWO(null) }}
        />
      )}
    </div>
  )
}
