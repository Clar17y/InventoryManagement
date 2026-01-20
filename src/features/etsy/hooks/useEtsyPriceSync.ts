import { useState } from 'react'
import { etsy, type EtsyPendingPriceUpdate } from '../../../lib/api'

export function useEtsyPriceSync({
  setError,
}: {
  setError: React.Dispatch<React.SetStateAction<string | null>>
}) {
  const [pendingPrices, setPendingPrices] = useState<EtsyPendingPriceUpdate[]>([])
  const [selectedPriceItems, setSelectedPriceItems] = useState<Set<string>>(new Set())
  const [pushingPrices, setPushingPrices] = useState(false)
  const [pricePushResult, setPricePushResult] = useState<{ updated: number; errors: number } | null>(null)
  const [showOnlyPriceDiff, setShowOnlyPriceDiff] = useState(true)

  const loadPendingPrices = async (listingIds?: string[]) => {
    try {
      const data = await etsy.getPendingPriceUpdates(listingIds)
      if (listingIds && listingIds.length > 0) {
        setPendingPrices((prev) => {
          const updated = new Map(prev.map((p) => [p.variantId, p]))
          for (const price of data.updates) {
            updated.set(price.variantId, price)
          }

          const refreshedListingSet = new Set(listingIds)
          return [...updated.values()].filter(
            (p) =>
              !refreshedListingSet.has(p.etsyListingId) ||
              data.updates.some((d) => d.variantId === p.variantId)
          )
        })
      } else {
        setPendingPrices(data.updates)
      }
    } catch (err) {
      console.warn('Failed to load pending prices:', err)
      if (!listingIds) setPendingPrices([])
    }
  }

  const togglePriceItem = (variantId: string) => {
    const newSelected = new Set(selectedPriceItems)
    if (newSelected.has(variantId)) {
      newSelected.delete(variantId)
    } else {
      newSelected.add(variantId)
    }
    setSelectedPriceItems(newSelected)
  }

  const selectAllPriceDiff = () => {
    const newSelected = new Set<string>()
    for (const item of pendingPrices) {
      if (item.needsSync) {
        newSelected.add(item.variantId)
      }
    }
    setSelectedPriceItems(newSelected)
  }

  const handleSyncPrices = async () => {
    if (selectedPriceItems.size === 0) return

    const pricesToPush = pendingPrices
      .filter((p) => p.needsSync && selectedPriceItems.has(p.variantId) && p.localPrice !== null)
      .map((p) => ({
        etsyListingId: p.etsyListingId,
        etsySku: p.etsySku,
        etsyProductId: p.etsyProductId,
        price: p.localPrice!,
      }))

    if (pricesToPush.length === 0) return

    const listingIds = [...new Set(pricesToPush.map((p) => p.etsyListingId))]

    if (!confirm(`Update ${pricesToPush.length} variant price(s) on Etsy?`)) {
      return
    }

    setPushingPrices(true)
    setError(null)
    setPricePushResult(null)

    try {
      const result = await etsy.pushPrices(pricesToPush)
      setPricePushResult({ updated: result.updated, errors: result.errors })
      if (result.success) {
        setSelectedPriceItems(new Set())
        await loadPendingPrices(listingIds)
      } else {
        setError(`Some prices failed to sync: ${result.errors} error(s)`)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to push prices')
    } finally {
      setPushingPrices(false)
    }
  }

  const priceNeedsSyncCount = pendingPrices.filter((p) => p.needsSync).length
  const filteredPrices = showOnlyPriceDiff ? pendingPrices.filter((p) => p.needsSync) : pendingPrices

  return {
    pendingPrices,
    filteredPrices,
    selectedPriceItems,
    pushingPrices,
    pricePushResult,
    showOnlyPriceDiff,
    setShowOnlyPriceDiff,
    priceNeedsSyncCount,
    loadPendingPrices,
    handleSyncPrices,
    togglePriceItem,
    selectAllPriceDiff,
    setPendingPrices,
  }
}

