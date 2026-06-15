import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAlarmStore } from '@/store/alarmStore'

export default function Header({ onMenuClick }) {
  const { unreadCount, alarms, markRead } = useAlarmStore()
  const [open, setOpen] = useState(false)
  const navigate = useNavigate()

  return (
    <header className="flex h-16 items-center justify-between border-b border-slate-700/50 bg-slate-900 px-4">
      {/* Hamburger (mobil/tablet) */}
      <button
        onClick={onMenuClick}
        className="lg:hidden rounded-lg p-2 text-slate-400 hover:bg-slate-800 hover:text-slate-100 transition-colors"
      >
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
        </svg>
      </button>

      <div className="hidden lg:block" />

      {/* Sağ aksiyonlar */}
      <div className="flex items-center gap-2">
        {/* Alarm zili */}
        <div className="relative">
          <button
            onClick={() => setOpen((v) => !v)}
            className="relative rounded-lg p-2 text-slate-400 hover:bg-slate-800 hover:text-slate-100 transition-colors"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
            </svg>
            {unreadCount > 0 && (
              <span className="absolute -right-0.5 -top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white">
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </button>

          {/* Dropdown */}
          {open && (
            <div className="absolute right-0 top-12 z-50 w-80 rounded-xl bg-slate-800 border border-slate-700 shadow-2xl">
              <div className="flex items-center justify-between px-4 py-3 border-b border-slate-700">
                <span className="text-sm font-semibold text-slate-100">Alarmlar</span>
                <div className="flex items-center gap-3">
                  <button onClick={() => { setOpen(false); navigate('/alarms') }}
                    className="text-xs text-blue-400 hover:text-blue-300 transition-colors">
                    Tümü →
                  </button>
                  <button onClick={() => setOpen(false)} className="text-slate-400 hover:text-slate-100">✕</button>
                </div>
              </div>
              <div className="max-h-80 overflow-y-auto divide-y divide-slate-700/50">
                {alarms.length === 0 ? (
                  <p className="px-4 py-6 text-center text-sm text-slate-500">Aktif alarm yok</p>
                ) : alarms.map((a) => (
                  <div
                    key={a.id}
                    onClick={() => markRead(a.id)}
                    className={`cursor-pointer px-4 py-3 hover:bg-slate-700/50 transition-colors ${!a.is_read ? 'bg-slate-700/20' : ''}`}
                  >
                    <div className="flex items-start gap-2">
                      <span className={`mt-0.5 h-2 w-2 flex-shrink-0 rounded-full ${
                        a.severity === 'critical' ? 'bg-red-500' :
                        a.severity === 'warning'  ? 'bg-amber-500' : 'bg-blue-500'
                      }`} />
                      <div>
                        <p className="text-sm font-medium text-slate-100">{a.title}</p>
                        {a.body && <p className="mt-0.5 text-xs text-slate-400 line-clamp-2">{a.body}</p>}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  )
}
