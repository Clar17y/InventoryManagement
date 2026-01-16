import { EtsyInventory, EtsyListing } from '../types';

export interface BulkHamperFixtureOptions {
  startListingId?: number;
  currencyCode?: string;
  multiVariantEvery?: number;
  variantsPerListing?: number;
}

const WORDS = [
  'Amber',
  'Willow',
  'Meadow',
  'Honey',
  'Cedar',
  'Velvet',
  'Saffron',
  'Juniper',
  'River',
  'Birch',
  'Maple',
  'Cocoa',
  'Linen',
  'Cloud',
  'Breeze',
  'Harbour',
  'Garden',
  'Orchard',
  'Fern',
  'Bloom',
  'Petal',
  'Daisy',
  'Rosemary',
  'Thyme',
  'Sage',
  'Olive',
  'Lemon',
  'Vanilla',
  'Cinnamon',
  'Ginger',
  'Mint',
  'Basil',
  'Copper',
  'Silver',
  'Pearl',
  'Opal',
  'Satin',
  'Cotton',
  'Wicker',
  'Bamboo',
  'Coral',
  'Lagoon',
  'Sunrise',
  'Sunset',
  'Starlight',
  'Moonbeam',
  'Twilight',
  'Aurora',
  'Comet',
  'Nova',
  'Quartz',
  'Jasper',
  'Granite',
  'Moss',
  'Hearth',
  'Haven',
  'Calm',
  'Cozy',
  'Bright',
  'Gentle',
  'Golden',
  'Fresh',
  'Warm',
  'Wild',
];

function hash32(value: number): number {
  let x = value | 0;
  x ^= x >>> 16;
  x = Math.imul(x, 0x7feb352d);
  x ^= x >>> 15;
  x = Math.imul(x, 0x846ca68b);
  x ^= x >>> 16;
  return x >>> 0;
}

function generateFourWordTitle(seed: number): string {
  const picked = new Set<string>();
  const words: string[] = [];

  let state = hash32(seed);
  while (words.length < 4) {
    state = hash32(state + words.length * 0x9e3779b9);
    const word = WORDS[state % WORDS.length]!;
    if (picked.has(word)) continue;
    picked.add(word);
    words.push(word);
  }

  return words.join(' ');
}

export function generateBulkHamperFixtures(
  count: number,
  options: BulkHamperFixtureOptions = {}
): { listings: EtsyListing[]; inventoryByListingId: Map<number, EtsyInventory> } {
  const startListingId = options.startListingId ?? 2000;
  const currencyCode = options.currencyCode ?? 'GBP';
  const multiVariantEvery = options.multiVariantEvery ?? 10;
  const variantsPerListing = options.variantsPerListing ?? 3;

  const listings: EtsyListing[] = [];
  const inventoryByListingId = new Map<number, EtsyInventory>();

  const safeCount = Math.max(0, Math.floor(count));
  for (let idx = 0; idx < safeCount; idx += 1) {
    const listingId = startListingId + idx;
    const sequence = idx + 1;
    const isMultiVariant =
      multiVariantEvery > 0 && variantsPerListing > 1 && sequence % multiVariantEvery === 0;

    const basePricePence = 3500 + (sequence % 30) * 100;
    const baseTitle = generateFourWordTitle(listingId);

    if (isMultiVariant) {
      const products = Array.from({ length: variantsPerListing }).map((_, vIdx) => {
        const variantNumber = vIdx + 1;
        const variantValueId = 55181010000 + sequence * 10 + variantNumber;
        const quantity = 1 + ((sequence + vIdx) % 5);

        return {
          product_id: listingId * 10 + variantNumber,
          sku: '',
          is_deleted: false,
          offerings: [
            {
              offering_id: listingId * 100 + variantNumber,
              quantity,
              price: { amount: basePricePence, divisor: 100, currency_code: currencyCode },
              is_enabled: true,
              is_deleted: false,
              readiness_state_id: 1452994454691,
            },
          ],
          property_values: [
            {
              property_id: 200,
              property_name: 'Design',
              scale_id: null,
              scale_name: null,
              value_ids: [variantValueId],
              values: [`Design ${variantNumber}`],
            },
          ],
        };
      });

      const totalQty = products.reduce(
        (sum, p) => sum + (p.offerings[0]?.quantity ?? 0),
        0
      );

      const listing: EtsyListing = {
        listing_id: listingId,
        title: `${baseTitle} Hamper`,
        description: `Mock hamper fixture with ${variantsPerListing} variants`,
        price: { amount: basePricePence, divisor: 100, currency_code: currencyCode },
        quantity: totalQty,
        state: 'active',
        url: `https://www.etsy.com/listing/${listingId}`,
        has_variations: true,
      };

      const inventory: EtsyInventory = {
        listing_id: listingId,
        products,
        price_on_property: [],
        quantity_on_property: [],
        sku_on_property: [],
      };

      listings.push(listing);
      inventoryByListingId.set(listingId, inventory);
      continue;
    }

    const quantity = 1 + (sequence % 8);

    const listing: EtsyListing = {
      listing_id: listingId,
      title: `${baseTitle} Hamper`,
      description: `Mock hamper fixture`,
      price: { amount: basePricePence, divisor: 100, currency_code: currencyCode },
      quantity,
      state: 'active',
      url: `https://www.etsy.com/listing/${listingId}`,
      has_variations: false,
    };

    const inventory: EtsyInventory = {
      listing_id: listingId,
      products: [
        {
          product_id: listingId * 10,
          sku: '',
          is_deleted: false,
          offerings: [
            {
              offering_id: listingId * 100,
              quantity,
              price: { amount: basePricePence, divisor: 100, currency_code: currencyCode },
              is_enabled: true,
              is_deleted: false,
              readiness_state_id: 1452994454691,
            },
          ],
          property_values: [],
        },
      ],
      price_on_property: [],
      quantity_on_property: [],
      sku_on_property: [],
    };

    listings.push(listing);
    inventoryByListingId.set(listingId, inventory);
  }

  return { listings, inventoryByListingId };
}
