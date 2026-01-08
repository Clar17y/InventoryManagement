import { describe, it, expect } from 'vitest';
import { formatPrice, formatCurrency, formatUnitCost } from '../../lib/formatting';

describe('formatPrice', () => {
  it('formats regular prices with 2 decimal places', () => {
    expect(formatPrice(10)).toBe('£10.00');
    expect(formatPrice(10.5)).toBe('£10.50');
    expect(formatPrice(10.99)).toBe('£10.99');
    expect(formatPrice(1)).toBe('£1.00');
    expect(formatPrice(100.123)).toBe('£100.12');
  });

  it('formats small prices (< £1) with 3 decimal places', () => {
    expect(formatPrice(0.5)).toBe('£0.500');
    expect(formatPrice(0.125)).toBe('£0.125');
    expect(formatPrice(0.999)).toBe('£0.999');
    expect(formatPrice(0.01)).toBe('£0.010');
  });

  it('formats zero with 2 decimal places', () => {
    expect(formatPrice(0)).toBe('£0.00');
  });

  it('handles negative values', () => {
    expect(formatPrice(-10)).toBe('£-10.00');
    expect(formatPrice(-0.5)).toBe('£-0.500');
  });

  it('handles string inputs', () => {
    expect(formatPrice('10.50')).toBe('£10.50');
    expect(formatPrice('0.125')).toBe('£0.125');
  });

  it('handles null and undefined', () => {
    expect(formatPrice(null)).toBe('£0.00');
    expect(formatPrice(undefined)).toBe('£0.00');
  });

  it('handles invalid strings', () => {
    expect(formatPrice('not a number')).toBe('£0.00');
    expect(formatPrice('')).toBe('£0.00');
  });
});

describe('formatCurrency', () => {
  it('always formats with 2 decimal places', () => {
    expect(formatCurrency(10)).toBe('£10.00');
    expect(formatCurrency(10.5)).toBe('£10.50');
    expect(formatCurrency(10.999)).toBe('£11.00');
  });

  it('formats small values with 2 decimal places (not 3)', () => {
    expect(formatCurrency(0.5)).toBe('£0.50');
    expect(formatCurrency(0.125)).toBe('£0.13');
    expect(formatCurrency(0.01)).toBe('£0.01');
  });

  it('formats zero', () => {
    expect(formatCurrency(0)).toBe('£0.00');
  });

  it('handles negative values', () => {
    expect(formatCurrency(-10)).toBe('£-10.00');
    expect(formatCurrency(-0.5)).toBe('£-0.50');
  });

  it('handles string inputs', () => {
    expect(formatCurrency('245.50')).toBe('£245.50');
  });

  it('handles null and undefined', () => {
    expect(formatCurrency(null)).toBe('£0.00');
    expect(formatCurrency(undefined)).toBe('£0.00');
  });
});

describe('formatUnitCost', () => {
  it('formats regular unit costs with 2 decimal places', () => {
    expect(formatUnitCost(5)).toBe('£5.00');
    expect(formatUnitCost(2.5)).toBe('£2.50');
  });

  it('formats small unit costs with 3 decimal places', () => {
    expect(formatUnitCost(0.5)).toBe('£0.500');
    expect(formatUnitCost(0.125)).toBe('£0.125');
  });

  it('appends unit when provided', () => {
    expect(formatUnitCost(2.5, 'kg')).toBe('£2.50/kg');
    expect(formatUnitCost(0.5, 'metre')).toBe('£0.500/metre');
    expect(formatUnitCost(10, 'unit')).toBe('£10.00/unit');
  });

  it('handles no unit', () => {
    expect(formatUnitCost(5, undefined)).toBe('£5.00');
    expect(formatUnitCost(5, '')).toBe('£5.00');
  });

  it('handles null and undefined values', () => {
    expect(formatUnitCost(null)).toBe('£0.00');
    expect(formatUnitCost(undefined, 'kg')).toBe('£0.00/kg');
  });
});
