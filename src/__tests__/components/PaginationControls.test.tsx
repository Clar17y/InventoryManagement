import { describe, expect, it, vi } from 'vitest'
import { fireEvent, screen } from '@testing-library/react'
import { render } from '../utils/test-utils'
import PaginationControls from '../../components/ui/PaginationControls'
import UpdatingResults from '../../components/ui/UpdatingResults'

const pageMeta = {
  page: 2,
  pageSize: 25 as const,
  totalItems: 42,
  totalPages: 2,
}

describe('PaginationControls', () => {
  it('renders the range, active page, navigation, and page-size options', () => {
    render(
      <PaginationControls
        {...pageMeta}
        loading={false}
        onPageChange={vi.fn()}
        onPageSizeChange={vi.fn()}
      />,
    )

    expect(screen.getByText('Showing 26–42 of 42')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '2' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('button', { name: /previous/i })).toBeEnabled()
    expect(screen.getByRole('button', { name: /next/i })).toBeDisabled()
    expect(screen.getByRole('option', { name: '25' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: '50' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: '100' })).toBeInTheDocument()
  })

  it('disables every control while loading', () => {
    render(
      <PaginationControls
        {...pageMeta}
        loading
        onPageChange={vi.fn()}
        onPageSizeChange={vi.fn()}
      />,
    )

    expect(screen.getAllByRole('button').every((button) => button.hasAttribute('disabled'))).toBe(true)
    expect(screen.getByRole('combobox')).toBeDisabled()
  })
})

describe('UpdatingResults', () => {
  it('dims retained results and announces an update while loading', () => {
    render(
      <UpdatingResults updating error={null} onRetry={vi.fn()}>
        <div>Current results</div>
      </UpdatingResults>,
    )

    expect(screen.getByText('Current results').parentElement).toHaveClass('relative', 'opacity-60')
    expect(screen.getByRole('status')).toHaveTextContent('Updating results…')
    expect(screen.getByRole('status')).toHaveAttribute('aria-live', 'polite')
  })

  it('shows a retry action for current-request errors', () => {
    const onRetry = vi.fn()
    render(
      <UpdatingResults updating={false} error="Could not load results" onRetry={onRetry}>
        <div>Current results</div>
      </UpdatingResults>,
    )

    expect(screen.getByRole('alert')).toHaveTextContent('Could not load results')
    fireEvent.click(screen.getByRole('button', { name: /retry/i }))
    expect(onRetry).toHaveBeenCalledOnce()
  })
})
