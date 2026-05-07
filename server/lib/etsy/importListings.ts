import type { Prisma } from '@prisma/client'

export type ImportedVariant = {
  name: string
  sku: string | null
  productId: string
  sellingPrice: number | null
}

export type PreparedImportedVariant = ImportedVariant & {
  skuForStorage: string | null
  skuIsAmbiguous: boolean
}

type DecimalLike = number | Prisma.Decimal

type ExistingHamper = {
  id: string
  name: string
  sellingPrice: DecimalLike
  hasVariants: boolean
}

type SyncDetail = {
  hamper: string
  action:
    | 'created_variant'
    | 'linked_product_id'
    | 'relinked_variant'
    | 'renamed_variant'
    | 'set_price'
    | 'set_sku'
    | 'toggled_has_variants'
  variant?: string
  info?: string
}

export type SyncExistingHamperArgs = {
  prisma: Pick<Prisma.TransactionClient, 'hamper' | 'hamperVariant'>
  existing: ExistingHamper
  listingPrice: number
  hasVariants: boolean
  inventoryLoaded: boolean
  variants: ImportedVariant[]
}

type SyncExistingHamperResult = {
  didUpdate: boolean
  details: SyncDetail[]
}

type LocalVariant = {
  id: string
  name: string
  etsySku: string | null
  etsyProductId: string | null
  sellingPrice: DecimalLike | null
}

type LinkedVariantConflict = {
  id: string
}

const normalizeName = (name: string | null): string | null => {
  const trimmed = (name ?? '').trim()
  return trimmed.length > 0 ? trimmed.toLowerCase() : null
}

const PRICE_TOLERANCE = 0.001

const toPriceNumber = (value: DecimalLike | null): number | null => {
  if (value === null) return null
  return Number(value)
}

const pricesDiffer = (left: DecimalLike | null, right: number | null): boolean => {
  if (left === null || right === null) {
    return left !== right
  }

  return Math.abs(Number(left) - right) > PRICE_TOLERANCE
}

function getDuplicateSkus(variants: ImportedVariant[]): Set<string> {
  const counts = new Map<string, number>()

  for (const variant of variants) {
    if (!variant.sku) continue
    counts.set(variant.sku, (counts.get(variant.sku) ?? 0) + 1)
  }

  return new Set(
    [...counts.entries()]
      .filter(([, count]) => count > 1)
      .map(([sku]) => sku)
  )
}

export function prepareImportedVariantsForStorage(
  variants: ImportedVariant[]
): PreparedImportedVariant[] {
  const duplicateImportedSkus = getDuplicateSkus(variants)

  return variants.map((variant) => {
    const skuIsAmbiguous = !!variant.sku && duplicateImportedSkus.has(variant.sku)

    return {
      ...variant,
      skuForStorage: skuIsAmbiguous ? null : variant.sku,
      skuIsAmbiguous,
    }
  })
}

async function findLinkedVariantConflict(
  prisma: Pick<Prisma.TransactionClient, 'hamperVariant'>,
  candidateId: string,
  productId: string,
  sku: string | null
): Promise<LinkedVariantConflict | null> {
  const existingByProductId = await prisma.hamperVariant.findFirst({
    where: {
      etsyProductId: productId,
      NOT: { id: candidateId },
    },
    select: { id: true },
  })

  if (existingByProductId) {
    return existingByProductId
  }

  if (!sku) {
    return null
  }

  return prisma.hamperVariant.findFirst({
    where: {
      etsySku: sku,
      NOT: { id: candidateId },
    },
    select: { id: true },
  })
}

async function retireLinkedVariantConflict(
  prisma: Pick<Prisma.TransactionClient, 'hamperVariant'>,
  candidateId: string,
  productId: string,
  sku: string | null
): Promise<boolean> {
  const linkedVariantConflict = await findLinkedVariantConflict(prisma, candidateId, productId, sku)

  if (!linkedVariantConflict) {
    return false
  }

  await prisma.hamperVariant.update({
    where: { id: linkedVariantConflict.id },
    data: {
      etsySku: null,
      etsyProductId: null,
      isActive: false,
    },
  })

  return true
}

