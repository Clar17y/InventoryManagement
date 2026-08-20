import { prisma } from '../prisma'

export interface AvailabilityInputs {
  requirements: Array<{
    hamperId: string
    categoryId: string
    quantity: number
    isOptional: boolean
  }>
  variants: Array<{
    id: string
    hamperId: string
    name: string
    etsySku: string | null
    sellingPrice: number | null
    etsyIsEnabled: boolean
    indicativeQuantity: number | null
  }>
  mappings: Array<{ variantId: string; categoryId: string; productId: string }>
  productIdsByCategory: Map<string, string[]>
  remainingByProductId: Map<string, number>
}

export type VariantAvailabilitySummary = {
  variantId: string
  name: string
  etsySku: string | null
  sellingPrice: number | null
  etsyIsEnabled: boolean
  indicativeQuantity: number | null
  canMake: number
}

function toNumber(value: unknown): number {
  return Number(value ?? 0)
}

export async function loadAvailabilityInputs(hamperIds: string[]): Promise<AvailabilityInputs> {
  const [requirements, variants] = await Promise.all([
    prisma.hamperRequirement.findMany({
      where: { hamperId: { in: hamperIds } },
      select: { hamperId: true, categoryId: true, quantity: true, isOptional: true },
    }),
    prisma.hamperVariant.findMany({
      where: { hamperId: { in: hamperIds }, isActive: true },
      select: {
        id: true,
        hamperId: true,
        name: true,
        etsySku: true,
        sellingPrice: true,
        etsyIsEnabled: true,
        indicativeQuantity: true,
      },
    }),
  ])

  const variantIds = variants.map((variant) => variant.id)
  const categoryIds = [...new Set(requirements.map((requirement) => requirement.categoryId))]

  const [mappings, products] = await Promise.all([
    prisma.hamperVariantMapping.findMany({
      where: { variantId: { in: variantIds } },
      select: { variantId: true, categoryId: true, productId: true },
    }),
    prisma.product.findMany({
      where: { isActive: true, categoryId: { in: categoryIds } },
      select: { id: true, categoryId: true },
    }),
  ])

  const productIds = products.map((product) => product.id)
  const stock = await prisma.inventoryLot.groupBy({
    by: ['productId'],
    where: { productId: { in: productIds }, remaining: { gt: 0 } },
    _sum: { remaining: true },
  })

  const productIdsByCategory = new Map<string, string[]>()
  for (const product of products) {
    const categoryProducts = productIdsByCategory.get(product.categoryId) ?? []
    categoryProducts.push(product.id)
    productIdsByCategory.set(product.categoryId, categoryProducts)
  }

  const remainingByProductId = new Map(
    stock.map((row) => [row.productId, toNumber(row._sum.remaining)] as const),
  )

  return {
    requirements: requirements.map((requirement) => ({
      hamperId: requirement.hamperId,
      categoryId: requirement.categoryId,
      quantity: toNumber(requirement.quantity),
      isOptional: requirement.isOptional,
    })),
    variants: variants.map((variant) => ({
      id: variant.id,
      hamperId: variant.hamperId,
      name: variant.name,
      etsySku: variant.etsySku,
      sellingPrice: variant.sellingPrice === null ? null : toNumber(variant.sellingPrice),
      etsyIsEnabled: variant.etsyIsEnabled,
      indicativeQuantity: variant.indicativeQuantity,
    })),
    mappings,
    productIdsByCategory,
    remainingByProductId,
  }
}

function categoryStock(inputs: AvailabilityInputs, categoryId: string): number {
  return (inputs.productIdsByCategory.get(categoryId) ?? []).reduce(
    (total, productId) => total + (inputs.remainingByProductId.get(productId) ?? 0),
    0,
  )
}

export function calculateAvailabilityMap(inputs: AvailabilityInputs): Map<string, number> {
  const requirementsByHamper = new Map<string, AvailabilityInputs['requirements']>()
  for (const requirement of inputs.requirements) {
    const requirements = requirementsByHamper.get(requirement.hamperId) ?? []
    requirements.push(requirement)
    requirementsByHamper.set(requirement.hamperId, requirements)
  }

  const availability = new Map<string, number>()
  for (const [hamperId, requirements] of requirementsByHamper) {
    const requiredAvailability = requirements
      .filter((requirement) => !requirement.isOptional)
      .map((requirement) => Math.floor(categoryStock(inputs, requirement.categoryId) / requirement.quantity))
    availability.set(hamperId, requiredAvailability.length > 0 ? Math.min(...requiredAvailability) : 0)
  }

  return availability
}

export function calculateVariantAvailabilityMap(
  inputs: AvailabilityInputs,
): Map<string, VariantAvailabilitySummary[]> {
  const requirementsByHamper = new Map<string, AvailabilityInputs['requirements']>()
  for (const requirement of inputs.requirements) {
    const requirements = requirementsByHamper.get(requirement.hamperId) ?? []
    requirements.push(requirement)
    requirementsByHamper.set(requirement.hamperId, requirements)
  }

  const mappingsByVariant = new Map<string, AvailabilityInputs['mappings']>()
  for (const mapping of inputs.mappings) {
    const mappings = mappingsByVariant.get(mapping.variantId) ?? []
    mappings.push(mapping)
    mappingsByVariant.set(mapping.variantId, mappings)
  }

  const variantsByHamper = new Map<string, VariantAvailabilitySummary[]>()
  for (const variant of inputs.variants) {
    const requirements = requirementsByHamper.get(variant.hamperId) ?? []
    const mappings = mappingsByVariant.get(variant.id) ?? []
    const mappingsByCategory = new Map<string, AvailabilityInputs['mappings']>()
    for (const mapping of mappings) {
      const categoryMappings = mappingsByCategory.get(mapping.categoryId) ?? []
      categoryMappings.push(mapping)
      mappingsByCategory.set(mapping.categoryId, categoryMappings)
    }

    const availabilityPerRequirement: number[] = []
    for (const requirement of requirements) {
      const categoryMappings = mappingsByCategory.get(requirement.categoryId) ?? []
      if (requirement.isOptional && categoryMappings.length === 0) continue

      if (categoryMappings.length > 0) {
        const alternativeStock = categoryMappings.reduce(
          (total, mapping) => total + (inputs.remainingByProductId.get(mapping.productId) ?? 0),
          0,
        )
        availabilityPerRequirement.push(Math.floor(alternativeStock / requirement.quantity))
      } else {
        availabilityPerRequirement.push(Math.floor(categoryStock(inputs, requirement.categoryId) / requirement.quantity))
      }
    }

    const summary: VariantAvailabilitySummary = {
      variantId: variant.id,
      name: variant.name,
      etsySku: variant.etsySku,
      sellingPrice: variant.sellingPrice,
      etsyIsEnabled: variant.etsyIsEnabled,
      indicativeQuantity: variant.indicativeQuantity,
      canMake: availabilityPerRequirement.length > 0 ? Math.min(...availabilityPerRequirement) : 0,
    }
    const hamperVariants = variantsByHamper.get(variant.hamperId) ?? []
    hamperVariants.push(summary)
    variantsByHamper.set(variant.hamperId, hamperVariants)
  }

  for (const variants of variantsByHamper.values()) {
    variants.sort((left, right) => left.name.localeCompare(right.name))
  }

  return variantsByHamper
}
