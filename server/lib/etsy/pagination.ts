import { IEtsyClient, EtsyListing } from './types';

export async function fetchAllActiveListings(
  client: IEtsyClient,
  options: { limit?: number } = {}
): Promise<EtsyListing[]> {
  const limit = Math.max(1, Math.floor(options.limit ?? 100));
  const allListings: EtsyListing[] = [];

  let offset = 0;
  while (true) {
    const { listings, count } = await client.getActiveListings(limit, offset);
    allListings.push(...listings);

    if (allListings.length >= count) break;
    if (listings.length === 0) break;

    offset += limit;
  }

  return allListings;
}

