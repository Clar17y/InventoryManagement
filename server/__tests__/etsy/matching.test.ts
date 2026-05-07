import { describe, expect, it } from 'vitest';
import {
  findEtsyProductByIdentifiers,
  findItemByEtsyProduct,
  hasDuplicateEtsySku,
} from '../../lib/etsy/matching';
import type { EtsyProduct } from '../../lib/etsy/types';

function product(
  productId: number,
  sku: string,
  name: string,
  overrides: Partial<EtsyProduct> = {}
): EtsyProduct {
  return {
    product_id: productId,
    sku,
    is_deleted: false,
    offerings: [
      {
        offering_id: productId * 10,
        quantity: 1,
        price: { amount: 1000, divisor: 100, currency_code: 'GBP' },
        is_enabled: true,
      },
    ],
    property_values: [
      {
        property_id: 1,
        property_name: 'Design',
        scale_id: null,
        scale_name: null,
        value_ids: [productId],
        values: [name],
      },
    ],
    ...overrides,
  };
}

describe('Etsy matching', () => {
  const products = [
    product(101, 'DUP-SKU', 'Grey Marble'),
    product(102, 'DUP-SKU', 'Mustard Star'),
    product(103, 'UNIQUE-SKU', 'Blue Star'),
  ];

  it('prefers product_id over duplicate SKU when matching Etsy products', () => {
    const match = findEtsyProductByIdentifiers(products, {
      etsySku: 'DUP-SKU',
      etsyProductId: '102',
    });

    expect(match?.product_id).toBe(102);
  });

  it('does not match an Etsy product by duplicate SKU alone', () => {
    const match = findEtsyProductByIdentifiers(products, {
      etsySku: 'DUP-SKU',
      etsyProductId: null,
    });

    expect(match).toBeUndefined();
  });

  it('matches an Etsy product by unique SKU when product_id is missing', () => {
    const match = findEtsyProductByIdentifiers(products, {
      etsySku: 'UNIQUE-SKU',
      etsyProductId: null,
    });

    expect(match?.product_id).toBe(103);
  });

  it('does not match local items by duplicate Etsy SKU without a product_id match', () => {
    const localItems = [
      { etsySku: 'DUP-SKU', etsyProductId: '102', name: 'Mustard Star' },
    ];

    const match = findItemByEtsyProduct(localItems, products[0], products);

    expect(match).toBeUndefined();
  });

  it('matches local items by product_id even when the Etsy SKU is duplicated', () => {
    const localItems = [
      { etsySku: 'DUP-SKU', etsyProductId: '102', name: 'Mustard Star' },
    ];

    const match = findItemByEtsyProduct(localItems, products[1], products);

    expect(match?.name).toBe('Mustard Star');
  });

  it('ignores deleted Etsy products when checking whether a SKU is duplicated', () => {
    const productsWithDeletedDuplicate = [
      product(101, 'GREY-SKU', 'Grey Marble'),
      product(102, 'GREY-SKU', 'Deleted Grey Marble', { is_deleted: true }),
    ];

    expect(hasDuplicateEtsySku(productsWithDeletedDuplicate, 'GREY-SKU')).toBe(false);
    expect(
      findEtsyProductByIdentifiers(productsWithDeletedDuplicate, {
        etsySku: 'GREY-SKU',
        etsyProductId: null,
      })?.product_id
    ).toBe(101);
    expect(
      findItemByEtsyProduct(
        [{ etsySku: 'GREY-SKU', etsyProductId: null, name: 'Grey Marble' }],
        productsWithDeletedDuplicate[0],
        productsWithDeletedDuplicate
      )?.name
    ).toBe('Grey Marble');
  });
});
