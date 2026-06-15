import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/authStore'
import Modal from '@/components/ui/Modal'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import Select from '@/components/ui/Select'

// ── Constants ─────────────────────────────────────────────────────
const MACHINE_STATUS_MAP = {
  active:      { label: 'Aktif',       dot: 'bg-emerald-500', text: 'text-emerald-400' },
  maintenance: { label: 'Bakımda',     dot: 'bg-amber-500',   text: 'text-amber-400' },
  fault:       { label: 'Arıza',       dot: 'bg-red-500',     text: 'text-red-400' },
  passive:     { label: 'Pasif',       dot: 'bg-slate-500',   text: 'text-slate-400' },
}

const SLOT_STATUS_MAP = {
  occupied: 'bg-blue-600/70 border-blue-500/50',
  empty:    'bg-slate-800/60 border-slate-700/40',
  reserved: 'bg-amber-600/30 border-amber-500/50',
}

const LIFE_BG = (pct) => {
  if (pct == null) return ''
  if (pct > 50) return 'ring-1 ring-emerald-500/50'
  if (pct > 20) return 'ring-1 ring-amber-500/60'
  return 'ring-2 ring-red-500/70'
}

const LIFE_TEXT = (pct) => {
  if (pct == null) return 'text-slate-500'
  if (pct > 50) return 'text-emerald-400'
  if (pct > 20) return 'text-amber-400'
  return 'text-red-400'
}

const STATUS_OPTS = Object.entries(MACHINE_STATUS_MAP).map(([v, { label }]) => ({ value: v, label }))

// ── Slot tooltip ─────────────────────────────────────────────────
function SlotPopover({ slot, onClose }) {
  if (!slot) return null
  const { pot_number, instance, status } = slot
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="card max-w-xs w-full p-4 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-3">
          <p className="font-semibold text-white">Pot {pot_number}</p>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-300 text-lg leading-none">×</button>
        </div>
        {status === 'empty' ? (
          <p className="text-sm text-slate-500">Boş slot</p>
        ) : status === 'reserved' ? (
          <p className="text-sm text-amber-400">Rezerve edilmiş</p>
        ) : instance ? (
          <div className="space-y-2 text-sm">
            <div>
              <p className="text-xs text-slate-500">Barkod</p>
              <p className="font-mono text-blue-300">{instance.barcode}</p>
            </div>
            <div>
              <p className="text-xs text-slate-500">Takım</p>
              <p className="text-slate-200">{instance.tool_definitions?.name ?? '—'}</p>
              <p className="text-xs text-slate-500 font-mono">{instance.tool_definitions?.internal_code ?? ''}</p>
            </div>
            {instance.last_length_mm != null && (
              <div>
                <p className="text-xs text-slate-500">Son Ölçüm</p>
                <p className="font-mono text-xs text-slate-300">L={instance.last_length_mm}  Ø={instance.last_diameter_mm ?? '?'}</p>
                {instance.last_measurement_result && (
                  <span className={`text-[10px] font-bold ${instance.last_measurement_result === 'PASS' ? 'text-emerald-400' : instance.last_measurement_result === 'FAIL' ? 'text-red-400' : 'text-amber-400'}`}>
                    {instance.last_measurement_result}
                  </span>
                )}
              </div>
            )}
            {instance.life_remaining_pct != null && (
              <div>
                <p className="text-xs text-slate-500">Kalan Ömür</p>
                <div className="flex items-center gap-2">
                  <div className="flex-1 h-1.5 rounded-full bg-slate-700">
                    <div className={`h-1.5 rounded-full ${instance.life_remaining_pct > 50 ? 'bg-emerald-500' : instance.life_remaining_pct > 20 ? 'bg-amber-500' : 'bg-red-500'}`}
                      style={{ width: `${Math.min(100, instance.life_remaining_pct)}%` }} />
                  </div>
                  <span className={`text-xs font-bold ${LIFE_TEXT(instance.life_remaining_pct)}`}>%{instance.life_remaining_pct.toFixed(0)}</span>
                </div>
              </div>
            )}
          </div>
        ) : (
          <p className="text-sm text-slate-500">Takım bilgisi yüklenemedi</p>
        )}
      </div>
    </div>
  )
}

