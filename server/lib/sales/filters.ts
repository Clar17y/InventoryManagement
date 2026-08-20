import { Prisma } from '@prisma/client'

const londonOffsetFormatter = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Europe/London',
  timeZoneName: 'longOffset',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

function parseDateOnly(value: string): [number, number, number] {
  const match = /^(?<year>\d{4})-(?<month>\d{2})-(?<day>\d{2})$/u.exec(value)
  if (!match?.groups) {
    throw new Error(`Invalid calendar date: ${value}`)
  }

  const year = Number(match.groups.year)
  const month = Number(match.groups.month)
  const day = Number(match.groups.day)
  const utcMidnight = new Date(Date.UTC(year, month - 1, day))
  if (
    utcMidnight.getUTCFullYear() !== year
    || utcMidnight.getUTCMonth() !== month - 1
    || utcMidnight.getUTCDate() !== day
  ) {
    throw new Error(`Invalid calendar date: ${value}`)
  }

  return [year, month, day]
}

export function londonDayStart(value: string): Date {
  const [year, month, day] = parseDateOnly(value)
  const utcMidnight = Date.UTC(year, month - 1, day)
  const zoneName = londonOffsetFormatter
    .formatToParts(new Date(utcMidnight))
    .find((part) => part.type === 'timeZoneName')?.value ?? 'GMT'
  const match = zoneName.match(/^GMT(?:(?<sign>[+-])(?<hours>\d{2}):(?<minutes>\d{2}))?$/u)
  if (!match) {
    throw new Error(`Unable to resolve Europe/London offset for ${value}`)
  }

  const sign = match.groups?.sign === '-' ? -1 : 1
  const offsetMinutes = match.groups?.hours
    ? sign * (Number(match.groups.hours) * 60 + Number(match.groups.minutes))
    : 0
  return new Date(utcMidnight - offsetMinutes * 60_000)
}

function nextDateOnly(value: string): string {
  const [year, month, day] = parseDateOnly(value)
  const next = new Date(Date.UTC(year, month - 1, day + 1))
  return [
    next.getUTCFullYear().toString().padStart(4, '0'),
    (next.getUTCMonth() + 1).toString().padStart(2, '0'),
    next.getUTCDate().toString().padStart(2, '0'),
  ].join('-')
}

export type SalesFilterQuery = {
  startDate?: string
  endDate?: string
  search?: string
}

export function buildSalesWhereClause(query: SalesFilterQuery): Prisma.SaleWhereInput {
  const { startDate, endDate, search } = query
  const where: Prisma.SaleWhereInput = {}

  if (startDate || endDate) {
    const saleDate: Prisma.DateTimeFilter = {}
    if (startDate) saleDate.gte = londonDayStart(startDate)
    if (endDate) saleDate.lt = londonDayStart(nextDateOnly(endDate))
    where.saleDate = saleDate
  }

  // Search across notes, etsyOrderId, and line hamper names/descriptions
  if (search?.trim()) {
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

