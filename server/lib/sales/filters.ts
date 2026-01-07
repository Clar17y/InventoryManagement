export function buildSalesWhereClause(query: {
  startDate?: unknown
  endDate?: unknown
  search?: unknown
}) {
  const { startDate, endDate, search } = query

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const where: any = {}

  if (startDate || endDate) {
    where.saleDate = {}
    if (startDate) where.saleDate.gte = new Date(startDate as string)
    if (endDate) {
      // Set to end of day for inclusive filtering
      const end = new Date(endDate as string)
      end.setHours(23, 59, 59, 999)
      where.saleDate.lte = end
    }
  }

  // Search across notes, etsyOrderId, and line hamper names/descriptions
  if (search && typeof search === 'string' && search.trim()) {
    const searchTerm = search.trim()
    where.OR = [
      { notes: { contains: searchTerm, mode: 'insensitive' } },
      { etsyOrderId: { contains: searchTerm, mode: 'insensitive' } },
      {
        lines: {
          some: {
            OR: [
              { description: { contains: searchTerm, mode: 'insensitive' } },
              { hamper: { name: { contains: searchTerm, mode: 'insensitive' } } },
            ],
          },
        },
      },
    ]
  }

  return where
}

