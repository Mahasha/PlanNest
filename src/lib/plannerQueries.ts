import { useQuery } from '@tanstack/react-query'
import { supabase } from './supabase'

export function useSupabaseSession() {
  return useQuery({
    queryKey: ['supabase-session'],
    queryFn: async () => {
      if (!supabase) return null
      const { data, error } = await supabase.auth.getSession()
      if (error) throw error
      return data.session
    },
  })
}
