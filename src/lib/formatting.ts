/**
 * Price/currency formatting utilities
 * - 2 decimal places for normal prices (£10.50)
 * - 3 decimal places for small unit costs under £1 (£0.125)
 */

/**
 * Format a currency value with appropriate decimal places.
 * Uses 3 decimals for values < £1 (low-cost per-unit items),
 * 2 decimals otherwise.
 */
export function formatPrice(value: number | string | null | undefined): string {
  const num = Number(value) || 0;
  const decimals = Math.abs(num) < 1 && num !== 0 ? 3 : 2;
  return `£${num.toFixed(decimals)}`;
}

/**
 * Format a currency value, always using 2 decimal places.
 * Use for final totals, revenues, margins where consistency matters.
 */
export function formatCurrency(value: number | string | null | undefined): string {
  const num = Number(value) || 0;
  return `£${num.toFixed(2)}`;
}

/**
 * Format a unit cost (e.g., £/metre, £/unit).
 * Uses up to 3 decimals for precision on small values.
 */
export function formatUnitCost(
  value: number | string | null | undefined,
  unit?: string
): string {
  const num = Number(value) || 0;
  const decimals = Math.abs(num) < 1 && num !== 0 ? 3 : 2;
  const formatted = `£${num.toFixed(decimals)}`;
  return unit ? `${formatted}/${unit}` : formatted;
}
