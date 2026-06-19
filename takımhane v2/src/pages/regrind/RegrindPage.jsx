import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/authStore'
import toast from '@/lib/toast'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import Select from '@/components/ui/Select'
import Modal from '@/components/ui/Modal'
import { Table, StatusBadge } from '@/components/ui/Table'

// ── Constants ─────────────────────────────────────────────────────
const ORDER_STATUS_MAP = {
  preparing:   { label: 'Hazırlanıyor', cls: 'badge-info' },
  sent:        { label: 'Gönderildi',   cls: 'badge-warning' },
  at_regrinder:{ label: 'Bilemecide',   cls: 'badge-warning' },
  returned:    { label: 'İade Edildi',  cls: 'badge-ok' },
  cancelled:   { label: 'İptal',        cls: 'badge-critical' },
}

const ITEM_RESULT_MAP = {
  success: { label: 'Başarılı', cls: 'badge-ok' },
  scrap:   { label: 'Bertaraf', cls: 'badge-critical' },
}

const SCRAP_APPROVAL_MAP = {
  pending:  { label: 'Onay Bekliyor', cls: 'badge-warning' },
  approved: { label: 'Onaylandı',     cls: 'badge-critical' },
}

// ── Regrind order detail modal ────────────────────────────────────
function OrderDetailModal({ order, availableTools, onClose, onRefresh }) {
  const { profile } = useAuthStore()
  const [items, setItems] = useState([])
  const [tab, setTab] = useState('items')
  const [addForm, setAddForm] = useState({ instance_id: '' })
  const [addingItem, setAddingItem] = useState(false)
  const [returning, setReturning] = useState(false)
  const [returnForm, setReturnForm] = useState({ returned_at: new Date().toISOString().slice(0,10), notes_after: '', cost: '' })
  const [itemResults, setItemResults] = useState({}) // { item_id: { result, life_restored_pct } }
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const loadItems = useCallback(async () => {
    const { data } = await supabase
      .from('regrind_order_items')
      .select('*, tool_instances(barcode, regrind_count, life_remaining_pct, tool_definitions(name, internal_code))')
      .eq('regrind_order_id', order.id)
    setItems(data ?? [])
    const init = {}
    ;(data ?? []).forEach((i) => { init[i.id] = { result: i.result ?? 'success', life_restored_pct: i.life_restored_pct ?? '' } })
    setItemResults(init)
  }, [order.id])

  useEffect(() => { loadItems() }, [loadItems])

  const addItem = async () => {
    if (!addForm.instance_id) return
    setAddingItem(true); setError('')
    try {
      const { error: e } = await supabase.from('regrind_order_items').insert({
        regrind_order_id: order.id,
        instance_id: addForm.instance_id,
      })
      if (e) throw e
      await supabase.from('tool_instances').update({ status: 'regrind' }).eq('id', addForm.instance_id)
      setAddForm({ instance_id: '' })
      await loadItems()
    } catch (e) { setError(e.message) }
    finally { setAddingItem(false) }
  }

  const advanceStatus = async (newStatus) => {
    setSaving(true)
    try {
      const patch = { status: newStatus }
      if (newStatus === 'sent') patch.sent_at = new Date().toISOString().slice(0, 10)
      await supabase.from('regrind_orders').update(patch).eq('id', order.id)
      onRefresh()
    } finally { setSaving(false) }
  }

  const submitReturn = async () => {
    setSaving(true); setError('')
    try {
      // Update order
      await supabase.from('regrind_orders').update({
        status: 'returned',
        returned_at: returnForm.returned_at,
        notes_after: returnForm.notes_after || null,
        cost: returnForm.cost ? Number(returnForm.cost) : null,
      }).eq('id', order.id)

      // Process each item
      for (const item of items) {
        const r = itemResults[item.id] ?? {}
        const result = r.result ?? 'success'
        const lifeRestored = r.life_restored_pct !== '' ? Number(r.life_restored_pct) : null

        await supabase.from('regrind_order_items').update({
          result,
          life_restored_pct: lifeRestored,
          regrind_count_after: (item.tool_instances?.regrind_count ?? 0) + 1,
        }).eq('id', item.id)

        if (result === 'success') {
          const curLife = item.tool_instances?.life_remaining_pct ?? 0
          await supabase.from('tool_instances').update({
            status: 'available',
            regrind_count: (item.tool_instances?.regrind_count ?? 0) + 1,
            life_remaining_pct: lifeRestored != null
              ? Math.min(100, curLife + lifeRestored)
              : null,
          }).eq('id', item.instance_id)
        } else {
          // Scrap the tool
          await supabase.from('tool_instances').update({ status: 'scrapped' }).eq('id', item.instance_id)
          await supabase.from('scrap_records').insert({
            facility_id: order.facility_id,
            instance_id: item.instance_id,
            reason_code: 'BILEME_SONRASI',
            proposed_by: profile.id,
            approved_by: profile.id,
            approved_at: new Date().toISOString(),
            is_locked: true,
            notes: `Bileme siparişi #${order.id} sonrası bertaraf.`,
          })
        }
      }
      onRefresh()
    } catch (e) { setError(e.message) }
    finally { setSaving(false) }
  }

  const regrinder = order.suppliers?.name ?? '—'
  const canAddItems = ['preparing', 'sent'].includes(order.status)
  const canReturn   = order.status === 'at_regrinder' || order.status === 'sent'

  return (
    <Modal open onClose={onClose} size="xl"
      title={<span>Bileme Siparişi <span className="text-slate-400 font-normal text-sm">— {regrinder}</span></span>}
      footer={
        <div className="flex w-full items-center justify-between gap-3">
          <div className="flex gap-2">
            {order.status === 'preparing' && <Button size="sm" onClick={() => advanceStatus('sent')} loading={saving}>Gönderildi →</Button>}
            {order.status === 'sent'      && <Button size="sm" onClick={() => advanceStatus('at_regrinder')} loading={saving}>Bilemecide →</Button>}
          </div>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={onClose}>Kapat</Button>
            {canReturn && <Button onClick={() => setReturning(true)}>İade Al</Button>}
          </div>
        </div>
      }>

      <div className="mb-4 grid grid-cols-3 gap-4 text-sm">
        {[
          ['Durum',     <StatusBadge status={order.status} map={ORDER_STATUS_MAP} />],
          ['Gönderim',  order.sent_at      ?? '—'],
          ['Termin',    order.deadline_date ?? '—'],
          ['Bilemeci',  regrinder],
          ['Maliyet',   order.cost ? `${order.cost} ₺` : '—'],
          ['İade',      order.returned_at ?? '—'],
        ].map(([l, v]) => (
          <div key={l}>
            <p className="text-xs text-slate-500">{l}</p>
            <div className="text-slate-200">{v}</div>
          </div>
        ))}
      </div>

      {error && <p className="mb-3 text-sm text-red-400">{error}</p>}

      {/* Items */}
      <div className="space-y-3">
        <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Kalemler ({items.length})</p>
        {items.map((item) => (
          <div key={item.id} className="rounded-xl border border-slate-700 bg-slate-800/40 p-3 flex items-center gap-4">
            <div className="flex-1 min-w-0">
              <p className="text-sm text-white">{item.tool_instances?.tool_definitions?.name ?? '—'}</p>
              <p className="font-mono text-xs text-blue-300">{item.tool_instances?.barcode ?? '—'}</p>
              <p className="text-xs text-slate-500">Bileme: {item.tool_instances?.regrind_count ?? 0}×</p>
            </div>
            {order.status === 'returned' ? (
              <div className="flex items-center gap-3">
                {item.result && <StatusBadge status={item.result} map={ITEM_RESULT_MAP} />}
                {item.life_restored_pct != null && <span className="text-xs text-emerald-400">+%{item.life_restored_pct} ömür</span>}
              </div>
            ) : canReturn ? (
              <div className="flex items-center gap-3">
                <Select options={[{ value: 'success', label: 'Başarılı' }, { value: 'scrap', label: 'Bertaraf' }]}
                  value={itemResults[item.id]?.result ?? 'success'}
                  onChange={(e) => setItemResults((p) => ({ ...p, [item.id]: { ...p[item.id], result: e.target.value } }))} />
                <Input type="number" placeholder="+% ömür" className="w-24"
                  value={itemResults[item.id]?.life_restored_pct ?? ''}
                  onChange={(e) => setItemResults((p) => ({ ...p, [item.id]: { ...p[item.id], life_restored_pct: e.target.value } }))} />
              </div>
            ) : null}
          </div>
        ))}

        {canAddItems && (
          <div className="flex items-end gap-3">
            <Select label="Takım Ekle"
              options={availableTools.map((t) => ({ value: t.id, label: `${t.barcode} — ${t.tool_definitions?.name ?? ''}` }))}
              value={addForm.instance_id} onChange={(e) => setAddForm({ instance_id: e.target.value })} className="flex-1" />
            <Button onClick={addItem} loading={addingItem} icon="+">Ekle</Button>
          </div>
        )}
      </div>

      {/* Return modal (inline) */}
      {returning && (
        <div className="mt-4 rounded-xl border border-slate-600 bg-slate-800/60 p-4 space-y-3">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">İade Bilgileri</p>
          <div className="grid grid-cols-3 gap-3">
            <Input label="İade Tarihi" type="date" value={returnForm.returned_at}
              onChange={(e) => setReturnForm((f) => ({ ...f, returned_at: e.target.value }))} />
            <Input label="Maliyet (₺)" type="number" value={returnForm.cost}
              onChange={(e) => setReturnForm((f) => ({ ...f, cost: e.target.value }))} />
            <Input label="Notlar" value={returnForm.notes_after}
              onChange={(e) => setReturnForm((f) => ({ ...f, notes_after: e.target.value }))} />
          </div>
          <div className="flex gap-2">
            <Button variant="secondary" size="sm" onClick={() => setReturning(false)}>Vazgeç</Button>
            <Button size="sm" onClick={submitReturn} loading={saving}>İadeyi Kaydet</Button>
          </div>
        </div>
      )}
    </Modal>
  )
}

