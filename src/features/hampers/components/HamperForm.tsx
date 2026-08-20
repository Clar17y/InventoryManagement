import { useEffect, useMemo, useRef, useState } from 'react'
import { ChevronDownIcon, ChevronUpIcon, PencilIcon, TrashIcon, XMarkIcon } from '@heroicons/react/24/outline'
import type { FormEvent, RefObject } from 'react'
import type { Category, HamperVariant, HamperVariantCreateData, Product } from '../../../lib/api'
import ProductLookupField from '../../products/components/ProductLookupField'
import { emptyVariantForm } from '../constants'
import type { HamperFormData } from '../types'
import RequirementsChecklist from './RequirementsChecklist'

export default function HamperForm({
  formRef,
  handleSubmit,
  editingId,
  formData,
  setFormData,
  categoryList,
  showVariantForm,
  setShowVariantForm,
  editingVariantId,
  setEditingVariantId,
  variantFormData,
  setVariantFormData,
  variantLoading,
  editingVariants,
  handleSaveVariant,
  handleEditVariant,
  handleDeleteVariant,
  saving,
  handleCancel,
}: {
  formRef: RefObject<HTMLFormElement | null>
  handleSubmit: (e: FormEvent) => void
  editingId: string | null
  formData: HamperFormData
  setFormData: (data: HamperFormData) => void
  categoryList: Category[]
  showVariantForm: boolean
  setShowVariantForm: (value: boolean) => void
  editingVariantId: string | null
  setEditingVariantId: (value: string | null) => void
  variantFormData: HamperVariantCreateData
  setVariantFormData: (data: HamperVariantCreateData) => void
  variantLoading: boolean
  editingVariants: HamperVariant[]
  handleSaveVariant: () => void
  handleEditVariant: (variant: HamperVariant) => void
  handleDeleteVariant: (variantId: string) => void
  saving: boolean
  handleCancel: () => void
}) {
  const variantFormRef = useRef<HTMLDivElement>(null)
  const [selectedProducts, setSelectedProducts] = useState<Map<string, Pick<Product, 'id' | 'name'>>>(new Map())

  useEffect(() => {
    if (showVariantForm && editingVariantId) {
      setTimeout(() => {
        variantFormRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'start' })
      }, 0)
    }
  }, [showVariantForm, editingVariantId])

  useEffect(() => {
    if (!editingVariantId) {
      setSelectedProducts(new Map())
      return
    }

    const variant = editingVariants.find((item) => item.id === editingVariantId)
    setSelectedProducts(new Map(
      variant?.mappings.map((mapping) => [mapping.productId, mapping.product]) ?? [],
    ))
  }, [editingVariantId, editingVariants])

  // Group mappings by category for display
  const mappingsByCategory = useMemo(() => {
    const grouped = new Map<string, HamperVariantCreateData['mappings']>()
    for (const m of variantFormData.mappings) {
      const existing = grouped.get(m.categoryId) || []
      grouped.set(m.categoryId, [...existing, m].sort((a, b) => (a.priority ?? 1) - (b.priority ?? 1)))
    }
    return grouped
  }, [variantFormData.mappings])

  // Move a mapping up in priority (lower number = higher priority)
  const moveUp = (categoryId: string, productId: string) => {
    const catMappings = [...(mappingsByCategory.get(categoryId) || [])]
    const idx = catMappings.findIndex((m) => m.productId === productId)
    if (idx <= 0) return
    const current = catMappings[idx]
    const above = catMappings[idx - 1]
    if (!current || !above) return
    const updated = variantFormData.mappings.map((m) => {
      if (m.categoryId === categoryId && m.productId === productId)
        return { ...m, priority: above.priority ?? idx }
      if (m.categoryId === categoryId && m.productId === above.productId)
        return { ...m, priority: current.priority ?? idx + 1 }
      return m
    })
    setVariantFormData({ ...variantFormData, mappings: updated })
  }

  // Move a mapping down in priority
  const moveDown = (categoryId: string, productId: string) => {
    const catMappings = [...(mappingsByCategory.get(categoryId) || [])]
    const idx = catMappings.findIndex((m) => m.productId === productId)
    if (idx < 0 || idx >= catMappings.length - 1) return
    const current = catMappings[idx]
    const below = catMappings[idx + 1]
    if (!current || !below) return
    const updated = variantFormData.mappings.map((m) => {
      if (m.categoryId === categoryId && m.productId === productId)
        return { ...m, priority: below.priority ?? idx + 2 }
      if (m.categoryId === categoryId && m.productId === below.productId)
        return { ...m, priority: current.priority ?? idx + 1 }
      return m
    })
    setVariantFormData({ ...variantFormData, mappings: updated })
  }

  // Add an alternative product to a category
  const addAlternative = (categoryId: string, product: Product) => {
    const existing = mappingsByCategory.get(categoryId) || []
    if (existing.some((mapping) => mapping.productId === product.id)) return
    const newPriority = existing.length + 1
    setVariantFormData({
      ...variantFormData,
      mappings: [...variantFormData.mappings, { categoryId, productId: product.id, priority: newPriority }],
    })
    setSelectedProducts((current) => new Map(current).set(product.id, product))
  }

  const replaceAlternative = (categoryId: string, productId: string, product: Product) => {
    const duplicate = variantFormData.mappings.some(
      (mapping) => mapping.productId === product.id && mapping.productId !== productId,
    )
    if (duplicate) return

    setVariantFormData({
      ...variantFormData,
      mappings: variantFormData.mappings.map((mapping) =>
        mapping.categoryId === categoryId && mapping.productId === productId
          ? { ...mapping, productId: product.id }
          : mapping
      ),
    })
    setSelectedProducts((current) => {
      const next = new Map(current)
      next.delete(productId)
      next.set(product.id, product)
      return next
    })
  }

  // Remove an alternative and renormalize priorities
  const removeAlternative = (categoryId: string, productId: string) => {
    const remaining = variantFormData.mappings.filter(
      (m) => !(m.categoryId === categoryId && m.productId === productId)
    )
    // Renormalize priorities per category
    const byCat = new Map<string, typeof remaining>()
    for (const m of remaining) {
      const existing = byCat.get(m.categoryId) || []
      byCat.set(m.categoryId, [...existing, m])
    }
    const normalized: typeof remaining = []
    for (const [, catMappings] of byCat) {
      const sorted = [...catMappings].sort((a, b) => (a.priority ?? 1) - (b.priority ?? 1))
      sorted.forEach((m, i) => normalized.push({ ...m, priority: i + 1 }))
    }
    setVariantFormData({ ...variantFormData, mappings: normalized })
    setSelectedProducts((current) => {
      const next = new Map(current)
      next.delete(productId)
      return next
    })
  }

  return (
    <form ref={formRef} onSubmit={handleSubmit} className="card space-y-4">
      <h3 className="font-medium">{editingId ? 'Edit Hamper' : 'New Hamper'}</h3>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Name *</label>
          <input
            type="text"
            required
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            className="input"
            placeholder="e.g., Luxury Spa Hamper"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Selling Price (£) *</label>
          <input
            type="number"
            required
            min="0.01"
            step="0.01"
            value={formData.sellingPrice}
            onChange={(e) => setFormData({ ...formData, sellingPrice: e.target.value })}
            className="input"
            placeholder="29.99"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Etsy Listing ID</label>
          <input
            type="text"
            value={formData.etsyListingId}
            onChange={(e) => setFormData({ ...formData, etsyListingId: e.target.value })}
            className="input"
            placeholder="Optional - for Etsy sync"
          />
        </div>
        {!formData.hasVariants && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Indicative Qty</label>
            <input
              type="number"
              min="0"
              step="1"
              value={formData.indicativeQuantity}
              onChange={(e) => setFormData({ ...formData, indicativeQuantity: e.target.value })}
              className="input"
              placeholder="Optional - floor for Etsy stock"
            />
          </div>
        )}
      </div>

      <div className="flex items-center gap-3">
        <input
          type="checkbox"
          id="hasVariants"
          checked={formData.hasVariants}
          onChange={(e) => setFormData({ ...formData, hasVariants: e.target.checked })}
          className="h-4 w-4 text-primary-600 border-gray-300 rounded focus:ring-primary-500"
        />
        <label htmlFor="hasVariants" className="text-sm font-medium text-gray-700">
          Enable Variants
        </label>
        <span className="text-xs text-gray-500">
          (Track availability per product variant, e.g., for Etsy listings with multiple options)
        </span>
      </div>

      <label className="flex items-center gap-3">
        <input
          type="checkbox"
          checked={formData.etsyIsEnabled}
          onChange={(e) => setFormData({ ...formData, etsyIsEnabled: e.target.checked })}
          className="h-4 w-4 text-primary-600 border-gray-300 rounded focus:ring-primary-500"
        />
        <span className="text-sm font-medium text-gray-700">Enabled on Etsy</span>
      </label>

      <div>
        <div className="flex justify-between items-center mb-2">
          <label className="block text-sm font-medium text-gray-700">
            Requirements{editingId ? '' : ' *'}
          </label>
        </div>

        {categoryList.length === 0 ? (
          <p className="text-sm text-amber-600">Create categories first before adding hampers</p>
        ) : (
          <div className="space-y-2">
            {!editingId && formData.requirements.length === 0 && (
              <p className="text-sm text-amber-600">Select at least one requirement</p>
            )}
            <RequirementsChecklist
              categoryList={categoryList}
              requirements={formData.requirements}
              onChange={(requirements) => setFormData({ ...formData, requirements })}
            />
          </div>
        )}
      </div>

      {/* Variant Management Section (only in Edit mode and if variants enabled) */}
      {editingId && formData.hasVariants && (
        <div className="border-t border-gray-200 mt-6 pt-6 animate-fade-in">
          <div className="flex justify-between items-center mb-4">
            <h3 className="font-semibold text-gray-900">Manage Variants</h3>
            {!showVariantForm && (
              <button
                type="button"
                onClick={() => {
                  setVariantFormData(emptyVariantForm)
                  setShowVariantForm(true)
                }}
                className="btn-secondary text-sm py-1"
              >
                + Add Variant
              </button>
            )}
          </div>

          {/* Add Variant Form */}
          {showVariantForm && (
            <div ref={variantFormRef} className="bg-primary-50 p-4 rounded-lg mb-4 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Variant Name *</label>
                  <input
                    type="text"
                    value={variantFormData.name}
                    onChange={(e) => setVariantFormData({ ...variantFormData, name: e.target.value })}
                    className="input text-sm"
                    placeholder="e.g., Small, Blue, 500g"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Selling Price (£)</label>
                  <input
                    type="number"
                    min="0.01"
                    step="0.01"
                    value={variantFormData.sellingPrice ?? ''}
                    onChange={(e) => setVariantFormData({
                      ...variantFormData,
                      sellingPrice: e.target.value ? parseFloat(e.target.value) : null
                    })}
                    className="input text-sm"
                    placeholder="Leave blank = use hamper price"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Etsy SKU</label>
                  <input
                    type="text"
                    value={variantFormData.etsySku || ''}
                    onChange={(e) => setVariantFormData({ ...variantFormData, etsySku: e.target.value })}
                    className="input text-sm"
                    placeholder="e.g., LUX-SPA-SM"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Indicative Qty</label>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    value={variantFormData.indicativeQuantity ?? ''}
                    onChange={(e) => setVariantFormData({
                      ...variantFormData,
                      indicativeQuantity: e.target.value ? parseInt(e.target.value, 10) : null
                    })}
                    className="input text-sm"
                    placeholder="Floor for Etsy stock"
                  />
                </div>
                <label className="flex items-center gap-2 pt-6 text-xs font-medium text-gray-700">
                  <input
                    type="checkbox"
                    checked={variantFormData.etsyIsEnabled ?? true}
                    onChange={(e) => setVariantFormData({ ...variantFormData, etsyIsEnabled: e.target.checked })}
                    className="h-4 w-4 text-primary-600 border-gray-300 rounded focus:ring-primary-500"
                  />
                  Enabled on Etsy
                </label>
              </div>


              <div>
                <label className="block text-xs font-medium text-gray-700 mb-2">
                  Product Alternatives by Category
                </label>
                <p className="text-xs text-gray-500 mb-3">
                  Add alternative products per category. Priority 1 is tried first when allocating stock.
                </p>

                {/* Categories with their alternatives */}
                <div className="space-y-3">
                  {formData.requirements.map((req) => {
                    if (!req.categoryId) return null
                    const category = categoryList.find((c) => c.id === req.categoryId)
                    const catMappings = mappingsByCategory.get(req.categoryId) || []

                    return (
                      <div key={req.categoryId} className="bg-white p-3 rounded-lg border border-gray-200">
                        <div className="flex justify-between items-center mb-2">
                          <span className="text-sm font-medium text-gray-800">
                            {category?.name || 'Category'}{' '}
                            <span className="text-gray-400 font-normal">(need {req.quantity})</span>
                          </span>
                        </div>

                        {catMappings.length === 0 ? (
                          <div className="text-xs text-gray-400 italic mb-2">
                            No alternatives set - will use any product from category
                          </div>
                        ) : (
                          <div className="space-y-1 mb-2">
                            {catMappings.map((mapping, idx) => {
                              const isFirst = idx === 0
                              const isLast = idx === catMappings.length - 1

                              return (
                                <div
                                  key={mapping.productId}
                                  className="flex items-center gap-2 text-sm bg-gray-50 p-2 rounded"
                                >
                                  <span className="text-xs text-gray-400 w-4">{idx + 1}.</span>
                                  <div className="min-w-0 flex-1">
                                    <ProductLookupField
                                      value={selectedProducts.get(mapping.productId) ?? null}
                                      categoryId={req.categoryId}
                                      onChange={(product) => replaceAlternative(
                                        req.categoryId,
                                        mapping.productId,
                                        product,
                                      )}
                                      disabled={variantLoading}
                                    />
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() => moveUp(req.categoryId, mapping.productId)}
                                    disabled={isFirst}
                                    className={`p-0.5 ${isFirst ? 'text-gray-200' : 'text-gray-400 hover:text-primary-600'}`}
                                    title="Move up"
                                  >
                                    <ChevronUpIcon className="h-4 w-4" />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => moveDown(req.categoryId, mapping.productId)}
                                    disabled={isLast}
                                    className={`p-0.5 ${isLast ? 'text-gray-200' : 'text-gray-400 hover:text-primary-600'}`}
                                    title="Move down"
                                  >
                                    <ChevronDownIcon className="h-4 w-4" />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => removeAlternative(req.categoryId, mapping.productId)}
                                    className="p-0.5 text-gray-400 hover:text-red-600"
                                    title="Remove"
                                  >
                                    <XMarkIcon className="h-4 w-4" />
                                  </button>
                                </div>
                              )
                            })}
                          </div>
                        )}

                        <div className="mt-2">
                          <p className="mb-1 text-xs text-gray-500">Add alternative</p>
                          <ProductLookupField
                            value={null}
                            categoryId={req.categoryId}
                            onChange={(product) => addAlternative(req.categoryId, product)}
                            disabled={variantLoading}
                          />
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={handleSaveVariant}
                  disabled={variantLoading || !variantFormData.name}
                  className="btn-primary text-sm py-1"
                >
                  {variantLoading ? 'Saving...' : editingVariantId ? 'Update Variant' : 'Save Variant'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowVariantForm(false)
                    setEditingVariantId(null)
                    setVariantFormData(emptyVariantForm)
                  }}
                  className="btn-secondary text-sm py-1"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* Existing Variants List */}
          <div className="space-y-3">
            {variantLoading && !showVariantForm && <div className="text-center text-sm text-gray-500 py-4 italic">Loading variants...</div>}

            {!variantLoading && editingVariants.length === 0 && !showVariantForm && (
              <div className="text-center text-sm text-gray-500 py-4 bg-gray-50 rounded-lg border border-dashed border-gray-300">
                No variants defined yet. Click "Add Variant" to start.
              </div>
            )}

            {editingVariants.map((variant) => (
              <div key={variant.id} className="bg-white border border-gray-200 p-3 rounded-lg shadow-sm">
                <div className="flex justify-between items-start">
                  <div>
                    <div className="font-medium text-gray-900">{variant.name}</div>
                    {variant.etsyIsEnabled === false && <div className="text-xs text-gray-500">Etsy hidden</div>}
                    {variant.sellingPrice && <div className="text-xs text-green-600 font-medium">£{Number(variant.sellingPrice).toFixed(2)}</div>}
                    {variant.etsySku && <div className="text-xs text-gray-500 font-mono">SKU: {variant.etsySku}</div>}
                    {!!variant.indicativeQuantity && <div className="text-xs text-blue-600">Indicative: {variant.indicativeQuantity}</div>}
                  </div>

                  <div className="flex gap-1">
                    <button
                      type="button"
                      onClick={() => handleEditVariant(variant)}
                      className="p-1 text-gray-400 hover:text-primary-600"
                      title="Edit variant"
                    >
                      <PencilIcon className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteVariant(variant.id)}
                      className="p-1 text-gray-400 hover:text-red-600"
                      title="Delete variant"
                    >
                      <TrashIcon className="h-4 w-4" />
                    </button>
                  </div>
                </div>

                <div className="mt-2 space-y-1">
                  {variant.mappings && (() => {
                    // Group mappings by category and sort by priority
                    const grouped: Record<string, typeof variant.mappings> = {}
                    for (const m of variant.mappings) {
                      const key = m.category.name
                      if (!grouped[key]) grouped[key] = []
                      grouped[key].push(m)
                    }

                    return Object.entries(grouped).map(([catName, mappings]) => (
                      <div key={catName} className="flex justify-between items-center text-xs">
                        <span className="text-gray-500">{catName}:</span>
                        <span className="font-medium text-primary-700">
                          {mappings
                            .sort((a, b) => (a.priority ?? 1) - (b.priority ?? 1))
                            .map((m) => m.product?.name)
                            .join(' > ')}
                        </span>
                      </div>
                    ))
                  })()}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex gap-2 mt-8 py-4 border-t border-gray-100">
        <button
          type="submit"
          disabled={saving || (!editingId && (categoryList.length === 0 || formData.requirements.length === 0))}
          className="btn-primary"
        >
          {saving ? 'Saving...' : editingId ? 'Update Basic Info' : 'Create Hamper'}
        </button>
        <button type="button" onClick={handleCancel} className="btn-secondary">
          Cancel
        </button>
      </div>
    </form>
  )
}
