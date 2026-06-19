import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/authStore'
import toast from '@/lib/toast'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import Select from '@/components/ui/Select'
import Modal from '@/components/ui/Modal'
import { Table, StatusBadge } from '@/components/ui/Table'

// ── Helpers ──────────────────────────────────────────────────────
const EMPTY_FORM = {
  internal_code: '', name: '', tool_type_id: '', supplier_id: '',
  manufacturer: '', manufacturer_part_no: '', iso_din_code: '',
  nominal_length_mm: '', nominal_diameter_mm: '',
  length_tolerance_mm: '', diameter_tolerance_mm: '',
  theoretical_life_minutes: '', theoretical_life_parts: '', theoretical_life_meters: '',
  min_stock_level: 0, reorder_point: 0, notes: '',
}

const STATUS_MAP = {
  true:  { label: 'Aktif', cls: 'badge-ok' },
  false: { label: 'Pasif', cls: 'badge-info' },
}

// Daraltılabilir form bölümü
function FormSection({ title, children, defaultOpen = true }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <section>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between mb-3 group"
      >
        <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 group-hover:text-slate-400 transition-colors">
          {title}
        </p>
        <svg
          className={`h-3.5 w-3.5 text-slate-600 transition-transform ${open ? 'rotate-0' : '-rotate-90'}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && children}
    </section>
  )
}

// Dynamic EAV field renderer
function AttrField({ attr, value, onChange }) {
  const label = `${attr.field_label}${attr.unit ? ` (${attr.unit})` : ''}${attr.is_required ? ' *' : ''}`
  if (attr.field_type === 'boolean') {
    return (
      <label className="flex items-center gap-2 cursor-pointer col-span-2">
        <input type="checkbox" className="accent-blue-500" checked={!!value} onChange={(e) => onChange(e.target.checked)} />
        <span className="text-sm text-slate-300">{label}</span>
      </label>
    )
  }
  if (attr.field_type === 'select' && attr.options?.length) {
    return (
      <Select label={label}
        options={attr.options.map((o) => ({ value: o, label: o }))}
        value={value ?? ''} onChange={(e) => onChange(e.target.value)} />
    )
  }
  return (
    <Input label={label} type={attr.field_type === 'number' ? 'number' : attr.field_type === 'date' ? 'date' : 'text'}
      value={value ?? ''} onChange={(e) => onChange(e.target.value)} />
  )
}

// ── Main component ────────────────────────────────────────────────
export default function CatalogPage() {
  const { profile } = useAuthStore()
  const [defs, setDefs] = useState([])
  const [toolTypes, setToolTypes] = useState([])
  const [suppliers, setSuppliers] = useState([])
  const [filterType, setFilterType] = useState('all')
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)
  const [attrValues, setAttrValues] = useState({})     // { attr_def_id: value }
  const [attrDefs, setAttrDefs] = useState([])         // applies_to_definition attrs for selected type
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const editing = !!form.id
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }))

  // ── Data loading ──────────────────────────────────────────────
  const load = useCallback(async () => {
    if (!profile?.facility_id) return
    setLoading(true)
    const { data } = await supabase
      .from('tool_definitions')
      .select('*, tool_types(id, code, name, color), suppliers(id, name)')
      .eq('facility_id', profile.facility_id)
      .order('internal_code')
    setDefs(data ?? [])
    setLoading(false)
  }, [profile?.facility_id])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    const fetchMeta = async () => {
      const [{ data: tt }, { data: sup }] = await Promise.all([
        supabase.from('tool_types').select('id, code, name, color').eq('is_active', true).order('display_order'),
        supabase.from('suppliers').select('id, name').eq('approval_status', 'active').order('name'),
      ])
      setToolTypes(tt ?? [])
      setSuppliers(sup ?? [])
    }
    fetchMeta()
  }, [])

  // When tool_type changes in form, load attribute definitions
  useEffect(() => {
    if (!form.tool_type_id) { setAttrDefs([]); return }
    supabase.from('tool_type_attribute_definitions')
      .select('*')
      .eq('tool_type_id', form.tool_type_id)
      .eq('applies_to_definition', true)
      .order('display_order')
      .then(({ data }) => setAttrDefs(data ?? []))
  }, [form.tool_type_id])

  // ── Modal helpers ─────────────────────────────────────────────
  const openNew = () => {
    setForm(EMPTY_FORM); setAttrValues({}); setAttrDefs([]); setError(''); setModal(true)
  }

  const openEdit = async (row) => {
    setForm({
      ...EMPTY_FORM, ...row,
      tool_type_id: row.tool_type_id ?? '',
      supplier_id: row.supplier_id ?? '',
      nominal_length_mm: row.nominal_length_mm ?? '',
      nominal_diameter_mm: row.nominal_diameter_mm ?? '',
      length_tolerance_mm: row.length_tolerance_mm ?? '',
      diameter_tolerance_mm: row.diameter_tolerance_mm ?? '',
      theoretical_life_minutes: row.theoretical_life_minutes ?? '',
      theoretical_life_parts: row.theoretical_life_parts ?? '',
      theoretical_life_meters: row.theoretical_life_meters ?? '',
    })
    setError('')
    // Load existing attr values
    const { data: existing } = await supabase
      .from('tool_definition_attributes')
      .select('*, tool_type_attribute_definitions(field_key, field_type)')
      .eq('definition_id', row.id)
    const vals = {}
    ;(existing ?? []).forEach((a) => {
      const ft = a.tool_type_attribute_definitions?.field_type
      vals[a.attribute_definition_id] =
        ft === 'boolean' ? a.value_boolean :
        ft === 'number'  ? a.value_number  :
        ft === 'date'    ? a.value_date    :
        a.value_text
    })
    setAttrValues(vals)
    setModal(true)
  }

  // ── Save ──────────────────────────────────────────────────────
  const save = async () => {
    if (!form.internal_code || !form.name || !form.tool_type_id) {
      setError('Kod, ad ve varlık tipi zorunludur.')
      return
    }
    setSaving(true); setError('')
    try {
      const payload = {
        facility_id: profile.facility_id,
        tool_type_id: form.tool_type_id,
        supplier_id: form.supplier_id || null,
        internal_code: form.internal_code,
        name: form.name,
        iso_din_code: form.iso_din_code || null,
        manufacturer: form.manufacturer || null,
        manufacturer_part_no: form.manufacturer_part_no || null,
        nominal_length_mm: form.nominal_length_mm !== '' ? Number(form.nominal_length_mm) : null,
        nominal_diameter_mm: form.nominal_diameter_mm !== '' ? Number(form.nominal_diameter_mm) : null,
        length_tolerance_mm: form.length_tolerance_mm !== '' ? Number(form.length_tolerance_mm) : null,
        diameter_tolerance_mm: form.diameter_tolerance_mm !== '' ? Number(form.diameter_tolerance_mm) : null,
        theoretical_life_minutes: form.theoretical_life_minutes !== '' ? Number(form.theoretical_life_minutes) : null,
        theoretical_life_parts: form.theoretical_life_parts !== '' ? Number(form.theoretical_life_parts) : null,
        theoretical_life_meters: form.theoretical_life_meters !== '' ? Number(form.theoretical_life_meters) : null,
        min_stock_level: Number(form.min_stock_level),
        reorder_point: Number(form.reorder_point),
        notes: form.notes || null,
      }

      let defId = form.id
      if (editing) {
        const { error: err } = await supabase.from('tool_definitions').update(payload).eq('id', form.id)
        if (err) throw err
      } else {
        const { data, error: err } = await supabase.from('tool_definitions').insert(payload).select('id').single()
        if (err) throw err
        defId = data.id
      }

      // Upsert EAV attribute values
      if (attrDefs.length > 0) {
        const attrRows = attrDefs.map((a) => {
          const val = attrValues[a.id]
          return {
            definition_id: defId,
            attribute_definition_id: a.id,
            value_text:    a.field_type !== 'number' && a.field_type !== 'date' && a.field_type !== 'boolean' ? (val ?? null) : null,
            value_number:  a.field_type === 'number'  ? (val !== '' && val != null ? Number(val) : null) : null,
            value_date:    a.field_type === 'date'    ? (val || null) : null,
            value_boolean: a.field_type === 'boolean' ? (!!val) : null,
          }
        })
        const { error: err } = await supabase.from('tool_definition_attributes').upsert(attrRows, { onConflict: 'definition_id,attribute_definition_id' })
        if (err) throw err
      }

      await load(); setModal(false)
      toast.success(editing ? 'Tanım güncellendi.' : 'Yeni tanım oluşturuldu.')
    } catch (e) { setError(e.message); toast.error(e.message) }
    finally { setSaving(false) }
  }

  const toggleActive = async (row) => {
    await supabase.from('tool_definitions').update({ is_active: !row.is_active }).eq('id', row.id)
    await load()
  }

  // ── Filtered data ─────────────────────────────────────────────
  const filtered = defs.filter((d) => {
    if (filterType !== 'all' && d.tool_type_id !== filterType) return false
    if (search) {
      const q = search.toLowerCase()
      return d.internal_code.toLowerCase().includes(q) || d.name.toLowerCase().includes(q) || (d.manufacturer ?? '').toLowerCase().includes(q)
    }
    return true
  })

  const columns = [
    { key: 'internal_code',    label: 'Kod',       width: 120, render: (v) => <span className="font-mono text-blue-300">{v}</span> },
    { key: 'name',             label: 'Takım Adı' },
    { key: 'tool_types',       label: 'Tip',        width: 140, render: (v) => v?.name ?? '—' },
    { key: 'manufacturer',     label: 'Üretici',    render: (v) => v ?? '—' },
    {
      key: 'nominal_diameter_mm', label: 'Ø (mm)', width: 80,
      render: (v, row) => v ? `Ø${v}` : (row.nominal_length_mm ? `${row.nominal_length_mm}mm` : '—'),
    },
    {
      key: 'is_active', label: 'Durum', width: 80,
      render: (v, row) => (
        <button onClick={(e) => { e.stopPropagation(); toggleActive(row) }}
          className={`h-5 w-9 rounded-full transition-colors ${v ? 'bg-emerald-600' : 'bg-slate-600'}`}>
          <span className={`block h-4 w-4 rounded-full bg-white shadow transition-transform mx-0.5 ${v ? 'translate-x-4' : 'translate-x-0'}`} />
        </button>
      ),
    },
  ]

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Envanter Kataloğu</h1>
          <p className="mt-1 text-sm text-slate-400">M6 — Takım tanım şablonları</p>
        </div>
        <Button onClick={openNew} icon="+">Yeni Tanım</Button>
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3">
        <Input placeholder="Kod, ad veya üretici ara…" value={search} onChange={(e) => setSearch(e.target.value)} className="w-64" />
        <div className="flex gap-1 rounded-lg bg-slate-800 p-1">
          <button onClick={() => setFilterType('all')}
            className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${filterType === 'all' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-slate-200'}`}>
            Tümü ({defs.length})
          </button>
          {toolTypes.map((t) => {
            const cnt = defs.filter((d) => d.tool_type_id === t.id).length
            if (!cnt) return null
            return (
              <button key={t.id} onClick={() => setFilterType(t.id)}
                className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${filterType === t.id ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-slate-200'}`}>
                {t.name} ({cnt})
              </button>
            )
          })}
        </div>
      </div>

      <Table columns={columns} data={filtered} onRowClick={openEdit}
        emptyText={loading ? 'Yükleniyor…' : 'Katalog boş — ilk tanımı ekleyin'} />

      {/* Create / Edit Modal */}
      <Modal open={modal} onClose={() => setModal(false)} size="xl"
        title={editing ? `Tanım Düzenle — ${form.internal_code}` : 'Yeni Takım Tanımı'}
        footer={<><Button variant="secondary" onClick={() => setModal(false)}>İptal</Button><Button onClick={save} loading={saving}>{editing ? 'Kaydet' : 'Oluştur'}</Button></>}>
        <div className="space-y-1 divide-y divide-slate-700/50">

          {/* Temel Bilgiler — her zaman açık */}
          <div className="pb-5">
            <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-500">Temel Bilgiler</p>
            <div className="grid grid-cols-3 gap-4">
              <Input label="İç Kod" required value={form.internal_code} onChange={(e) => set('internal_code', e.target.value)} placeholder="KTM-001" />
              <Input label="Takım Adı" required value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="Karbür Freze D12" className="col-span-2" />
              <Select label="Varlık Tipi" required
                options={toolTypes.map((t) => ({ value: t.id, label: t.name }))}
                value={form.tool_type_id} onChange={(e) => set('tool_type_id', e.target.value)} />
              <Select label="Tedarikçi"
                options={suppliers.map((s) => ({ value: s.id, label: s.name }))}
                value={form.supplier_id} onChange={(e) => set('supplier_id', e.target.value)} />
              <Input label="Üretici" value={form.manufacturer} onChange={(e) => set('manufacturer', e.target.value)} placeholder="Sandvik / Kennametal" />
              <Input label="Üretici Parça No" value={form.manufacturer_part_no} onChange={(e) => set('manufacturer_part_no', e.target.value)} />
              <Input label="ISO/DIN Kodu" value={form.iso_din_code} onChange={(e) => set('iso_din_code', e.target.value)} placeholder="ISO 1641 · DIN 844" className="col-span-2" />
            </div>
          </div>

          {/* Nominal Boyutlar */}
          <div className="pt-4 pb-5">
            <FormSection title="Nominal Boyutlar">
              <div className="grid grid-cols-4 gap-4">
                <Input label="Nominal Uzunluk (mm)" type="number" value={form.nominal_length_mm} onChange={(e) => set('nominal_length_mm', e.target.value)} />
                <Input label="Nominal Çap (mm)" type="number" value={form.nominal_diameter_mm} onChange={(e) => set('nominal_diameter_mm', e.target.value)} />
                <Input label="Uzunluk Toleransı (mm)" type="number" value={form.length_tolerance_mm} onChange={(e) => set('length_tolerance_mm', e.target.value)} />
                <Input label="Çap Toleransı (mm)" type="number" value={form.diameter_tolerance_mm} onChange={(e) => set('diameter_tolerance_mm', e.target.value)} />
              </div>
            </FormSection>
          </div>

          {/* Teorik Ömür */}
          <div className="pt-4 pb-5">
            <FormSection title="Teorik Ömür">
              <div className="grid grid-cols-3 gap-4">
                <Input label="Süre (dakika)" type="number" value={form.theoretical_life_minutes} onChange={(e) => set('theoretical_life_minutes', e.target.value)} />
                <Input label="Parça Sayısı" type="number" value={form.theoretical_life_parts} onChange={(e) => set('theoretical_life_parts', e.target.value)} />
                <Input label="Mesafe (metre)" type="number" value={form.theoretical_life_meters} onChange={(e) => set('theoretical_life_meters', e.target.value)} />
              </div>
            </FormSection>
          </div>

          {/* Stok Kontrol */}
          <div className="pt-4 pb-5">
            <FormSection title="Stok Kontrol">
              <div className="grid grid-cols-3 gap-4">
                <Input label="Min. Stok" type="number" value={form.min_stock_level} onChange={(e) => set('min_stock_level', e.target.value)} />
                <Input label="Yenileme Noktası" type="number" value={form.reorder_point} onChange={(e) => set('reorder_point', e.target.value)} />
                <Input label="Notlar" value={form.notes} onChange={(e) => set('notes', e.target.value)} />
              </div>
            </FormSection>
          </div>

          {/* Ek Özellikler (EAV — dinamik) */}
          {attrDefs.length > 0 && (
            <div className="pt-4 pb-2">
              <FormSection title={`Ek Özellikler — ${toolTypes.find(t => t.id === form.tool_type_id)?.name ?? ''}`}>
                <div className="grid grid-cols-3 gap-4">
                  {attrDefs.map((a) => (
                    <AttrField key={a.id} attr={a} value={attrValues[a.id]}
                      onChange={(v) => setAttrValues((prev) => ({ ...prev, [a.id]: v }))} />
                  ))}
                </div>
              </FormSection>
            </div>
          )}

        </div>
        {error && <p className="mt-4 text-sm text-red-400">{error}</p>}
      </Modal>
    </div>
  )
}
