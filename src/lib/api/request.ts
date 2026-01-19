import { supabase } from '../supabase'
import { z } from 'zod'

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

const shouldValidateApiResponse = () => import.meta.env.VITE_VALIDATE_API !== 'false'

export async function requestWithSchema<TSchema extends z.ZodTypeAny>(
  endpoint: string,
  schema: TSchema,
  options?: RequestInit,
): Promise<z.infer<TSchema>> {
  const data = await request<unknown>(endpoint, options)

  if (!shouldValidateApiResponse() || data === undefined) {
    return data as z.infer<TSchema>
  }

  const result = schema.safeParse(data)
  if (!result.success) {
    console.error('API response validation failed', {
      endpoint,
      issues: result.error.issues,
    })
    throw new Error('Unexpected server response')
  }

  return result.data
}

