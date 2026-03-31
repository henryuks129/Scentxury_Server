/**
 * ============================================
 * PAYMENT VALIDATORS
 * ============================================
 *
 * Zod schemas for payment request validation.
 *
 * @file src/validators/payment.validator.ts
 */

import { z } from 'zod';

// ============================================
// INITIALIZE PAYMENT
// ============================================

export const InitializePaymentSchema = z.object({
  orderId: z.string().min(1, 'Order ID is required'),
  email: z.string().email('Valid email is required'),
  amount: z.number().positive('Amount must be positive'),
  paymentMethod: z.enum(['paystack', 'stripe']),
  reference: z.string().optional(),
  currency: z.enum(['NGN', 'USD']).optional().default('NGN'),
  callbackUrl: z.string().url().optional(),
});

export type InitializePaymentInput = z.infer<typeof InitializePaymentSchema>;

// ============================================
// VERIFY PAYMENT
// ============================================

export const VerifyPaymentSchema = z.object({
  reference: z.string().min(1, 'Payment reference is required'),
});

export type VerifyPaymentInput = z.infer<typeof VerifyPaymentSchema>;

// ============================================
// PAYSTACK WEBHOOK
// ============================================

export const PaystackWebhookSchema = z.object({
  event: z.string(),
  data: z.object({
    id: z.number().optional(),
    reference: z.string().optional(),
    status: z.string().optional(),
    amount: z.number().optional(),
    currency: z.string().optional(),
    metadata: z.record(z.string(), z.unknown()).optional(),
  }).passthrough(),
});

export type PaystackWebhookInput = z.infer<typeof PaystackWebhookSchema>;

// ============================================
// STRIPE WEBHOOK
// ============================================

export const StripeWebhookSchema = z.object({
  type: z.string(),
  data: z.object({
    object: z.record(z.string(), z.unknown()),
  }).passthrough(),
}).passthrough();

export type StripeWebhookInput = z.infer<typeof StripeWebhookSchema>;
