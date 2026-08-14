import { describe, expect, it } from 'vitest'
import {
  etsyFeeReconciliationSourceSchema,
  etsyFeeReconciliationStatusSchema,
} from '#contracts/domain/etsyFees'
import {
  etsySaleResolutionApplyBodySchema,
  etsySaleResolutionPreviewBodySchema,
  salesVerificationFilterSchema,
} from '#contracts/routes/sales'

const validResolution = {
  type: 'manual_verify' as const,
  etsyOrderId: '4137418052',
  attributed: true,
  offsiteAdsFeePence: 480,
  vatOnOffsiteAdsFeePence: 96,
  note: 'Checked Etsy finances',
}

describe('manual Etsy Sale resolution contracts', () => {
  it('accepts the new status, source, and verification filter values', () => {
    expect(etsyFeeReconciliationStatusSchema.parse('MANUALLY_VERIFIED')).toBe('MANUALLY_VERIFIED')
    expect(etsyFeeReconciliationSourceSchema.parse('MANUAL')).toBe('MANUAL')
    expect(salesVerificationFilterSchema.parse('needs_verification')).toBe('needs_verification')
  })

  it('accepts a manual verification preview request', () => {
    expect(etsySaleResolutionPreviewBodySchema.parse({ resolution: validResolution })).toMatchObject({
      resolution: { type: 'manual_verify' },
    })
  })

  it('rejects negative manual verification pence values', () => {
    expect(() => etsySaleResolutionPreviewBodySchema.parse({
      resolution: { ...validResolution, offsiteAdsFeePence: -1 },
    })).toThrow()
  })

  it('rejects notes longer than five hundred characters', () => {
    expect(() => etsySaleResolutionPreviewBodySchema.parse({
      resolution: { ...validResolution, note: 'x'.repeat(501) },
    })).toThrow()
  })

  it('rejects non-attributed manual verification with non-zero fees', () => {
    expect(() => etsySaleResolutionPreviewBodySchema.parse({
      resolution: { ...validResolution, attributed: false },
    })).toThrow()
  })

  it('rejects reclassification to Etsy', () => {
    expect(() => etsySaleResolutionPreviewBodySchema.parse({
      resolution: { type: 'reclassify', channel: 'etsy' },
    })).toThrow()
  })

  it('rejects malformed apply fingerprints', () => {
    expect(() => etsySaleResolutionApplyBodySchema.parse({
      fingerprint: 'not-a-sha256-fingerprint',
      resolution: validResolution,
    })).toThrow()
  })
})
