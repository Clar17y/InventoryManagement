import { useMemo, useState } from 'react'
import { MagnifyingGlassIcon, XMarkIcon } from '@heroicons/react/24/outline'
import type { Category } from '../../../lib/api'
import type { RequirementInput } from '../types'

export default function RequirementsChecklist({
  categoryList,
  requirements,
  onChange,
}: {
  categoryList: Category[]
  requirements: RequirementInput[]
  onChange: (requirements: RequirementInput[]) => void
}) {
  const [query, setQuery] = useState('')

  const categoryById = useMemo(() => {
    const map = new Map<string, Category>()
    for (const cat of categoryList) map.set(cat.id, cat)
    return map
  }, [categoryList])

  const requirementsByCategoryId = useMemo(() => {
    const map = new Map<string, RequirementInput>()
    for (const req of requirements) map.set(req.categoryId, req)
    return map
  }, [requirements])

  const selectedRequirements = useMemo(() => {
    const list = requirements
      .filter((r) => r.categoryId)
      .map((r) => ({
        ...r,
        category: categoryById.get(r.categoryId) ?? null,
      }))

    list.sort((a, b) => {
      const aName = a.category?.name ?? ''
      const bName = b.category?.name ?? ''
      return aName.localeCompare(bName)
    })
    return list
  }, [requirements, categoryById])

  const availableCategories = useMemo(() => {
    const q = query.trim().toLowerCase()
    const sorted = [...categoryList].sort((a, b) => {
      if (a.isActive !== b.isActive) return a.isActive ? -1 : 1
      return a.name.localeCompare(b.name)
    })

    const unselected = sorted.filter((cat) => !requirementsByCategoryId.has(cat.id))
    if (!q) return unselected
    return unselected.filter((cat) => cat.name.toLowerCase().includes(q))
  }, [categoryList, query, requirementsByCategoryId])

  const addCategory = (categoryId: string) => {
    if (requirementsByCategoryId.has(categoryId)) return
    onChange([...requirements, { categoryId, quantity: 1, isOptional: false }])
  }

  const removeCategory = (categoryId: string) => {
    onChange(requirements.filter((r) => r.categoryId !== categoryId))
  }

  const updateCategory = (categoryId: string, updates: Partial<RequirementInput>) => {
    onChange(requirements.map((r) => (r.categoryId === categoryId ? { ...r, ...updates } : r)))
  }

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <div className="text-xs font-medium text-gray-700">Selected requirements</div>
          <div className="flex items-center gap-3">
            <div className="text-xs text-gray-500">{selectedRequirements.length} selected</div>
            {selectedRequirements.length > 0 && (
              <button
                type="button"
                onClick={() => onChange([])}
                className="text-xs text-gray-500 hover:text-gray-700"
              >
                Clear all
              </button>
            )}
          </div>
        </div>

        {selectedRequirements.length === 0 ? (
          <div className="text-sm text-gray-500 py-6 bg-gray-50 rounded-lg border border-dashed border-gray-300 text-center">
            No requirements selected yet
          </div>
        ) : (
          <div className="max-h-56 overflow-auto space-y-1 pr-1">
            {selectedRequirements.map((req) => {
              const cat = req.category
              const name = cat?.name || 'Unknown category'

              return (
                <div
                  key={req.categoryId}
                  className="flex flex-col sm:flex-row sm:items-center gap-2 px-2 py-1 rounded-lg border bg-primary-50 border-primary-200"
                >
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    <input
                      id={`selected-${req.categoryId}`}
                      type="checkbox"
                      checked
                      onChange={() => removeCategory(req.categoryId)}
                      className="h-4 w-4 text-primary-600 border-gray-300 rounded focus:ring-primary-500"
                      aria-label={`Remove ${name}`}
                    />
                    <label
                      htmlFor={`selected-${req.categoryId}`}
                      className="text-sm font-medium text-gray-800 truncate cursor-pointer"
                      title={name}
                    >
                      {name}
                    </label>
                    {cat && !cat.isActive && <span className="text-xs text-gray-400">(inactive)</span>}
                  </div>

                  <div className="flex items-center gap-3 sm:justify-end">
                    <input
                      type="number"
                      required
                      min="0.001"
                      step="0.001"
                      value={req.quantity}
                      onChange={(e) =>
                        updateCategory(req.categoryId, {
                          quantity: parseFloat(e.target.value) || 0,
                        })
                      }
                      className="input w-24"
                      placeholder="Qty"
                      aria-label={`Quantity for ${name}`}
                    />
                    <label className="flex items-center gap-1 text-sm whitespace-nowrap">
                      <input
                        type="checkbox"
                        checked={req.isOptional}
                        onChange={(e) => updateCategory(req.categoryId, { isOptional: e.target.checked })}
                        className="rounded border-gray-300"
                      />
                      Optional
                    </label>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      <div className="space-y-2">
        <div className="text-xs font-medium text-gray-700">Add requirements</div>

        <div className="relative">
          <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter categories to add..."
            className="w-full pl-9 pr-8 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              aria-label="Clear filter"
            >
              <XMarkIcon className="h-4 w-4" />
            </button>
          )}
        </div>

        {availableCategories.length === 0 ? (
          <div className="text-sm text-gray-500 text-center py-6 bg-gray-50 rounded-lg border border-dashed border-gray-300">
            {query.trim() ? (
              <>No categories match "{query.trim()}"</>
            ) : (
              <>All categories are already selected</>
            )}
          </div>
        ) : (
          <div className="max-h-72 overflow-auto space-y-1 pr-1">
            {availableCategories.map((cat) => (
              <div
                key={cat.id}
                className="flex items-center gap-2 p-2 rounded-lg border bg-gray-50 border-gray-200"
              >
                <input
                  id={`available-${cat.id}`}
                  type="checkbox"
                  checked={false}
                  onChange={(e) => e.target.checked && addCategory(cat.id)}
                  className="h-4 w-4 text-primary-600 border-gray-300 rounded focus:ring-primary-500"
                  aria-label={`Add ${cat.name}`}
                />
                <label
                  htmlFor={`available-${cat.id}`}
                  className="text-sm font-medium text-gray-800 truncate cursor-pointer flex-1"
                  title={cat.name}
                >
                  {cat.name}
                </label>
                {!cat.isActive && <span className="text-xs text-gray-400">(inactive)</span>}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
