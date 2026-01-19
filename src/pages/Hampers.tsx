import { useState, useEffect, useMemo, useRef } from 'react'
import {
  PlusIcon,
  PencilIcon,
  TrashIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  XMarkIcon,
  ArrowPathRoundedSquareIcon,
} from '@heroicons/react/24/outline'
import { hampers, categories, products, hamperVariants, Hamper, HamperDetail, Category, HamperVariantAvailability, Product, HamperVariant, HamperVariantCreateData } from '../lib/api'
import { formatCurrency } from '../lib/formatting'
import EtsySyncPanel from '../components/EtsySyncPanel'

type HamperSortOption =
  | 'canmake-desc' | 'canmake-asc'
  | 'name-asc' | 'name-desc'
  | 'price-asc' | 'price-desc'
  | 'reqs-asc' | 'reqs-desc'
  | 'date-desc' | 'date-asc'

const HAMPER_SORT_OPTIONS: { value: HamperSortOption; label: string }[] = [
  { value: 'canmake-desc', label: 'Can Make (high→low)' },
  { value: 'canmake-asc', label: 'Can Make (low→high)' },
  { value: 'name-asc', label: 'Name (A→Z)' },
  { value: 'name-desc', label: 'Name (Z→A)' },
  { value: 'price-asc', label: 'Price (low→high)' },
  { value: 'price-desc', label: 'Price (high→low)' },
  { value: 'reqs-asc', label: 'Fewest requirements' },
  { value: 'reqs-desc', label: 'Most requirements' },
  { value: 'date-desc', label: 'Newest first' },
  { value: 'date-asc', label: 'Oldest first' },
]

interface RequirementInput {
  categoryId: string
  quantity: number
  isOptional: boolean
}

interface HamperFormData {
  name: string
  sellingPrice: string
  etsyListingId: string
  hasVariants: boolean
  requirements: RequirementInput[]
}

const emptyForm: HamperFormData = {
  name: '',
  sellingPrice: '',
  etsyListingId: '',
  hasVariants: false,
  requirements: [{ categoryId: '', quantity: 1, isOptional: false }],
}

function getAvailabilityColor(canMake: number): string {
  if (canMake >= 5) return 'bg-green-100 text-green-800'
  if (canMake >= 1) return 'bg-amber-100 text-amber-800'
  return 'bg-red-100 text-red-800'
}

