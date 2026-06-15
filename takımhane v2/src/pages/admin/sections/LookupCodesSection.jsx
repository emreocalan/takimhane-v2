import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import Select from '@/components/ui/Select'
import Modal from '@/components/ui/Modal'

const CATEGORIES = [
  { value: 'checkout_reason', label: 'Zimmet Sebep Kodları' },
  { value: 'scrap_reason',    label: 'Bertaraf Sebep Kodları' },
  { value: 'ncr_reason',      label: 'NCR Sebep Kodları' },
]

export default function LookupCodesSection() {
  const [category, setCategory] = useState('checkout_reason')
  const [codes, setCodes] = useState([])
  const [modal, setModal] = useState(false)
  const [form, setForm] = useState({ code: '', label: '', display_order: 0 })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const editing = !!form.id
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }))

  const load = async () => {
    const { data } = await supabase.from('lookup_codes').select('*').eq('category', category).is('facility_id', null).order('display_order')
    setCodes(data ?? [])
  }

  useEffect(() => { load() }, [category])

  const openNew  = () => { setForm({ code: '', label: '', display_order: (codes.length + 1) * 10 }); setError(''); setModal(true) }
  const openEdit = (row) => { setForm(row); setError(''); setModal(true) }

  const save = async () => {
    if (!form.code || !form.label) { setError('Kod ve etiket zorunludur.'); return }
    setSaving(true); setError('')
    try {
      const payload = { category, code: form.code, label: form.label, display_order: Number(form.display_order) }
      if (editing) {
        const { error: err } = await supabase.from('lookup_codes').update(payload).eq('id', form.id)
        if (err) throw err
      } else {
        const { error: err } = await supabase.from('lookup_codes').insert(payload)
        if (err) throw err
      }
      await load(); setModal(false)
    } catch (e) { setError(e.message) }
    finally { setSaving(false) }
  }

  const toggleActive = async (row) => {
    if (row.is_system_reserved) return
    await supabase.from('lookup_codes').update({ is_active: !row.is_active }).eq('id', row.id)
    await load()
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex gap-1 rounded-lg bg-slate-800 p-1">
          {CATEGORIES.map((c) => (
            <button key={c.value} onClick={() => setCategory(c.value)}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${category === c.value ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-slate-200'}`}>
              {c.label}
            </button>
          ))}
        </div>
        <Button onClick={openNew} icon="+" size="sm">Kod Ekle</Button>
      </div>

      <div className="rounded-xl border border-slate-700 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-700 bg-slate-800/50">
              <th className="px-4 py-2 text-left text-xs text-slate-400">Sıra</th>
              <th className="px-4 py-2 text-left text-xs text-slate-400">Kod</th>
              <th className="px-4 py-2 text-left text-xs text-slate-400">Etiket</th>
              <th className="px-4 py-2 text-left text-xs text-slate-400">Sistem</th>
              <th className="px-4 py-2 text-left text-xs text-slate-400">Aktif</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-700/50">
            {codes.length === 0 ? (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-slate-500">Kayıt yok</td></tr>
            ) : codes.map((c) => (
              <tr key={c.id} onClick={() => !c.is_system_reserved && openEdit(c)}
                className={`bg-slate-800 transition-colors ${!c.is_system_reserved ? 'cursor-pointer hover:bg-slate-700/60' : 'opacity-70'}`}>
                <td className="px-4 py-2.5 text-slate-500 text-xs">{c.display_order}</td>
                <td className="px-4 py-2.5 font-mono text-slate-200">{c.code}</td>
                <td className="px-4 py-2.5 text-slate-300">{c.label}</td>
                <td className="px-4 py-2.5">{c.is_system_reserved ? <span className="badge-info">Sistem</span> : '—'}</td>
                <td className="px-4 py-2.5">
                  <button onClick={(e) => { e.stopPropagation(); toggleActive(c) }}
                    disabled={c.is_system_reserved}
                    className={`h-5 w-9 rounded-full transition-colors ${c.is_active ? 'bg-emerald-600' : 'bg-slate-600'} disabled:cursor-not-allowed`}>
                    <span className={`block h-4 w-4 rounded-full bg-white shadow transition-transform mx-0.5 ${c.is_active ? 'translate-x-4' : 'translate-x-0'}`} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Modal open={modal} onClose={() => setModal(false)} title={editing ? 'Kod Düzenle' : 'Yeni Kod'} size="sm"
        footer={<><Button variant="secondary" onClick={() => setModal(false)}>İptal</Button><Button onClick={save} loading={saving}>{editing ? 'Kaydet' : 'Ekle'}</Button></>}>
        <div className="space-y-4">
          <Input label="Kod" required value={form.code} onChange={(e) => set('code', e.target.value)} placeholder="ASINMA" />
          <Input label="Etiket (görünen ad)" required value={form.label} onChange={(e) => set('label', e.target.value)} placeholder="Aşınma" />
          <Input label="Sıra" type="number" value={form.display_order} onChange={(e) => set('display_order', e.target.value)} />
        </div>
        {error && <p className="mt-3 text-sm text-red-400">{error}</p>}
      </Modal>
    </div>
  )
}
