import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import Select from '@/components/ui/Select'
import Modal from '@/components/ui/Modal'
import { Table } from '@/components/ui/Table'

const CHANNEL_OPTS = [
  { value: 'in_app',    label: 'Uygulama İçi' },
  { value: 'email',     label: 'E-posta' },
  { value: 'sms',       label: 'SMS' },
  { value: 'push',      label: 'Push Bildirimi' },
]

const EVENT_LABELS = {
  calibration_due:         'Kalibrasyon Vadesi',
  calibration_overdue:     'Kalibrasyon Gecikmiş',
  tool_life_warning:       'Takım Ömrü Uyarısı',
  checkout_overdue:        'Zimmet Gecikmiş',
  scrap_approved:          'Bertaraf Onaylandı',
  regrind_returned:        'Bileme İadesi',
  stock_low:               'Stok Düşük',
  alarm_critical:          'Kritik Alarm',
}

const EMPTY = { event_type: '', channel: 'in_app', subject_template: '', body_template: '', is_active: true }

export default function NotificationTemplatesSection() {
  const [templates, setTemplates] = useState([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(false)
  const [form, setForm] = useState(EMPTY)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const editing = !!form.id
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }))

  const load = async () => {
    setLoading(true)
    const { data } = await supabase.from('notification_templates').select('*').order('event_type')
    setTemplates(data ?? [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const openNew  = () => { setForm(EMPTY); setError(''); setModal(true) }
  const openEdit = (row) => { setForm(row); setError(''); setModal(true) }

  const save = async () => {
    if (!form.event_type || !form.body_template) { setError('Olay tipi ve şablon gövdesi zorunludur.'); return }
    setSaving(true); setError('')
    try {
      const payload = { ...form }
      delete payload.id; delete payload.created_at; delete payload.updated_at
      if (editing) {
        const { error: err } = await supabase.from('notification_templates').update(payload).eq('id', form.id)
        if (err) throw err
      } else {
        const { error: err } = await supabase.from('notification_templates').insert(payload)
        if (err) throw err
      }
      await load(); setModal(false)
    } catch (e) { setError(e.message) }
    finally { setSaving(false) }
  }

  const toggleActive = async (row) => {
    await supabase.from('notification_templates').update({ is_active: !row.is_active }).eq('id', row.id)
    await load()
  }

  const columns = [
    { key: 'event_type', label: 'Olay Tipi', render: (v) => EVENT_LABELS[v] ?? v },
    { key: 'channel',    label: 'Kanal',     render: (v) => CHANNEL_OPTS.find((c) => c.value === v)?.label ?? v },
    { key: 'subject_template', label: 'Konu Şablonu', render: (v) => v || <span className="text-slate-500">—</span> },
    {
      key: 'is_active', label: 'Aktif', width: 80,
      render: (v, row) => (
        <button onClick={(e) => { e.stopPropagation(); toggleActive(row) }}
          className={`h-5 w-9 rounded-full transition-colors ${v ? 'bg-emerald-600' : 'bg-slate-600'}`}>
          <span className={`block h-4 w-4 rounded-full bg-white shadow transition-transform mx-0.5 ${v ? 'translate-x-4' : 'translate-x-0'}`} />
        </button>
      ),
    },
  ]

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-400">
          Bildirim şablonlarını yönetin. Şablonlarda <code className="bg-slate-700 px-1 rounded text-xs">{'{{tool_code}}'}</code>,{' '}
          <code className="bg-slate-700 px-1 rounded text-xs">{'{{days_remaining}}'}</code> gibi değişkenler kullanabilirsiniz.
        </p>
        <Button onClick={openNew} icon="+">Şablon Ekle</Button>
      </div>

      <Table columns={columns} data={templates} onRowClick={openEdit} emptyText="Bildirim şablonu yok" />

      <Modal open={modal} onClose={() => setModal(false)} title={editing ? 'Şablon Düzenle' : 'Yeni Şablon'} size="lg"
        footer={<><Button variant="secondary" onClick={() => setModal(false)}>İptal</Button><Button onClick={save} loading={saving}>{editing ? 'Kaydet' : 'Ekle'}</Button></>}>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Select label="Olay Tipi" required
              options={Object.entries(EVENT_LABELS).map(([v, l]) => ({ value: v, label: l }))}
              value={form.event_type} onChange={(e) => set('event_type', e.target.value)} />
            <Select label="Kanal" options={CHANNEL_OPTS} value={form.channel} onChange={(e) => set('channel', e.target.value)} />
          </div>
          <Input label="Konu Şablonu" value={form.subject_template ?? ''} onChange={(e) => set('subject_template', e.target.value)}
            placeholder="{{tool_code}} — Kalibrasyon vadesi yaklaşıyor" />
          <div className="space-y-1.5">
            <label className="block text-xs font-medium uppercase tracking-wider text-slate-400">Gövde Şablonu <span className="text-red-400">*</span></label>
            <textarea rows={5} value={form.body_template ?? ''} onChange={(e) => set('body_template', e.target.value)}
              className="w-full rounded-xl border border-slate-600 bg-slate-700 px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 resize-none"
              placeholder="{{tool_code}} ({{tool_name}}) kodlu takımın kalibrasyonu {{due_date}} tarihinde sona eriyor. Kalan süre: {{days_remaining}} gün." />
          </div>
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" className="accent-blue-500" checked={!!form.is_active} onChange={(e) => set('is_active', e.target.checked)} />
            <span className="text-sm text-slate-300">Şablon aktif</span>
          </label>
        </div>
        {error && <p className="mt-2 text-sm text-red-400">{error}</p>}
      </Modal>
    </div>
  )
}
