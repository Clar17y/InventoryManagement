import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { products } from '../../lib/api'
import type { Product, ProductsListResponse } from '../../lib/api/products'
import { useProductSearch } from '../../features/products/hooks/useProductSearch'
import { productFixtures } from '../utils/fixtures'

vi.mock('../../lib/api', () => ({
  products: { list: vi.fn() },
}))

const mockProductsList = vi.mocked(products.list)

function response(items: Product[], page: number, totalPages = 1): ProductsListResponse {
  return {
    items,
    pagination: {
      page,
      pageSize: 25,
      totalItems: totalPages * 25,
      totalPages,
    },
  }
}

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve
    reject = promiseReject
  })
  return { promise, resolve, reject }
}

describe('useProductSearch', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    mockProductsList.mockReset()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('debounces search for 400ms and sends bounded page, category, and search parameters', async () => {
    mockProductsList.mockResolvedValue(response([], 1))

    const { result } = renderHook(() => useProductSearch({ categoryId: 'cat-1' }))

    await act(async () => Promise.resolve())
    expect(mockProductsList).toHaveBeenCalledWith(
      { categoryId: 'cat-1', page: 1, pageSize: 25, search: undefined },
      { signal: expect.any(AbortSignal) },
    )

    act(() => result.current.setSearch('dark chocolate'))
    act(() => vi.advanceTimersByTime(399))
    expect(mockProductsList).toHaveBeenCalledTimes(1)

    await act(async () => {
      vi.advanceTimersByTime(1)
      await Promise.resolve()
    })
    expect(mockProductsList).toHaveBeenCalledTimes(2)
    expect(mockProductsList).toHaveBeenLastCalledWith(
      { categoryId: 'cat-1', page: 1, pageSize: 25, search: 'dark chocolate' },
      { signal: expect.any(AbortSignal) },
    )
  })

  it('retains visible results while updating and ignores a stale page response', async () => {
    vi.useRealTimers()
    const first = deferred<ProductsListResponse>()
    const second = deferred<ProductsListResponse>()
    const third = deferred<ProductsListResponse>()
    mockProductsList
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise)
      .mockReturnValueOnce(third.promise)

    const { result } = renderHook(() => useProductSearch({}))
    await waitFor(() => expect(mockProductsList).toHaveBeenCalledTimes(1))

    await act(async () => {
      first.resolve(response([productFixtures[0]!], 1, 3))
      await first.promise
    })
    expect(result.current.items).toEqual([productFixtures[0]])

    act(() => result.current.setPage(2))
    await waitFor(() => expect(mockProductsList).toHaveBeenCalledTimes(2))
    expect(result.current.items).toEqual([productFixtures[0]])
    expect(result.current.isUpdating).toBe(true)

    act(() => result.current.setPage(3))
    await waitFor(() => expect(mockProductsList).toHaveBeenCalledTimes(3))

    await act(async () => {
      third.resolve(response([productFixtures[1]!], 3, 3))
      await third.promise
    })
    expect(result.current.items).toEqual([productFixtures[1]])

    await act(async () => {
      second.resolve(response([productFixtures[0]!], 2, 3))
      await second.promise
    })
    expect(result.current.items).toEqual([productFixtures[1]])
    expect(result.current.pagination.page).toBe(3)
  })
})
