/**
 * Payment Validator — Unit Tests
 *
 * @file src/validators/__tests__/payment.validator.test.ts
 */

import { describe, it, expect } from 'vitest';
import {
  InitializePaymentSchema,
  VerifyPaymentSchema,
  PaystackWebhookSchema,
  StripeWebhookSchema,
} from '../payment.validator.js';

describe('Payment Validators', () => {
  // ============================================
  // InitializePaymentSchema
  // ============================================

  describe('InitializePaymentSchema', () => {
    it('should validate a valid paystack initialization', () => {
      const result = InitializePaymentSchema.parse({
        orderId: 'order-123',
        email: 'user@example.com',
        amount: 5000,
        paymentMethod: 'paystack',
      });

      expect(result.orderId).toBe('order-123');
      expect(result.paymentMethod).toBe('paystack');
      expect(result.currency).toBe('NGN'); // default
    });

    it('should validate a valid stripe initialization', () => {
      const result = InitializePaymentSchema.parse({
        orderId: 'order-456',
        email: 'user@example.com',
        amount: 100,
        paymentMethod: 'stripe',
        currency: 'USD',
      });

      expect(result.paymentMethod).toBe('stripe');
      expect(result.currency).toBe('USD');
    });

    it('should reject invalid email', () => {
      expect(() =>
        InitializePaymentSchema.parse({
          orderId: 'order-123',
          email: 'not-an-email',
          amount: 5000,
          paymentMethod: 'paystack',
        })
      ).toThrow();
    });

    it('should reject zero or negative amount', () => {
      expect(() =>
        InitializePaymentSchema.parse({
          orderId: 'order-123',
          email: 'user@example.com',
          amount: 0,
          paymentMethod: 'paystack',
        })
      ).toThrow();

      expect(() =>
        InitializePaymentSchema.parse({
          orderId: 'order-123',
          email: 'user@example.com',
          amount: -100,
          paymentMethod: 'paystack',
        })
      ).toThrow();
    });

    it('should reject invalid paymentMethod', () => {
      expect(() =>
        InitializePaymentSchema.parse({
          orderId: 'order-123',
          email: 'user@example.com',
          amount: 5000,
          paymentMethod: 'bitcoin',
        })
      ).toThrow();
    });

    it('should reject missing orderId', () => {
      expect(() =>
        InitializePaymentSchema.parse({
          email: 'user@example.com',
          amount: 5000,
          paymentMethod: 'paystack',
        })
      ).toThrow();
    });

    it('should accept optional reference and callbackUrl', () => {
      const result = InitializePaymentSchema.parse({
        orderId: 'order-123',
        email: 'user@example.com',
        amount: 5000,
        paymentMethod: 'paystack',
        reference: 'MY-REF-001',
        callbackUrl: 'https://scentxury.com/callback',
      });

      expect(result.reference).toBe('MY-REF-001');
      expect(result.callbackUrl).toBe('https://scentxury.com/callback');
    });

    it('should reject invalid callbackUrl', () => {
      expect(() =>
        InitializePaymentSchema.parse({
          orderId: 'order-123',
          email: 'user@example.com',
          amount: 5000,
          paymentMethod: 'paystack',
          callbackUrl: 'not-a-url',
        })
      ).toThrow();
    });
  });

  // ============================================
  // VerifyPaymentSchema
  // ============================================

  describe('VerifyPaymentSchema', () => {
    it('should validate a valid reference', () => {
      const result = VerifyPaymentSchema.parse({ reference: 'CHI-ORD001-1234-XYZ' });
      expect(result.reference).toBe('CHI-ORD001-1234-XYZ');
    });

    it('should reject empty reference', () => {
      expect(() => VerifyPaymentSchema.parse({ reference: '' })).toThrow();
    });

    it('should reject missing reference', () => {
      expect(() => VerifyPaymentSchema.parse({})).toThrow();
    });
  });

  // ============================================
  // PaystackWebhookSchema
  // ============================================

  describe('PaystackWebhookSchema', () => {
    it('should validate a charge.success event', () => {
      const result = PaystackWebhookSchema.parse({
        event: 'charge.success',
        data: {
          id: 12345,
          reference: 'CHI-ORD001',
          status: 'success',
          amount: 50000,
          currency: 'NGN',
        },
      });

      expect(result.event).toBe('charge.success');
      expect(result.data.reference).toBe('CHI-ORD001');
    });

    it('should allow extra fields in data via passthrough', () => {
      const result = PaystackWebhookSchema.parse({
        event: 'charge.success',
        data: {
          reference: 'REF',
          extra_field: 'extra_value',
        },
      });

      expect((result.data as any).extra_field).toBe('extra_value');
    });

    it('should reject missing event field', () => {
      expect(() =>
        PaystackWebhookSchema.parse({ data: { reference: 'REF' } })
      ).toThrow();
    });
  });

  // ============================================
  // StripeWebhookSchema
  // ============================================

  describe('StripeWebhookSchema', () => {
    it('should validate a payment_intent.succeeded event', () => {
      const result = StripeWebhookSchema.parse({
        type: 'payment_intent.succeeded',
        data: {
          object: {
            id: 'pi_xxx',
            metadata: { orderId: 'order123' },
          },
        },
      });

      expect(result.type).toBe('payment_intent.succeeded');
    });

    it('should reject missing type field', () => {
      expect(() =>
        StripeWebhookSchema.parse({ data: { object: {} } })
      ).toThrow();
    });
  });
});
