export function getAvailabilityColor(canMake: number): string {
  if (canMake >= 5) return 'bg-green-100 text-green-800'
  if (canMake >= 1) return 'bg-amber-100 text-amber-800'
  return 'bg-red-100 text-red-800'
}

export function isEtsyEnabled(value?: boolean | null): boolean {
  return value !== false
}

// Returns display value and whether it's indicative (higher than actual)
export function getDisplayAvailability(
  canMake: number,
  indicativeQuantity: number | null | undefined
): { value: number; isIndicative: boolean } {
  const indicative = indicativeQuantity ?? 0
  if (indicative > canMake) {
    return { value: indicative, isIndicative: true }
  }
  return { value: canMake, isIndicative: false }
}

// Format availability with asterisk if indicative
export function formatAvailability(
  canMake: number,
  indicativeQuantity: number | null | undefined
): string {
  const { value, isIndicative } = getDisplayAvailability(canMake, indicativeQuantity)
  return isIndicative ? `${value}*` : `${value}`
}

