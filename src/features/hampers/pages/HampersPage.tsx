import { useEffect, useMemo, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import {
  categories,
  hamperVariants,
  hampers,
  products,
  type Category,
  type Hamper,
  type HamperDetail,
  type HamperVariant,
  type HamperVariantCreateData,
  type Product,
} from '../../../lib/api'
import { useDebounce } from '../../../hooks/useDebounce'
import HamperForm from '../components/HamperForm'
import HampersHeader from '../components/HampersHeader'
import HampersListView from '../components/HampersListView'
import { DEFAULT_HAMPERS_SORT, emptyHamperForm, emptyVariantForm } from '../constants'
import type { HamperFormData, HamperSortOption } from '../types'
import { isEtsyEnabled } from '../utils'

export default function Hampers() {
  const formRef = useRef<HTMLFormElement | null>(null)
  const [hamperList, setHamperList] = useState<Hamper[]>([])
  const [categoryList, setCategoryList] = useState<Category[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [formData, setFormData] = useState<HamperFormData>(emptyHamperForm)
  const [saving, setSaving] = useState(false)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [expandedDetail, setExpandedDetail] = useState<HamperDetail | null>(null)
  const [editingVariants, setEditingVariants] = useState<HamperVariant[]>([])
  const [productList, setProductList] = useState<Product[]>([])
  const [variantLoading, setVariantLoading] = useState(false)
  const [showVariantForm, setShowVariantForm] = useState(false)
  const [editingVariantId, setEditingVariantId] = useState<string | null>(null)
  const [variantFormData, setVariantFormData] = useState<HamperVariantCreateData>(emptyVariantForm)
  const [sortBy, setSortBy] = useState<HamperSortOption>(
    () => (localStorage.getItem('hampers-sort') as HamperSortOption) || DEFAULT_HAMPERS_SORT
  )
  const [showEtsyPanel, setShowEtsyPanel] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [hideEtsyHidden, setHideEtsyHidden] = useState(
    () => localStorage.getItem('hampers-hide-etsy-hidden') !== 'false'
  )
  const debouncedSearch = useDebounce(searchQuery, 300)

  const loadData = async () => {
    try {
      setLoading(true)
      const [hampersData, catsData, prodsData] = await Promise.all([
        hampers.list(),
        categories.list(),
        products.list(),
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
    void loadData()
  }, [])

  useEffect(() => {
    localStorage.setItem('hampers-sort', sortBy)
  }, [sortBy])

  useEffect(() => {
    localStorage.setItem('hampers-hide-etsy-hidden', String(hideEtsyHidden))
  }, [hideEtsyHidden])

  useEffect(() => {
    if (!showForm) return
    formRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'start' })
  }, [showForm, editingId])

  const sortedHampers = useMemo(() => {
    let filtered = hideEtsyHidden
      ? hamperList
          .filter((hamper) => isEtsyEnabled(hamper.etsyIsEnabled))
          .map((hamper) => {
            if (!hamper.hasVariants || !hamper.variantAvailability) return hamper
            return {
              ...hamper,
              variantAvailability: hamper.variantAvailability.filter((variant) =>
                isEtsyEnabled(variant.etsyIsEnabled)
              ),
            }
          })
          .filter((hamper) =>
            !hamper.hasVariants ||
            !hamper.variantAvailability ||
            hamper.variantAvailability.length > 0
          )
      : hamperList

    if (debouncedSearch.trim()) {
      const query = debouncedSearch.toLowerCase()
      filtered = filtered.filter((h) => h.name.toLowerCase().includes(query))
    }

    const sorted = [...filtered]
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
  }, [hamperList, sortBy, debouncedSearch, hideEtsyHidden])

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

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setError(null)

    try {
      const requirements = Array.from(
        new Map(
          formData.requirements
            .filter((r) => r.categoryId)
            .map((r) => [
              r.categoryId,
              { categoryId: r.categoryId, quantity: r.quantity, isOptional: r.isOptional },
            ])
        ).values()
      )

      if (!editingId && requirements.length === 0) {
        setError('Please select at least one requirement')
        return
      }

      const data = {
        name: formData.name,
        sellingPrice: parseFloat(formData.sellingPrice),
        etsyListingId: formData.etsyListingId || undefined,
        etsyIsEnabled: formData.etsyIsEnabled,
        indicativeQuantity: formData.hasVariants ? undefined : (formData.indicativeQuantity ? parseInt(formData.indicativeQuantity, 10) : null),
        hasVariants: formData.hasVariants,
        requirements,
      }

      if (editingId) {
        await hampers.update(editingId, data)
      } else {
        await hampers.create(data as Parameters<typeof hampers.create>[0])
      }

      setShowForm(false)
      setEditingId(null)
      setFormData(emptyHamperForm)
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
      etsyIsEnabled: isEtsyEnabled(hamper.etsyIsEnabled),
      indicativeQuantity: hamper.indicativeQuantity ? String(hamper.indicativeQuantity) : '',
      hasVariants: hamper.hasVariants || false,
      requirements:
        hamper.requirements.length > 0
          ? hamper.requirements.map((r) => ({
              categoryId: r.categoryId,
              quantity: Number(r.quantity),
              isOptional: r.isOptional,
            }))
          : [],
    })
    setEditingId(hamper.id)
    setShowForm(true)

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
    setFormData(emptyHamperForm)
    setEditingVariants([])
    setShowVariantForm(false)
    setEditingVariantId(null)
    setVariantFormData(emptyVariantForm)
    setError(null)
  }

  const handleSaveVariant = async () => {
    if (!editingId || !variantFormData.name) return

    const validMappings = variantFormData.mappings.filter((m) => m.productId)

    setVariantLoading(true)
    try {
      if (editingVariantId) {
        await hamperVariants.update(editingId, editingVariantId, { ...variantFormData, mappings: validMappings })
      } else {
        await hamperVariants.create(editingId, { ...variantFormData, mappings: validMappings })
      }
      const detail = await hampers.get(editingId)
      setEditingVariants(detail.variants || [])
      setShowVariantForm(false)
      setEditingVariantId(null)
      setVariantFormData(emptyVariantForm)
      await loadData()
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
      etsyIsEnabled: isEtsyEnabled(variant.etsyIsEnabled),
      indicativeQuantity: variant.indicativeQuantity ?? null,
      mappings: variant.mappings?.map((m) => ({
        categoryId: m.categoryId,
        productId: m.productId,
        priority: m.priority ?? 1,
      })) || [],
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
      await loadData()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete variant')
    } finally {
      setVariantLoading(false)
    }
  }

  if (loading && hamperList.length === 0) {
    return <div className="text-center py-8 text-gray-500">Loading...</div>
  }

  return (
    <div className="space-y-4">
      <HampersHeader
        showForm={showForm}
        setShowForm={setShowForm}
        showEtsyPanel={showEtsyPanel}
        setShowEtsyPanel={setShowEtsyPanel}
        onImportComplete={loadData}
      />

      {error && <div className="alert-danger">{error}</div>}

      {showForm ? (
        <HamperForm
          formRef={formRef}
          handleSubmit={handleSubmit}
          editingId={editingId}
          formData={formData}
          setFormData={setFormData}
          categoryList={categoryList}
          productList={productList}
          showVariantForm={showVariantForm}
          setShowVariantForm={setShowVariantForm}
          editingVariantId={editingVariantId}
          setEditingVariantId={setEditingVariantId}
          variantFormData={variantFormData}
          setVariantFormData={setVariantFormData}
          variantLoading={variantLoading}
          editingVariants={editingVariants}
          handleSaveVariant={handleSaveVariant}
          handleEditVariant={handleEditVariant}
          handleDeleteVariant={handleDeleteVariant}
          saving={saving}
          handleCancel={handleCancel}
        />
      ) : (
        <HampersListView
          sortedHampers={sortedHampers}
          debouncedSearch={debouncedSearch}
          searchQuery={searchQuery}
          setSearchQuery={setSearchQuery}
          hideEtsyHidden={hideEtsyHidden}
          setHideEtsyHidden={setHideEtsyHidden}
          sortBy={sortBy}
          setSortBy={setSortBy}
          expandedId={expandedId}
          expandedDetail={expandedDetail}
          handleExpand={handleExpand}
          handleEdit={handleEdit}
          handleDelete={handleDelete}
        />
      )}
    </div>
  )
}
