/**
 * Historical Data Import Script
 *
 * Imports sales and expenses from the "Savvy Finances.xml" spreadsheet.
 *
 * Usage: npx tsx scripts/import-historical.ts [--dry-run]
 *
 * Options:
 *   --dry-run  Parse and display data without writing to database
 */

import { readFileSync } from 'fs'
import { PrismaClient, ExpenseCategory } from '@prisma/client'

const prisma = new PrismaClient()

// Parse command line args
const isDryRun = process.argv.includes('--dry-run')

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

function parseXmlValue(cellContent: string): string | number | Date | null {
  // Extract type and value from XML cell
  const typeMatch = cellContent.match(/ss:Type="(\w+)"/)
  const valueMatch = cellContent.match(/<Data[^>]*>([^<]*)<\/Data>/)

  if (!valueMatch) return null

  const type = typeMatch?.[1] || 'String'
  const value = valueMatch[1]

  if (type === 'Number') {
    return parseFloat(value) || 0
  } else if (type === 'DateTime') {
    return new Date(value)
  }
  return value
}

function parseRow(rowXml: string): (string | number | Date | null)[] {
  const cells: (string | number | Date | null)[] = []
  const cellRegex = /<Cell[^>]*>([\s\S]*?)<\/Cell>/g
  let match

  while ((match = cellRegex.exec(rowXml)) !== null) {
    // Check for ss:Index attribute (skipped columns)
    const indexMatch = match[0].match(/ss:Index="(\d+)"/)
    if (indexMatch) {
      const targetIndex = parseInt(indexMatch[1]) - 1
      while (cells.length < targetIndex) {
        cells.push(null)
      }
    }

    const value = parseXmlValue(match[1])
    cells.push(value)
  }

  return cells
}

function parseSalesWorksheet(xml: string): SaleRecord[] {
  const sales: SaleRecord[] = []

  // Find Sales worksheet
  const salesStart = xml.indexOf('<Worksheet ss:Name="Sales">')
  const salesEnd = xml.indexOf('</Worksheet>', salesStart)
  if (salesStart === -1) {
    console.error('Sales worksheet not found')
    return sales
  }

  const salesXml = xml.substring(salesStart, salesEnd)

  // Find all rows
  const rowRegex = /<Row[^>]*>([\s\S]*?)<\/Row>/g
  let match
  let isHeader = true

  while ((match = rowRegex.exec(salesXml)) !== null) {
    if (isHeader) {
      isHeader = false
      continue
    }

    const cells = parseRow(match[1])

    // Skip empty rows or rows without order ID
    if (!cells[0] || typeof cells[0] !== 'number') continue

    const sale: SaleRecord = {
      orderId: String(cells[0]),
      payeeName: String(cells[1] || ''),
      date: cells[2] instanceof Date ? cells[2] : new Date(),
      product: String(cells[3] || ''),
      salePrice: typeof cells[4] === 'number' ? cells[4] : 0,
      postagePrice: typeof cells[5] === 'number' ? cells[5] : 0,
      totalFees: typeof cells[6] === 'number' ? cells[6] : 0,
      transactionFee: typeof cells[7] === 'number' ? cells[7] : 0,
      postageTransactionFee: typeof cells[8] === 'number' ? cells[8] : 0,
      regulatoryFee: typeof cells[9] === 'number' ? cells[9] : 0,
      processingFee: typeof cells[10] === 'number' ? cells[10] : 0,
      vatProcessingFee: typeof cells[11] === 'number' ? cells[11] : 0,
      net: typeof cells[12] === 'number' ? cells[12] : 0,
    }

    // Validate the sale has meaningful data
    if (sale.salePrice > 0) {
      sales.push(sale)
    }
  }

  return sales
}