// ── Magazine grid ─────────────────────────────────────────────────
function MagazineGrid({ machine, slots }) {
  const [popover, setPopover] = useState(null)
  const capacity = machine.magazine_capacity ?? 30

  // Build slot lookup
  const slotMap = {}
  ;(slots ?? []).forEach((s) => { slotMap[s.pot_number] = s })

  return (
    <div>
      <p className="mb-3 text-xs font-medium text-slate-500 uppercase tracking-wider">
        Magazin — {capacity} pot
      </p>
      <div className="flex flex-wrap gap-1.5">
        {Array.from({ length: capacity }, (_, i) => i + 1).map((pot) => {
          const s = slotMap[pot]
          const status = s?.status ?? 'empty'
          const instance = s?.tool_instances
          const life = instance?.life_remaining_pct ?? s?.life_pct_at_load

          return (
            <button key={pot} onClick={() => setPopover({ pot_number: pot, instance, status })}
              className={`relative h-9 w-9 rounded-lg border text-xs font-mono font-bold transition-all hover:opacity-80 ${SLOT_STATUS_MAP[status] ?? SLOT_STATUS_MAP.empty} ${life != null ? LIFE_BG(life) : ''}`}
              title={`Pot ${pot}`}>
              <span className={status === 'occupied' ? 'text-white' : 'text-slate-600'}>{pot}</span>
              {life != null && life < 20 && (
                <span className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full bg-red-500" />
              )}
            </button>
          )
        })}
      </div>
      <div className="mt-3 flex gap-4 text-xs text-slate-500">
        <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded bg-blue-600/70" />Dolu</span>
        <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded bg-amber-600/30" />Rezerve</span>
        <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded bg-slate-800/60 border border-slate-700" />Boş</span>
        <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-red-500" />Kritik ömür</span>
      </div>

      {popover && <SlotPopover slot={popover} onClose={() => setPopover(null)} />}
    </div>
  )
}

// ── Machine card ──────────────────────────────────────────────────
function MachineCard({ machine, slots, activeWO }) {
  const [expanded, setExpanded] = useState(false)
  const st = MACHINE_STATUS_MAP[machine.status] ?? MACHINE_STATUS_MAP.active

  const occupiedCount = (slots ?? []).filter((s) => s.status === 'occupied').length
  const criticalCount = (slots ?? []).filter((s) => {
    const life = s.tool_instances?.life_remaining_pct ?? s.life_pct_at_load
    return life != null && life < 20
  }).length

  return (
    <div className="card overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-4 p-4 cursor-pointer" onClick={() => setExpanded((e) => !e)}>
        {/* Status dot */}
        <div className="relative flex-shrink-0">
          <div className={`h-3 w-3 rounded-full ${st.dot}`} />
          {machine.status === 'active' && (
            <div className={`absolute inset-0 rounded-full ${st.dot} animate-ping opacity-50`} />
          )}
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="font-semibold text-white">{machine.name}</p>
            <span className={`text-xs font-medium ${st.text}`}>{st.label}</span>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            {machine.machine_type?.toUpperCase()} · {machine.brand ?? ''} {machine.model ?? ''} · {machine.tool_connection_type?.toUpperCase() ?? ''}
          </p>
        </div>

        {/* Counters */}
        <div className="flex items-center gap-4 text-right">
          <div>
            <p className="text-lg font-bold text-white">{occupiedCount}<span className="text-slate-500 text-xs">/{machine.magazine_capacity}</span></p>
            <p className="text-xs text-slate-500">dolu pot</p>
          </div>
          {criticalCount > 0 && (
            <div>
              <p className="text-lg font-bold text-red-400">{criticalCount}</p>
              <p className="text-xs text-slate-500">kritik</p>
            </div>
          )}
          <span className={`text-slate-500 text-sm transition-transform ${expanded ? 'rotate-180' : ''}`}>▼</span>
        </div>
      </div>

      {/* Expanded body */}
      {expanded && (
        <div className="border-t border-slate-700 p-4 space-y-4">
          {/* Active WO */}
          {activeWO ? (
            <div className="rounded-xl bg-blue-600/10 border border-blue-600/20 px-4 py-3 text-sm">
              <p className="text-xs text-blue-400 font-medium mb-1">Aktif İş Emri</p>
              <p className="font-mono text-blue-300 font-semibold">{activeWO.wo_code}</p>
              <p className="text-slate-400 text-xs mt-0.5">{activeWO.part_name ?? activeWO.part_no ?? '—'}</p>
            </div>
          ) : (
            <p className="text-xs text-slate-600 italic">Aktif iş emri yok</p>
          )}

          {/* Magazine grid */}
          <MagazineGrid machine={machine} slots={slots} />
        </div>
      )}
    </div>
  )
}

// ── Status change modal ───────────────────────────────────────────
function StatusModal({ machine, onClose, onDone }) {
  const [status, setStatus] = useState(machine.status)
  const [saving, setSaving] = useState(false)

  const save = async () => {
    setSaving(true)
    await supabase.from('magazine_machines').update({ status }).eq('id', machine.id)
    setSaving(false)
    onDone()
  }

  return (
    <Modal open onClose={onClose} title={`${machine.name} — Durum`} size="sm"
      footer={<><Button variant="secondary" onClick={onClose}>İptal</Button><Button onClick={save} loading={saving}>Kaydet</Button></>}>
      <Select label="Tezgah Durumu" options={STATUS_OPTS} value={status} onChange={(e) => setStatus(e.target.value)} />
    </Modal>
  )
}