// ── Scrap modal ───────────────────────────────────────────────────
function ScrapModal({ tools, reasons, facilityId, onClose, onDone }) {
  const { profile } = useAuthStore()
  const [form, setForm] = useState({ instance_id: '', reason_code: '', notes: '', wo_id: '' })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }))

  const submit = async () => {
    if (!form.instance_id || !form.reason_code) { setError('Takım ve sebep zorunludur.'); return }
    setSaving(true); setError('')
    try {
      const { error: e } = await supabase.from('scrap_records').insert({
        facility_id: facilityId,
        instance_id: form.instance_id,
        reason_code: form.reason_code,
        proposed_by: profile.id,
        notes: form.notes || null,
        is_locked: false,
      })
      if (e) throw e
      await supabase.from('tool_instances').update({ status: 'quarantine' }).eq('id', form.instance_id)
      onDone()
    } catch (e) { setError(e.message) }
    finally { setSaving(false) }
  }

  return (
    <Modal open onClose={onClose} title="Bertaraf Teklifi" size="sm"
      footer={<><Button variant="secondary" onClick={onClose}>İptal</Button><Button variant="danger" onClick={submit} loading={saving}>Bertaraf Teklif Et</Button></>}>
      <div className="space-y-4">
        <div className="rounded-xl bg-red-500/10 border border-red-500/20 p-3 text-xs text-red-400">
          Bertaraf teklifi takımı Karantina'ya alır. Onay sonrası kalıcı olarak kilitlenir (AS9100).
        </div>
        <Select label="Takım" required
          options={tools.map((t) => ({ value: t.id, label: `${t.barcode} — ${t.tool_definitions?.name ?? ''}` }))}
          value={form.instance_id} onChange={(e) => set('instance_id', e.target.value)} />
        <Select label="Bertaraf Sebebi" required
          options={reasons.map((r) => ({ value: r.code, label: r.label }))}
          value={form.reason_code} onChange={(e) => set('reason_code', e.target.value)} />
        <Input label="Notlar" value={form.notes} onChange={(e) => set('notes', e.target.value)} />
        {error && <p className="text-sm text-red-400">{error}</p>}
      </div>
    </Modal>
  )
}

