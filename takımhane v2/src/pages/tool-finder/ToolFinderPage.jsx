import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/authStore'
import { createCheckout } from '@/services/checkout'
import Input from '@/components/ui/Input'
import Select from '@/components/ui/Select'
import Modal from '@/components/ui/Modal'
import Button from '@/components/ui/Button'

// ── Constants ─────────────────────────────────────────────────────
const LIFE_COLOR = (pct) => {
  if (pct == null) return 'text-slate-500'
  if (pct > 50) return 'text-emerald-400'
  if (pct > 20) return 'text-amber-400'
  return 'text-red-400'
}

const LIFE_BG = (pct) => {
  if (pct == null) return 'bg-slate-600'
  if (pct > 50) return 'bg-emerald-500'
  if (pct > 20) return 'bg-amber-500'
  return 'bg-red-500'
}

const STATUS_MAP = {
  available:   { label: 'Müsait',      cls: 'text-emerald-400 bg-emerald-400/10' },
  checked_out: { label: 'Zimmette',    cls: 'text-amber-400 bg-amber-400/10' },
  calibration: { label: 'Kalibrasyon', cls: 'text-blue-400 bg-blue-400/10' },
  regrind:     { label: 'Bilemede',    cls: 'text-blue-400 bg-blue-400/10' },
  quarantine:  { label: 'Karantina',   cls: 'text-red-400 bg-red-400/10' },
  scrapped:    { label: 'Bertaraf',    cls: 'text-slate-500 bg-slate-500/10' },
}

// ── Checkout Modal ────────────────────────────────────────────────
function QuickCheckoutModal({ instance, onClose, onDone }) {
  const { profile } = useAuthStore()
  const [reasons, setReasons] = useState([])
  const [reason, setReason] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    supabase.from('lookup_codes')
      .select('code, label').eq('category', 'checkout_reason').eq('is_active', true).order('display_order')
      .then(({ data }) => setReasons(data ?? []))
  }, [])

  const submit = async () => {
    setSaving(true); setError('')
    try {
      await createCheckout({
        instanceId: instance.id,
        checkoutType: 'temporary',
        checkedOutBy: profile.id,
        reasonCode: reason || null,
        woId: null,
        facilityId: profile.facility_id,
      })
      onDone()
    } catch (e) { setError(e.message) } finally { setSaving(false) }
  }

  return (
    <Modal open onClose={onClose} title="Hızlı Zimmet" size="sm"
      footer={<><Button variant="secondary" onClick={onClose}>İptal</Button><Button onClick={submit} loading={saving}>Zimmet Ver</Button></>}>
      <div className="space-y-4">
        <div className="rounded-xl bg-slate-700/50 p-4 space-y-1">
          <p className="font-medium text-white">{instance.tool_definitions?.name}</p>
          <p className="font-mono text-sm text-blue-300">{instance.barcode}</p>
          <p className="text-xs text-slate-400">
            Konum: <span className="text-slate-200">{instance.storage_locations?.name ?? instance.storage_locations?.code ?? '—'}</span>
          </p>
          {instance.life_remaining_pct != null && (
            <p className={`text-xs font-medium ${LIFE_COLOR(instance.life_remaining_pct)}`}>
              Kalan ömür: %{instance.life_remaining_pct.toFixed(1)}
            </p>
          )}
        </div>
        <Select label="Zimmet Sebebi (opsiyonel)"
          options={[{ value: '', label: '— Seçiniz —' }, ...reasons.map((r) => ({ value: r.code, label: r.label }))]}
          value={reason} onChange={(e) => setReason(e.target.value)} />
        {error && <p className="text-sm text-red-400">{error}</p>}
      </div>
    </Modal>
  )
}

