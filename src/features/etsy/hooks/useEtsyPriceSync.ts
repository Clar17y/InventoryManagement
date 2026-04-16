import { useState } from 'react'
import { etsy, type EtsyPendingPriceUpdate, type EtsyPricePullResult } from '../../../lib/api'

export function useEtsyPriceSync({
  setError,
}: {
  setError: React.Dispatch<React.SetStateAction<string | null>>
}) {
  const [pendingPrices, setPendingPrices] = useState<EtsyPendingPriceUpdate[]>([])
  const [selectedPriceItems, setSelectedPriceItems] = useState<Set<string>>(new Set())
  const [pushingPrices, setPushingPrices] = useState(false)
  const [pullingPrices, setPullingPrices] = useState(false)
  const [pricePushResult, setPricePushResult] = useState<{ updated: number; errors: number } | null>(null)
  const [pricePullResult, setPricePullResult] = useState<EtsyPricePullResult | null>(null)
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

  const handlePushPrices = async () => {
    if (selectedPriceItems.size === 0) return

    const selectedPendingPrices = pendingPrices.filter(
      (p) => p.needsSync && selectedPriceItems.has(p.variantId)
    )

    const pricesToPush = selectedPendingPrices
      .filter((p) => p.localPrice !== null)
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
    setPricePullResult(null)

    try {
      const result = await etsy.pushPrices(pricesToPush)
      setPricePushResult({ updated: result.updated, errors: result.errors })
      if (result.updated > 0) {
        const successfulListingIds = new Set(
          result.results.filter((item) => item.success).map((item) => item.listingId)
        )
        setSelectedPriceItems((prev) => {
          if (successfulListingIds.size === 0) return prev
          return new Set(
            [...prev].filter((variantId) => {
              const selectedPrice = selectedPendingPrices.find((price) => price.variantId === variantId)
              return !selectedPrice || !successfulListingIds.has(selectedPrice.etsyListingId)
            })
          )
        })
        await loadPendingPrices(listingIds)
      }
      if (!result.success) {
        setError(`Some prices failed to sync: ${result.errors} error(s)`)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to push prices')
    } finally {
      setPushingPrices(false)
    }
  }

  const handlePullPrices = async () => {
    if (selectedPriceItems.size === 0) return

    const selectedPendingPrices = pendingPrices.filter(
      (p) => p.needsSync && selectedPriceItems.has(p.variantId)
    )

    const pricesToPull = selectedPendingPrices.map((p) => ({
        hamperId: p.hamperId,
        variantId: p.variantId,
        etsyPrice: p.etsyPrice,
      }))

    if (pricesToPull.length === 0) return

    const listingIds = [
      ...new Set(selectedPendingPrices.map((p) => p.etsyListingId)),
    ]

    if (!confirm(`Pull ${pricesToPull.length} Etsy price(s) into local records?`)) {
      return
    }

    setPullingPrices(true)
    setError(null)
    setPricePullResult(null)
    setPricePushResult(null)

    try {
      const result = await etsy.pullPrices(pricesToPull)
      setPricePullResult(result)
      if (result.updated > 0) {
        const successfulVariantIds = new Set(
          result.results.filter((item) => item.success).map((item) => item.variantId)
        )
        setSelectedPriceItems((prev) => {
          if (successfulVariantIds.size === 0) return prev
          return new Set([...prev].filter((variantId) => !successfulVariantIds.has(variantId)))
        })
        await loadPendingPrices(listingIds)
      }
      if (!result.success) {
        setError(`Some prices failed to pull: ${result.errors} error(s)`)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to pull prices')
    } finally {
      setPullingPrices(false)
    }
  }

  const priceNeedsSyncCount = pendingPrices.filter((p) => p.needsSync).length
  const filteredPrices = showOnlyPriceDiff ? pendingPrices.filter((p) => p.needsSync) : pendingPrices

  return {
    pendingPrices,
    filteredPrices,
    selectedPriceItems,
    pushingPrices,
    pullingPrices,
    pricePushResult,
    pricePullResult,
    showOnlyPriceDiff,
    setShowOnlyPriceDiff,
    priceNeedsSyncCount,
    loadPendingPrices,
    handlePushPrices,
    handlePullPrices,
    togglePriceItem,
    selectAllPriceDiff,
    setPendingPrices,
  }
}

