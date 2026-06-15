import { NavLink } from 'react-router-dom'
import { useAuthStore } from '@/store/authStore'

const NAV = [
  { to: '/dashboard',   icon: '🏠', label: 'Dashboard' },
  { section: 'OPERASYON' },
  { to: '/work-orders', icon: '📋', label: 'İş Emirleri' },
  { to: '/checkouts',   icon: '📦', label: 'Açık Zimmetler & İadeler' },
  { to: '/regrind',     icon: '🔄', label: 'Yenileme & Bertaraf' },
  { section: 'ENVANTER' },
  { to: '/catalog',     icon: '📚', label: 'Envanter Kataloğu' },
  { to: '/stock',       icon: '📍', label: 'Fiziksel Stok' },
  { section: 'KALİTE' },
  { to: '/calibration', icon: '📐', label: 'Kalibrasyon' },
  { to: '/records',     icon: '📄', label: 'Kayıtlar & Denetim' },
  { section: 'İZLEME' },
  { to: '/cnc-status',  icon: '🖥️', label: 'CNC & Depo Durumu' },
]

export default function Sidebar({ onClose }) {
  const { profile, role, signOut } = useAuthStore()
  const isAdmin = role === 'admin'

  return (
    <aside className="flex h-full w-64 flex-col bg-slate-900 border-r border-slate-700/50">
      {/* Logo */}
      <div className="flex h-16 items-center gap-3 px-5 border-b border-slate-700/50">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600 text-white font-bold text-sm">
          T2
        </div>
        <div>
          <div className="text-sm font-semibold text-white">Takımhane</div>
          <div className="text-xs text-slate-400">v2 · AS9100</div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-0.5">
        {NAV.map((item, i) =>
          item.section ? (
            <div key={i} className="px-3 pt-5 pb-1 text-[10px] font-semibold tracking-widest text-slate-500 uppercase">
              {item.section}
            </div>
          ) : (
            <NavLink
              key={item.to}
              to={item.to}
              onClick={onClose}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors ${
                  isActive
                    ? 'bg-blue-600/20 text-blue-400 font-medium'
                    : 'text-slate-400 hover:bg-slate-800 hover:text-slate-100'
                }`
              }
            >
              <span className="text-base">{item.icon}</span>
              <span>{item.label}</span>
            </NavLink>
          )
        )}

        {isAdmin && (
          <>
            <div className="px-3 pt-5 pb-1 text-[10px] font-semibold tracking-widest text-slate-500 uppercase">
              YÖNETİM
            </div>
            <NavLink
              to="/admin"
              onClick={onClose}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors ${
                  isActive
                    ? 'bg-blue-600/20 text-blue-400 font-medium'
                    : 'text-slate-400 hover:bg-slate-800 hover:text-slate-100'
                }`
              }
            >
              <span>⚙️</span>
              <span>Sistem Tanımları</span>
            </NavLink>
          </>
        )}
      </nav>

      {/* Profil */}
      <div className="border-t border-slate-700/50 p-4">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-blue-600/20 text-blue-400 font-semibold text-sm">
            {profile?.full_name?.[0] ?? '?'}
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-medium text-slate-100">{profile?.full_name ?? '—'}</div>
            <div className="text-xs text-slate-400">{profile?.roles?.label ?? role}</div>
          </div>
          <button
            onClick={signOut}
            title="Çıkış"
            className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-800 hover:text-slate-300 transition-colors"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
          </button>
        </div>
      </div>
    </aside>
  )
}