// ── Tool Card ─────────────────────────────────────────────────────
function ToolCard({ instance, onCheckout }) {
  const st = STATUS_MAP[instance.status] ?? { label: instance.status, cls: 'text-slate-400 bg-slate-400/10' }
  const pct = instance.life_remaining_pct
  const def = instance.tool_definitions ?? {}
  const loc = instance.storage_locations

  return (
    <div className="rounded-xl border border-slate-700 bg-slate-800/50 p-4 flex flex-col gap-3 hover:border-slate-600 transition-colors">
      {/* Header row */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-medium text-white text-sm truncate">{def.name ?? '—'}</p>
          <p className="text-xs font-mono text-slate-400 mt-0.5">{def.internal_code ?? ''}</p>
        </div>
        <span className={`flex-shrink-0 rounded-md px-2 py-0.5 text-[11px] font-semibold ${st.cls}`}>
          {st.label}
        </span>
      </div>

      {/* Barcode */}
      <p className="font-mono text-blue-300 text-sm">{instance.barcode}</p>

      {/* Location — most important for finder */}
      <div className="rounded-lg bg-slate-700/50 px-3 py-2 flex items-center gap-2">
        <span className="text-slate-400 text-xs">📍</span>
        <span className="text-sm font-medium text-slate-100">
          {loc?.name ?? loc?.code ?? <span className="text-slate-500 italic">Konum yok</span>}
        </span>
      </div>

      {/* Life bar */}
      {pct != null && (
        <div>
          <div className="flex justify-between text-xs mb-1">
            <span className="text-slate-500">Kalan Ömür</span>
            <span className={`font-medium ${LIFE_COLOR(pct)}`}>%{pct.toFixed(0)}</span>
          </div>
          <div className="h-1.5 w-full rounded-full bg-slate-700">
            <div className={`h-1.5 rounded-full ${LIFE_BG(pct)}`} style={{ width: `${Math.min(100, pct)}%` }} />
          </div>
        </div>
      )}

      {/* Last measurement */}
      {instance.last_length_mm != null && (
        <p className="text-xs text-slate-500">
          L={instance.last_length_mm}mm
          {instance.last_diameter_mm != null && <> · Ø={instance.last_diameter_mm}mm</>}
        </p>
      )}

      {/* Action */}
      {instance.status === 'available' && (
        <button onClick={() => onCheckout(instance)}
          className="w-full rounded-lg bg-blue-600 hover:bg-blue-500 py-2 text-sm font-medium text-white transition-colors">
          Zimmet Ver
        </button>
      )}
    </div>
  )
}

// ── Main ──────────────────────────────────────────────────────────
export default function ToolFinderPage() {
  const { profile } = useAuthStore()
  const [instances, setInstances] = useState([])
  const [toolTypes, setToolTypes] = useState([])
  const [loading, setLoading] = useState(false)
  const [searched, setSearched] = useState(false)

  const [search, setSearch] = useState('')
  const [typeId, setTypeId] = useState('')
  const [statusFilter, setStatusFilter] = useState('available')
  const [checkoutTarget, setCheckoutTarget] = useState(null)

  const searchInputRef = useRef(null)

  // Load tool types for filter
  useEffect(() => {
    if (!profile?.facility_id) return
    supabase.from('tool_types').select('id, name').eq('is_active', true).order('name')
      .then(({ data }) => setToolTypes(data ?? []))
  }, [profile?.facility_id])

  // Focus search on mount
  useEffect(() => { searchInputRef.current?.focus() }, [])

  // Barcode scan → fill search
  useEffect(() => {
    const onScan = (e) => { setSearch(e.detail); doSearch(e.detail) }
    window.addEventListener('barcode-scan', onScan)
    return () => window.removeEventListener('barcode-scan', onScan)
  }, [typeId, statusFilter])

  const doSearch = useCallback(async (overrideSearch) => {
    if (!profile?.facility_id) return
    const q = (overrideSearch ?? search).trim()
    setLoading(true); setSearched(true)

    let query = supabase
      .from('tool_instances')
      .select(`
        *,
        tool_definitions(id, internal_code, name, tool_type_id,
          tool_types(id, name)),
        storage_locations(id, name, code)
      `)
      .eq('facility_id', profile.facility_id)
      .order('life_remaining_pct', { ascending: false, nullsFirst: false })
      .limit(80)

    if (statusFilter && statusFilter !== 'all') query = query.eq('status', statusFilter)

    if (q) {
      query = query.or(
        `barcode.ilike.%${q}%,serial_no.ilike.%${q}%`
      )
    }

    const { data } = await query
    let results = data ?? []

    // Client-side filter for text in definition name/code and tool type
    if (q) {
      const ql = q.toLowerCase()
      results = results.filter((i) =>
        i.barcode?.toLowerCase().includes(ql) ||
        i.serial_no?.toLowerCase().includes(ql) ||
        i.tool_definitions?.name?.toLowerCase().includes(ql) ||
        i.tool_definitions?.internal_code?.toLowerCase().includes(ql)
      )
    }

    if (typeId) {
      results = results.filter((i) => i.tool_definitions?.tool_type_id === typeId)
    }

    setInstances(results)
    setLoading(false)
  }, [profile?.facility_id, search, typeId, statusFilter])

  const handleKey = (e) => { if (e.key === 'Enter') doSearch() }

  const afterCheckout = () => {
    setCheckoutTarget(null)
    doSearch()
  }

  const availableCount = instances.filter((i) => i.status === 'available').length

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Takım Bulucu</h1>
        <p className="mt-1 text-sm text-slate-400">Barkod okutun veya takım adı/kodu arayın — konumunu ve durumunu anında görün</p>
      </div>

      {/* Search bar — large, prominent */}
      <div className="rounded-xl border border-slate-600 bg-slate-800 p-5 space-y-4">
        <div className="flex gap-3">
          <div className="flex-1">
            <Input
              ref={searchInputRef}
              placeholder="Barkod, takım adı veya iç kod…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={handleKey}
              className="text-base"
            />
          </div>
          <Button onClick={() => doSearch()} loading={loading} className="px-6">
            Ara
          </Button>
        </div>

        <div className="flex flex-wrap gap-3">
          <Select
            options={[{ value: '', label: 'Tüm Takım Tipleri' }, ...toolTypes.map((t) => ({ value: t.id, label: t.name }))]}
            value={typeId} onChange={(e) => setTypeId(e.target.value)}
          />
          <div className="flex gap-1 rounded-lg bg-slate-700 p-1">
            {[['available', 'Sadece Müsait'], ['all', 'Tüm Durumlar']].map(([v, l]) => (
              <button key={v} onClick={() => setStatusFilter(v)}
                className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${statusFilter === v ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-slate-200'}`}>
                {l}
              </button>
            ))}
          </div>
          <p className="self-center text-xs text-slate-500">
            Enter'a basın veya barkod okutun
          </p>
        </div>
      </div>

      {/* Results */}
      {!searched && (
        <div className="flex flex-col items-center justify-center py-16 text-slate-600">
          <div className="text-5xl mb-4">🔍</div>
          <p className="text-lg font-medium">Takım aramak için yukarıya yazın</p>
          <p className="text-sm mt-1">Barkod okuyucu ile doğrudan tarama da yapabilirsiniz</p>
        </div>
      )}

      {searched && !loading && instances.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 text-slate-500">
          <div className="text-4xl mb-3">📭</div>
          <p className="font-medium">Eşleşen takım bulunamadı</p>
          <p className="text-sm mt-1">Arama kriterlerini değiştirin veya "Tüm Durumlar" seçin</p>
        </div>
      )}

      {searched && instances.length > 0 && (
        <>
          <div className="flex items-center justify-between">
            <p className="text-sm text-slate-400">
              <span className="font-medium text-white">{instances.length}</span> sonuç
              {statusFilter === 'available' && availableCount > 0 &&
                <span className="ml-2 text-emerald-400">· {availableCount} müsait</span>}
            </p>
            <p className="text-xs text-slate-600">Ömür yüksekten düşüğe sıralı</p>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {instances.map((inst) => (
              <ToolCard key={inst.id} instance={inst} onCheckout={setCheckoutTarget} />
            ))}
          </div>
        </>
      )}

      {checkoutTarget && (
        <QuickCheckoutModal
          instance={checkoutTarget}
          onClose={() => setCheckoutTarget(null)}
          onDone={afterCheckout}
        />
      )}
    </div>
  )
}
