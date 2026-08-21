import { useCallback, useEffect, useRef, useState } from 'react'

export interface PaginatedListState<T> {
  data: T | null
  isInitialLoading: boolean
  isUpdating: boolean
  error: string | null
  retry: () => void
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Failed to load results'
}

export function usePaginatedList<T>({
  queryKey,
  load,
}: {
  queryKey: string
  load: (signal: AbortSignal) => Promise<T>
}): PaginatedListState<T> {
  const loadRef = useRef(load)
  loadRef.current = load

  const [data, setData] = useState<T | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [retryToken, setRetryToken] = useState(0)
  const controllerRef = useRef<AbortController | null>(null)
  const requestVersionRef = useRef(0)

  useEffect(() => {
    controllerRef.current?.abort()

    const controller = new AbortController()
    controllerRef.current = controller
    const requestVersion = requestVersionRef.current + 1
    requestVersionRef.current = requestVersion

    setError(null)
    setIsLoading(true)

    const commitIfCurrent = (commit: () => void) => {
      if (requestVersionRef.current === requestVersion && !controller.signal.aborted) {
        commit()
      }
    }

    try {
      void loadRef.current(controller.signal).then(
        (nextData) => {
          commitIfCurrent(() => {
            setData(nextData)
            setIsLoading(false)
          })
        },
        (requestError: unknown) => {
          commitIfCurrent(() => {
            setError(getErrorMessage(requestError))
            setIsLoading(false)
          })
        },
      )
    } catch (requestError) {
      commitIfCurrent(() => {
        setError(getErrorMessage(requestError))
        setIsLoading(false)
      })
    }

    return () => {
      controller.abort()
      if (controllerRef.current === controller) {
        controllerRef.current = null
      }
    }
  }, [queryKey, retryToken])

  const retry = useCallback(() => {
    setRetryToken((token) => token + 1)
  }, [])

  return {
    data,
    isInitialLoading: isLoading && data === null,
    isUpdating: isLoading && data !== null,
    error,
    retry,
  }
}
