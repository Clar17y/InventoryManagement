import { supabase } from '../supabase'
import { z } from 'zod'

const API_BASE = '/api'

export class ApiError extends Error {
  status: number
  body: unknown

  constructor(message: string, status: number, body: unknown) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.body = body
  }
}

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
    const errorBody = await response.json().catch(() => ({ error: 'Request failed' }))
    const errorMessage =
      typeof errorBody === 'object' && errorBody && 'message' in errorBody && typeof (errorBody as any).message === 'string'
        ? (errorBody as any).message
        : typeof errorBody === 'object' && errorBody && 'error' in errorBody && typeof (errorBody as any).error === 'string'
          ? (errorBody as any).error
          : 'Request failed'
    throw new ApiError(errorMessage, response.status, errorBody)
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

