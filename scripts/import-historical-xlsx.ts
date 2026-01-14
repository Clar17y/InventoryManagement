/**
 * Historical Data Import Script (XLSX)
 *
 * Imports sales and expenses from an Excel spreadsheet.
 *
 * Usage: npx tsx scripts/import-historical-xlsx.ts [file.xlsx] [--dry-run]
 *
 * Options:
 *   --dry-run  Parse and display data without writing to database
 *
 * Default file: "Savvy Finances.xlsx"
 */

import { PrismaClient, ExpenseCategory } from '@prisma/client'
import XLSX from 'xlsx'

const prisma = new PrismaClient()

// Parse command line args
const isDryRun = process.argv.includes('--dry-run')
const fileArg = process.argv.find(arg => arg.endsWith('.xlsx') || arg.endsWith('.xls'))
const xlsxPath = fileArg || 'Savvy Finances.xlsx'

interface SaleRecord {
  orderId: string
  payeeName: string
  date: Date
  product: string
  salePrice: number
  postagePrice: number
  totalFees: number
  transactionFee: number
  postageTransactionFee: number
  regulatoryFee: number
  processingFee: number
  vatProcessingFee: number
  net: number
}

interface CostRecord {
  category: string
  date: Date
  payee: string
  description: string
  priceIncVat: number
  priceExcVat: number
}

function parseExcelDate(value: unknown): Date {
  if (value instanceof Date) return value
  if (typeof value === 'number') {
    // Excel serial date number - convert to JS Date
    // Excel epoch is Dec 30, 1899 (accounting for 1900 leap year bug)
    const excelEpoch = new Date(1899, 11, 30)
    const days = Math.floor(value)
    const ms = excelEpoch.getTime() + days * 24 * 60 * 60 * 1000
    return new Date(ms)
  }
  if (typeof value === 'string') {
    const parsed = new Date(value)
    if (!isNaN(parsed.getTime())) return parsed
  }
  return new Date()
}

function parseNumber(value: unknown): number {
  if (typeof value === 'number') return value
  if (typeof value === 'string') return parseFloat(value) || 0
  return 0
}

function parseSalesWorksheet(workbook: XLSX.WorkBook): SaleRecord[] {
  const sales: SaleRecord[] = []

  const sheet = workbook.Sheets['Sales']
  if (!sheet) {
    console.error('Sales worksheet not found')
    return sales
  }

  // Convert to JSON array of arrays (skip header row after)
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1 })

  // Skip header row
  for (let i = 1; i < rows.length; i++) {
    const cells = rows[i]
    if (!cells || cells.length === 0) continue

    // Skip rows without order ID
    if (!cells[0]) continue

    const sale: SaleRecord = {
      orderId: String(cells[0]),
      payeeName: String(cells[1] || ''),
      date: parseExcelDate(cells[2]),
      product: String(cells[3] || ''),
      salePrice: parseNumber(cells[4]),
      postagePrice: parseNumber(cells[5]),
      totalFees: parseNumber(cells[6]),
      transactionFee: parseNumber(cells[7]),
      postageTransactionFee: parseNumber(cells[8]),
      regulatoryFee: parseNumber(cells[9]),
      processingFee: parseNumber(cells[10]),
      vatProcessingFee: parseNumber(cells[11]),
      net: parseNumber(cells[12]),
    }

    // Validate the sale has meaningful data
    if (sale.salePrice > 0) {
      sales.push(sale)
    }
  }

  return sales
}

function parseCostsWorksheet(workbook: XLSX.WorkBook): CostRecord[] {
  const costs: CostRecord[] = []

  const sheet = workbook.Sheets['Costs']
  if (!sheet) {
    console.error('Costs worksheet not found')
    return costs
  }

  // Convert to JSON array of arrays
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1 })

  // Skip header row
  for (let i = 1; i < rows.length; i++) {
    const cells = rows[i]
    if (!cells || cells.length === 0) continue

    // Skip rows without category
    if (!cells[0] || typeof cells[0] !== 'string') continue

    const cost: CostRecord = {
      category: String(cells[0] || ''),
      date: parseExcelDate(cells[1]),
      payee: String(cells[2] || ''),
      description: String(cells[3] || ''),
      priceIncVat: parseNumber(cells[4]),
      priceExcVat: parseNumber(cells[5]),
    }

    // Validate the cost has meaningful data
    if (cost.priceIncVat > 0 && cost.category) {
      costs.push(cost)
    }
  }

  return costs
}

function mapCategoryToEnum(category: string): ExpenseCategory {
  const normalized = category.toLowerCase().trim()

  if (normalized === 'advertising') return 'ADVERTISING'
  if (normalized === 'packaging') return 'PACKAGING'
  if (normalized === 'postage') return 'POSTAGE'
  if (normalized === 'listing fee' || normalized === 'listing') return 'LISTING_FEE'
  if (normalized === 'hamper contents') return 'STOCK'

  return 'OTHER'
}

