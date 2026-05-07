import { EtsyProduct } from './types';

export type EtsyLinkIdentifiers = {
  etsySku?: string | null;
  etsyProductId?: string | null;
};

function normalizeSku(sku?: string | null): string | null {
  if (!sku) return null;
  const trimmed = sku.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeProductId(productId?: string | null): string | null {
  if (!productId) return null;
  const trimmed = productId.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeVariantName(name?: string | null): string | null {
  if (!name) return null;
  const trimmed = name.trim();
  return trimmed.length > 0 ? trimmed.toLowerCase() : null;
}

function isActiveProduct(product: EtsyProduct): boolean {
  return !product.is_deleted;
}

function isSkuUniqueInProducts(products: EtsyProduct[], sku: string): boolean {
  return products.filter((product) => isActiveProduct(product) && normalizeSku(product.sku) === sku).length === 1;
}

export function findDuplicateEtsySkus(products: EtsyProduct[]): Set<string> {
  const counts = new Map<string, number>();

  for (const product of products) {
    if (!isActiveProduct(product)) continue;
    const sku = normalizeSku(product.sku);
    if (!sku) continue;
    counts.set(sku, (counts.get(sku) ?? 0) + 1);
  }

  return new Set(
    [...counts.entries()]
      .filter(([, count]) => count > 1)
      .map(([sku]) => sku)
  );
}

export function hasDuplicateEtsySku(products: EtsyProduct[], sku?: string | null): boolean {
  const normalizedSku = normalizeSku(sku);
  return !!normalizedSku && findDuplicateEtsySkus(products).has(normalizedSku);
}

export function getEtsyVariantName(product: EtsyProduct): string | null {
  if (!product.property_values || product.property_values.length === 0) {
    return null;
  }

  const name = product.property_values
    .map((pv) => pv.values.filter(Boolean).join(', '))
    .join(' / ')
    .trim();

  return name.length > 0 ? name : null;
}

export function findEtsyProductByIdentifiers(
  products: EtsyProduct[],
  identifiers: EtsyLinkIdentifiers
): EtsyProduct | undefined {
  const productId = normalizeProductId(identifiers.etsyProductId);
  if (productId) {
    const match = products.find((product) => String(product.product_id) === productId);
    if (match) return match;
  }

  const sku = normalizeSku(identifiers.etsySku);
  if (!sku || !isSkuUniqueInProducts(products, sku)) {
    return undefined;
  }

  return products.find((product) => normalizeSku(product.sku) === sku);
}

export function findEtsyProductByVariantName(
  products: EtsyProduct[],
  variantName?: string | null
): EtsyProduct | undefined {
  const normalizedName = normalizeVariantName(variantName);
  if (!normalizedName) return undefined;

  const matches = products.filter((product) => {
    const productName = normalizeVariantName(getEtsyVariantName(product));
    return productName === normalizedName;
  });

  return matches.length === 1 ? matches[0] : undefined;
}

export function findItemByEtsyProduct<T extends EtsyLinkIdentifiers>(
  items: T[],
  product: EtsyProduct,
  productsInListing?: EtsyProduct[]
): T | undefined {
  const productId = String(product.product_id);
  const productIdMatch = items.find((item) => normalizeProductId(item.etsyProductId) === productId);
  if (productIdMatch) return productIdMatch;

  const productSku = normalizeSku(product.sku);
  const skuScope = productsInListing ?? [product];
  if (productSku && isSkuUniqueInProducts(skuScope, productSku)) {
    const match = items.find((item) => normalizeSku(item.etsySku) === productSku);
    if (match) return match;
  }

  return undefined;
}

export function findItemByVariantName<T extends { name?: string | null }>(
  items: T[],
  variantName?: string | null
): T | undefined {
  const normalizedName = normalizeVariantName(variantName);
  if (!normalizedName) return undefined;

  const matches = items.filter((item) => {
    const itemName = normalizeVariantName(item.name);
    return itemName === normalizedName;
  });

  return matches.length === 1 ? matches[0] : undefined;
}