export default function Hampers() {
  const formRef = useRef<HTMLFormElement | null>(null)
  const [hamperList, setHamperList] = useState<Hamper[]>([])
  const [categoryList, setCategoryList] = useState<Category[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [formData, setFormData] = useState<HamperFormData>(emptyForm)
  const [saving, setSaving] = useState(false)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [expandedDetail, setExpandedDetail] = useState<HamperDetail | null>(null)
  const [editingVariants, setEditingVariants] = useState<HamperVariant[]>([])
  const [productList, setProductList] = useState<Product[]>([])
  const [variantLoading, setVariantLoading] = useState(false)
  const [showVariantForm, setShowVariantForm] = useState(false)
  const [editingVariantId, setEditingVariantId] = useState<string | null>(null)
  const [variantFormData, setVariantFormData] = useState<HamperVariantCreateData>({ name: '', mappings: [] })
  const [sortBy, setSortBy] = useState<HamperSortOption>(
    () => (localStorage.getItem('hampers-sort') as HamperSortOption) || 'canmake-desc'
  )
  const [showEtsyPanel, setShowEtsyPanel] = useState(false)

  const loadData = async () => {
    try {
      setLoading(true)
      const [hampersData, catsData, prodsData] = await Promise.all([
        hampers.list(),
        categories.list(),
        products.list()
      ])
      setHamperList(hampersData)
      setCategoryList(catsData)
      setProductList(prodsData)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load data')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [])

  useEffect(() => {
    localStorage.setItem('hampers-sort', sortBy)
  }, [sortBy])

  useEffect(() => {
    if (!showForm) return
    formRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'start' })
  }, [showForm, editingId])

  // Sort hampers based on selected option
  const sortedHampers = useMemo(() => {
    const sorted = [...hamperList]
    switch (sortBy) {
      case 'canmake-desc':
        sorted.sort((a, b) => b.canMake - a.canMake)
        break
      case 'canmake-asc':
        sorted.sort((a, b) => a.canMake - b.canMake)
        break
      case 'name-asc':
        sorted.sort((a, b) => a.name.localeCompare(b.name))
        break
      case 'name-desc':
        sorted.sort((a, b) => b.name.localeCompare(a.name))
        break
      case 'price-asc':
        sorted.sort((a, b) => Number(a.sellingPrice) - Number(b.sellingPrice))
        break
      case 'price-desc':
        sorted.sort((a, b) => Number(b.sellingPrice) - Number(a.sellingPrice))
        break
      case 'reqs-asc':
        sorted.sort((a, b) => a.requirements.length - b.requirements.length)
        break
      case 'reqs-desc':
        sorted.sort((a, b) => b.requirements.length - a.requirements.length)
        break
      case 'date-desc':
        sorted.sort((a, b) => new Date(b.createdAt ?? 0).getTime() - new Date(a.createdAt ?? 0).getTime())
        break
      case 'date-asc':
        sorted.sort((a, b) => new Date(a.createdAt ?? 0).getTime() - new Date(b.createdAt ?? 0).getTime())
        break
    }
    return sorted
  }, [hamperList, sortBy])

  const handleExpand = async (id: string) => {
    if (expandedId === id) {
      setExpandedId(null)
      setExpandedDetail(null)
      return
    }
    try {
      const detail = await hampers.get(id)
      setExpandedDetail(detail)
      setExpandedId(id)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load details')
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setError(null)

    try {
      const data = {
        name: formData.name,
        sellingPrice: parseFloat(formData.sellingPrice),
        etsyListingId: formData.etsyListingId || undefined,
        hasVariants: formData.hasVariants,
        requirements: formData.requirements
          .filter((r) => r.categoryId)
          .map((r) => ({
            categoryId: r.categoryId,
            quantity: r.quantity,
            isOptional: r.isOptional,
          })),
      }

      if (editingId) {
        await hampers.update(editingId, data)
      } else {
        await hampers.create(data)
      }
      setShowForm(false)
      setEditingId(null)
      setFormData(emptyForm)
      await loadData()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save hamper')
    } finally {
      setSaving(false)
    }
  }

  const handleEdit = async (hamper: Hamper) => {
    setFormData({
      name: hamper.name,
      sellingPrice: String(hamper.sellingPrice),
      etsyListingId: hamper.etsyListingId || '',
      hasVariants: hamper.hasVariants || false,
      requirements: hamper.requirements.length > 0
        ? hamper.requirements.map((r) => ({
          categoryId: r.categoryId,
          quantity: Number(r.quantity),
          isOptional: r.isOptional,
        }))
        : emptyForm.requirements,
    })
    setEditingId(hamper.id)
    setShowForm(true)

    // Load variants if hamper has them
    if (hamper.hasVariants) {
      setVariantLoading(true)
      try {
        const detail = await hampers.get(hamper.id)
        setEditingVariants(detail.variants || [])
      } catch (err) {
        console.error('Failed to load variants:', err)
      } finally {
        setVariantLoading(false)
      }
    } else {
      setEditingVariants([])
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this hamper?')) return
    try {
      await hampers.delete(id)
      await loadData()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete hamper')
    }
  }

  const handleCancel = () => {
    setShowForm(false)
    setEditingId(null)
    setFormData(emptyForm)
    setEditingVariants([])
    setShowVariantForm(false)
    setEditingVariantId(null)
    setVariantFormData({ name: '', mappings: [] })
    setError(null)
  }

  const handleSaveVariant = async () => {
    if (!editingId || !variantFormData.name) return

    // Filter to only include mappings where a product was selected
    const validMappings = variantFormData.mappings.filter(m => m.productId)
    if (validMappings.length === 0) {
      setError('Please add at least one product mapping')
      return
    }

    setVariantLoading(true)
    try {
      if (editingVariantId) {
        // Update existing variant
        await hamperVariants.update(editingId, editingVariantId, { ...variantFormData, mappings: validMappings })
      } else {
        // Create new variant
        await hamperVariants.create(editingId, { ...variantFormData, mappings: validMappings })
      }
      const detail = await hampers.get(editingId)
      setEditingVariants(detail.variants || [])
      setShowVariantForm(false)
      setEditingVariantId(null)
      setVariantFormData({ name: '', mappings: [] })
      await loadData() // Refresh availability in list
    } catch (err) {
      setError(err instanceof Error ? err.message : `Failed to ${editingVariantId ? 'update' : 'add'} variant`)
    } finally {
      setVariantLoading(false)
    }
  }

  const handleEditVariant = (variant: HamperVariant) => {
    setEditingVariantId(variant.id)
    setVariantFormData({
      name: variant.name,
      sellingPrice: variant.sellingPrice ?? null,
      etsySku: variant.etsySku || '',
      mappings: variant.mappings?.map(m => ({ categoryId: m.categoryId, productId: m.productId })) || []
    })
    setShowVariantForm(true)
  }


  const handleDeleteVariant = async (variantId: string) => {
    if (!editingId || !confirm('Delete this variant?')) return
    setVariantLoading(true)
    try {
      await hamperVariants.delete(editingId, variantId)
      const detail = await hampers.get(editingId)
      setEditingVariants(detail.variants || [])
      await loadData() // Refresh availability in list
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete variant')
    } finally {
      setVariantLoading(false)
    }
  }

  const addRequirement = () => {
    setFormData({
      ...formData,
      requirements: [...formData.requirements, { categoryId: '', quantity: 1, isOptional: false }],
    })
  }

  const removeRequirement = (index: number) => {
    if (formData.requirements.length <= 1) return
    setFormData({
      ...formData,
      requirements: formData.requirements.filter((_, i) => i !== index),
    })
  }

  const updateRequirement = (index: number, updates: Partial<RequirementInput>) => {
    setFormData({
      ...formData,
      requirements: formData.requirements.map((r, i) => (i === index ? { ...r, ...updates } : r)),
    })
  }

  if (loading && hamperList.length === 0) {
    return <div className="text-center py-8 text-gray-500">Loading...</div>
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-semibold">Hampers</h2>
        <div className="flex gap-2">
          {!showForm && (
            <>
              <button
                onClick={() => setShowEtsyPanel(true)}
                className="btn-secondary flex items-center gap-1"
                title="Sync with Etsy"
              >
                <ArrowPathRoundedSquareIcon className="h-5 w-5" />
                Etsy Sync
              </button>
              <button onClick={() => setShowForm(true)} className="btn-primary flex items-center gap-1">
                <PlusIcon className="h-5 w-5" />
                New Hamper
              </button>
            </>
          )}
        </div>
      </div>

      {/* Etsy Sync Panel */}
      <EtsySyncPanel
        isOpen={showEtsyPanel}
        onClose={() => setShowEtsyPanel(false)}
        onImportComplete={loadData}
      />

      {/* Sort Controls */}
      {!showForm && (
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-500">Sort:</span>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as HamperSortOption)}
            className="px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 flex-1 max-w-xs"
          >
            {HAMPER_SORT_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
      )}

      {error && <div className="bg-red-50 text-red-700 p-3 rounded-lg text-sm">{error}</div>}

      {showForm && (
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
      )}

      {sortedHampers.length === 0 ? (
        <div className="card text-gray-500 text-center py-12">
          <p className="mb-4">No hampers defined yet</p>
          <p className="text-sm">Create your first hamper to start tracking availability</p>
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
                  <div className="font-medium">{hamper.name}</div>
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
                  <div className="text-sm text-gray-500">
                    {formatCurrency(hamper.sellingPrice)} • {hamper.requirements.length} requirements
                  </div>
                  <div className="flex items-center gap-2">
                    {!hamper.hasVariants && (
                      <span className={`px-2.5 py-1 rounded-full text-sm font-medium ${getAvailabilityColor(hamper.canMake)}`}>
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
                          <div
                            key={v.variantId}
                            className={`p-2 rounded-lg text-center ${getAvailabilityColor(v.canMake)}`}
                          >
                            <div className="font-medium text-sm">{v.name}</div>
                            <div className="text-lg font-bold">{v.canMake}</div>
                            {v.etsySku && (
                              <div className="text-xs opacity-75 font-mono">{v.etsySku}</div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )
      }
    </div >
  )
}
