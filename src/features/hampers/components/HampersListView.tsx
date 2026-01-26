import { useEffect, useState } from 'react'
import {
  ChevronDownIcon,
  ChevronUpIcon,
  MagnifyingGlassIcon,
  PencilIcon,
  TrashIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline'
import type { Hamper, HamperDetail, HamperVariantAvailability } from '../../../lib/api'
import { formatCurrency } from '../../../lib/formatting'
import { HAMPER_SORT_OPTIONS } from '../constants'
import type { HamperSortOption } from '../types'
import { getAvailabilityColor } from '../utils'

export default function HampersListView({
  sortedHampers,
  debouncedSearch,
  searchQuery,
  setSearchQuery,
  sortBy,
  setSortBy,
  expandedId,
  expandedDetail,
  handleExpand,
  handleEdit,
  handleDelete,
}: {
  sortedHampers: Hamper[]
  debouncedSearch: string
  searchQuery: string
  setSearchQuery: (value: string) => void
  sortBy: HamperSortOption
  setSortBy: (value: HamperSortOption) => void
  expandedId: string | null
  expandedDetail: HamperDetail | null
  handleExpand: (id: string) => void
  handleEdit: (hamper: Hamper) => void
  handleDelete: (id: string) => void
}) {
  const [selectedVariantId, setSelectedVariantId] = useState<string | null>(null)

  // Clear selected variant when expanded hamper changes
  useEffect(() => {
    setSelectedVariantId(null)
  }, [expandedId])

  return (
    <>
      <div className="flex flex-col sm:flex-row gap-2">
        {/* Search */}
        <div className="relative flex-1">
          <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search hampers..."
            className="w-full pl-9 pr-8 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
            >
              <XMarkIcon className="h-4 w-4" />
            </button>
          )}
        </div>

        {/* Sort */}
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-500">Sort:</span>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as HamperSortOption)}
            className="px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
          >
            {HAMPER_SORT_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
      </div>

    {sortedHampers.length === 0 ? (
      <div className="card text-gray-500 text-center py-12">
        {debouncedSearch ? (
          <>
            <p className="mb-4">No hampers match "{debouncedSearch}"</p>
            <p className="text-sm">Try a different search term</p>
          </>
        ) : (
          <>
            <p className="mb-4">No hampers defined yet</p>
            <p className="text-sm">Create your first hamper to start tracking availability</p>
          </>
        )}
      </div>
    ) : (
      <div className="space-y-3">
        {sortedHampers.map((hamper) => (
          <div key={hamper.id} className="card">
            {/* Row 1: Full-width name with edit/delete buttons */}
            <div className="flex items-start justify-between gap-2">
              <button
                onClick={() => handleExpand(hamper.id)}
                className="flex-1 text-left min-w-0"
              >
                <div className="text-sm font-medium">{hamper.name}</div>
              </button>
              <div className="flex gap-1 flex-shrink-0">
                <button
                  type="button"
                  onClick={() => handleEdit(hamper)}
                  className="p-2 text-gray-500 hover:text-primary-600"
                  aria-label={`Edit hamper ${hamper.name}`}
                >
                  <PencilIcon className="h-5 w-5" />
                </button>
                <button
                  type="button"
                  onClick={() => handleDelete(hamper.id)}
                  className="p-2 text-gray-500 hover:text-red-600"
                  aria-label={`Delete hamper ${hamper.name}`}
                >
                  <TrashIcon className="h-5 w-5" />
                </button>
              </div>
            </div>

            {/* Row 2: Details and expand button */}
            <button
              onClick={() => handleExpand(hamper.id)}
              className="w-full text-left mt-1"
            >
              <div className="flex items-center justify-between gap-2">
                <div className="text-xs text-gray-500">
                  {formatCurrency(hamper.sellingPrice)} • {hamper.requirements.length} requirements
                </div>
                <div className="flex items-center gap-2">
                  {!hamper.hasVariants && (
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${getAvailabilityColor(hamper.canMake)}`}>
                      Can make: {hamper.canMake}
                    </span>
                  )}
                  {expandedId === hamper.id ? (
                    <ChevronUpIcon className="h-5 w-5 text-gray-400 flex-shrink-0" />
                  ) : (
                    <ChevronDownIcon className="h-5 w-5 text-gray-400 flex-shrink-0" />
                  )}
                </div>
              </div>

              {/* Variant Badges (show max 3, then "+X more") */}
              {hamper.hasVariants && hamper.variantAvailability && hamper.variantAvailability.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-2">
                  {hamper.variantAvailability.slice(0, 3).map((v: HamperVariantAvailability) => (
                    <span
                      key={v.variantId}
                      className={`px-2 py-0.5 rounded-full text-xs font-medium ${getAvailabilityColor(v.canMake)}`}
                      title={v.etsySku ? `SKU: ${v.etsySku}` : undefined}
                    >
                      {v.name}: {v.canMake}
                    </span>
                  ))}
                  {hamper.variantAvailability.length > 3 && (
                    <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600">
                      +{hamper.variantAvailability.length - 3} more
                    </span>
                  )}
                </div>
              )}
            </button>

            {expandedId === hamper.id && expandedDetail && (
              <div className="mt-4 pt-4 border-t border-gray-100">
                <div className="grid grid-cols-3 gap-4 mb-4 text-center">
                  <div className="bg-gray-50 p-3 rounded-lg">
                    <div className="text-xs text-gray-500">Selling Price</div>
                    <div className="font-semibold">{formatCurrency(expandedDetail.sellingPrice)}</div>
                  </div>
                  <div className="bg-gray-50 p-3 rounded-lg">
                    <div className="text-xs text-gray-500">Est. Cost</div>
                    <div className="font-semibold">{formatCurrency(expandedDetail.estimatedCost)}</div>
                  </div>
                  <div className="bg-gray-50 p-3 rounded-lg">
                    <div className="text-xs text-gray-500">Est. Margin</div>
                    <div className={`font-semibold ${expandedDetail.estimatedMargin >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {formatCurrency(expandedDetail.estimatedMargin)}
                    </div>
                  </div>
                </div>

                <h4 className="text-sm font-medium text-gray-700 mb-2">Requirements</h4>
                <div className="space-y-2">
                  {expandedDetail.requirements.map((req) => (
                    <div key={req.id} className="flex justify-between items-center text-sm bg-gray-50 p-2 rounded-lg">
                      <div>
                        <span className="font-medium">{req.category.name}</span>
                        {req.isOptional && <span className="text-gray-400 ml-1">(optional)</span>}
                      </div>
                      <div className="flex items-center gap-4 text-xs">
                        <span>Need: {req.quantityRequired}</span>
                        <span className={req.availableStock >= req.quantityRequired ? 'text-green-600' : 'text-red-600'}>
                          Stock: {req.availableStock.toFixed(1)}
                        </span>
                        <span className={`px-2 py-0.5 rounded ${getAvailabilityColor(req.canFulfill)}`}>
                          ×{req.canFulfill}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Variant Availability Breakdown */}
                {expandedDetail.hasVariants && expandedDetail.variantAvailability && expandedDetail.variantAvailability.length > 0 && (
                  <div className="mt-4">
                    <h4 className="text-sm font-medium text-gray-700 mb-2">Variant Availability</h4>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                      {expandedDetail.variantAvailability.map((v: HamperVariantAvailability) => (
                        <button
                          type="button"
                          key={v.variantId}
                          onClick={() => setSelectedVariantId(selectedVariantId === v.variantId ? null : v.variantId)}
                          className={`p-2 rounded-lg text-center transition-all ${getAvailabilityColor(v.canMake)} ${
                            selectedVariantId === v.variantId ? 'ring-2 ring-primary-500 ring-offset-1' : 'hover:opacity-80'
                          }`}
                        >
                          <div className="font-medium text-sm">{v.name}</div>
                          <div className="text-lg font-bold">{v.canMake}</div>
                          {v.etsySku && (
                            <div className="text-xs opacity-75 font-mono">{v.etsySku}</div>
                          )}
                        </button>
                      ))}
                    </div>

                    {/* Selected Variant Mappings */}
                    {selectedVariantId && (() => {
                      const selectedVariant = expandedDetail.variantAvailability?.find(v => v.variantId === selectedVariantId)
                      if (!selectedVariant?.mappings?.length) return null

                      // Group mappings by category
                      const byCategory: Record<string, Array<{ name: string; stock: number; priority: number }>> = {}
                      for (const m of selectedVariant.mappings) {
                        const catName = m.category?.name || 'Category'
                        if (!byCategory[catName]) byCategory[catName] = []
                        byCategory[catName].push({
                          name: m.product?.name || 'Product',
                          stock: (m as { stock?: number }).stock ?? 0,
                          priority: (m as { priority?: number }).priority ?? 1,
                        })
                      }

                      // Sort categories to match hamper requirement order
                      const reqOrder = expandedDetail.requirements.map(r => r.category.name)
                      const sortedCategories = Object.entries(byCategory).sort(([a], [b]) => {
                        const aIdx = reqOrder.indexOf(a)
                        const bIdx = reqOrder.indexOf(b)
                        // Categories not in requirements go to end
                        if (aIdx === -1 && bIdx === -1) return a.localeCompare(b)
                        if (aIdx === -1) return 1
                        if (bIdx === -1) return -1
                        return aIdx - bIdx
                      })

                      return (
                        <div className="mt-3 p-3 bg-gray-50 rounded-lg border border-gray-200">
                          <div className="text-xs font-medium text-gray-600 mb-2">
                            {selectedVariant.name} Requirements
                          </div>
                          <div className="space-y-2">
                            {sortedCategories.map(([catName, products]) => {
                              // Sort by priority and calculate total
                              const sorted = [...products].sort((a, b) => a.priority - b.priority)
                              const totalStock = sorted.reduce((sum, p) => sum + p.stock, 0)

                              return (
                                <div key={catName} className="flex justify-between items-center text-sm">
                                  <span className="text-gray-500">{catName}:</span>
                                  <div className="flex items-center gap-2">
                                    <span className="font-medium text-primary-700">
                                      {sorted.map((p) => `${p.name} (${p.stock})`).join(' > ')}
                                    </span>
                                    {sorted.length > 1 && (
                                      <span className={`text-xs px-1.5 py-0.5 rounded ${totalStock > 0 ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                                        = {totalStock}
                                      </span>
                                    )}
                                    {sorted.length === 1 && (
                                      <span className={`text-xs px-1.5 py-0.5 rounded ${totalStock > 0 ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                                        {totalStock}
                                      </span>
                                    )}
                                  </div>
                                </div>
                              )
                            })}
                          </div>
                        </div>
                      )
                    })()}
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    )
    }
    </>
  )
}
