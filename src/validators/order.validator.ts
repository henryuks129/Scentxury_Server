/**
 * ============================================
 * ORDER VALIDATORS
 * ============================================
 *
 * Zod schemas for order-related operations.
 *
 * @file src/validators/order.validator.ts
 */

import { z } from 'zod';

// ============================================
// CONSTANTS
// ============================================

// Must match OrderStatus type in src/models/Order.ts exactly
export const ORDER_STATUSES = [
  'pending',
  'confirmed',
  'processing',
  'shipped',
  'out_for_delivery',
  'delivered',
  'cancelled',
  'refunded',
  'returned',  // item returned by customer after delivery
] as const;

// Must match PaymentStatus type in src/models/Order.ts exactly.
// 'paid' = successfully captured/settled. Extended gateway states (authorized,
// captured, partially_refunded) are mapped to these four values by the payment
// service (Day 5) before they reach the model.
export const PAYMENT_STATUSES = [
  'pending',
  'paid',
  'failed',
  'refunded',
] as const;

// Must match PaymentMethod type in src/models/Order.ts exactly
export const PAYMENT_METHODS = [
  'paystack',
  'stripe',
  'bank_transfer',
  'cash_on_delivery', // common in Nigerian e-commerce
] as const;

// Must match DeliveryType in src/models/Order.ts exactly
export const DELIVERY_TYPES = [
  'same_day',
  'next_day',
  'standard',
  'pickup', // customer picks up at store/warehouse
] as const;

// ============================================
// HELPER SCHEMAS
// ============================================

/**
 * Nigerian phone validation
 */
export const nigerianPhoneSchema = z
  .string()
  .regex(/^(\+234|0)[789][01]\d{8}$/, 'Invalid Nigerian phone number')
  .transform((phone) => (phone.startsWith('0') ? '+234' + phone.substring(1) : phone));

/**
 * Nigerian postal code (6 digits)
 */
export const postalCodeSchema = z
  .string()
  .regex(/^\d{6}$/, 'Invalid postal code format');

// ============================================
// ADDRESS SCHEMAS
// ============================================

/**
 * Shipping address schema
 */
export const ShippingAddressSchema = z.object({
  recipientName: z
    .string()
    .min(2, 'Recipient name must be at least 2 characters')
    .max(100, 'Recipient name cannot exceed 100 characters')
    .trim(),
  phone: nigerianPhoneSchema,
  alternatePhone: nigerianPhoneSchema.optional(),
  street: z
    .string()
    .min(5, 'Street address must be at least 5 characters')
    .max(200, 'Street address cannot exceed 200 characters')
    .trim(),
  city: z
    .string()
    .min(2, 'City must be at least 2 characters')
    .max(100, 'City cannot exceed 100 characters')
    .trim(),
  state: z
    .string()
    .min(2, 'State must be at least 2 characters')
    .max(50, 'State cannot exceed 50 characters')
    .trim(),
  postalCode: postalCodeSchema.optional(),
  country: z.string().default('Nigeria'),
  landmark: z.string().max(200).optional(),
  deliveryInstructions: z.string().max(500).optional(),
  coordinates: z
    .object({
      lat: z.number().min(-90).max(90),
      lng: z.number().min(-180).max(180),
    })
    .optional(),
});

export type ShippingAddressInput = z.infer<typeof ShippingAddressSchema>;

// ============================================
// ORDER ITEM SCHEMAS
// ============================================

/**
 * Order item schema
 */
export const OrderItemSchema = z.object({
  productId: z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid product ID'),
  variantSku: z
    .string()
    .min(1, 'Variant SKU is required')
    .regex(/^[A-Z0-9-]+$/, 'Invalid SKU format'),
  quantity: z.number().int().positive('Quantity must be at least 1'),
  // priceAtPurchase is optional — the service always resolves price from DB
  // to prevent price-tampering attacks. Never trust client-submitted prices.
  priceAtPurchase: z.number().positive('Price must be positive').optional(),
  currency: z.enum(['NGN', 'USD']).default('NGN'),
  giftWrap: z.boolean().default(false),
  giftMessage: z.string().max(200).optional(),
});

export type OrderItemInput = z.infer<typeof OrderItemSchema>;

// ============================================
// CREATE ORDER SCHEMA
// ============================================

/**
 * Create order schema
 */
export const CreateOrderSchema = z.object({
  items: z.array(OrderItemSchema).min(1, 'At least one item is required'),
  shippingAddress: ShippingAddressSchema,
  deliveryType: z.enum(DELIVERY_TYPES).default('standard'),
  paymentMethod: z.enum(PAYMENT_METHODS),
  currency: z.enum(['NGN', 'USD']).default('NGN'),
  couponCode: z.string().max(50).optional(),
  customerNotes: z.string().max(1000).optional(),
  isGift: z.boolean().default(false),
});

export type CreateOrderInput = z.infer<typeof CreateOrderSchema>;

// ============================================
// UPDATE ORDER STATUS SCHEMAS
// ============================================

/**
 * Update order status schema
 */
