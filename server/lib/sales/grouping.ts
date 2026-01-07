type SaleLineLike = {
  hamperId: string | null
  description: string | null
  hamper?: { name: string } | null
  unitPrice: unknown
  quantity: number
}

type SaleLike = {
  saleChannel: string
  grossRevenue: unknown
  etsyFees: unknown
  margin: unknown
  lines: SaleLineLike[]
}

export function groupSalesByChannel(sales: SaleLike[]) {
  const byChannel: Record<string, { count: number; revenue: number; fees: number; margin: number }> = {}
  for (const sale of sales) {
    const channel = sale.saleChannel
    if (!byChannel[channel]) {
      byChannel[channel] = { count: 0, revenue: 0, fees: 0, margin: 0 }
    }
    byChannel[channel].count += 1
    byChannel[channel].revenue += Number(sale.grossRevenue)
    byChannel[channel].fees += Number(sale.etsyFees)
    byChannel[channel].margin += Number(sale.margin)
  }

  return Object.entries(byChannel).map(([channel, data]) => ({ channel, ...data }))
}

export function groupSalesByHamper(sales: Array<Pick<SaleLike, 'lines'>>) {
  const byHamper: Record<string, { name: string; count: number; revenue: number }> = {}
  for (const sale of sales) {
    for (const line of sale.lines) {
      const key = line.hamperId || `bespoke:${line.description}`
      const name = line.hamper?.name || line.description || 'Bespoke Item'
      if (!byHamper[key]) {
        byHamper[key] = { name, count: 0, revenue: 0 }
      }
      byHamper[key].count += line.quantity
      byHamper[key].revenue += Number(line.unitPrice) * line.quantity
    }
  }

  return Object.values(byHamper).sort((a, b) => b.count - a.count)
}

