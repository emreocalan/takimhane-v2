import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import Select from '@/components/ui/Select'
import Modal from '@/components/ui/Modal'

const FIELD_TYPES = [
  { value: 'text',        label: 'Metin' },
  { value: 'number',      label: 'Sayı' },
  { value: 'date',        label: 'Tarih' },
  { value: 'select',      label: 'Seçim Listesi' },
  { value: 'boolean',     label: 'Evet/Hayır' },
  { value: 'file',        label: 'Dosya' },
]

function AttributeList({ typeId }) {
  const [attrs, setAttrs] = useState([])
  const [modal, setModal] = useState(false)
  const [form, setForm] = useState({ field_key: '', field_label: '', field_type: 'text', unit: '', is_required: false, display_order: 10 })
  const [saving, setSaving] = useState(false)
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }))

  const load = async () => {
    const { data } = await supabase.from('tool_type_attribute_definitions').select('*').eq('tool_type_id', typeId).order('display_order')
    setAttrs(data ?? [])
  }

  useEffect(() => { if (typeId) load() }, [typeId])

  const save = async () => {
    if (!form.field_key || !form.field_label) return
    setSaving(true)
    try {
      await supabase.from('tool_type_attribute_definitions').insert({
        tool_type_id: typeId, ...form,
        display_order: Number(form.display_order),
        applies_to_definition: true,
      })
      await load(); setModal(false)
      setForm({ field_key: '', field_label: '', field_type: 'text', unit: '', is_required: false, display_order: (attrs.length + 1) * 10 })
    } finally { setSaving(false) }
  }

  return (
    <div className="mt-3 space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-xs text-slate-500 font-medium uppercase tracking-wider">Attribute'lar ({attrs.length})</p>
        <Button size="sm" variant="ghost" onClick={() => setModal(true)} icon="+">Alan Ekle</Button>
      </div>

      {attrs.map((a) => (
        <div key={a.id} className="flex items-center gap-3 rounded-lg bg-slate-700/40 px-3 py-2 text-xs">
          <span className="font-mono text-slate-300 w-32 truncate">{a.field_key}</span>
          <span className="text-slate-400 flex-1">{a.field_label}</span>
          <span className="text-slate-500">{a.field_type}</span>
          {a.unit && <span className="text-slate-500">{a.unit}</span>}
          {a.is_required && <span className="badge-critical text-[10px]">Zorunlu</span>}
        </div>
      ))}

      <Modal open={modal} onClose={() => setModal(false)} title="Yeni Attribute" size="sm"
        footer={<><Button variant="secondary" onClick={() => setModal(false)}>İptal</Button><Button onClick={save} loading={saving}>Ekle</Button></>}>
        <div className="space-y-3">
          <Input label="Alan Anahtarı (key)" required value={form.field_key} onChange={(e) => set('field_key', e.target.value.toLowerCase().replace(/\s+/g, '_'))} placeholder="diameter_mm" />
          <Input label="Etiket (görünen ad)" required value={form.field_label} onChange={(e) => set('field_label', e.target.value)} placeholder="Çap (mm)" />
          <div className="grid grid-cols-2 gap-3">
            <Select label="Alan Tipi" options={FIELD_TYPES} value={form.field_type} onChange={(e) => set('field_type', e.target.value)} />
            <Input label="Birim" value={form.unit} onChange={(e) => set('unit', e.target.value)} placeholder="mm, °, rpm…" />
          </div>
          <Input label="Sıra" type="number" value={form.display_order} onChange={(e) => set('display_order', e.target.value)} />
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" className="accent-blue-500" checked={form.is_required} onChange={(e) => set('is_required', e.target.checked)} />
            <span className="text-sm text-slate-300">Zorunlu alan</span>
          </label>
        </div>
      </Modal>
    </div>
  )
}

export default function ToolTypesSection() {
  const [types, setTypes] = useState([])
  const [expanded, setExpanded] = useState(null)

  const load = async () => {
    const { data } = await supabase.from('tool_types').select('*').order('display_order')
    setTypes(data ?? [])
  }

  useEffect(() => { load() }, [])

  const toggle = async (id) => {
    const t = types.find((x) => x.id === id)
    await supabase.from('tool_types').update({ is_active: !t.is_active }).eq('id', id)
    await load()
  }

  const colorMap = { '#EF4444': 'bg-red-500', '#3B82F6': 'bg-blue-500', '#10B981': 'bg-emerald-500', '#8B5CF6': 'bg-violet-500', '#F59E0B': 'bg-amber-500', '#6B7280': 'bg-slate-500' }

  return (
    <div className="space-y-3">
      <p className="text-sm text-slate-400">Varlık tiplerini ve attribute şablonlarını yönetin.</p>

      {types.map((t) => (
        <div key={t.id} className="card">
          <div className="flex items-center gap-4 p-4 cursor-pointer" onClick={() => setExpanded(expanded === t.id ? null : t.id)}>
            <div className={`h-3 w-3 rounded-full flex-shrink-0 ${colorMap[t.color] ?? 'bg-slate-500'}`} />
            <div className="flex-1">
              <p className="text-sm font-medium text-white">{t.name}</p>
              <p className="text-xs text-slate-500">
                {t.allows_regrind ? '• Bileme' : ''}{t.requires_calibration ? ' • Kalibrasyon' : ''}{t.is_system ? ' • Sistem tipi' : ''}
              </p>
            </div>
            <div className="flex items-center gap-3">
              {!t.is_system && (
                <button onClick={(e) => { e.stopPropagation(); toggle(t.id) }}
                  className={`h-5 w-9 rounded-full transition-colors ${t.is_active ? 'bg-emerald-600' : 'bg-slate-600'}`}>
                  <span className={`block h-4 w-4 rounded-full bg-white shadow transition-transform mx-0.5 ${t.is_active ? 'translate-x-4' : 'translate-x-0'}`} />
                </button>
              )}
              <span className="text-slate-500 text-xs">{expanded === t.id ? '▲' : '▼'}</span>
            </div>
          </div>

          {expanded === t.id && (
            <div className="border-t border-slate-700 px-4 pb-4">
              <AttributeList typeId={t.id} />
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
