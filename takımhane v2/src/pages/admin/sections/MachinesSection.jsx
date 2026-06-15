import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/authStore'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import Select from '@/components/ui/Select'
import Modal from '@/components/ui/Modal'
import { Table, StatusBadge } from '@/components/ui/Table'

const STATUS_MAP = {
  active:      { label: 'Aktif',    cls: 'badge-ok' },
  maintenance: { label: 'Bakımda',  cls: 'badge-warning' },
  fault:       { label: 'Arıza',    cls: 'badge-critical' },
  passive:     { label: 'Pasif',    cls: 'badge-info' },
}

const EMPTY = { code: '', name: '', machine_type: 'vmc', brand: '', model: '', magazine_capacity: 30, tool_connection_type: 'bt40', max_tool_diameter_mm: '', max_tool_length_mm: '', location_area: '', status: 'active' }

export default function MachinesSection() {
  const { profile } = useAuthStore()
  const [machines, setMachines] = useState([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(false)
  const [form, setForm] = useState(EMPTY)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const editing = !!form.id
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }))

  const load = async () => {
    if (!profile?.facility_id) return
    setLoading(true)
    const { data } = await supabase.from('magazine_machines').select('*').eq('facility_id', profile.facility_id).order('code')
    setMachines(data ?? [])
    setLoading(false)
  }

  useEffect(() => { load() }, [profile?.facility_id])

  const openNew  = () => { setForm(EMPTY); setError(''); setModal(true) }
  const openEdit = (row) => { setForm(row); setError(''); setModal(true) }

  const save = async () => {
    if (!form.code || !form.name) { setError('Kod ve ad zorunludur.'); return }
    setSaving(true); setError('')
    try {
      const payload = { ...form, facility_id: profile.facility_id, magazine_capacity: Number(form.magazine_capacity) }
      delete payload.id
      if (editing) {
        const { error: err } = await supabase.from('magazine_machines').update(payload).eq('id', form.id)
        if (err) throw err
      } else {
        const { error: err } = await supabase.from('magazine_machines').insert(payload)
        if (err) throw err
      }
      await load()
      setModal(false)
    } catch (e) { setError(e.message) }
    finally { setSaving(false) }
  }

  const columns = [
    { key: 'code',             label: 'Kod',      width: 100 },
    { key: 'name',             label: 'Ad' },
    { key: 'machine_type',     label: 'Tip',      width: 80,  render: (v) => v?.toUpperCase() },
    { key: 'brand',            label: 'Marka',    width: 100 },
    { key: 'magazine_capacity',label: 'Kapasite', width: 90,  render: (v) => `${v} pot` },
    { key: 'tool_connection_type', label: 'Bağlantı', width: 100, render: (v) => v?.toUpperCase() },
    { key: 'status', label: 'Durum', width: 100, render: (v) => <StatusBadge status={v} map={STATUS_MAP} /> },
  ]

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-400">{machines.length} tezgah tanımlı</p>
        <Button onClick={openNew} icon="+">Tezgah Ekle</Button>
      </div>

      <Table columns={columns} data={machines} onRowClick={openEdit} emptyText="Henüz tezgah eklenmemiş" />

      <Modal open={modal} onClose={() => setModal(false)} title={editing ? 'Tezgah Düzenle' : 'Yeni Tezgah'} size="lg"
        footer={<><Button variant="secondary" onClick={() => setModal(false)}>İptal</Button><Button onClick={save} loading={saving}>{editing ? 'Kaydet' : 'Ekle'}</Button></>}>
        <div className="grid grid-cols-2 gap-4">
          <Input label="Tezgah Kodu" required value={form.code} onChange={(e) => set('code', e.target.value)} placeholder="VMC-01" />
          <Input label="Tezgah Adı" required value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="Mazak Variaxis 630" />
          <Select label="Tip" options={[
            { value: 'vmc', label: 'VMC' }, { value: 'hmc', label: 'HMC' },
            { value: 'lathe', label: 'Torna' }, { value: 'grinding', label: 'Taşlama' },
            { value: 'edm', label: 'EDM' }, { value: 'other', label: 'Diğer' },
          ]} value={form.machine_type} onChange={(e) => set('machine_type', e.target.value)} />
          <Select label="Durum" options={Object.entries(STATUS_MAP).map(([v, o]) => ({ value: v, label: o.label }))}
            value={form.status} onChange={(e) => set('status', e.target.value)} />
          <Input label="Marka" value={form.brand ?? ''} onChange={(e) => set('brand', e.target.value)} placeholder="Mazak" />
          <Input label="Model" value={form.model ?? ''} onChange={(e) => set('model', e.target.value)} placeholder="Variaxis 630" />
          <Input label="Magazin Kapasitesi (pot)" type="number" value={form.magazine_capacity} onChange={(e) => set('magazine_capacity', e.target.value)} />
          <Select label="Takım Bağlantı Tipi" options={[
            { value: 'bt30', label: 'BT30' }, { value: 'bt40', label: 'BT40' },
            { value: 'bt50', label: 'BT50' }, { value: 'hsk_a63', label: 'HSK-A63' },
            { value: 'cat40', label: 'CAT40' }, { value: 'other', label: 'Diğer' },
          ]} value={form.tool_connection_type ?? ''} onChange={(e) => set('tool_connection_type', e.target.value)} />
          <Input label="Maks. Takım Çapı (mm)" type="number" value={form.max_tool_diameter_mm ?? ''} onChange={(e) => set('max_tool_diameter_mm', e.target.value)} />
          <Input label="Maks. Takım Boyu (mm)" type="number" value={form.max_tool_length_mm ?? ''} onChange={(e) => set('max_tool_length_mm', e.target.value)} />
          <Input label="Bulunduğu Alan" value={form.location_area ?? ''} onChange={(e) => set('location_area', e.target.value)} placeholder="Hol-A, CNC Bölgesi 2" className="col-span-2" />
        </div>
        {error && <p className="mt-3 text-sm text-red-400">{error}</p>}
      </Modal>
    </div>
  )
}
