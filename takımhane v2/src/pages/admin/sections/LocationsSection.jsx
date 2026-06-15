import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/authStore'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import Select from '@/components/ui/Select'
import Modal from '@/components/ui/Modal'

const LEVEL_LABELS = { region: 'Bölge/Alan', cabinet: 'Dolap', shelf: 'Raf', slot: 'Göz/Çekmece' }
const TYPE_LABELS  = { cutting_tool: 'Kesici Takım', gauge: 'Ölçüm Aleti', fixture: 'Fikstür', consumable: 'Sarf', mixed: 'Karma' }

const EMPTY = { code: '', name: '', level: 'cabinet', location_type: 'mixed', parent_id: '', capacity: '' }

function LocationRow({ loc, depth = 0, onEdit }) {
  return (
    <>
      <tr className="border-b border-slate-700/40 bg-slate-800 hover:bg-slate-700/50 cursor-pointer" onClick={() => onEdit(loc)}>
        <td className="px-4 py-2.5">
          <span style={{ paddingLeft: depth * 20 }} className="flex items-center gap-2">
            <span className="text-slate-500 text-xs">{depth > 0 ? '└' : ''}</span>
            <span className="font-mono text-sm text-slate-200">{loc.code}</span>
          </span>
        </td>
        <td className="px-4 py-2.5 text-sm text-slate-300">{loc.name}</td>
        <td className="px-4 py-2.5 text-xs text-slate-400">{LEVEL_LABELS[loc.level]}</td>
        <td className="px-4 py-2.5 text-xs text-slate-400">{TYPE_LABELS[loc.location_type]}</td>
        <td className="px-4 py-2.5 text-xs text-slate-400">{loc.capacity ?? '—'}</td>
      </tr>
    </>
  )
}

function renderTree(nodes, parentId = null, depth = 0, onEdit) {
  return nodes
    .filter((n) => (n.parent_id ?? null) === parentId)
    .flatMap((n) => [
      <LocationRow key={n.id} loc={n} depth={depth} onEdit={onEdit} />,
      ...renderTree(nodes, n.id, depth + 1, onEdit),
    ])
}

export default function LocationsSection() {
  const { profile } = useAuthStore()
  const [locations, setLocations] = useState([])
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
    const { data } = await supabase.from('storage_locations').select('*').eq('facility_id', profile.facility_id).order('code')
    setLocations(data ?? [])
    setLoading(false)
  }

  useEffect(() => { load() }, [profile?.facility_id])

  const openNew  = () => { setForm(EMPTY); setError(''); setModal(true) }
  const openEdit = (row) => { setForm({ ...row, parent_id: row.parent_id ?? '' }); setError(''); setModal(true) }

  const save = async () => {
    if (!form.code) { setError('Kod zorunludur.'); return }
    setSaving(true); setError('')
    try {
      const payload = {
        facility_id: profile.facility_id, code: form.code, name: form.name || form.code,
        level: form.level, location_type: form.location_type,
        capacity: form.capacity ? Number(form.capacity) : null,
        parent_id: form.parent_id || null,
      }
      if (editing) {
        const { error: err } = await supabase.from('storage_locations').update(payload).eq('id', form.id)
        if (err) throw err
      } else {
        const { error: err } = await supabase.from('storage_locations').insert(payload)
        if (err) throw err
      }
      await load(); setModal(false)
    } catch (e) { setError(e.message) }
    finally { setSaving(false) }
  }

  const parentOptions = locations
    .filter((l) => l.level !== 'slot')
    .map((l) => ({ value: l.id, label: `${l.code} — ${l.name || l.code} (${LEVEL_LABELS[l.level]})` }))

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-400">{locations.length} lokasyon tanımlı (ağaç görünümü)</p>
        <Button onClick={openNew} icon="+">Lokasyon Ekle</Button>
      </div>

      <div className="overflow-x-auto rounded-xl border border-slate-700">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-700 bg-slate-800/50">
              <th className="px-4 py-2 text-left text-xs text-slate-400">Kod</th>
              <th className="px-4 py-2 text-left text-xs text-slate-400">Ad</th>
              <th className="px-4 py-2 text-left text-xs text-slate-400">Seviye</th>
              <th className="px-4 py-2 text-left text-xs text-slate-400">Tip</th>
              <th className="px-4 py-2 text-left text-xs text-slate-400">Kapasite</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-slate-500">Yükleniyor…</td></tr>
            ) : locations.length === 0 ? (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-slate-500">Henüz lokasyon eklenmemiş</td></tr>
            ) : renderTree(locations, null, 0, openEdit)}
          </tbody>
        </table>
      </div>

      <Modal open={modal} onClose={() => setModal(false)} title={editing ? 'Lokasyon Düzenle' : 'Yeni Lokasyon'}
        footer={<><Button variant="secondary" onClick={() => setModal(false)}>İptal</Button><Button onClick={save} loading={saving}>{editing ? 'Kaydet' : 'Ekle'}</Button></>}>
        <div className="grid grid-cols-2 gap-4">
          <Select label="Seviye" required options={Object.entries(LEVEL_LABELS).map(([v, l]) => ({ value: v, label: l }))}
            value={form.level} onChange={(e) => set('level', e.target.value)} />
          <Input label="Kod" required value={form.code} onChange={(e) => set('code', e.target.value)} placeholder="DOL-01" />
          <Input label="Ad" value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="Kesici Takım Dolabı" className="col-span-2" />
          <Select label="Lokasyon Tipi" options={Object.entries(TYPE_LABELS).map(([v, l]) => ({ value: v, label: l }))}
            value={form.location_type} onChange={(e) => set('location_type', e.target.value)} />
          <Input label="Kapasite (adet)" type="number" value={form.capacity ?? ''} onChange={(e) => set('capacity', e.target.value)} placeholder="20" />
          {parentOptions.length > 0 && (
            <Select label="Üst Lokasyon" options={parentOptions} value={form.parent_id ?? ''}
              onChange={(e) => set('parent_id', e.target.value)} className="col-span-2" />
          )}
        </div>
        {error && <p className="mt-3 text-sm text-red-400">{error}</p>}
      </Modal>
    </div>
  )
}
