import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/authStore'
import { useAlarmStore } from '@/store/alarmStore'
import Button from '@/components/ui/Button'

// ── Constants ─────────────────────────────────────────────────────
const SEVERITY_MAP = {
  critical: { label: 'Kritik',  dot: 'bg-red-500',    text: 'text-red-400',    ring: 'border-red-500/40 bg-red-500/5' },
  warning:  { label: 'Uyarı',   dot: 'bg-amber-500',  text: 'text-amber-400',  ring: 'border-amber-500/40 bg-amber-500/5' },
  info:     { label: 'Bilgi',   dot: 'bg-blue-500',   text: 'text-blue-400',   ring: 'border-blue-500/40 bg-blue-500/5' },
}

const ENTITY_LABELS = {
  tool_instance: 'Takım',
  work_order:    'İş Emri',
  calibration:   'Kalibrasyon',
  regrind_order: 'Bileme',
  checkout:      'Zimmet',
}

function timeAgo(dateStr) {
  const mins = Math.round((Date.now() - new Date(dateStr)) / 60000)
  if (mins < 60)    return `${mins}dk önce`
  if (mins < 1440)  return `${Math.floor(mins / 60)}s önce`
  if (mins < 10080) return `${Math.floor(mins / 1440)}g önce`
  return new Date(dateStr).toLocaleDateString('tr-TR')
}