async function importSales(sales: SaleRecord[]) {
  console.log(`\nImporting ${sales.length} sales...`)

  let imported = 0

  // Track current index for each order ID (for suffix numbering)
  const orderIdCurrentIndex: Record<string, number> = {}

  for (const sale of sales) {
    // Same Etsy order ID can have multiple items
    orderIdCurrentIndex[sale.orderId] = (orderIdCurrentIndex[sale.orderId] || 0) + 1
    const currentIndex = orderIdCurrentIndex[sale.orderId]

    // First occurrence keeps original ID, subsequent get -2, -3, etc.
    const uniqueOrderId = currentIndex > 1
      ? `${sale.orderId}-${currentIndex}`
      : sale.orderId

    if (isDryRun) {
      console.log(`  [DRY RUN] Would import: ${sale.date.toISOString().split('T')[0]} - ${sale.product} - £${sale.salePrice}`)
      imported++
      continue
    }

    const grossRevenue = sale.salePrice
    const postageCharged = sale.postagePrice
    const etsyFees = sale.totalFees
    const netRevenue = sale.net

    await prisma.sale.create({
      data: {
        saleDate: sale.date,
        saleChannel: 'etsy',
        etsyOrderId: uniqueOrderId,
        grossRevenue: grossRevenue,
        postageCharged: postageCharged,
        postageCost: 0,
        etsyFees: etsyFees,
        transactionFee: sale.transactionFee,
        postageTransactionFee: sale.postageTransactionFee,
        regulatoryFee: sale.regulatoryFee,
        processingFee: sale.processingFee,
        vatOnProcessingFee: sale.vatProcessingFee,
        listingFee: 0.15,
        packagingOverhead: 0,
        netRevenue: netRevenue,
        totalCost: 0,
        margin: netRevenue,
        notes: `${sale.product} - ${sale.payeeName}`,
        isHistorical: true,
      }
    })

    imported++

    if (imported % 100 === 0) {
      console.log(`  Imported ${imported} sales...`)
    }
  }

  console.log(`  Done: ${imported} imported`)
}

async function importExpenses(costs: CostRecord[]) {
  console.log(`\nImporting expenses...`)

  let imported = 0

  for (const cost of costs) {
    const category = mapCategoryToEnum(cost.category)

    if (isDryRun) {
      console.log(`  [DRY RUN] Would import: ${cost.date.toISOString().split('T')[0]} - ${category} - ${cost.description} - £${cost.priceIncVat}`)
      imported++
      continue
    }

    await prisma.businessExpense.create({
      data: {
        date: cost.date,
        category: category,
        supplier: cost.payee || null,
        description: cost.description,
        amountIncVat: cost.priceIncVat,
        amountExcVat: cost.priceExcVat || cost.priceIncVat * 0.8,
        isHistorical: true,
      }
    })

    imported++

    if (imported % 100 === 0) {
      console.log(`  Imported ${imported} expenses...`)
    }
  }

  console.log(`  Done: ${imported} imported`)
}

async function main() {
  console.log('='.repeat(60))
  console.log('Historical Data Import (XLSX)')
  console.log('='.repeat(60))

  if (isDryRun) {
    console.log('\n*** DRY RUN MODE - No changes will be made ***\n')
  }

  // Read the XLSX file
  console.log(`Reading ${xlsxPath}...`)

  let workbook: XLSX.WorkBook
  try {
    workbook = XLSX.readFile(xlsxPath)
    console.log(`  Sheets found: ${workbook.SheetNames.join(', ')}`)
  } catch (err) {
    console.error(`Failed to read ${xlsxPath}:`, err)
    process.exit(1)
  }

  // Parse sales
  console.log('\nParsing Sales worksheet...')
  const sales = parseSalesWorksheet(workbook)
  console.log(`  Found ${sales.length} sales records`)

  if (sales.length > 0) {
    const dates = sales.map(s => s.date)
    const minDate = new Date(Math.min(...dates.map(d => d.getTime())))
    const maxDate = new Date(Math.max(...dates.map(d => d.getTime())))
    console.log(`  Date range: ${minDate.toISOString().split('T')[0]} to ${maxDate.toISOString().split('T')[0]}`)

    // Report bad dates (outside 2020-2030)
    const badDates = sales
      .map((s, i) => ({ row: i + 2, date: s.date, orderId: s.orderId, product: s.product })) // +2 for 1-indexed + header
      .filter(s => s.date.getFullYear() < 2020 || s.date.getFullYear() > 2030)
    if (badDates.length > 0) {
      console.log(`  WARNING: ${badDates.length} rows have suspicious dates:`)
      for (const bad of badDates) {
        console.log(`    Row ${bad.row}: ${bad.date.toISOString().split('T')[0]} - Order ${bad.orderId} - ${bad.product}`)
      }
    }

    // Report duplicate order IDs (multi-item orders)
    const orderCounts: Record<string, { count: number; products: string[] }> = {}
    for (const sale of sales) {
      if (!orderCounts[sale.orderId]) {
        orderCounts[sale.orderId] = { count: 0, products: [] }
      }
      orderCounts[sale.orderId].count++
      orderCounts[sale.orderId].products.push(sale.product)
    }
    const duplicates = Object.entries(orderCounts).filter(([, v]) => v.count > 1)
    if (duplicates.length > 0) {
      console.log(`  Multi-item orders: ${duplicates.length} orders with multiple items`)
      for (const [orderId, { count, products }] of duplicates.slice(0, 5)) {
        console.log(`    Order ${orderId}: ${count} items - ${products.join(', ')}`)
      }
      if (duplicates.length > 5) {
        console.log(`    ... and ${duplicates.length - 5} more`)
      }
    }
  }

  // Parse costs
  console.log('\nParsing Costs worksheet...')
  const costs = parseCostsWorksheet(workbook)
  console.log(`  Found ${costs.length} cost records`)

  // Count by category
  const categoryCounts: Record<string, number> = {}
  for (const cost of costs) {
    categoryCounts[cost.category] = (categoryCounts[cost.category] || 0) + 1
  }
  console.log('  By category:')
  for (const [cat, count] of Object.entries(categoryCounts).sort((a, b) => b[1] - a[1])) {
    const mapped = mapCategoryToEnum(cat)
    console.log(`    ${cat}: ${count} → ${mapped}`)
  }

  // Import data
  await importSales(sales)
  await importExpenses(costs)

  console.log('\n' + '='.repeat(60))
  console.log('Import complete!')
  console.log('='.repeat(60))
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
