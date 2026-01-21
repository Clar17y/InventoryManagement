export interface LotOverride {
  lotId: string
  productName: string
  quantity: number
  unitCost: number
  maxAvailable: number
}

export interface SaleLineInput {
  hamperId?: string
  variantId?: string
  description?: string
  quantity: number
  unitPrice?: number
  isBespoke?: boolean
}
