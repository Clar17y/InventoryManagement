export function getAvailabilityColor(canMake: number): string {
  if (canMake >= 5) return 'bg-green-100 text-green-800'
  if (canMake >= 1) return 'bg-amber-100 text-amber-800'
  return 'bg-red-100 text-red-800'
}

