import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/authStore'
import { useAlarmStore } from '@/store/alarmStore'

function QuickAction({ icon, label, onClick, color = 'blue' }) {
  const colors = {
    blue: 'bg-blue-600/10 border-blue-600/30 text-blue-400 hover:bg-blue-600/20',
    red:  'bg-red-600/10  border-red-600/30  text-red-400  hover:bg-red-600/20',
    amber:'bg-amber-500/10 border-amber-500/30 text-amber-400 hover:bg-amber-500/20',
  }
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2 rounded-xl border px-4 py-3 text-sm font-medium transition-colors ${colors[color]}`}
    >
      <span>{icon}</span>
      <span>{label}</span>
    </button>
  )
}

function KpiCard({ label, value, sub, trend }) {
  return (
    <div className="card p-4">
      <p className="text-xs text-slate-400 uppercase tracking-wider">{label}</p>
      <p className="mt-1 text-3xl font-bold text-white">{value ?? '—'}</p>
      {sub && <p className="mt-1 text-xs text-slate-500">{sub}</p>}
    </div>
  )
}

export default function DashboardPage() {
  const profile = useAuthStore((s) => s.profile)
  const { alarms } = useAlarmStore()
  const [kpi, setKpi] = useState({})

  const critical = alarms.filter((a) => a.severity === 'critical' && !a.is_resolved)
  const warnings  = alarms.filter((a) => a.severity === 'warning'  && !a.is_resolved)

  useEffect(() => {
    if (!profile?.facility_id) return
    const fid = profile.facility_id

    Promise.all([
      supabase.from('tool_instances').select('id', { count: 'exact', head: true }).eq('facility_id', fid).eq('status', 'checked_out'),
      supabase.from('tool_instances').select('id', { count: 'exact', head: true }).eq('facility_id', fid).neq('status', 'scrapped'),
      supabase.from('checkouts').select('id', { count: 'exact', head: true }).eq('facility_id', fid).eq('is_open', true),
      supabase.from('regrind_orders').select('id', { count: 'exact', head: true }).eq('facility_id', fid).in('status', ['sent', 'at_regrinder']),
    ]).then(([co, total, open, regrind]) => {
      setKpi({
        checkedOut: co.count,
        totalTools: total.count,
        openCheckouts: open.count,
        inRegrind: regrind.count,
      })
    })
  }, [profile?.facility_id])

  return (
    <div className="space-y-6">
      {/* Başlık */}
      <div>
        <h1 className="text-2xl font-bold text-white">Dashboard</h1>
        <p className="mt-1 text-sm text-slate-400">
          {new Date().toLocaleDateString('tr-TR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
        </p>
      </div>

      {/* Hızlı Aksiyonlar */}
      <div className="card p-4">
        <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-500">Hızlı Aksiyonlar</p>
        <div className="flex flex-wrap gap-2">
          <QuickAction icon="🔍" label="Takım Bulucu"     color="blue" />
          <QuickAction icon="↗"  label="Zimmet Ver"       color="blue" />
          <QuickAction icon="↙"  label="Takım İade"       color="blue" />
          <QuickAction icon="💥" label="Takım Kır"        color="red"  />
          <QuickAction icon="⚡" label="Acil Talep"       color="amber" />
          <QuickAction icon="+"  label="Yeni İş Emri"     color="blue" />
          <QuickAction icon="📦" label="Bilemeye Gönder"  color="blue" />
        </div>
      </div>

      {/* Alarmlar */}
      {critical.length > 0 && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/5 p-4">
          <p className="mb-3 flex items-center gap-2 text-sm font-semibold text-red-400">
            🔴 Kritik Uyarılar ({critical.length})
          </p>
          <div className="space-y-2">
            {critical.slice(0, 5).map((a) => (
              <div key={a.id} className="flex items-start gap-2 text-sm text-red-300">
                <span className="mt-1 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-red-500" />
                {a.title}
              </div>
            ))}
          </div>
        </div>
      )}

      {warnings.length > 0 && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4">
          <p className="mb-3 flex items-center gap-2 text-sm font-semibold text-amber-400">
            🟡 Dikkat Gerektiren ({warnings.length})
          </p>
          <div className="space-y-2">
            {warnings.slice(0, 5).map((a) => (
              <div key={a.id} className="flex items-start gap-2 text-sm text-amber-300">
                <span className="mt-1 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-amber-500" />
                {a.title}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* KPI Kartları */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <KpiCard label="Toplam Takım"     value={kpi.totalTools}    sub="scrapped hariç" />
        <KpiCard label="Zimmetli"         value={kpi.checkedOut}    sub="şu an dışarıda" />
        <KpiCard label="Açık Zimmet"      value={kpi.openCheckouts} sub="iade bekliyor" />
        <KpiCard label="Bilemede"         value={kpi.inRegrind}     sub="dışarıda" />
      </div>
    </div>
  )
}
