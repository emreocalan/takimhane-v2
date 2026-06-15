import { useState, useEffect } from 'react'
import { Outlet } from 'react-router-dom'
import Sidebar from './Sidebar'
import Header from './Header'
import { useAuthStore } from '@/store/authStore'
import { useAlarmStore } from '@/store/alarmStore'

export default function AppLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const profile = useAuthStore((s) => s.profile)
  const { fetch, subscribeRealtime } = useAlarmStore()

  useEffect(() => {
    if (!profile?.facility_id) return
    fetch()
    const unsub = subscribeRealtime(profile.facility_id)
    return unsub
  }, [profile?.facility_id, fetch, subscribeRealtime])

  // Global barkod dinleyici (her sayfada aktif)
  useEffect(() => {
    let buffer = ''
    let timer = null

    const onKey = (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return

      if (e.key === 'Enter' && buffer.length > 3) {
        window.dispatchEvent(new CustomEvent('barcode-scan', { detail: buffer }))
        buffer = ''
        return
      }
      if (e.key.length === 1) {
        buffer += e.key
        clearTimeout(timer)
        timer = setTimeout(() => { buffer = '' }, 100)
      }
    }

    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <div className="flex h-full bg-slate-900">
      {/* Desktop sidebar */}
      <div className="hidden lg:flex lg:flex-shrink-0">
        <Sidebar />
      </div>

      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-50 flex lg:hidden">
          <div className="fixed inset-0 bg-black/60" onClick={() => setSidebarOpen(false)} />
          <div className="relative flex w-64 flex-col">
            <Sidebar onClose={() => setSidebarOpen(false)} />
          </div>
        </div>
      )}

      {/* Main */}
      <div className="flex flex-1 flex-col overflow-hidden">
        <Header onMenuClick={() => setSidebarOpen(true)} />
        <main className="flex-1 overflow-y-auto p-4 lg:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
