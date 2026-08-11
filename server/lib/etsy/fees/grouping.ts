interface SaleWithReceipt {
  id: string
  etsyOrderId: string | null
}

function compareIds(a: { id: string }, b: { id: string }): number {
  if (a.id < b.id) return -1
  if (a.id > b.id) return 1
  return 0
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** Return local rows for an exact receipt or its numeric historical suffixes. */
export function groupSalesByReceipt<T extends SaleWithReceipt>(receiptId: string, sales: readonly T[]): T[] {
  const suffixPattern = new RegExp(`^${escapeRegExp(receiptId)}-\\d+$`)
  return sales
    .filter((sale) => sale.etsyOrderId === receiptId || (sale.etsyOrderId !== null && suffixPattern.test(sale.etsyOrderId)))
    .sort((a, b) => {
      const aIsExact = a.etsyOrderId === receiptId
      const bIsExact = b.etsyOrderId === receiptId
      if (aIsExact !== bIsExact) return aIsExact ? -1 : 1
      return compareIds(a, b)
    })
}