// ── Main ──────────────────────────────────────────────────────────
export default function RegrindPage() {
  const { profile } = useAuthStore()
  const [tab, setTab] = useState('regrind')
  const [orders, setOrders] = useState([])
  const [scraps, setScraps] = useState([])
  const [regrinderSuppliers, setRegrinderSuppliers] = useState([])
  const [availableTools, setAvailableTools] = useState([])
  const [scrapReasons, setScrapReasons] = useState([])
  const [loading, setLoading] = useState(true)
  const [selectedOrder, setSelectedOrder] = useState(null)
  const [createOrder, setCreateOrder] = useState(false)
  const [createScrap, setCreateScrap] = useState(false)
  const [orderForm, setOrderForm] = useState({ regrinder_id: '', deadline_date: '', notes_before: '' })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [filterStatus, setFilterStatus] = useState('active')
  const [confirmScrapId, setConfirmScrapId] = useState(null)
  const setOF = (k, v) => setOrderForm((f) => ({ ...f, [k]: v }))

  const load = useCallback(async () => {
    if (!profile?.facility_id) return
    setLoading(true)
    const fid = profile.facility_id

    const [{ data: o }, { data: s }, { data: reg }, { data: tools }, { data: reasons }] = await Promise.all([
      supabase.from('regrind_orders')
        .select('*, suppliers(name), regrind_order_items(id)')
        .eq('facility_id', fid)
        .order('created_at', { ascending: false }),

      supabase.from('scrap_records')
        .select('*, tool_instances(barcode, tool_definitions(name, internal_code)), profiles!scrap_records_proposed_by_fkey(full_name), approved_by_profile:profiles!scrap_records_approved_by_fkey(full_name)')
        .eq('facility_id', fid)
        .order('proposed_at', { ascending: false }),

      supabase.from('suppliers').select('id, name').contains('supplier_types', ['regrinder']).eq('approval_status', 'active'),
      supabase.from('tool_instances')
        .select('id, barcode, tool_definitions(name)')
        .eq('facility_id', fid)
        .in('status', ['available', 'regrind']),
      supabase.from('lookup_codes').select('code, label').eq('category', 'scrap_reason').eq('is_active', true).order('display_order'),
    ])

    setOrders(o ?? [])
    setScraps(s ?? [])
    setRegrinderSuppliers(reg ?? [])
    setAvailableTools(tools ?? [])
    setScrapReasons(reasons ?? [])
    setLoading(false)
  }, [profile?.facility_id])

  useEffect(() => { load() }, [load])

  const saveOrder = async () => {
    if (!orderForm.regrinder_id) { setError('Bilemeci seçin.'); return }
    setSaving(true); setError('')
    try {
      const { error: e } = await supabase.from('regrind_orders').insert({
        facility_id: profile.facility_id,
        regrinder_id: orderForm.regrinder_id,
        deadline_date: orderForm.deadline_date || null,
        notes_before: orderForm.notes_before || null,
        status: 'preparing',
        created_by: profile.id,
      })
      if (e) throw e
      await load(); setCreateOrder(false)
      setOrderForm({ regrinder_id: '', deadline_date: '', notes_before: '' })
      toast.success('Bileme siparişi oluşturuldu.')
    } catch (e) { setError(e.message); toast.error(e.message) }
    finally { setSaving(false) }
  }

  const approveScrap = async (scrap) => {
    await supabase.from('scrap_records').update({
      approved_by: profile.id,
      approved_at: new Date().toISOString(),
      is_locked: true,
    }).eq('id', scrap.id)
    await supabase.from('tool_instances').update({ status: 'scrapped' }).eq('id', scrap.instance_id)
    toast.success('Bertaraf onaylandı ve kayıt kilitlendi.')
    setConfirmScrapId(null)
    await load()
  }

  const ACTIVE_STATUSES = ['preparing', 'sent', 'at_regrinder']
  const filteredOrders = orders.filter((o) => {
    if (filterStatus === 'active') return ACTIVE_STATUSES.includes(o.status)
    if (filterStatus === 'completed') return o.status === 'returned'
    return true
  })

  const orderColumns = [
    { key: 'suppliers',     label: 'Bilemeci',   render: (v) => v?.name ?? '—' },
    { key: 'sent_at',       label: 'Gönderim',   width: 110, render: (v) => v ?? '—' },
    { key: 'deadline_date', label: 'Termin',      width: 110, render: (v) => v ?? '—' },
    { key: 'regrind_order_items', label: 'Kalem', width: 60,  render: (v) => v?.length ?? 0 },
    { key: 'status',        label: 'Durum',       width: 130, render: (v) => <StatusBadge status={v} map={ORDER_STATUS_MAP} /> },
    { key: 'cost',          label: 'Maliyet',     width: 90,  render: (v) => v ? `${v} ₺` : '—' },
  ]

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Yenileme & Bertaraf</h1>
          <p className="mt-1 text-sm text-slate-400">M2 — Bileme siparişleri ve hurda kayıtları</p>
        </div>
        <div className="flex gap-2">
          {tab === 'regrind' && <Button onClick={() => { setCreateOrder(true); setError('') }} icon="+">Yeni Sipariş</Button>}
          {tab === 'scrap'   && <Button variant="danger" onClick={() => setCreateScrap(true)} icon="+">Bertaraf Teklif Et</Button>}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 rounded-lg bg-slate-800 p-1 w-fit">
        {[['regrind', 'Bileme Siparişleri'], ['scrap', `Bertaraf Kayıtları (${scraps.length})`]].map(([id, label]) => (
          <button key={id} onClick={() => setTab(id)}
            className={`rounded-md px-4 py-1.5 text-xs font-medium transition-colors ${tab === id ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-slate-200'}`}>
            {label}
          </button>
        ))}
      </div>

      {/* Regrind tab */}
      {tab === 'regrind' && (
        <div className="space-y-4">
          <div className="flex gap-1 rounded-lg bg-slate-800 p-1 w-fit">
            {[['active', 'Aktif'], ['completed', 'Tamamlanan'], ['all', 'Tümü']].map(([v, l]) => (
              <button key={v} onClick={() => setFilterStatus(v)}
                className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${filterStatus === v ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-slate-200'}`}>
                {l} ({v === 'active' ? orders.filter(o => ACTIVE_STATUSES.includes(o.status)).length : v === 'completed' ? orders.filter(o => o.status === 'returned').length : orders.length})
              </button>
            ))}
          </div>
          <Table columns={orderColumns} data={filteredOrders} onRowClick={setSelectedOrder}
            emptyText={loading ? 'Yükleniyor…' : 'Bileme siparişi yok'} />
        </div>
      )}

      {/* Scrap tab */}
      {tab === 'scrap' && (
        <div className="space-y-3">
          {loading ? <p className="text-slate-500 text-sm">Yükleniyor…</p> :
           scraps.length === 0 ? (
            <div className="card flex items-center justify-center p-16 text-slate-500">Bertaraf kaydı yok</div>
          ) : scraps.map((s) => (
            <div key={s.id} className={`card flex items-center gap-4 p-4 ${s.is_locked ? 'opacity-70' : ''}`}>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium text-white">{s.tool_instances?.tool_definitions?.name ?? '—'}</p>
                  {s.is_locked
                    ? <span className="badge-critical">Kilitli</span>
                    : <span className="badge-warning">Onay Bekliyor</span>}
                </div>
                <p className="font-mono text-xs text-blue-300">{s.tool_instances?.barcode ?? '—'}</p>
                <p className="text-xs text-slate-500 mt-0.5">
                  Sebep: {s.reason_code} · Teklif: {s.profiles?.full_name ?? '—'}
                  {s.approved_by_profile && ` · Onay: ${s.approved_by_profile.full_name}`}
                </p>
                {s.notes && <p className="text-xs text-slate-600 mt-0.5">{s.notes}</p>}
              </div>
              <div className="text-right text-xs text-slate-500 flex-shrink-0">
                <p>{new Date(s.proposed_at).toLocaleDateString('tr-TR')}</p>
              </div>
              {!s.is_locked && confirmScrapId !== s.id && (
                <Button size="sm" variant="danger" onClick={() => setConfirmScrapId(s.id)}>Onayla</Button>
              )}
              {!s.is_locked && confirmScrapId === s.id && (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-red-400 whitespace-nowrap">Emin misiniz?</span>
                  <Button size="sm" variant="danger" onClick={() => approveScrap(s)}>Evet</Button>
                  <Button size="sm" variant="secondary" onClick={() => setConfirmScrapId(null)}>Hayır</Button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Create order modal */}
      <Modal open={createOrder} onClose={() => setCreateOrder(false)} title="Yeni Bileme Siparişi" size="sm"
        footer={<><Button variant="secondary" onClick={() => setCreateOrder(false)}>İptal</Button><Button onClick={saveOrder} loading={saving}>Oluştur</Button></>}>
        <div className="space-y-4">
          <Select label="Bilemeci" required
            options={regrinderSuppliers.map((s) => ({ value: s.id, label: s.name }))}
            value={orderForm.regrinder_id} onChange={(e) => setOF('regrinder_id', e.target.value)} />
          <Input label="Termin Tarihi" type="date" value={orderForm.deadline_date} onChange={(e) => setOF('deadline_date', e.target.value)} />
          <Input label="Gönderim Notları" value={orderForm.notes_before} onChange={(e) => setOF('notes_before', e.target.value)} />
          {error && <p className="text-sm text-red-400">{error}</p>}
        </div>
      </Modal>

      {selectedOrder && (
        <OrderDetailModal order={selectedOrder} availableTools={availableTools}
          onClose={() => setSelectedOrder(null)} onRefresh={() => { load(); setSelectedOrder(null) }} />
      )}

      {createScrap && (
        <ScrapModal tools={availableTools} reasons={scrapReasons} facilityId={profile.facility_id}
          onClose={() => setCreateScrap(false)} onDone={() => { setCreateScrap(false); load() }} />
      )}
    </div>
  )
}
