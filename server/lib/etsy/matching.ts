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
  const sku = normalizeSku(identifiers.etsySku);
  if (sku) {
    const match = products.find((product) => normalizeSku(product.sku) === sku);
    if (match) return match;
  }

  const productId = normalizeProductId(identifiers.etsyProductId);
  if (!productId) return undefined;

  return products.find((product) => String(product.product_id) === productId);
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
  product: EtsyProduct
): T | undefined {
  const productSku = normalizeSku(product.sku);
  if (productSku) {
    const match = items.find((item) => normalizeSku(item.etsySku) === productSku);
    if (match) return match;
  }

  const productId = String(product.product_id);
  return items.find((item) => normalizeProductId(item.etsyProductId) === productId);
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
