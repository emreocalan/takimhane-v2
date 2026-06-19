import { useState } from 'react'
import { useAuthStore } from '@/store/authStore'
import MachinesSection            from './sections/MachinesSection'
import LocationsSection           from './sections/LocationsSection'
import SuppliersSection           from './sections/SuppliersSection'
import PersonnelSection           from './sections/PersonnelSection'
import LookupCodesSection         from './sections/LookupCodesSection'
import AlarmThresholdsSection     from './sections/AlarmThresholdsSection'
import NotificationTemplatesSection from './sections/NotificationTemplatesSection'
import ToolTypesSection           from './sections/ToolTypesSection'

const TABS = [
  { id: 'machines',       label: 'Tezgahlar',            icon: '⚙️' },
  { id: 'locations',      label: 'Depo Yapısı',           icon: '🗂️' },
  { id: 'suppliers',      label: 'Tedarikçiler',          icon: '🏭' },
  { id: 'personnel',      label: 'Personel',              icon: '👤' },
  { id: 'lookup-codes',   label: 'Kodlar',                icon: '🏷️' },
  { id: 'alarms',         label: 'Alarm Eşikleri',        icon: '🔔' },
  { id: 'notifications',  label: 'Bildirim Şablonları',   icon: '📩' },
  { id: 'tool-types',     label: 'Varlık Tipleri',        icon: '🔧' },
]

const SECTION_MAP = {
  'machines':      MachinesSection,
  'locations':     LocationsSection,
  'suppliers':     SuppliersSection,
  'personnel':     PersonnelSection,
  'lookup-codes':  LookupCodesSection,
  'alarms':        AlarmThresholdsSection,
  'notifications': NotificationTemplatesSection,
  'tool-types':    ToolTypesSection,
}

export default function AdminPage() {
  const { hasRole } = useAuthStore()
  const [active, setActive] = useState('machines')

  if (!hasRole('admin', 'tool_room_manager')) {
    return (
      <div className="flex h-96 items-center justify-center">
        <p className="text-slate-400">Bu sayfaya erişim yetkiniz yok.</p>
      </div>
    )
  }

  const Section = SECTION_MAP[active]

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Sistem Tanımları</h1>
        <p className="mt-1 text-sm text-slate-400">M11 — Tesis geneli yapılandırma</p>
      </div>

      {/* Tab bar */}
      <div className="flex overflow-x-auto gap-1 rounded-xl bg-slate-800/60 p-1 scrollbar-none">
        {TABS.map((t) => (
          <button key={t.id} onClick={() => setActive(t.id)}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium transition-colors whitespace-nowrap
              ${active === t.id ? 'bg-blue-600 text-white shadow' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-700/50'}`}>
            <span>{t.icon}</span>
            <span>{t.label}</span>
          </button>
        ))}
      </div>

      {/* Section content */}
      <div className="min-h-96">
        {Section ? <Section /> : null}
      </div>
    </div>
  )
}
