import { act, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { render } from '../utils/test-utils'
import {
  usePaginationSearchParams,
  type PaginationSearchParams,
} from '../../hooks/usePaginationSearchParams'

function PaginationHarness({ onState }: { onState: (state: PaginationSearchParams) => void }) {
  onState(usePaginationSearchParams())
  return <output data-testid="pagination-state" />
}

describe('usePaginationSearchParams', () => {
  afterEach(() => {
    window.history.replaceState({}, '', '/sales')
  })

  it('reads the page and page size from the current URL and resets page on size changes', () => {
    window.history.pushState({}, '', '/sales?page=3&pageSize=50')
    let state: PaginationSearchParams | undefined

    render(<PaginationHarness onState={(nextState) => { state = nextState }} />)

    expect(screen.getByTestId('pagination-state')).toBeInTheDocument()
    expect(state?.page).toBe(3)
    expect(state?.pageSize).toBe(50)

    act(() => state?.setPageSize(100))

    const searchParams = new URLSearchParams(window.location.search)
    expect(searchParams.get('page')).toBe('1')
    expect(searchParams.get('pageSize')).toBe('100')
  })

  it('clamps page changes to page one and preserves the current page size on reset', () => {
    window.history.pushState({}, '', '/sales?page=4&pageSize=100')
    let state: PaginationSearchParams | undefined

    render(<PaginationHarness onState={(nextState) => { state = nextState }} />)

    act(() => state?.setPage(0))
    expect(new URLSearchParams(window.location.search).get('page')).toBe('1')

    act(() => state?.resetPage())
    expect(new URLSearchParams(window.location.search).get('page')).toBe('1')
    expect(new URLSearchParams(window.location.search).get('pageSize')).toBe('100')
  })
})