// ── Main ──────────────────────────────────────────────────────────
export default function CncStatusPage() {
  const { profile } = useAuthStore()
  const [machines, setMachines] = useState([])
  const [slots, setSlots] = useState({})      // { machine_id: [slot, ...] }
  const [activeWOs, setActiveWOs] = useState({}) // { machine_id: wo }
  const [loading, setLoading] = useState(true)
  const [statusModal, setStatusModal] = useState(null)
  const [search, setSearch] = useState('')

  const load = useCallback(async () => {
    if (!profile?.facility_id) return
    setLoading(true)
    const fid = profile.facility_id

    const [{ data: m }, { data: s }, { data: wo }] = await Promise.all([
      supabase.from('magazine_machines').select('*').eq('facility_id', fid).order('name'),
      supabase.from('magazine_slots')
        .select('*, tool_instances(barcode, last_length_mm, last_diameter_mm, last_measurement_result, life_remaining_pct, tool_definitions(internal_code, name))')
        .eq('facility_id', fid),
      supabase.from('work_orders')
        .select('id, wo_code, part_no, part_name, machine_id')
        .eq('facility_id', fid)
        .in('status', ['active', 'checkout', 'measurement']),
    ])

    setMachines(m ?? [])

    // Group slots by machine_id
    const slotsByMachine = {}
    ;(s ?? []).forEach((sl) => {
      if (!slotsByMachine[sl.machine_id]) slotsByMachine[sl.machine_id] = []
      slotsByMachine[sl.machine_id].push(sl)
    })
    setSlots(slotsByMachine)

    // Latest WO per machine
    const woByMachine = {}
    ;(wo ?? []).forEach((w) => {
      if (w.machine_id) woByMachine[w.machine_id] = w
    })
    setActiveWOs(woByMachine)

    setLoading(false)
  }, [profile?.facility_id])

  useEffect(() => { load() }, [load])

  // Realtime: slot changes
  useEffect(() => {
    if (!profile?.facility_id) return
    const channel = supabase
      .channel('cnc-slots-rt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'magazine_slots',
        filter: `facility_id=eq.${profile.facility_id}` }, () => load())
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [profile?.facility_id, load])

  const filtered = machines.filter((m) => {
    if (!search) return true
    const q = search.toLowerCase()
    return m.name.toLowerCase().includes(q) || m.code.toLowerCase().includes(q)
  })

  const counts = {
    active:      machines.filter((m) => m.status === 'active').length,
    maintenance: machines.filter((m) => m.status === 'maintenance').length,
    fault:       machines.filter((m) => m.status === 'fault').length,
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">CNC & Depo Durumu</h1>
          <p className="mt-1 text-sm text-slate-400">M10 — {machines.length} tezgah · canlı magazin görünümü</p>
        </div>
        <button onClick={load} className="text-slate-500 hover:text-slate-300 text-xs flex items-center gap-1 transition-colors">
          ↻ Yenile
        </button>
      </div>

      {/* Summary badges */}
      <div className="flex flex-wrap gap-3">
        <div className="flex items-center gap-2 rounded-xl bg-emerald-500/10 border border-emerald-500/20 px-4 py-2">
          <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
          <span className="text-sm font-medium text-emerald-400">{counts.active} Aktif</span>
        </div>
        {counts.maintenance > 0 && (
          <div className="flex items-center gap-2 rounded-xl bg-amber-500/10 border border-amber-500/20 px-4 py-2">
            <span className="h-2 w-2 rounded-full bg-amber-500" />
            <span className="text-sm font-medium text-amber-400">{counts.maintenance} Bakımda</span>
          </div>
        )}
        {counts.fault > 0 && (
          <div className="flex items-center gap-2 rounded-xl bg-red-500/10 border border-red-500/20 px-4 py-2">
            <span className="h-2 w-2 rounded-full bg-red-500" />
            <span className="text-sm font-medium text-red-400">{counts.fault} Arıza</span>
          </div>
        )}
        <Input placeholder="Tezgah ara…" value={search} onChange={(e) => setSearch(e.target.value)} className="w-48 ml-auto" />
      </div>

      {loading ? (
        <div className="flex justify-center py-20">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-slate-600 border-t-blue-500" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="card flex items-center justify-center p-20 text-slate-500">
          {machines.length === 0 ? 'Tezgah tanımı yok — Sistem Tanımları → Tezgahlar' : 'Arama sonucu bulunamadı'}
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((m) => (
            <div key={m.id} className="relative">
              <MachineCard
                machine={m}
                slots={slots[m.id] ?? []}
                activeWO={activeWOs[m.id] ?? null}
              />
              <button onClick={() => setStatusModal(m)}
                className="absolute top-4 right-12 text-xs text-slate-600 hover:text-slate-400 transition-colors">
                durum değiştir
              </button>
            </div>
          ))}
        </div>
      )}

      {statusModal && (
        <StatusModal
          machine={statusModal}
          onClose={() => setStatusModal(null)}
          onDone={() => { setStatusModal(null); load() }}
        />
      )}
    </div>
  )
}
