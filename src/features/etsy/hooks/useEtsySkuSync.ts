import { useState } from 'react'
import { etsy, type EtsyPendingSku } from '../../../lib/api'

export function useEtsySkuSync({
  setError,
}: {
  setError: React.Dispatch<React.SetStateAction<string | null>>
}) {
  const [pendingSkus, setPendingSkus] = useState<EtsyPendingSku[]>([])
  const [selectedSkuItems, setSelectedSkuItems] = useState<Set<string>>(new Set())
  const [pushingSkus, setPushingSkus] = useState(false)
  const [generatingSkus, setGeneratingSkus] = useState(false)
  const [skuPushResult, setSkuPushResult] = useState<{ updated: number; errors: number } | null>(null)
  const [skuGenerateResult, setSkuGenerateResult] = useState<{ generated: number } | null>(null)
  const [showOnlySkuDiff, setShowOnlySkuDiff] = useState(true)

  const loadPendingSkus = async (listingIds?: string[]) => {
    try {
      const data = await etsy.getPendingSkus(listingIds)
      if (listingIds && listingIds.length > 0) {
        setPendingSkus((prev) => {
          const updated = new Map(prev.map((s) => [s.variantId, s]))
          for (const sku of data.skus) {
            updated.set(sku.variantId, sku)
          }

          const refreshedListingSet = new Set(listingIds)
          return [...updated.values()].filter(
            (s) =>
              !refreshedListingSet.has(s.etsyListingId) || data.skus.some((d) => d.variantId === s.variantId)
          )
        })
      } else {
        setPendingSkus(data.skus)
      }
    } catch (err) {
      console.warn('Failed to load pending SKUs:', err)
      if (!listingIds) setPendingSkus([])
    }
  }

  const handleGenerateSkus = async () => {
    if (
      !confirm(
        'Generate SKUs for all variants without one? This will create SKUs like "PTSH-9096-BRN" based on hamper and variant names.'
      )
    ) {
      return
    }

    setGeneratingSkus(true)
    setError(null)
    setSkuGenerateResult(null)

    try {
      const result = await etsy.generateSkus()
      setSkuGenerateResult({ generated: result.generated })
      if (result.generated > 0) {
        await loadPendingSkus()
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate SKUs')
    } finally {
      setGeneratingSkus(false)
    }
  }

  const handlePushSkus = async () => {
    if (selectedSkuItems.size === 0) return

    const skusToPush = pendingSkus.filter((s) => s.needsSync && selectedSkuItems.has(s.variantId))
    if (skusToPush.length === 0) return

    const listingIds = [...new Set(skusToPush.map((s) => s.etsyListingId))]

    if (!confirm(`Push ${skusToPush.length} SKU(s) to Etsy? This will update SKUs on your Etsy listings.`)) {
      return
    }

    setPushingSkus(true)
    setError(null)
    setSkuPushResult(null)

    try {
      const result = await etsy.pushSkus(listingIds)
      setSkuPushResult({ updated: result.totalUpdated, errors: result.errors })
      if (result.success) {
        setSelectedSkuItems(new Set())
        await loadPendingSkus(listingIds)
      } else {
        setError(`Some SKUs failed to sync: ${result.errors} error(s)`)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to push SKUs')
    } finally {
      setPushingSkus(false)
    }
  }

  const toggleSkuItem = (variantId: string) => {
    const newSelected = new Set(selectedSkuItems)
    if (newSelected.has(variantId)) {
      newSelected.delete(variantId)
    } else {
      newSelected.add(variantId)
    }
    setSelectedSkuItems(newSelected)
  }

  const selectAllSkuDiff = () => {
    const newSelected = new Set<string>()
    for (const sku of pendingSkus) {
      if (sku.needsSync) {
        newSelected.add(sku.variantId)
      }
    }
    setSelectedSkuItems(newSelected)
  }

  const skuNeedsSyncCount = pendingSkus.filter((s) => s.needsSync).length
  const filteredSkus = showOnlySkuDiff ? pendingSkus.filter((s) => s.needsSync) : pendingSkus

  return {
    pendingSkus,
    filteredSkus,
    selectedSkuItems,
    pushingSkus,
    generatingSkus,
    skuPushResult,
    skuGenerateResult,
    showOnlySkuDiff,
    setShowOnlySkuDiff,
    skuNeedsSyncCount,
    loadPendingSkus,
    handleGenerateSkus,
    handlePushSkus,
    toggleSkuItem,
    selectAllSkuDiff,
    setPendingSkus,
  }
}