export const UpdateOrderStatusSchema = z.object({
  status: z.enum(ORDER_STATUSES),
  notes: z.string().max(500).optional(),
  notifyCustomer: z.boolean().default(true),
});

export type UpdateOrderStatusInput = z.infer<typeof UpdateOrderStatusSchema>;

/**
 * Update payment status schema
 */
export const UpdatePaymentStatusSchema = z.object({
  paymentStatus: z.enum(PAYMENT_STATUSES),
  paymentReference: z.string().optional(),
  paymentProvider: z.enum(PAYMENT_METHODS).optional(),
  transactionId: z.string().optional(),
  notes: z.string().max(500).optional(),
});

export type UpdatePaymentStatusInput = z.infer<typeof UpdatePaymentStatusSchema>;

// ============================================
// TRACKING SCHEMAS
// ============================================

/**
 * Add tracking entry schema
 */
export const AddTrackingEntrySchema = z.object({
  status: z.enum(ORDER_STATUSES),
  description: z.string().max(500),
  location: z.string().max(200).optional(),
  estimatedDelivery: z.coerce.date().optional(),
});

export type AddTrackingEntryInput = z.infer<typeof AddTrackingEntrySchema>;

/**
 * Update delivery info schema
 */
export const UpdateDeliveryInfoSchema = z.object({
  trackingNumber: z.string().max(100).optional(),
  carrier: z.string().max(100).optional(),
  estimatedDelivery: z.coerce.date().optional(),
  actualDelivery: z.coerce.date().optional(),
  deliveryAttempts: z.number().int().min(0).optional(),
  deliveryNotes: z.string().max(500).optional(),
});

export type UpdateDeliveryInfoInput = z.infer<typeof UpdateDeliveryInfoSchema>;

// ============================================
// REFUND SCHEMAS
// ============================================

/**
 * Process refund schema
 */
export const ProcessRefundSchema = z.object({
  amount: z.number().positive('Refund amount must be positive'),
  reason: z
    .string()
    .min(10, 'Refund reason must be at least 10 characters')
    .max(500, 'Refund reason cannot exceed 500 characters'),
  refundMethod: z.enum(['original_payment', 'store_credit', 'bank_transfer']),
  itemsToRefund: z
    .array(
      z.object({
        productId: z.string().regex(/^[0-9a-fA-F]{24}$/),
        variantSku: z.string(),
        quantity: z.number().int().positive(),
      })
    )
    .optional(),
});

export type ProcessRefundInput = z.infer<typeof ProcessRefundSchema>;

// ============================================
// QUERY SCHEMAS
// ============================================

/**
 * Order list query parameters
 */
export const OrderQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  status: z.enum(ORDER_STATUSES).optional(),
  paymentStatus: z.enum(PAYMENT_STATUSES).optional(),
  startDate: z.coerce.date().optional(),
  endDate: z.coerce.date().optional(),
  customerId: z.string().regex(/^[0-9a-fA-F]{24}$/).optional(),
  search: z.string().max(100).optional(),
  sort: z.enum(['createdAt', '-createdAt', 'total', '-total']).default('-createdAt'),
});

export type OrderQueryInput = z.infer<typeof OrderQuerySchema>;

/**
 * Order search by order number.
 * Format matches Order model pre-save hook: CHI + YYYYMM + 6-digit sequence.
 * Example: CHI202603000001
 */
export const OrderSearchSchema = z.object({
  orderNumber: z
    .string()
    .regex(/^CHI\d{10,}$/, 'Invalid order number format'),
});

export type OrderSearchInput = z.infer<typeof OrderSearchSchema>;

// ============================================
// CANCEL ORDER SCHEMA
// ============================================

/**
 * Cancel order schema.
 * Only `reason` is required — the controller infers `cancelledBy` from req.user.role,
 * and refund processing is handled by the payment service on Day 5.
 */
export const CancelOrderSchema = z.object({
  reason: z
    .string()
    .min(10, 'Cancellation reason must be at least 10 characters')
    .max(500, 'Cancellation reason cannot exceed 500 characters'),
  refundRequested: z.boolean().default(true),
  // Who initiated the cancellation — controller can also infer from req.user.role
  cancelledBy: z.enum(['customer', 'admin', 'system']).optional(),
});

export type CancelOrderInput = z.infer<typeof CancelOrderSchema>;

// ============================================
// EXPORTS
// ============================================

export const OrderValidators = {
  createOrder: CreateOrderSchema,
  updateStatus: UpdateOrderStatusSchema,
  updatePaymentStatus: UpdatePaymentStatusSchema,
  addTrackingEntry: AddTrackingEntrySchema,
  updateDeliveryInfo: UpdateDeliveryInfoSchema,
  processRefund: ProcessRefundSchema,
  orderQuery: OrderQuerySchema,
  orderSearch: OrderSearchSchema,
  cancelOrder: CancelOrderSchema,
  shippingAddress: ShippingAddressSchema,
  orderItem: OrderItemSchema,
};

export default OrderValidators;
