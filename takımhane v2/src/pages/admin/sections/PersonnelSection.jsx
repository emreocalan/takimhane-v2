import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/authStore'
import { Table, StatusBadge } from '@/components/ui/Table'
import Button from '@/components/ui/Button'
import Select from '@/components/ui/Select'
import Modal from '@/components/ui/Modal'
import Input from '@/components/ui/Input'

const STATUS_MAP = {
  active:    { label: 'Aktif',   cls: 'badge-ok' },
  on_leave:  { label: 'İzinde',  cls: 'badge-warning' },
  inactive:  { label: 'Pasif',   cls: 'badge-info' },
}

const SHIFT_LABELS = { morning: 'Sabah', afternoon: 'Öğle', night: 'Gece', flexible: 'Esnek' }

export default function PersonnelSection() {
  const { profile: myProfile } = useAuthStore()
  const [profiles, setProfiles] = useState([])
  const [roles, setRoles] = useState([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(false)
  const [form, setForm] = useState({})
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }))

  const load = async () => {
    if (!myProfile?.facility_id) return
    setLoading(true)
    const [{ data: p }, { data: r }] = await Promise.all([
      supabase.from('profiles').select('*, roles(name, label)').eq('facility_id', myProfile.facility_id).order('full_name'),
      supabase.from('roles').select('*').order('label'),
    ])
    setProfiles(p ?? [])
    setRoles(r ?? [])
    setLoading(false)
  }

  useEffect(() => { load() }, [myProfile?.facility_id])

  const openEdit = (row) => { setForm({ ...row, role_id: row.role_id ?? '' }); setError(''); setModal(true) }

  const save = async () => {
    setSaving(true); setError('')
    try {
      const { error: err } = await supabase.from('profiles').update({
        full_name: form.full_name, role_id: form.role_id || null,
        employee_no: form.employee_no, shift: form.shift || null,
        status: form.status, rfid_card_no: form.rfid_card_no || null,
      }).eq('id', form.id)
      if (err) throw err
      await load(); setModal(false)
    } catch (e) { setError(e.message) }
    finally { setSaving(false) }
  }

  const columns = [
    { key: 'employee_no', label: 'Sicil', width: 80 },
    { key: 'full_name',   label: 'Ad Soyad' },
    { key: 'roles',       label: 'Rol',    render: (v) => v?.label ?? '—' },
    { key: 'shift',       label: 'Vardiya', render: (v) => SHIFT_LABELS[v] ?? '—' },
    { key: 'status',      label: 'Durum',  width: 100, render: (v) => <StatusBadge status={v} map={STATUS_MAP} /> },
  ]

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-blue-500/30 bg-blue-500/5 p-4 text-sm text-blue-300">
        <p className="font-medium">ℹ️ Yeni kullanıcı ekleme</p>
        <p className="mt-1 text-blue-400">
          Yeni personel için önce <strong>Supabase Dashboard → Authentication → Users → Add user</strong> üzerinden
          hesap oluşturun. E-posta: <code className="font-mono bg-blue-900/30 px-1 rounded">sicilno@takimhane.local</code>,
          şifre: PIN. Kullanıcı ilk girişini yaptıktan sonra burada listelenir.
        </p>
      </div>

      <Table columns={columns} data={profiles} onRowClick={openEdit} emptyText="Henüz profil kaydı yok" />

      <Modal open={modal} onClose={() => setModal(false)} title="Personel Düzenle"
        footer={<><Button variant="secondary" onClick={() => setModal(false)}>İptal</Button><Button onClick={save} loading={saving}>Kaydet</Button></>}>
        <div className="grid grid-cols-2 gap-4">
          <Input label="Ad Soyad" required value={form.full_name ?? ''} onChange={(e) => set('full_name', e.target.value)} />
          <Input label="Sicil No" value={form.employee_no ?? ''} onChange={(e) => set('employee_no', e.target.value)} />
          <Select label="Rol" options={roles.map((r) => ({ value: r.id, label: r.label }))} value={form.role_id ?? ''}
            onChange={(e) => set('role_id', e.target.value)} />
          <Select label="Vardiya" options={Object.entries(SHIFT_LABELS).map(([v, l]) => ({ value: v, label: l }))}
            value={form.shift ?? ''} onChange={(e) => set('shift', e.target.value)} />
          <Select label="Durum" options={Object.entries(STATUS_MAP).map(([v, o]) => ({ value: v, label: o.label }))}
            value={form.status ?? 'active'} onChange={(e) => set('status', e.target.value)} />
          <Input label="RFID Kart No" value={form.rfid_card_no ?? ''} onChange={(e) => set('rfid_card_no', e.target.value)} />
        </div>
        {error && <p className="mt-3 text-sm text-red-400">{error}</p>}
      </Modal>
    </div>
  )
}
