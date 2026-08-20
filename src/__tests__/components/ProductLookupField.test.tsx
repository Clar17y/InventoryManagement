import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import ProductLookupField from '../../features/products/components/ProductLookupField'
import { products } from '../../lib/api'
import type { Product, ProductsListResponse } from '../../lib/api/products'
import { render } from '../utils/test-utils'
import { productFixtures } from '../utils/fixtures'

vi.mock('../../lib/api', () => ({
  products: { list: vi.fn() },
}))

const mockProductsList = vi.mocked(products.list)

function response(items: Product[]): ProductsListResponse {
  return {
    items,
    pagination: { page: 1, pageSize: 25, totalItems: items.length, totalPages: 1 },
  }
}

describe('ProductLookupField', () => {
  beforeEach(() => {
    mockProductsList.mockReset()
  })

  it('keeps the selected product label visible when it is outside the current result page', async () => {
    mockProductsList.mockResolvedValue(response([productFixtures[1]!]))

    render(
      <ProductLookupField
        value={productFixtures[0]!}
        categoryId="cat-1"
        onChange={vi.fn()}
      />,
    )

    expect(screen.getByText(/Dark Chocolate Bar/)).toBeInTheDocument()
    await waitFor(() => expect(screen.getByRole('button', { name: /orange juice/i })).toBeInTheDocument())
    expect(screen.getByText(/Dark Chocolate Bar/)).toBeInTheDocument()
  })

  it('returns the full selected product after a result click', async () => {
    const onChange = vi.fn()
    mockProductsList.mockResolvedValue(response([productFixtures[1]!]))
    const user = userEvent.setup()

    render(<ProductLookupField value={null} onChange={onChange} />)

    await user.click(await screen.findByRole('button', { name: /orange juice/i }))
    expect(onChange).toHaveBeenCalledWith(productFixtures[1])
  })

  it('shows the current request failure and retries it', async () => {
    mockProductsList
      .mockRejectedValueOnce(new Error('Product search failed'))
      .mockResolvedValueOnce(response([productFixtures[0]!]))
    const user = userEvent.setup()

    render(<ProductLookupField value={null} onChange={vi.fn()} />)

    expect(await screen.findByText('Product search failed')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Retry' }))

    expect(await screen.findByRole('button', { name: /dark chocolate bar/i })).toBeInTheDocument()
    expect(mockProductsList).toHaveBeenCalledTimes(2)
  })
})
