import { PencilIcon, TrashIcon, XMarkIcon } from '@heroicons/react/24/outline'
import type { FormEvent, RefObject } from 'react'
import type { Category, HamperVariant, HamperVariantCreateData, Product } from '../../../lib/api'
import type { HamperFormData, RequirementInput } from '../types'

export default function HamperForm({
  formRef,
  handleSubmit,
  editingId,
  formData,
  setFormData,
  categoryList,
  productList,
  addRequirement,
  removeRequirement,
  updateRequirement,
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
  productList: Product[]
  addRequirement: () => void
  removeRequirement: (index: number) => void
  updateRequirement: (index: number, updates: Partial<RequirementInput>) => void
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

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Etsy Listing ID</label>
        <input
          type="text"
          value={formData.etsyListingId}
          onChange={(e) => setFormData({ ...formData, etsyListingId: e.target.value })}
          className="input"
          placeholder="Optional - for future Etsy sync"
        />
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

      <div>
        <div className="flex justify-between items-center mb-2">
          <label className="block text-sm font-medium text-gray-700">Requirements *</label>
          <button type="button" onClick={addRequirement} className="text-sm text-primary-600 hover:text-primary-700">
            + Add Requirement
          </button>
        </div>

        {categoryList.length === 0 ? (
          <p className="text-sm text-amber-600">Create categories first before adding hampers</p>
        ) : (
          <div className="space-y-2">
            {formData.requirements.map((req, index) => (
              <div key={index} className="flex gap-2 items-center bg-gray-50 p-2 rounded-lg">
                <select
                  required
                  value={req.categoryId}
                  onChange={(e) => updateRequirement(index, { categoryId: e.target.value })}
                  className="input flex-1"
                >
                  <option value="">Select category...</option>
                  {categoryList.map((cat) => (
                    <option key={cat.id} value={cat.id}>
                      {cat.name}
                    </option>
                  ))}
                </select>
                <input
                  type="number"
                  required
                  min="0.001"
                  step="0.001"
                  value={req.quantity}
                  onChange={(e) => updateRequirement(index, { quantity: parseFloat(e.target.value) || 0 })}
                  className="input w-20"
                  placeholder="Qty"
                />
                <label className="flex items-center gap-1 text-sm whitespace-nowrap">
                  <input
                    type="checkbox"
                    checked={req.isOptional}
                    onChange={(e) => updateRequirement(index, { isOptional: e.target.checked })}
                    className="rounded border-gray-300"
                  />
                  Optional
                </label>
                {formData.requirements.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeRequirement(index)}
                    className="p-1 text-gray-400 hover:text-red-600"
                  >
                    <XMarkIcon className="h-5 w-5" />
                  </button>
                )}
              </div>
            ))}
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
                  // Start with empty mappings - user adds what they need
                  setVariantFormData({ name: '', etsySku: '', mappings: [] })
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
            <div className="bg-primary-50 p-4 rounded-lg mb-4 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
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
              </div>


              <div>
                <div className="flex justify-between items-center mb-2">
                  <label className="block text-xs font-medium text-gray-700">
                    Product Mappings {variantFormData.mappings.length === 0 && <span className="text-red-500">*</span>}
                  </label>
                  <select
                    value=""
                    onChange={(e) => {
                      if (e.target.value) {
                        // Add a new mapping for this category
                        const alreadyMapped = variantFormData.mappings.some(m => m.categoryId === e.target.value)
                        if (!alreadyMapped) {
                          setVariantFormData({
                            ...variantFormData,
                            mappings: [...variantFormData.mappings, { categoryId: e.target.value, productId: '' }]
                          })
                        }
                      }
                    }}
                    className="input text-xs py-1 w-auto"
                  >
                    <option value="">+ Add category mapping...</option>
                    {formData.requirements
                      .filter(r => r.categoryId && !variantFormData.mappings.some(m => m.categoryId === r.categoryId))
                      .map(r => {
                        const cat = categoryList.find(c => c.id === r.categoryId)
                        return <option key={r.categoryId} value={r.categoryId}>{cat?.name || 'Category'}</option>
                      })}
                  </select>
                </div>

                {variantFormData.mappings.length === 0 ? (
                  <div className="text-xs text-gray-500 italic py-2 text-center border border-dashed border-gray-300 rounded-lg">
                    Add at least one category mapping to define what makes this variant unique.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {variantFormData.mappings.map((mapping, idx) => {
                      const category = categoryList.find(c => c.id === mapping.categoryId)
                      const categoryProds = productList.filter(p => p.categoryId === mapping.categoryId)

                      return (
                        <div key={idx} className="flex items-center gap-2 bg-white p-2 rounded border border-gray-200">
                          <div className="text-xs font-medium text-gray-600 w-28 truncate" title={category?.name}>
                            {category?.name || 'Category'}
                          </div>
                          <select
                            value={mapping.productId}
                            onChange={(e) => {
                              const newMappings = [...variantFormData.mappings]
                              newMappings[idx] = { ...mapping, productId: e.target.value }
                              setVariantFormData({ ...variantFormData, mappings: newMappings })
                            }}
                            className="input text-sm flex-1"
                          >
                            <option value="">Select product...</option>
                            {categoryProds.map(p => (
                              <option key={p.id} value={p.id}>{p.name}</option>
                            ))}
                          </select>
                          <button
                            type="button"
                            onClick={() => {
                              setVariantFormData({
                                ...variantFormData,
                                mappings: variantFormData.mappings.filter((_, i) => i !== idx)
                              })
                            }}
                            className="p-1 text-gray-400 hover:text-red-600"
                            title="Remove mapping"
                          >
                            <XMarkIcon className="h-4 w-4" />
                          </button>
                        </div>
                      )
                    })}
                  </div>
                )}
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
                    setVariantFormData({ name: '', mappings: [] })
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
                    {variant.sellingPrice && <div className="text-xs text-green-600 font-medium">£{Number(variant.sellingPrice).toFixed(2)}</div>}
                    {variant.etsySku && <div className="text-xs text-gray-500 font-mono">SKU: {variant.etsySku}</div>}
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
                  {variant.mappings?.map((m, idx) => (
                    <div key={idx} className="flex justify-between items-center text-xs">
                      <span className="text-gray-500">{m.category.name}:</span>
                      <span className="font-medium text-primary-700">{m.product?.name}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex gap-2 mt-8 py-4 border-t border-gray-100">
        <button type="submit" disabled={saving || categoryList.length === 0} className="btn-primary">
          {saving ? 'Saving...' : editingId ? 'Update Basic Info' : 'Create Hamper'}
        </button>
        <button type="button" onClick={handleCancel} className="btn-secondary">
          Cancel
        </button>
      </div>
    </form>
  )
}
