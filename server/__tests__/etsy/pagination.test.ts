import { describe, it, expect } from 'vitest';
import { MockEtsyClient } from '../../lib/etsy/mockClient';
import { generateBulkHamperFixtures } from '../../lib/etsy/fixtures';
import { fetchAllActiveListings } from '../../lib/etsy/pagination';

describe('Etsy pagination', () => {
  it('fetchAllActiveListings retrieves all pages', async () => {
    const bulk = generateBulkHamperFixtures(150, {
      multiVariantEvery: 0,
      variantsPerListing: 1,
    });
    const client = new MockEtsyClient({
      listings: bulk.listings,
      inventoryByListingId: bulk.inventoryByListingId,
    });

    const firstPage = await client.getActiveListings(100, 0);
    expect(firstPage.listings).toHaveLength(100);
    expect(firstPage.count).toBe(150);

    const allListings = await fetchAllActiveListings(client);
    expect(allListings).toHaveLength(150);
  });
});