export async function syncExistingHamperFromListing({
  prisma,
  existing,
  listingPrice,
  hasVariants,
  inventoryLoaded,
  variants,
}: SyncExistingHamperArgs): Promise<SyncExistingHamperResult> {
  const details: SyncDetail[] = []
  let didUpdate = false
  let currentHasVariants = existing.hasVariants

  if (inventoryLoaded && existing.hasVariants !== hasVariants) {
    await prisma.hamper.update({
      where: { id: existing.id },
      data: { hasVariants },
    })
    currentHasVariants = hasVariants
    didUpdate = true
    details.push({
      hamper: existing.name,
      action: 'toggled_has_variants',
      info: `${existing.hasVariants} → ${hasVariants}`,
    })
  }

  if (!currentHasVariants && pricesDiffer(existing.sellingPrice, listingPrice)) {
    await prisma.hamper.update({
      where: { id: existing.id },
      data: { sellingPrice: listingPrice },
    })
    didUpdate = true
    details.push({
      hamper: existing.name,
      action: 'set_price',
      info: 'hamper',
    })
  }

  if (inventoryLoaded && variants.length > 0) {
    const preparedVariants = prepareImportedVariantsForStorage(variants)
    const localVariants: LocalVariant[] = await prisma.hamperVariant.findMany({
      where: { hamperId: existing.id, isActive: true },
      select: {
        id: true,
        name: true,
        etsySku: true,
        etsyProductId: true,
        sellingPrice: true,
      },
    })

    for (const variant of preparedVariants) {
      const productId = variant.productId
      const sku = variant.sku
      const { skuForStorage, skuIsAmbiguous } = variant
      const nameKey = normalizeName(variant.name)

      const candidate =
        localVariants.find(localVariant => localVariant.etsyProductId === productId) ??
        (!skuIsAmbiguous && sku ? localVariants.find(localVariant => localVariant.etsySku === sku) : undefined) ??
        (nameKey
          ? (() => {
              const matches = localVariants.filter(localVariant => normalizeName(localVariant.name) === nameKey)
              return matches.length === 1 ? matches[0] : undefined
            })()
          : undefined)

      if (candidate) {
        const updateData: Prisma.HamperVariantUpdateInput = {}
        const changes: Array<'linked_product_id' | 'set_sku' | 'set_price' | 'renamed_variant'> = []

        if (candidate.etsyProductId !== productId) {
          updateData.etsyProductId = productId
          changes.push('linked_product_id')
        }
        if (!candidate.etsySku && skuForStorage) {
          updateData.etsySku = skuForStorage
          changes.push('set_sku')
        }

        const effectiveSellingPrice = toPriceNumber(candidate.sellingPrice) ?? toPriceNumber(existing.sellingPrice)
        if (variant.sellingPrice !== null && pricesDiffer(effectiveSellingPrice, variant.sellingPrice)) {
          updateData.sellingPrice = variant.sellingPrice
          changes.push('set_price')
        }

        if (/^Variant\s+\d+$/i.test(candidate.name) && candidate.name !== variant.name) {
          updateData.name = variant.name
          changes.push('renamed_variant')
        }

        if (Object.keys(updateData).length > 0) {
          try {
            const retiredLinkedVariant = await retireLinkedVariantConflict(prisma, candidate.id, productId, skuForStorage)

            if (retiredLinkedVariant) {
              didUpdate = true
              details.push({
                hamper: existing.name,
                action: 'relinked_variant',
                variant: variant.name,
              })
            }

            await prisma.hamperVariant.update({
              where: { id: candidate.id },
              data: updateData,
            })
            didUpdate = true
            for (const change of changes) {
              details.push({
                hamper: existing.name,
                action: change,
                variant: candidate.name,
              })
            }
          } catch (variantErr) {
            console.warn(`Skipping variant ${variant.name}: ${variantErr instanceof Error ? variantErr.message : variantErr}`)
          }
        } else {
          const retiredLinkedVariant = await retireLinkedVariantConflict(prisma, candidate.id, productId, skuForStorage)

          if (retiredLinkedVariant) {
            didUpdate = true
            details.push({
              hamper: existing.name,
              action: 'relinked_variant',
              variant: variant.name,
            })
          }
        }
      } else {
        try {
          await prisma.hamperVariant.create({
            data: {
              hamperId: existing.id,
              name: variant.name,
              sellingPrice: variant.sellingPrice,
              etsySku: skuForStorage,
              etsyProductId: variant.productId,
              isActive: true,
            },
          })
          didUpdate = true
          details.push({
            hamper: existing.name,
            action: 'created_variant',
            variant: variant.name,
            ...(skuIsAmbiguous && {
              info: 'etsy SKU omitted because it is duplicated on Etsy',
            }),
          })
        } catch (variantErr) {
          const existingBySku = skuForStorage
            ? await prisma.hamperVariant.findFirst({
                where: { etsySku: skuForStorage },
              })
            : null
          const existingByProductId = variant.productId
            ? await prisma.hamperVariant.findFirst({
                where: { etsyProductId: variant.productId },
              })
            : null
          const existingVariant = existingByProductId ?? existingBySku

          if (existingVariant) {
            await prisma.hamperVariant.update({
              where: { id: existingVariant.id },
              data: {
                hamperId: existing.id,
                name: variant.name,
                sellingPrice: variant.sellingPrice,
                etsySku: skuForStorage,
                etsyProductId: variant.productId,
                isActive: true,
              },
            })
            didUpdate = true
            details.push({
              hamper: existing.name,
              action: 'relinked_variant',
              variant: variant.name,
              ...(skuIsAmbiguous && {
                info: 'etsy SKU omitted because it is duplicated on Etsy',
              }),
            })
          } else {
            console.warn(`Skipping variant ${variant.name}: ${variantErr instanceof Error ? variantErr.message : variantErr}`)
          }
        }
      }
    }
  }

  return { didUpdate, details }
}