function parseCostsWorksheet(xml: string): CostRecord[] {
  const costs: CostRecord[] = []

  // Find Costs worksheet
  const costsStart = xml.indexOf('<Worksheet ss:Name="Costs">')
  const costsEnd = xml.indexOf('</Worksheet>', costsStart)
  if (costsStart === -1) {
    console.error('Costs worksheet not found')
    return costs
  }

  const costsXml = xml.substring(costsStart, costsEnd)

  // Find all rows
  const rowRegex = /<Row[^>]*>([\s\S]*?)<\/Row>/g
  let match
  let isHeader = true

  while ((match = rowRegex.exec(costsXml)) !== null) {
    if (isHeader) {
      isHeader = false
      continue
    }

    const cells = parseRow(match[1])

    // Skip empty rows or rows without category
    if (!cells[0] || typeof cells[0] !== 'string') continue

    const cost: CostRecord = {
      category: String(cells[0] || ''),
      date: cells[1] instanceof Date ? cells[1] : new Date(),
      payee: String(cells[2] || ''),
      description: String(cells[3] || ''),
      priceIncVat: typeof cells[4] === 'number' ? cells[4] : 0,
      priceExcVat: typeof cells[5] === 'number' ? cells[5] : 0,
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
  if (normalized === 'hamper contents') return 'STOCK' // Historical stock purchases

  return 'OTHER'
}

async function importSales(sales: SaleRecord[]) {
  console.log(`\nImporting ${sales.length} sales...`)

  let imported = 0
  // Track how many times we've seen each order ID to create unique suffixes
  const orderIdCounts: Record<string, number> = {}

  for (const sale of sales) {
    // Same Etsy order ID can have multiple items (e.g., 2 hampers in one order)
    // Append item number suffix to make unique: "123456-1", "123456-2"
    orderIdCounts[sale.orderId] = (orderIdCounts[sale.orderId] || 0) + 1
    const uniqueOrderId = `${sale.orderId}-${orderIdCounts[sale.orderId]}`

    if (isDryRun) {
      console.log(`  [DRY RUN] Would import: ${sale.date.toISOString().split('T')[0]} - ${sale.product} - £${sale.salePrice}`)
      imported++
      continue
    }

    // Calculate net revenue and margin
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
        postageCost: 0, // Unknown from spreadsheet
        etsyFees: etsyFees,
        transactionFee: sale.transactionFee,
        postageTransactionFee: sale.postageTransactionFee,
        regulatoryFee: sale.regulatoryFee,
        processingFee: sale.processingFee,
        vatOnProcessingFee: sale.vatProcessingFee,
        listingFee: 0.15, // Standard listing fee
        packagingOverhead: 0,
        netRevenue: netRevenue,
        totalCost: 0, // Unknown - no stock allocation for historical
        margin: netRevenue, // Best estimate without stock cost
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
  console.log('Historical Data Import')
  console.log('='.repeat(60))

  if (isDryRun) {
    console.log('\n*** DRY RUN MODE - No changes will be made ***\n')
  }

  // Read the XML file
  const xmlPath = 'Savvy Finances.xml'
  console.log(`Reading ${xmlPath}...`)

  let xml: string
  try {
    xml = readFileSync(xmlPath, 'utf-8')
    console.log(`  File size: ${(xml.length / 1024 / 1024).toFixed(2)} MB`)
  } catch (err) {
    console.error(`Failed to read ${xmlPath}:`, err)
    process.exit(1)
  }

  // Parse sales
  console.log('\nParsing Sales worksheet...')
  const sales = parseSalesWorksheet(xml)
  console.log(`  Found ${sales.length} sales records`)

  if (sales.length > 0) {
    const dates = sales.map(s => s.date)
    const minDate = new Date(Math.min(...dates.map(d => d.getTime())))
    const maxDate = new Date(Math.max(...dates.map(d => d.getTime())))
    console.log(`  Date range: ${minDate.toISOString().split('T')[0]} to ${maxDate.toISOString().split('T')[0]}`)
  }

  // Parse costs
  console.log('\nParsing Costs worksheet...')
  const costs = parseCostsWorksheet(xml)
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
