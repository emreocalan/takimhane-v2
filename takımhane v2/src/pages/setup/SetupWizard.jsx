import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/authStore'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import Select from '@/components/ui/Select'

const STEPS = [
  { id: 1, label: 'Tesis'       },
  { id: 2, label: 'Depo'        },
  { id: 3, label: 'Tezgahlar'   },
  { id: 4, label: 'Personel'    },
  { id: 5, label: 'Tedarikçi'   },
  { id: 6, label: 'Varlık Tipi' },
  { id: 7, label: 'Tamamlandı'  },
]

function StepIndicator({ current }) {
  return (
    <div className="flex items-center gap-0">
      {STEPS.map((s, i) => (
        <div key={s.id} className="flex items-center">
          <div className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold transition-colors ${
            s.id < current  ? 'bg-emerald-600 text-white' :
            s.id === current ? 'bg-blue-600 text-white ring-2 ring-blue-400 ring-offset-2 ring-offset-slate-900' :
                               'bg-slate-700 text-slate-400'
          }`}>
            {s.id < current ? '✓' : s.id}
          </div>
          <div className="hidden sm:block">
            <span className={`ml-2 text-xs ${s.id === current ? 'text-white font-medium' : 'text-slate-500'}`}>
              {s.label}
            </span>
          </div>
          {i < STEPS.length - 1 && (
            <div className={`mx-2 h-px w-6 sm:w-10 ${s.id < current ? 'bg-emerald-600' : 'bg-slate-700'}`} />
          )}
        </div>
      ))}
    </div>
  )
}

// ── Adım 1: Tesis Bilgileri ─────────────────────────────────
function Step1({ onNext, facilityId, setFacilityId }) {
  const { profile } = useAuthStore()
  const [form, setForm] = useState({ code: 'FAB-01', name: '', address: '', as9100_cert_no: '' })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }))

  const save = async () => {
    if (!form.name.trim()) { setError('Tesis adı zorunludur.'); return }
    setLoading(true); setError('')
    try {
      const { data, error: err } = await supabase
        .from('facilities')
        .insert({ code: form.code, name: form.name, address: form.address, as9100_cert_no: form.as9100_cert_no })
        .select().single()
      if (err) throw err

      // Profile'a facility_id yaz
      await supabase.from('profiles').update({ facility_id: data.id }).eq('id', profile.id)
      setFacilityId(data.id)
      onNext()
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-4">
        <Input label="Tesis Kodu" required value={form.code} onChange={(e) => set('code', e.target.value)} placeholder="FAB-01" />
        <Input label="Tesis Adı" required value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="Saburmetal A.Ş." />
      </div>
      <Input label="Adres" value={form.address} onChange={(e) => set('address', e.target.value)} placeholder="Mahalle, İlçe, İl" />
      <Input label="AS9100 Sertifika No" value={form.as9100_cert_no} onChange={(e) => set('as9100_cert_no', e.target.value)} placeholder="AS9100-2024-XXXX" />
      {error && <p className="text-sm text-red-400">{error}</p>}
      <div className="flex justify-end">
        <Button onClick={save} loading={loading}>Kaydet & Devam →</Button>
      </div>
    </div>
  )
}

// ── Adım 2: Depo Hiyerarşisi ────────────────────────────────
function Step2({ onNext, onBack, facilityId }) {
  const [locations, setLocations] = useState([])
  const [form, setForm] = useState({ code: '', name: '', level: 'cabinet', location_type: 'mixed', parent_id: '' })
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const regions = locations.filter((l) => l.level === 'region')
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }))

  const add = async () => {
    if (!form.code.trim()) { setError('Kod zorunludur.'); return }
    setSaving(true); setError('')
    try {
      const payload = { facility_id: facilityId, code: form.code, name: form.name || form.code, level: form.level, location_type: form.location_type }
      if (form.parent_id) payload.parent_id = form.parent_id
      const { data, error: err } = await supabase.from('storage_locations').insert(payload).select().single()
      if (err) throw err
      setLocations((l) => [...l, data])
      setForm({ code: '', name: '', level: 'cabinet', location_type: 'mixed', parent_id: '' })
    } catch (e) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  const cabinets = locations.filter((l) => l.level === 'cabinet')

  return (
    <div className="space-y-5">
      <p className="text-sm text-slate-400">En az bir dolap (cabinet) ekleyin. Hiyerarşi: Bölge → Dolap → Raf → Göz</p>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Select label="Seviye" options={[
          { value: 'region',  label: 'Bölge/Alan' },
          { value: 'cabinet', label: 'Dolap' },
          { value: 'shelf',   label: 'Raf' },
          { value: 'slot',    label: 'Göz/Çekmece' },
        ]} value={form.level} onChange={(e) => set('level', e.target.value)} />
        <Input label="Kod" required value={form.code} onChange={(e) => set('code', e.target.value)} placeholder="DOL-01" />
        <Input label="Ad" value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="Kesici Takım Dolabı" />
        <Select label="Tip" options={[
          { value: 'cutting_tool', label: 'Kesici Takım' },
          { value: 'gauge',        label: 'Ölçüm Aleti' },
          { value: 'fixture',      label: 'Fikstür' },
          { value: 'consumable',   label: 'Sarf' },
          { value: 'mixed',        label: 'Karma' },
        ]} value={form.location_type} onChange={(e) => set('location_type', e.target.value)} />
      </div>
      {(form.level === 'shelf' || form.level === 'slot') && regions.length > 0 && (
        <Select label="Üst Lokasyon" options={locations.filter((l) => l.level !== 'slot').map((l) => ({ value: l.id, label: `${l.code} — ${l.name}` }))}
          value={form.parent_id} onChange={(e) => set('parent_id', e.target.value)} />
      )}
      {error && <p className="text-sm text-red-400">{error}</p>}
      <Button variant="secondary" onClick={add} loading={saving} icon="+" size="sm">Lokasyon Ekle</Button>

      {locations.length > 0 && (
        <div className="rounded-xl border border-slate-700 overflow-hidden">
          <table className="w-full text-sm">
            <thead><tr className="border-b border-slate-700 bg-slate-800/50">
              <th className="px-4 py-2 text-left text-xs text-slate-400">Kod</th>
              <th className="px-4 py-2 text-left text-xs text-slate-400">Ad</th>
              <th className="px-4 py-2 text-left text-xs text-slate-400">Seviye</th>
              <th className="px-4 py-2 text-left text-xs text-slate-400">Tip</th>
            </tr></thead>
            <tbody className="divide-y divide-slate-700/50">
              {locations.map((l) => (
                <tr key={l.id} className="bg-slate-800">
                  <td className="px-4 py-2 font-mono text-slate-200">{l.code}</td>
                  <td className="px-4 py-2 text-slate-300">{l.name}</td>
                  <td className="px-4 py-2 text-slate-400">{l.level}</td>
                  <td className="px-4 py-2 text-slate-400">{l.location_type}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="flex justify-between">
        <Button variant="ghost" onClick={onBack}>← Geri</Button>
        <Button onClick={onNext} disabled={cabinets.length === 0}>Devam → {cabinets.length === 0 && '(en az 1 dolap)'}</Button>
      </div>
    </div>
  )
}

// ── Adım 3: CNC Tezgahları ──────────────────────────────────
function Step3({ onNext, onBack, facilityId }) {
  const [machines, setMachines] = useState([])
  const [form, setForm] = useState({ code: '', name: '', machine_type: 'vmc', brand: '', model: '', magazine_capacity: 30, tool_connection_type: 'bt40' })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }))

  const add = async () => {
    if (!form.code.trim() || !form.name.trim()) { setError('Kod ve ad zorunludur.'); return }
    setSaving(true); setError('')
    try {
      const { data, error: err } = await supabase.from('magazine_machines')
        .insert({ ...form, facility_id: facilityId, magazine_capacity: Number(form.magazine_capacity) })
        .select().single()
      if (err) throw err
      setMachines((m) => [...m, data])
      setForm({ code: '', name: '', machine_type: 'vmc', brand: '', model: '', magazine_capacity: 30, tool_connection_type: 'bt40' })
    } catch (e) { setError(e.message) }
    finally { setSaving(false) }
  }

  return (
    <div className="space-y-5">
      <p className="text-sm text-slate-400">En az bir CNC tezgahı ekleyin.</p>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Input label="Tezgah Kodu" required value={form.code} onChange={(e) => set('code', e.target.value)} placeholder="VMC-01" />
        <Input label="Tezgah Adı" required value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="Mazak Variaxis 630" />
        <Select label="Tip" options={[
          { value: 'vmc', label: 'VMC' }, { value: 'hmc', label: 'HMC' },
          { value: 'lathe', label: 'Torna' }, { value: 'grinding', label: 'Taşlama' },
          { value: 'edm', label: 'EDM' }, { value: 'other', label: 'Diğer' },
        ]} value={form.machine_type} onChange={(e) => set('machine_type', e.target.value)} />
        <Input label="Marka" value={form.brand} onChange={(e) => set('brand', e.target.value)} placeholder="Mazak" />
        <Input label="Model" value={form.model} onChange={(e) => set('model', e.target.value)} placeholder="Variaxis 630" />
        <Input label="Magazin Kapasitesi (pot)" type="number" value={form.magazine_capacity} onChange={(e) => set('magazine_capacity', e.target.value)} />
        <Select label="Takım Bağlantı Tipi" options={[
          { value: 'bt30', label: 'BT30' }, { value: 'bt40', label: 'BT40' },
          { value: 'bt50', label: 'BT50' }, { value: 'hsk_a63', label: 'HSK-A63' },
          { value: 'cat40', label: 'CAT40' }, { value: 'other', label: 'Diğer' },
        ]} value={form.tool_connection_type} onChange={(e) => set('tool_connection_type', e.target.value)} />
      </div>
      {error && <p className="text-sm text-red-400">{error}</p>}
      <Button variant="secondary" onClick={add} loading={saving} icon="+" size="sm">Tezgah Ekle</Button>

      {machines.length > 0 && (
        <div className="rounded-xl border border-slate-700 overflow-hidden">
          <table className="w-full text-sm">
            <thead><tr className="border-b border-slate-700 bg-slate-800/50">
              <th className="px-4 py-2 text-left text-xs text-slate-400">Kod</th>
              <th className="px-4 py-2 text-left text-xs text-slate-400">Ad</th>
              <th className="px-4 py-2 text-left text-xs text-slate-400">Tip</th>
              <th className="px-4 py-2 text-left text-xs text-slate-400">Kapasite</th>
            </tr></thead>
            <tbody className="divide-y divide-slate-700/50">
              {machines.map((m) => (
                <tr key={m.id} className="bg-slate-800">
                  <td className="px-4 py-2 font-mono text-slate-200">{m.code}</td>
                  <td className="px-4 py-2 text-slate-300">{m.name}</td>
                  <td className="px-4 py-2 text-slate-400 uppercase">{m.machine_type}</td>
                  <td className="px-4 py-2 text-slate-400">{m.magazine_capacity} pot</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="flex justify-between">
        <Button variant="ghost" onClick={onBack}>← Geri</Button>
        <Button onClick={onNext} disabled={machines.length === 0}>Devam →</Button>
      </div>
    </div>
  )
}

// ── Adım 4: Personel ────────────────────────────────────────
function Step4({ onNext, onBack, facilityId }) {
  const { profile } = useAuthStore()
  const [users, setUsers] = useState([])
  const [form, setForm] = useState({ employee_no: '', full_name: '', role: 'operator', pin: '' })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }))

  const add = async () => {
    if (!form.employee_no || !form.full_name || form.pin.length < 4) {
      setError('Sicil no, ad ve en az 4 haneli PIN zorunludur.'); return
    }
    setSaving(true); setError('')
    try {
      const email = `${form.employee_no.trim()}@takimhane.local`

      // Supabase Auth'da kullanıcı oluştur
      const { data: authData, error: authErr } = await supabase.auth.admin
        ? { data: null, error: { message: 'Admin API kullanılamıyor — kullanıcıyı Supabase Dashboard üzerinden ekleyin.' } }
        : { data: null, error: { message: 'Kullanıcılar Supabase Dashboard → Auth → Users üzerinden eklenmelidir.' } }

      // Profile'ı güncelle (admin kendi profilini rol ile set eder)
      if (form.employee_no === profile?.employee_no) {
        const { data: role } = await supabase.from('roles').select('id').eq('name', form.role).single()
        if (role) await supabase.from('profiles').update({ role_id: role.id, facility_id: facilityId }).eq('id', profile.id)
      }

      setUsers((u) => [...u, { ...form, email }])
      setForm({ employee_no: '', full_name: '', role: 'operator', pin: '' })
    } catch (e) { setError(e.message) }
    finally { setSaving(false) }
  }

  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-blue-500/30 bg-blue-500/5 p-4 text-sm text-blue-300">
        <p className="font-medium mb-1">ℹ️ Kullanıcı Ekleme Hakkında</p>
        <p className="text-blue-400">Kullanıcılar <strong>Supabase Dashboard → Authentication → Users</strong> üzerinden eklenir.</p>
        <p className="mt-1 text-blue-400">E-posta formatı: <code className="font-mono bg-blue-900/30 px-1 rounded">sicilno@takimhane.local</code>, şifre: PIN kodu</p>
      </div>

      <div className="rounded-xl border border-slate-700 p-4">
        <p className="text-xs text-slate-400 mb-3 font-medium uppercase tracking-wider">Kendi Rolünüzü Ayarlayın</p>
        <div className="grid grid-cols-2 gap-3">
          <Select label="Rolünüz" options={[
            { value: 'admin',      label: 'Yönetici' },
            { value: 'supervisor', label: 'Takımhane Sorumlusu' },
          ]} value={form.role} onChange={(e) => set('role', e.target.value)} />
          <div className="flex items-end">
            <Button onClick={async () => {
              const { data: role } = await supabase.from('roles').select('id').eq('name', form.role).single()
              if (role) {
                await supabase.from('profiles').update({ role_id: role.id }).eq('id', profile.id)
                alert('Rol güncellendi!')
              }
            }} variant="secondary" size="sm">Rolü Uygula</Button>
          </div>
        </div>
      </div>

      {error && <p className="text-sm text-red-400">{error}</p>}
      <div className="flex justify-between">
        <Button variant="ghost" onClick={onBack}>← Geri</Button>
        <Button onClick={onNext}>Devam →</Button>
      </div>
    </div>
  )
}

// ── Adım 5: Tedarikçiler (opsiyonel) ────────────────────────
function Step5({ onNext, onBack }) {
  const [suppliers, setSuppliers] = useState([])
  const [form, setForm] = useState({ code: '', name: '', supplier_types: [], contact_email: '' })
  const [saving, setSaving] = useState(false)
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }))

  const add = async () => {
    if (!form.code || !form.name) return
    setSaving(true)
    try {
      const { data } = await supabase.from('suppliers')
        .insert({ code: form.code, name: form.name, supplier_types: ['tool_vendor'], contact_email: form.contact_email })
        .select().single()
      if (data) setSuppliers((s) => [...s, data])
      setForm({ code: '', name: '', contact_email: '' })
    } finally { setSaving(false) }
  }

  return (
    <div className="space-y-5">
      <p className="text-sm text-slate-400">Bu adım isteğe bağlıdır. Tedarikçileri daha sonra Sistem Tanımları'ndan da ekleyebilirsiniz.</p>
      <div className="grid grid-cols-3 gap-3">
        <Input label="Kod" value={form.code} onChange={(e) => set('code', e.target.value)} placeholder="TDR-001" />
        <Input label="Firma Adı" value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="Sandvik Türkiye" />
        <Input label="E-posta" type="email" value={form.contact_email} onChange={(e) => set('contact_email', e.target.value)} placeholder="info@sandvik.com" />
      </div>
      <Button variant="secondary" onClick={add} loading={saving} icon="+" size="sm" disabled={!form.code || !form.name}>Tedarikçi Ekle</Button>

      {suppliers.length > 0 && (
        <div className="text-sm text-slate-400">{suppliers.length} tedarikçi eklendi: {suppliers.map((s) => s.name).join(', ')}</div>
      )}

      <div className="flex justify-between">
        <Button variant="ghost" onClick={onBack}>← Geri</Button>
        <Button onClick={onNext}>Devam → {suppliers.length === 0 && '(atla)'}</Button>
      </div>
    </div>
  )
}

// ── Adım 6: Varlık Tipleri ──────────────────────────────────
function Step6({ onNext, onBack }) {
  const [types, setTypes] = useState([])

  useState(() => {
    supabase.from('tool_types').select('*').order('display_order').then(({ data }) => { if (data) setTypes(data) })
  }, [])

  const typeColors = { '#EF4444': 'bg-red-500', '#3B82F6': 'bg-blue-500', '#10B981': 'bg-emerald-500', '#8B5CF6': 'bg-violet-500', '#F59E0B': 'bg-amber-500', '#6B7280': 'bg-slate-500' }

  return (
    <div className="space-y-5">
      <p className="text-sm text-slate-400">Sisteme hazır 6 varlık tipi yüklenmiştir. Sistem Tanımları'ndan yeni tipler ekleyebilir, attribute'ları düzenleyebilirsiniz.</p>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {types.map((t) => (
          <div key={t.id} className="card flex items-center gap-3 p-4">
            <div className={`h-3 w-3 rounded-full ${typeColors[t.color] ?? 'bg-slate-500'}`} />
            <div>
              <p className="text-sm font-medium text-white">{t.name}</p>
              <p className="text-xs text-slate-400">{t.allows_regrind ? 'Bileme ✓' : ''}{t.requires_calibration ? ' Kalibrasyon ✓' : ''}</p>
            </div>
          </div>
        ))}
      </div>
      <div className="flex justify-between">
        <Button variant="ghost" onClick={onBack}>← Geri</Button>
        <Button onClick={onNext}>Tamamla →</Button>
      </div>
    </div>
  )
}

// ── Adım 7: Tamamlandı ──────────────────────────────────────
function Step7({ facilityId }) {
  const navigate = useNavigate()
  const fetchProfile = useAuthStore((s) => s.fetchProfile)
  const { profile } = useAuthStore()

  const finish = async () => {
    await fetchProfile(profile.id)
    navigate('/dashboard')
  }

  return (
    <div className="flex flex-col items-center gap-6 py-6 text-center">
      <div className="flex h-20 w-20 items-center justify-center rounded-full bg-emerald-600/20 text-5xl">
        ✅
      </div>
      <div>
        <h3 className="text-xl font-bold text-white">Kurulum Tamamlandı!</h3>
        <p className="mt-2 text-slate-400">Sistem kullanıma hazır. Artık ilk takımınızı ekleyebilirsiniz.</p>
      </div>
      <div className="flex gap-3">
        <Button onClick={() => navigate('/admin')} variant="secondary">⚙️ Sistem Tanımları</Button>
        <Button onClick={finish}>Dashboard'a Gir →</Button>
      </div>
    </div>
  )
}

// ── Ana Wizard ───────────────────────────────────────────────
export default function SetupWizard() {
  const [step, setStep] = useState(1)
  const [facilityId, setFacilityId] = useState(null)

  const next = () => setStep((s) => Math.min(s + 1, 7))
  const back = () => setStep((s) => Math.max(s - 1, 1))

  const stepProps = { onNext: next, onBack: back, facilityId, setFacilityId }

  return (
    <div className="flex min-h-full items-center justify-center bg-slate-900 p-4">
      <div className="w-full max-w-3xl">
        {/* Header */}
        <div className="mb-8 text-center">
          <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-600 text-white font-bold text-xl shadow-lg shadow-blue-600/30">T2</div>
          <h1 className="text-2xl font-bold text-white">Kurulum Sihirbazı</h1>
          <p className="mt-1 text-sm text-slate-400">Sistemi kullanmaya başlamadan önce temel tanımlamaları yapın</p>
        </div>

        {/* Step indicator */}
        <div className="mb-8 overflow-x-auto pb-2">
          <StepIndicator current={step} />
        </div>

        {/* Step card */}
        <div className="card p-6">
          <h2 className="mb-5 text-base font-semibold text-white">
            {STEPS[step - 1].label}
          </h2>
          {step === 1 && <Step1 {...stepProps} />}
          {step === 2 && <Step2 {...stepProps} />}
          {step === 3 && <Step3 {...stepProps} />}
          {step === 4 && <Step4 {...stepProps} />}
          {step === 5 && <Step5 {...stepProps} />}
          {step === 6 && <Step6 {...stepProps} />}
          {step === 7 && <Step7 facilityId={facilityId} />}
        </div>
      </div>
    </div>
  )
}
