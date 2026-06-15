import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import Select from '@/components/ui/Select'
import Modal from '@/components/ui/Modal'
import { Table, StatusBadge } from '@/components/ui/Table'

const STATUS_MAP = {
  active:    { label: 'Aktif',          cls: 'badge-ok' },
  suspended: { label: 'Askıya Alınmış', cls: 'badge-critical' },
  pending:   { label: 'Beklemede',      cls: 'badge-warning' },
}

const TYPE_LABELS = { tool_vendor: 'Takım Satıcısı', regrinder: 'Bilemeci', calibration_lab: 'Kalibrasyon Lab' }

const EMPTY = { code: '', name: '', supplier_types: [], is_as9100_approved: false, approval_status: 'active', turkak_accred_no: '', contact_phone: '', contact_email: '', address: '', avg_delivery_days: '' }

export default function SuppliersSection() {
  const [suppliers, setSuppliers] = useState([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(false)
  const [form, setForm] = useState(EMPTY)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const editing = !!form.id
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }))

  const load = async () => {
    setLoading(true)
    const { data } = await supabase.from('suppliers').select('*').order('name')
    setSuppliers(data ?? [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const toggleType = (t) => {
    const types = form.supplier_types ?? []
    set('supplier_types', types.includes(t) ? types.filter((x) => x !== t) : [...types, t])
  }

  const openNew  = () => { setForm(EMPTY); setError(''); setModal(true) }
  const openEdit = (row) => { setForm({ ...row, supplier_types: row.supplier_types ?? [] }); setError(''); setModal(true) }

  const save = async () => {
    if (!form.code || !form.name) { setError('Kod ve firma adı zorunludur.'); return }
    setSaving(true); setError('')
    try {
      const payload = { ...form, avg_delivery_days: form.avg_delivery_days ? Number(form.avg_delivery_days) : null }
      delete payload.id
      if (editing) {
        const { error: err } = await supabase.from('suppliers').update(payload).eq('id', form.id)
        if (err) throw err
      } else {
        const { error: err } = await supabase.from('suppliers').insert(payload)
        if (err) throw err
      }
      await load(); setModal(false)
    } catch (e) { setError(e.message) }
    finally { setSaving(false) }
  }

  const columns = [
    { key: 'code',             label: 'Kod',         width: 90 },
    { key: 'name',             label: 'Firma Adı' },
    { key: 'supplier_types',   label: 'Tipler',      render: (v) => (v ?? []).map((t) => TYPE_LABELS[t] ?? t).join(', ') || '—' },
    { key: 'is_as9100_approved', label: 'AS9100',    width: 80, render: (v) => v ? <span className="badge-ok">✓</span> : '—' },
    { key: 'approval_status',  label: 'Durum',       width: 120, render: (v) => <StatusBadge status={v} map={STATUS_MAP} /> },
    { key: 'avg_delivery_days', label: 'Teslimat (gün)', width: 100 },
  ]

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-400">{suppliers.length} tedarikçi tanımlı</p>
        <Button onClick={openNew} icon="+">Tedarikçi Ekle</Button>
      </div>

      <Table columns={columns} data={suppliers} onRowClick={openEdit} emptyText="Henüz tedarikçi eklenmemiş" />

      <Modal open={modal} onClose={() => setModal(false)} title={editing ? 'Tedarikçi Düzenle' : 'Yeni Tedarikçi'} size="lg"
        footer={<><Button variant="secondary" onClick={() => setModal(false)}>İptal</Button><Button onClick={save} loading={saving}>{editing ? 'Kaydet' : 'Ekle'}</Button></>}>
        <div className="grid grid-cols-2 gap-4">
          <Input label="Tedarikçi Kodu" required value={form.code} onChange={(e) => set('code', e.target.value)} placeholder="TDR-001" />
          <Input label="Firma Adı" required value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="Sandvik Türkiye" />

          <div className="col-span-2 space-y-1.5">
            <label className="block text-xs font-medium uppercase tracking-wider text-slate-400">Tedarikçi Tipi</label>
            <div className="flex gap-3">
              {Object.entries(TYPE_LABELS).map(([v, l]) => (
                <label key={v} className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" className="accent-blue-500"
                    checked={(form.supplier_types ?? []).includes(v)}
                    onChange={() => toggleType(v)} />
                  <span className="text-sm text-slate-300">{l}</span>
                </label>
              ))}
            </div>
          </div>

          <Select label="Onay Durumu" options={Object.entries(STATUS_MAP).map(([v, o]) => ({ value: v, label: o.label }))}
            value={form.approval_status} onChange={(e) => set('approval_status', e.target.value)} />
          <div className="flex items-center gap-3 pt-5">
            <input type="checkbox" id="as9100" className="accent-blue-500" checked={!!form.is_as9100_approved}
              onChange={(e) => set('is_as9100_approved', e.target.checked)} />
            <label htmlFor="as9100" className="text-sm text-slate-300 cursor-pointer">AS9100 Onaylı Tedarikçi</label>
          </div>

          <Input label="TÜRKAK Akreditasyon No" value={form.turkak_accred_no ?? ''} onChange={(e) => set('turkak_accred_no', e.target.value)} placeholder="17025-XXXX" />
          <Input label="Ort. Teslimat Süresi (gün)" type="number" value={form.avg_delivery_days ?? ''} onChange={(e) => set('avg_delivery_days', e.target.value)} />
          <Input label="Telefon" value={form.contact_phone ?? ''} onChange={(e) => set('contact_phone', e.target.value)} />
          <Input label="E-posta" type="email" value={form.contact_email ?? ''} onChange={(e) => set('contact_email', e.target.value)} />
          <Input label="Adres" value={form.address ?? ''} onChange={(e) => set('address', e.target.value)} className="col-span-2" />
        </div>
        {error && <p className="mt-3 text-sm text-red-400">{error}</p>}
      </Modal>
    </div>
  )
}
