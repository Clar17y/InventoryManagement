import { request } from './request'

export interface Category {
  id: string
  name: string
  description: string | null
  pickRule: 'FIFO' | 'FEFO' | 'CHEAPEST' | 'MANUAL'
  isActive: boolean
  createdAt: string
  updatedAt: string
  _count?: { products: number }
}

export const categories = {
  list: () => request<Category[]>('/categories'),
  get: (id: string) => request<Category>(`/categories/${id}`),
  create: (data: { name: string; description?: string; pickRule?: string }) =>
    request<Category>('/categories', { method: 'POST', body: JSON.stringify(data) }),
  update: (id: string, data: Partial<{ name: string; description: string; pickRule: string }>) =>
    request<Category>(`/categories/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  delete: (id: string) => request<void>(`/categories/${id}`, { method: 'DELETE' }),
}

