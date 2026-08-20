import { act, renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { usePaginatedList } from '../../hooks/usePaginatedList'

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve
    reject = promiseReject
  })

  return { promise, resolve, reject }
}

describe('usePaginatedList', () => {
  it('keeps the newest query result when an older request settles later', async () => {
    const first = deferred<string>()
    const second = deferred<string>()
    const requests = [first, second]
    const load = vi.fn((signal: AbortSignal) => {
      const request = requests[load.mock.calls.length - 1]
      expect(signal).toBeInstanceOf(AbortSignal)
      if (!request) throw new Error('Unexpected request')
      return request.promise
    })

    const { result, rerender } = renderHook(
      ({ queryKey }: { queryKey: string }) => usePaginatedList({ queryKey, load }),
      { initialProps: { queryKey: 'query-a' } },
    )

    await waitFor(() => expect(load).toHaveBeenCalledTimes(1))
    rerender({ queryKey: 'query-b' })
    await waitFor(() => expect(load).toHaveBeenCalledTimes(2))

    await act(async () => {
      second.resolve('result-b')
      await second.promise
    })
    expect(result.current.data).toBe('result-b')

    await act(async () => {
      first.resolve('result-a')
      await first.promise
    })
    expect(result.current.data).toBe('result-b')
    expect(result.current.error).toBeNull()
  })

  it('does not expose an error from an aborted stale request', async () => {
    const first = deferred<string>()
    const second = deferred<string>()
    const requests = [first, second]
    const load = vi.fn(() => {
      const request = requests[load.mock.calls.length - 1]
      if (!request) throw new Error('Unexpected request')
      return request.promise
    })

    const { result, rerender } = renderHook(
      ({ queryKey }: { queryKey: string }) => usePaginatedList({ queryKey, load }),
      { initialProps: { queryKey: 'query-a' } },
    )

    await waitFor(() => expect(load).toHaveBeenCalledTimes(1))
    rerender({ queryKey: 'query-b' })
    await waitFor(() => expect(load).toHaveBeenCalledTimes(2))

    await act(async () => {
      first.reject(new Error('stale failure'))
      await expect(first.promise).rejects.toThrow('stale failure')
    })

    expect(result.current.error).toBeNull()

    await act(async () => {
      second.resolve('result-b')
      await second.promise
    })
    expect(result.current.data).toBe('result-b')
    expect(result.current.error).toBeNull()
  })

  it('retains old data on current errors and retries the same query', async () => {
    const initial = deferred<string>()
    const failed = deferred<string>()
    const retried = deferred<string>()
    const requests = [initial, failed, retried]
    const load = vi.fn(() => {
      const request = requests[load.mock.calls.length - 1]
      if (!request) throw new Error('Unexpected request')
      return request.promise
    })

    const { result } = renderHook(() => usePaginatedList({ queryKey: 'query-a', load }))

    await waitFor(() => expect(load).toHaveBeenCalledTimes(1))
    await act(async () => {
      initial.resolve('old-data')
      await initial.promise
    })
    await waitFor(() => expect(result.current.data).toBe('old-data'))

    act(() => result.current.retry())
    await waitFor(() => expect(load).toHaveBeenCalledTimes(2))

    await act(async () => {
      failed.reject(new Error('current failure'))
      await expect(failed.promise).rejects.toThrow('current failure')
    })
    await waitFor(() => expect(result.current.error).toBe('current failure'))
    expect(result.current.data).toBe('old-data')
    expect(result.current.isInitialLoading).toBe(false)
    expect(result.current.isUpdating).toBe(false)

    act(() => result.current.retry())
    await waitFor(() => expect(load).toHaveBeenCalledTimes(3))
    expect(result.current.data).toBe('old-data')
    expect(result.current.error).toBeNull()

    await act(async () => {
      retried.resolve('new-data')
      await retried.promise
    })
    await waitFor(() => expect(result.current.data).toBe('new-data'))
    expect(result.current.error).toBeNull()
  })
})
