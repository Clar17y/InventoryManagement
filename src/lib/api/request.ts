import { supabase } from '../supabase'

const API_BASE = '/api'

export async function request<T>(endpoint: string, options?: RequestInit): Promise<T> {
  const {
    data: { session },
  } = await supabase.auth.getSession()

  const response = await fetch(`${API_BASE}${endpoint}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
      ...options?.headers,
    },
    ...options,
  })

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Request failed' }))
    // Use detailed message if available (e.g., stock shortages), otherwise fall back to error
    const errorMessage = error.message || error.error || 'Request failed'
    throw new Error(errorMessage)
  }

  if (response.status === 204) {
    return undefined as T
  }

  return response.json()
}

