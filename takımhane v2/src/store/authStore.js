import { create } from 'zustand'
import { supabase } from '@/lib/supabase'

export const useAuthStore = create((set, get) => ({
  session: null,
  profile: null,
  role: null,
  loading: true,

  setSession: (session) => set({ session }),

  setProfile: (profile) => set({
    profile,
    role: profile?.roles?.name ?? null,
  }),

  initialize: async () => {
    const { data: { session } } = await supabase.auth.getSession()
    set({ session })

    if (session) await get().fetchProfile(session.user.id)
    set({ loading: false })

    supabase.auth.onAuthStateChange(async (_event, session) => {
      set({ session })
      if (session) {
        await get().fetchProfile(session.user.id)
      } else {
        set({ profile: null, role: null })
      }
    })
  },

  fetchProfile: async (userId) => {
    const { data } = await supabase
      .from('profiles')
      .select('*, roles(name, label)')
      .eq('id', userId)
      .single()
    if (data) get().setProfile(data)
  },

  signOut: async () => {
    await supabase.auth.signOut()
    set({ session: null, profile: null, role: null })
  },

  hasRole: (...roles) => roles.includes(get().role),
}))
