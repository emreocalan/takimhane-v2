import { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/authStore'
import { useAlarmStore } from '@/store/alarmStore'

// ── Sub-components ────────────────────────────────────────────────
function KpiCard({ label, value, sub, color = 'default', onClick }) {
  const colors = {
    default: 'border-slate-700',
    red:     'border-red-500/40 bg-red-500/5',
    amber:   'border-amber-500/40 bg-amber-500/5',
    green:   'border-emerald-500/40 bg-emerald-500/5',
    blue:    'border-blue-500/40 bg-blue-500/5',
  }
  const vals = {
    default: 'text-white',
    red:     'text-red-400',
    amber:   'text-amber-400',
    green:   'text-emerald-400',
    blue:    'text-blue-400',
  }
  return (
    <div onClick={onClick} className={`card border p-4 ${colors[color]} ${onClick ? 'cursor-pointer hover:opacity-80 transition-opacity' : ''}`}>
      <p className="text-xs text-slate-400 uppercase tracking-wider">{label}</p>
      <p className={`mt-1 text-3xl font-bold ${vals[color]}`}>{value ?? <span className="text-slate-600">—</span>}</p>
      {sub && <p className="mt-1 text-xs text-slate-500">{sub}</p>}
    </div>
  )
}

function QuickAction({ icon, label, to, color = 'blue' }) {
  const navigate = useNavigate()
  const colors = {
    blue:  'bg-blue-600/10 border-blue-600/30 text-blue-400 hover:bg-blue-600/20',
    red:   'bg-red-600/10  border-red-600/30  text-red-400  hover:bg-red-600/20',
    amber: 'bg-amber-500/10 border-amber-500/30 text-amber-400 hover:bg-amber-500/20',
    green: 'bg-emerald-600/10 border-emerald-600/30 text-emerald-400 hover:bg-emerald-600/20',
  }
  return (
    <button onClick={() => to && navigate(to)}
      className={`flex items-center gap-2 rounded-xl border px-4 py-3 text-sm font-medium transition-colors ${colors[color]}`}>
      <span>{icon}</span><span>{label}</span>
    </button>
  )
}

function AlarmPanel({ items, severity }) {
  if (!items.length) return null
  const isCritical = severity === 'critical'
  return (
    <div className={`rounded-xl border p-4 ${isCritical ? 'border-red-500/30 bg-red-500/5' : 'border-amber-500/30 bg-amber-500/5'}`}>
      <p className={`mb-3 flex items-center gap-2 text-sm font-semibold ${isCritical ? 'text-red-400' : 'text-amber-400'}`}>
        {isCritical ? '🔴' : '🟡'} {isCritical ? 'Kritik Alarmlar' : 'Uyarılar'} ({items.length})
      </p>
      <div className="space-y-2">
        {items.slice(0, 5).map((a) => (
          <div key={a.id} className={`flex items-start gap-2 text-sm ${isCritical ? 'text-red-300' : 'text-amber-300'}`}>
            <span className={`mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full ${isCritical ? 'bg-red-500' : 'bg-amber-500'}`} />
            {a.title}
          </div>
        ))}
        {items.length > 5 && (
          <p className="text-xs text-slate-500">+{items.length - 5} daha</p>
        )}
      </div>
    </div>
  )
}

function ActivityItem({ item }) {
  const isReturn = !item.is_open
  const name = item.tool_instances?.tool_definitions?.name ?? '—'
  const barcode = item.tool_instances?.barcode ?? '—'
  const person = item.profiles?.full_name ?? '—'
  const time = new Date(isReturn ? item.checkin_at : item.checkout_at)
  const mins = Math.round((Date.now() - time) / 60000)
  const timeStr = mins < 60 ? `${mins}dk önce` : mins < 1440 ? `${Math.floor(mins / 60)}s önce` : time.toLocaleDateString('tr-TR')

  return (
    <div className="flex items-center gap-3 py-2.5 border-b border-slate-700/50 last:border-0">
      <div className={`h-7 w-7 flex-shrink-0 rounded-full flex items-center justify-center text-xs font-bold ${isReturn ? 'bg-emerald-700/50 text-emerald-300' : 'bg-blue-700/50 text-blue-300'}`}>
        {isReturn ? '↙' : '↗'}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm text-slate-200 truncate">{name}</p>
        <p className="text-xs text-slate-500 font-mono">{barcode} · {person}</p>
      </div>
      <span className="text-xs text-slate-500 flex-shrink-0">{timeStr}</span>
    </div>
  )
}

function CriticalToolRow({ tool }) {
  const life = tool.life_remaining_pct
  const calDue = tool.next_calibration_date
  const daysLeft = calDue ? Math.ceil((new Date(calDue) - Date.now()) / 86400000) : null
  const name = tool.tool_definitions?.name ?? '—'

  return (
    <div className="flex items-center gap-3 py-2.5 border-b border-slate-700/50 last:border-0">
      <span className="font-mono text-xs text-blue-300 w-28 truncate">{tool.barcode}</span>
      <span className="flex-1 text-sm text-slate-300 truncate">{name}</span>
      {life != null && (
        <span className={`text-xs font-bold w-14 text-right ${life < 10 ? 'text-red-400' : 'text-amber-400'}`}>
          %{life.toFixed(0)} ömür
        </span>
      )}
      {daysLeft != null && (
        <span className={`text-xs font-bold w-20 text-right ${daysLeft < 0 ? 'text-red-400' : 'text-amber-400'}`}>
          {daysLeft < 0 ? `${Math.abs(daysLeft)}g geçti` : `${daysLeft}g kaldı`}
        </span>
      )}
    </div>
  )
}

// ── Main ─────────────────────────────────────────────────────────
export default function DashboardPage() {
  const { profile } = useAuthStore()
  const { alarms } = useAlarmStore()
  const [kpi, setKpi] = useState({})
  const [activity, setActivity] = useState([])
  const [criticalTools, setCriticalTools] = useState([])
  const [calDueTools, setCalDueTools] = useState([])

  const critical = alarms.filter((a) => a.severity === 'critical' && !a.is_resolved)
  const warnings  = alarms.filter((a) => a.severity === 'warning'  && !a.is_resolved)

  const load = useCallback(async () => {
    if (!profile?.facility_id) return
    const fid = profile.facility_id
    const today = new Date().toISOString().slice(0, 10)
    const in30  = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10)

    const [
      { count: checkedOut },
      { count: totalTools },
      { count: openCheckouts },
      { count: inRegrind },
      { count: lowLife },
      { count: calDue },
      { count: activeWOs },
    ] = await Promise.all([
      supabase.from('tool_instances').select('id', { count: 'exact', head: true }).eq('facility_id', fid).eq('status', 'checked_out'),
      supabase.from('tool_instances').select('id', { count: 'exact', head: true }).eq('facility_id', fid).neq('status', 'scrapped'),
      supabase.from('checkouts').select('id', { count: 'exact', head: true }).eq('facility_id', fid).eq('is_open', true),
      supabase.from('regrind_orders').select('id', { count: 'exact', head: true }).eq('facility_id', fid).in('status', ['sent', 'at_regrinder']),
      supabase.from('tool_instances').select('id', { count: 'exact', head: true }).eq('facility_id', fid).lt('life_remaining_pct', 20).neq('status', 'scrapped'),
      supabase.from('tool_instances').select('id', { count: 'exact', head: true }).eq('facility_id', fid).lte('next_calibration_date', in30).gte('next_calibration_date', today).neq('status', 'scrapped'),
      supabase.from('work_orders').select('id', { count: 'exact', head: true }).eq('facility_id', fid).in('status', ['planned', 'preparation', 'magazine_comparison', 'measurement', 'checkout', 'active']),
    ])

    setKpi({ checkedOut, totalTools, openCheckouts, inRegrind, lowLife, calDue, activeWOs })

    // Recent activity (last 20 checkout events)
    const { data: act } = await supabase
      .from('checkouts')
      .select('id, is_open, checkout_at, checkin_at, tool_instances(barcode, tool_definitions(name)), profiles!checkouts_checked_out_by_fkey(full_name)')
      .eq('facility_id', fid)
      .order('updated_at', { ascending: false })
      .limit(20)
    setActivity(act ?? [])

    // Low life tools
    const { data: ll } = await supabase
      .from('tool_instances')
      .select('id, barcode, life_remaining_pct, tool_definitions(name)')
      .eq('facility_id', fid)
      .lt('life_remaining_pct', 20)
      .neq('status', 'scrapped')
      .order('life_remaining_pct')
      .limit(8)
    setCriticalTools(ll ?? [])

    // Calibration due (next 30 days + overdue)
    const { data: cd } = await supabase
      .from('tool_instances')
      .select('id, barcode, next_calibration_date, tool_definitions(name)')
      .eq('facility_id', fid)
      .lte('next_calibration_date', in30)
      .neq('status', 'scrapped')
      .order('next_calibration_date')
      .limit(8)
    setCalDueTools(cd ?? [])
  }, [profile?.facility_id])

  useEffect(() => { load() }, [load])

  const hasCriticalTools = criticalTools.length > 0 || calDueTools.length > 0

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-white">Dashboard</h1>
        <p className="mt-1 text-sm text-slate-400">
          {new Date().toLocaleDateString('tr-TR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
        </p>
      </div>

      {/* Alarm panels */}
      <AlarmPanel items={critical} severity="critical" />
      <AlarmPanel items={warnings}  severity="warning" />

      {/* Quick Actions */}
      <div className="card p-4">
        <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-500">Hızlı Aksiyonlar</p>
        <div className="flex flex-wrap gap-2">
          <QuickAction icon="↗"  label="Zimmet Ver"       to="/checkouts"   color="blue" />
          <QuickAction icon="↙"  label="Takım İade"       to="/checkouts"   color="green" />
          <QuickAction icon="+"  label="Yeni İş Emri"     to="/work-orders" color="blue" />
          <QuickAction icon="🔧" label="Katalog"          to="/catalog"     color="blue" />
          <QuickAction icon="📦" label="Bilemeye Gönder"  to="/regrind"     color="amber" />
          <QuickAction icon="🖥" label="CNC Durum"        to="/cnc-status"  color="blue" />
        </div>
      </div>

      {/* KPI grid */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <KpiCard label="Toplam Takım"     value={kpi.totalTools}    sub="aktif stok" />
        <KpiCard label="Aktif İş Emri"   value={kpi.activeWOs}     sub="devam eden" color="blue" />
        <KpiCard label="Açık Zimmet"      value={kpi.openCheckouts} sub="iade bekliyor" color={kpi.openCheckouts > 0 ? 'amber' : 'default'} />
        <KpiCard label="Bilemede"         value={kpi.inRegrind}     sub="dışarıda" />
      </div>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <KpiCard label="Düşük Ömürlü"    value={kpi.lowLife}       sub="<%20 kalan" color={kpi.lowLife > 0 ? 'red' : 'default'} />
        <KpiCard label="Kalibrasyon (30g)" value={kpi.calDue}       sub="yaklaşan / geçen" color={kpi.calDue > 0 ? 'amber' : 'default'} />
        <KpiCard label="Zimmette"         value={kpi.checkedOut}    sub="şu an dışarıda" />
        <KpiCard label="Kayıtlı Takım"    value={kpi.totalTools}    sub="toplam stok" />
      </div>

      {/* Critical tools + Activity */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Critical tools list */}
        <div className="card p-4">
          <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-slate-500">
            Dikkat Gerektiren Takımlar
          </p>
          {criticalTools.length === 0 && calDueTools.length === 0 ? (
            <p className="py-6 text-center text-sm text-slate-600">Kritik durum yok ✓</p>
          ) : (
            <div className="mt-3">
              {criticalTools.length > 0 && (
                <>
                  <p className="mb-2 text-xs text-red-400 font-medium">Düşük Ömür (&lt;%20)</p>
                  {criticalTools.map((t) => (
                    <CriticalToolRow key={t.id} tool={t} />
                  ))}
                </>
              )}
              {calDueTools.length > 0 && (
                <div className={criticalTools.length > 0 ? 'mt-4' : ''}>
                  <p className="mb-2 text-xs text-amber-400 font-medium">Kalibrasyon Vadesi (30 gün)</p>
                  {calDueTools.map((t) => (
                    <CriticalToolRow key={t.id} tool={t} />
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Recent activity */}
        <div className="card p-4">
          <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-slate-500">
            Son Aktivite
          </p>
          {activity.length === 0 ? (
            <p className="py-6 text-center text-sm text-slate-600">Henüz hareket yok</p>
          ) : (
            <div className="mt-2">
              {activity.slice(0, 10).map((a) => (
                <ActivityItem key={a.id} item={a} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