// ── Alarm card ────────────────────────────────────────────────────
function AlarmCard({ alarm, onMarkRead, onResolve }) {
  const s = SEVERITY_MAP[alarm.severity] ?? SEVERITY_MAP.info
  const isResolved = alarm.is_resolved

  return (
    <div className={`rounded-xl border p-4 transition-opacity ${isResolved ? 'opacity-50' : ''} ${s.ring}`}>
      <div className="flex items-start gap-3">
        {/* Severity dot */}
        <div className="mt-1 flex-shrink-0 relative">
          <div className={`h-2.5 w-2.5 rounded-full ${s.dot}`} />
          {!alarm.is_read && !isResolved && (
            <div className={`absolute inset-0 rounded-full ${s.dot} animate-ping opacity-60`} />
          )}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`text-xs font-semibold uppercase tracking-wider ${s.text}`}>{s.label}</span>
            {alarm.entity_type && (
              <span className="text-xs text-slate-500">· {ENTITY_LABELS[alarm.entity_type] ?? alarm.entity_type}</span>
            )}
            {alarm.entity_label && (
              <span className="font-mono text-xs text-slate-400">{alarm.entity_label}</span>
            )}
            {!alarm.is_read && <span className="h-1.5 w-1.5 rounded-full bg-blue-400" title="Okunmadı" />}
          </div>
          <p className="mt-1 text-sm font-medium text-white">{alarm.title}</p>
          {alarm.body && <p className="mt-1 text-xs text-slate-400">{alarm.body}</p>}
          <p className="mt-2 text-xs text-slate-600">{timeAgo(alarm.created_at)}</p>
        </div>

        {/* Actions */}
        <div className="flex flex-col gap-1.5 flex-shrink-0">
          {!alarm.is_read && !isResolved && (
            <button onClick={() => onMarkRead(alarm.id)}
              className="text-xs text-slate-500 hover:text-slate-300 transition-colors whitespace-nowrap">
              Okundu
            </button>
          )}
          {!isResolved && (
            <button onClick={() => onResolve(alarm.id)}
              className="text-xs text-emerald-600 hover:text-emerald-400 transition-colors whitespace-nowrap">
              Çözüldü
            </button>
          )}
          {isResolved && (
            <span className="text-xs text-emerald-600">✓ Çözüldü</span>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Main ──────────────────────────────────────────────────────────
export default function AlarmsPage() {
  const { profile } = useAuthStore()
  const { fetch: refetchStore } = useAlarmStore()
  const [alarms, setAlarms] = useState([])
  const [loading, setLoading] = useState(true)
  const [filterSeverity, setFilterSeverity] = useState('all')
  const [filterStatus, setFilterStatus] = useState('unresolved')
  const [savingAll, setSavingAll] = useState(false)

  const load = useCallback(async () => {
    if (!profile?.facility_id) return
    setLoading(true)
    let q = supabase
      .from('alarm_events')
      .select('*')
      .eq('facility_id', profile.facility_id)
      .order('created_at', { ascending: false })
      .limit(200)

    if (filterStatus === 'unresolved') q = q.eq('is_resolved', false)
    if (filterStatus === 'resolved')   q = q.eq('is_resolved', true)
    if (filterSeverity !== 'all')      q = q.eq('severity', filterSeverity)

    const { data } = await q
    setAlarms(data ?? [])
    setLoading(false)
  }, [profile?.facility_id, filterSeverity, filterStatus])

  useEffect(() => { load() }, [load])

  // Realtime
  useEffect(() => {
    if (!profile?.facility_id) return
    const channel = supabase
      .channel('alarms-rt')
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'alarm_events',
        filter: `facility_id=eq.${profile.facility_id}`,
      }, () => { load(); refetchStore(profile.facility_id) })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [profile?.facility_id, load, refetchStore])

  const markRead = async (id) => {
    await supabase.from('alarm_events').update({ is_read: true, read_by: profile.id, read_at: new Date().toISOString() }).eq('id', id)
    setAlarms((prev) => prev.map((a) => a.id === id ? { ...a, is_read: true } : a))
    refetchStore(profile.facility_id)
  }

  const resolve = async (id) => {
    await supabase.from('alarm_events').update({
      is_resolved: true, resolved_by: profile.id, resolved_at: new Date().toISOString(),
      is_read: true, read_by: profile.id, read_at: new Date().toISOString(),
    }).eq('id', id)
    setAlarms((prev) => prev.map((a) => a.id === id ? { ...a, is_resolved: true, is_read: true } : a))
    refetchStore(profile.facility_id)
  }

  const markAllRead = async () => {
    setSavingAll(true)
    const unread = alarms.filter((a) => !a.is_read).map((a) => a.id)
    if (unread.length) {
      await supabase.from('alarm_events').update({
        is_read: true, read_by: profile.id, read_at: new Date().toISOString(),
      }).in('id', unread)
      setAlarms((prev) => prev.map((a) => unread.includes(a.id) ? { ...a, is_read: true } : a))
      refetchStore(profile.facility_id)
    }
    setSavingAll(false)
  }

  const counts = {
    all:        alarms.length,
    critical:   alarms.filter((a) => a.severity === 'critical').length,
    warning:    alarms.filter((a) => a.severity === 'warning').length,
    info:       alarms.filter((a) => a.severity === 'info').length,
    unread:     alarms.filter((a) => !a.is_read && !a.is_resolved).length,
  }

  const visible = alarms.filter((a) =>
    (filterSeverity === 'all' || a.severity === filterSeverity)
  )

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Alarm Yönetimi</h1>
          <p className="mt-1 text-sm text-slate-400">M9 — Sistem alarmları ve uyarıları</p>
        </div>
        <div className="flex items-center gap-3">
          {counts.unread > 0 && (
            <Button size="sm" variant="secondary" onClick={markAllRead} loading={savingAll}>
              Tümünü Okundu İşaretle ({counts.unread})
            </Button>
          )}
        </div>
      </div>

      {/* Summary bars */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { key: 'critical', label: 'Kritik',   color: 'border-red-500/40 bg-red-500/5',    text: 'text-red-400' },
          { key: 'warning',  label: 'Uyarı',    color: 'border-amber-500/40 bg-amber-500/5', text: 'text-amber-400' },
          { key: 'info',     label: 'Bilgi',    color: 'border-blue-500/40 bg-blue-500/5',   text: 'text-blue-400' },
          { key: 'unread',   label: 'Okunmadı', color: 'border-slate-600 bg-slate-800',      text: 'text-slate-300' },
        ].map(({ key, label, color, text }) => (
          <div key={key} className={`rounded-xl border p-3 ${color}`}>
            <p className="text-xs text-slate-500">{label}</p>
            <p className={`text-2xl font-bold ${text}`}>{counts[key]}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        <div className="flex gap-1 rounded-lg bg-slate-800 p-1">
          {[['unresolved', 'Açık'], ['resolved', 'Çözülmüş'], ['all', 'Tümü']].map(([v, l]) => (
            <button key={v} onClick={() => setFilterStatus(v)}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${filterStatus === v ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-slate-200'}`}>
              {l}
            </button>
          ))}
        </div>
        <div className="flex gap-1 rounded-lg bg-slate-800 p-1">
          {[['all', 'Tümü'], ['critical', 'Kritik'], ['warning', 'Uyarı'], ['info', 'Bilgi']].map(([v, l]) => (
            <button key={v} onClick={() => setFilterSeverity(v)}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${filterSeverity === v ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-slate-200'}`}>
              {l}
            </button>
          ))}
        </div>
      </div>

      {/* Alarm list */}
      {loading ? (
        <div className="flex justify-center py-16">
          <div className="h-7 w-7 animate-spin rounded-full border-4 border-slate-600 border-t-blue-500" />
        </div>
      ) : visible.length === 0 ? (
        <div className="card flex flex-col items-center justify-center gap-2 p-16 text-slate-500">
          <span className="text-3xl">✓</span>
          <span className="text-sm">Alarm yok</span>
        </div>
      ) : (
        <div className="space-y-2">
          {visible.map((a) => (
            <AlarmCard key={a.id} alarm={a} onMarkRead={markRead} onResolve={resolve} />
          ))}
        </div>
      )}
    </div>
  )
}
