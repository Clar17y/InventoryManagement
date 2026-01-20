import type { SaleChannel } from '../../lib/api'

export const channelLabels: Record<SaleChannel, string> = {
  etsy: 'Etsy',
  direct: 'Direct',
  fair: 'Fair/Market',
}

export const channelColors: Record<SaleChannel, string> = {
  etsy: 'bg-orange-100 text-orange-800',
  direct: 'bg-green-100 text-green-800',
  fair: 'bg-accent-100 text-accent-800',
}

