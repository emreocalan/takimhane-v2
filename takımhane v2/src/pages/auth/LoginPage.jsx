import { useState } from 'react'
import { Navigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/authStore'

const PINS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '⌫', '0', '✓']

export default function LoginPage() {
  const session = useAuthStore((s) => s.session)
  const [empNo, setEmpNo] = useState('')
  const [pin, setPin]     = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  if (session) return <Navigate to="/dashboard" replace />

  const pressKey = (k) => {
    if (k === '⌫') { setPin((p) => p.slice(0, -1)); return }
    if (k === '✓')  { handleLogin(); return }
    if (pin.length < 6) setPin((p) => p + k)
  }

  const handleLogin = async () => {
    if (!empNo.trim() || pin.length < 4) {
      setError('Sicil numarası ve en az 4 haneli PIN giriniz.')
      return
    }
    setLoading(true)
    setError('')

    const email = `${empNo.trim().toLowerCase()}@takimhane.local`
    const { error: err } = await supabase.auth.signInWithPassword({ email, password: pin })

    if (err) {
      setError('Sicil numarası veya PIN hatalı.')
      setPin('')
    }
    setLoading(false)
  }

  return (
    <div className="flex h-full items-center justify-center bg-slate-900 p-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-blue-600 text-white font-bold text-2xl shadow-lg shadow-blue-600/30">
            T2
          </div>
          <h1 className="text-xl font-bold text-white">Takımhane v2</h1>
          <p className="mt-1 text-sm text-slate-400">AS9100 Takımhane Yönetim Sistemi</p>
        </div>

        <div className="card p-6 space-y-5">
          {/* Sicil No */}
          <div>
            <label className="mb-1.5 block text-xs font-medium text-slate-400 uppercase tracking-wider">
              Sicil Numarası
            </label>
            <input
              type="text"
              value={empNo}
              onChange={(e) => setEmpNo(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
              placeholder="örn. 1042"
              autoFocus
              className="w-full rounded-lg bg-slate-700 border border-slate-600 px-4 py-3 text-white placeholder-slate-500 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 font-mono text-lg"
            />
          </div>

          {/* PIN göstergesi */}
          <div>
            <label className="mb-1.5 block text-xs font-medium text-slate-400 uppercase tracking-wider">
              PIN
            </label>
            <div className="flex justify-center gap-3 py-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <div
                  key={i}
                  className={`h-4 w-4 rounded-full border-2 transition-colors ${
                    i < pin.length
                      ? 'border-blue-500 bg-blue-500'
                      : 'border-slate-600 bg-transparent'
                  }`}
                />
              ))}
            </div>
          </div>

          {/* PIN pad */}
          <div className="grid grid-cols-3 gap-2">
            {PINS.map((k) => (
              <button
                key={k}
                onClick={() => pressKey(k)}
                disabled={loading}
                className={`flex items-center justify-center rounded-xl py-4 text-lg font-medium transition-all active:scale-95 ${
                  k === '✓'
                    ? 'bg-blue-600 text-white hover:bg-blue-500 shadow-lg shadow-blue-600/30'
                    : k === '⌫'
                    ? 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                    : 'bg-slate-700 text-white hover:bg-slate-600'
                }`}
              >
                {k}
              </button>
            ))}
          </div>

          {error && (
            <p className="rounded-lg bg-red-500/10 border border-red-500/20 px-4 py-3 text-sm text-red-400 text-center">
              {error}
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
