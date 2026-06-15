import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'

export default function AlarmThresholdsSection() {
  const [thresholds, setThresholds] = useState([])
  const [edited, setEdited] = useState({})
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  const load = async () => {
    const { data } = await supabase.from('alarm_thresholds').select('*').is('facility_id', null).order('threshold_key')
    setThresholds(data ?? [])
    setEdited({})
  }

  useEffect(() => { load() }, [])

  const change = (id, value) => setEdited((e) => ({ ...e, [id]: value }))

  const saveAll = async () => {
    setSaving(true)
    try {
      const updates = Object.entries(edited).map(([id, val]) =>
        supabase.from('alarm_thresholds').update({ value_number: Number(val) }).eq('id', id)
      )
      await Promise.all(updates)
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
      await load()
    } finally { setSaving(false) }
  }

  const hasChanges = Object.keys(edited).length > 0

  const unitLabel = { days: 'gün', hours: 'saat', pct: '%', ratio: 'oran' }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-400">Global alarm eşik değerleri (tüm tesisler için geçerli)</p>
        <Button onClick={saveAll} loading={saving} disabled={!hasChanges} variant={saved ? 'success' : 'primary'}>
          {saved ? '✓ Kaydedildi' : 'Değişiklikleri Kaydet'}
        </Button>
      </div>

      <div className="space-y-3">
        {thresholds.map((t) => (
          <div key={t.id} className="card flex items-center gap-4 p-4">
            <div className="flex-1">
              <p className="text-sm font-medium text-white">{t.label}</p>
              <p className="text-xs text-slate-500 font-mono">{t.threshold_key}</p>
            </div>
            <div className="flex items-center gap-2">
              <Input
                type="number"
                className="w-28"
                value={edited[t.id] !== undefined ? edited[t.id] : (t.value_number ?? '')}
                onChange={(e) => change(t.id, e.target.value)}
              />
              <span className="text-sm text-slate-400 w-10">{unitLabel[t.unit] ?? t.unit}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
