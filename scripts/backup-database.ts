/**
 * Database Backup Script
 * 
 * Creates a JSON export of the Neon database using Prisma.
 * Run with: npm run db:backup
 */

import { PrismaClient } from '@prisma/client'
import * as fs from 'fs'
import * as path from 'path'
import { fileURLToPath } from 'url'
import { gzipSync } from 'zlib'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const prisma = new PrismaClient()

async function backup() {
    const timestamp = new Date().toISOString().split('T')[0]
    const backupDir = path.join(__dirname, '..', 'backups')
    const backupFile = path.join(backupDir, `backup_${timestamp}.json.gz`)

    // Create backups directory if it doesn't exist
    if (!fs.existsSync(backupDir)) {
        fs.mkdirSync(backupDir, { recursive: true })
    }

    console.log('🔄 Starting database backup...')

    try {
        // Export all data from each table
        const [
            categories,
            products,
            productBarcodes,
            productCosts,
            inventoryLots,
            hampers,
            hamperRequirements,
            hamperVariants,
            hamperVariantMappings,
            sales,
            saleLines,
            saleConsumptions,
            etsyFeeConfigs,
            packagingOverheads,
            businessExpenses,
        ] = await Promise.all([
            prisma.componentCategory.findMany(),
            prisma.product.findMany(),
            prisma.productBarcode.findMany(),
            prisma.productCost.findMany(),
            prisma.inventoryLot.findMany(),
            prisma.hamper.findMany(),
            prisma.hamperRequirement.findMany(),
            prisma.hamperVariant.findMany(),
            prisma.hamperVariantMapping.findMany(),
            prisma.sale.findMany(),
            prisma.saleLine.findMany(),
            prisma.saleConsumption.findMany(),
            prisma.etsyFeeConfig.findMany(),
            prisma.packagingOverhead.findMany(),
            prisma.businessExpense.findMany(),
        ])

        const backup = {
            exportedAt: new Date().toISOString(),
            version: '1.0',
            data: {
                categories,
                products,
                productBarcodes,
                productCosts,
                inventoryLots,
                hampers,
                hamperRequirements,
                hamperVariants,
                hamperVariantMappings,
                sales,
                saleLines,
                saleConsumptions,
                etsyFeeConfigs,
                packagingOverheads,
                businessExpenses,
            },
            counts: {
                categories: categories.length,
                products: products.length,
                productBarcodes: productBarcodes.length,
                productCosts: productCosts.length,
                inventoryLots: inventoryLots.length,
                hampers: hampers.length,
                hamperRequirements: hamperRequirements.length,
                hamperVariants: hamperVariants.length,
                hamperVariantMappings: hamperVariantMappings.length,
                sales: sales.length,
                saleLines: saleLines.length,
                saleConsumptions: saleConsumptions.length,
                etsyFeeConfigs: etsyFeeConfigs.length,
                packagingOverheads: packagingOverheads.length,
                businessExpenses: businessExpenses.length,
            },
        }

        const jsonData = JSON.stringify(backup)
        const compressed = gzipSync(jsonData)
        fs.writeFileSync(backupFile, compressed)

        const originalSize = Buffer.byteLength(jsonData)
        const compressedSize = compressed.length
        const ratio = ((1 - compressedSize / originalSize) * 100).toFixed(1)
        console.log(`📦 Compressed: ${(originalSize / 1024).toFixed(1)}KB → ${(compressedSize / 1024).toFixed(1)}KB (${ratio}% smaller)`)

        console.log('✅ Backup complete!')
        console.log(`📁 Saved to: ${backupFile}`)
        console.log('\n📊 Record counts:')
        Object.entries(backup.counts).forEach(([table, count]) => {
            console.log(`   ${table}: ${count}`)
        })

    } catch (error) {
        console.error('❌ Backup failed:', error)
        process.exit(1)
    } finally {
        await prisma.$disconnect()
    }
}

backup()
