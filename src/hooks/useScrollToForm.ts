import { useRef, useCallback } from 'react'

/**
 * Hook for scrolling to a form element when it becomes visible.
 * Returns a ref to attach to the form container and a function to trigger the scroll.
 */
export function useScrollToForm<T extends HTMLElement = HTMLDivElement>() {
  const formRef = useRef<T>(null)

  const scrollToForm = useCallback(() => {
    setTimeout(() => {
      formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }, 0)
  }, [])

  return { formRef, scrollToForm }
}
