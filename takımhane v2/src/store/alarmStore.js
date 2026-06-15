import { create } from 'zustand'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from './authStore'

export const useAlarmStore = create((set, get) => ({
  alarms: [],
  unreadCount: 0,

  fetch: async () => {
    const profile = useAuthStore.getState().profile
    if (!profile?.facility_id) return

    const { data } = await supabase
      .from('alarm_events')
      .select('*')
      .eq('facility_id', profile.facility_id)
      .eq('is_resolved', false)
      .order('created_at', { ascending: false })
      .limit(50)

    if (data) {
      set({
        alarms: data,
        unreadCount: data.filter((a) => !a.is_read).length,
      })
    }
  },

  markRead: async (id) => {
    const profile = useAuthStore.getState().profile
    await supabase
      .from('alarm_events')
      .update({ is_read: true, read_by: profile?.id, read_at: new Date().toISOString() })
      .eq('id', id)

    set((s) => ({
      alarms: s.alarms.map((a) => (a.id === id ? { ...a, is_read: true } : a)),
      unreadCount: Math.max(0, s.unreadCount - 1),
    }))
  },

  subscribeRealtime: (facilityId) => {
    const channel = supabase
      .channel('alarm_events')
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'alarm_events',
        filter: `facility_id=eq.${facilityId}`,
      }, (payload) => {
        set((s) => ({
          alarms: [payload.new, ...s.alarms],
          unreadCount: s.unreadCount + 1,
        }))
      })
      .subscribe()

    return () => supabase.removeChannel(channel)
  },
}))
