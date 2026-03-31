/**
 * Payment Service — Unit Tests
 *
 * Tests Paystack + Stripe integration, webhook handling,
 * retry logic, and reference generation.
 *
 * @file src/services/__tests__/payment.service.unit.test.ts
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import axios from 'axios';
import {
  initializePaystackPayment,
  verifyPaystackPayment,
  handlePaystackWebhook,
  createStripePaymentIntent,
  handleStripeWebhook,
  initializePaystackPaymentWithRetry,
  generatePaymentReference,
} from '../payment.service.js';
import { Order } from '@models/Order.js';

// ============================================
// MOCKS
// ============================================

vi.mock('axios');
vi.mock('@models/Order.js');
vi.mock('@config/stripe.js', () => ({
  stripe: {
    paymentIntents: {
      create: vi.fn(),
    },
    webhooks: {
      constructEvent: vi.fn(),
    },
  },
}));

const mockedAxios = vi.mocked(axios);

// ============================================
// PAYSTACK — initializePaystackPayment
// ============================================

describe('PaymentService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.PAYSTACK_SECRET_KEY = 'sk_test_xxx';
    process.env.PAYSTACK_WEBHOOK_SECRET = 'whsec_xxx';
    process.env.STRIPE_WEBHOOK_SECRET = 'whsec_stripe_xxx';
  });

  // ----------------------------------------
  // PAYSTACK
  // ----------------------------------------

  describe('initializePaystackPayment', () => {
    it('should initialize Paystack payment successfully', async () => {
      mockedAxios.post = vi.fn().mockResolvedValue({
        data: {
          status: true,
          data: {
            authorization_url: 'https://checkout.paystack.com/abc',
            access_code: 'abc123',
            reference: 'CHI-ORD001-1234-XYZ',
          },
        },
      });

      const result = await initializePaystackPayment({
        orderId: 'order123',
        email: 'test@example.com',
        amount: 500,
      });

      expect(result.authorizationUrl).toBe('https://checkout.paystack.com/abc');
      expect(result.reference).toBe('CHI-ORD001-1234-XYZ');
    });

    it('should convert NGN amount to kobo (× 100)', async () => {
      mockedAxios.post = vi.fn().mockResolvedValue({
        data: { status: true, data: { authorization_url: 'url', access_code: 'c', reference: 'r' } },
      });

      await initializePaystackPayment({
        orderId: 'order123',
        email: 'test@example.com',
        amount: 500, // ₦500 → 50000 kobo
      });

      expect(mockedAxios.post).toHaveBeenCalledWith(
        expect.stringContaining('/transaction/initialize'),
        expect.objectContaining({ amount: 50000 }),
        expect.any(Object)
      );
    });

    it('should include Authorization Bearer header', async () => {
      mockedAxios.post = vi.fn().mockResolvedValue({
        data: { status: true, data: { authorization_url: 'url', access_code: 'c', reference: 'r' } },
      });

      await initializePaystackPayment({
        orderId: 'order123',
        email: 'test@example.com',
        amount: 500,
      });

      expect(mockedAxios.post).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(Object),
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'Bearer sk_test_xxx',
          }),
        })
      );
    });

    it('should use provided reference when given', async () => {
      mockedAxios.post = vi.fn().mockResolvedValue({
        data: { status: true, data: { authorization_url: 'url', access_code: 'c', reference: 'MY-REF' } },
      });

      await initializePaystackPayment({
        orderId: 'order123',
        email: 'test@example.com',
        amount: 500,
        reference: 'MY-REF',
      });

      expect(mockedAxios.post).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ reference: 'MY-REF' }),
        expect.any(Object)
      );
    });

    it('should throw PaymentError when Paystack returns status: false', async () => {
      mockedAxios.post = vi.fn().mockResolvedValue({
        data: { status: false, message: 'Invalid key' },
      });

      await expect(
        initializePaystackPayment({
          orderId: 'order123',
          email: 'test@example.com',
          amount: 500,
        })
      ).rejects.toThrow();
    });

    it('should throw ExternalServiceError when PAYSTACK_SECRET_KEY is missing', async () => {
      delete process.env.PAYSTACK_SECRET_KEY;

      await expect(
        initializePaystackPayment({
          orderId: 'order123',
          email: 'test@example.com',
          amount: 500,
        })
      ).rejects.toThrow('Paystack secret key is not configured');
    });

    it('should throw PaymentError on network error', async () => {
      mockedAxios.post = vi.fn().mockRejectedValue(
        Object.assign(new Error('Network error'), { isAxiosError: true, response: null })
      );
      mockedAxios.isAxiosError = vi.fn().mockReturnValue(true);

      await expect(
        initializePaystackPayment({
          orderId: 'order123',
          email: 'test@example.com',
          amount: 500,
        })
      ).rejects.toThrow();
    });
  });

  // ----------------------------------------
  // verifyPaystackPayment
  // ----------------------------------------

  describe('verifyPaystackPayment', () => {
    it('should verify a successful payment', async () => {
      mockedAxios.get = vi.fn().mockResolvedValue({
        data: {
          status: true,
          data: {
            status: 'success',
            reference: 'CHI-ORD001-1234-XYZ',
            amount: 50000,
            currency: 'NGN',
            paid_at: '2025-01-15T12:00:00Z',
          },
        },
      });

      const result = await verifyPaystackPayment('CHI-ORD001-1234-XYZ');

      expect(result.status).toBe('success');
      expect(result.amount).toBe(50000);
      expect(result.currency).toBe('NGN');
    });

    it('should return failed status for a failed payment', async () => {
      mockedAxios.get = vi.fn().mockResolvedValue({
        data: {
          status: true,
          data: {
            status: 'failed',
            reference: 'CHI-FAILED',
            amount: 50000,
            currency: 'NGN',
          },
        },
      });

      const result = await verifyPaystackPayment('CHI-FAILED');

      expect(result.status).toBe('failed');
    });

    it('should URL-encode the reference in the GET request', async () => {
      mockedAxios.get = vi.fn().mockResolvedValue({
        data: { status: true, data: { status: 'success', reference: 'ref/with/slash', amount: 0, currency: 'NGN' } },
      });

      await verifyPaystackPayment('ref/with/slash');

      expect(mockedAxios.get).toHaveBeenCalledWith(
        expect.stringContaining('ref%2Fwith%2Fslash'),
        expect.any(Object)
      );
    });
  });

  // ----------------------------------------
  // handlePaystackWebhook
  // ----------------------------------------

  describe('handlePaystackWebhook', () => {
    it('should update order paymentStatus to paid on charge.success', async () => {
      const mockOrder = {
        orderNumber: 'CHI-000001',
        paymentStatus: 'pending',
        status: 'pending',
        save: vi.fn().mockResolvedValue(true),
      };
      vi.mocked(Order.findOne).mockResolvedValue(mockOrder as any);

      const event = {
        event: 'charge.success',
        data: { reference: 'CHI-ORD001-1234-XYZ' },
      };

      // Generate valid HMAC
      const crypto = await import('crypto');
      const signature = crypto
        .createHmac('sha512', 'whsec_xxx')
        .update(JSON.stringify(event))
        .digest('hex');

      await handlePaystackWebhook(event, signature);

      expect(mockOrder.paymentStatus).toBe('paid');
      expect(mockOrder.status).toBe('confirmed');
      expect(mockOrder.save).toHaveBeenCalled();
    });

    it('should throw BadRequestError on invalid signature', async () => {
      const event = { event: 'charge.success', data: { reference: 'ref' } };

      await expect(
        handlePaystackWebhook(event, 'invalid-signature')
      ).rejects.toThrow('Invalid Paystack webhook signature');
    });

    it('should handle charge.failed event and update paymentStatus', async () => {
      const mockOrder = {
        orderNumber: 'CHI-000002',
        paymentStatus: 'pending',
        save: vi.fn().mockResolvedValue(true),
      };
      vi.mocked(Order.findOne).mockResolvedValue(mockOrder as any);

      const event = {
        event: 'charge.failed',
        data: { reference: 'CHI-FAIL-REF' },
      };

      const crypto = await import('crypto');
      const signature = crypto
        .createHmac('sha512', 'whsec_xxx')
        .update(JSON.stringify(event))
        .digest('hex');

      await handlePaystackWebhook(event, signature);

      expect(mockOrder.paymentStatus).toBe('failed');
    });

    it('should not throw when order not found (webhook should always 200)', async () => {
      vi.mocked(Order.findOne).mockResolvedValue(null);

      const event = {
        event: 'charge.success',
        data: { reference: 'NONEXISTENT-REF' },
      };

      const crypto = await import('crypto');
      const signature = crypto
        .createHmac('sha512', 'whsec_xxx')
        .update(JSON.stringify(event))
        .digest('hex');

      // Should not throw
      await expect(handlePaystackWebhook(event, signature)).resolves.toBeUndefined();
    });
  });

  // ----------------------------------------
  // STRIPE — createStripePaymentIntent
  // ----------------------------------------

  describe('createStripePaymentIntent', () => {
    it('should create a Stripe PaymentIntent successfully', async () => {
      const { stripe } = await import('@config/stripe.js');
      vi.mocked(stripe.paymentIntents.create).mockResolvedValue({
        id: 'pi_test_xxx',
        client_secret: 'pi_test_xxx_secret_yyy',
        amount: 10000,
        currency: 'usd',
        status: 'requires_payment_method',
      } as any);

      const result = await createStripePaymentIntent({
        orderId: 'order123',
        email: 'test@example.com',
        amount: 10000,
        currency: 'usd',
      });

      expect(result.clientSecret).toBe('pi_test_xxx_secret_yyy');
      expect(result.paymentIntentId).toBe('pi_test_xxx');
    });

    it('should include orderId in metadata', async () => {
      const { stripe } = await import('@config/stripe.js');
      vi.mocked(stripe.paymentIntents.create).mockResolvedValue({
        id: 'pi_xxx',
        client_secret: 'pi_xxx_secret',
        amount: 5000,
        currency: 'usd',
        status: 'requires_payment_method',
      } as any);

      await createStripePaymentIntent({
        orderId: 'order-123',
        email: 'user@example.com',
        amount: 5000,
      });

      expect(stripe.paymentIntents.create).toHaveBeenCalledWith(
        expect.objectContaining({
          metadata: expect.objectContaining({ orderId: 'order-123' }),
        })
      );
    });

    it('should throw PaymentError when Stripe SDK throws', async () => {
      const { stripe } = await import('@config/stripe.js');
      vi.mocked(stripe.paymentIntents.create).mockRejectedValue(
        new Error('Stripe API error')
      );

      await expect(
        createStripePaymentIntent({
          orderId: 'order123',
          email: 'test@example.com',
          amount: 5000,
        })
      ).rejects.toThrow('Stripe PaymentIntent creation failed');
    });
  });

  // ----------------------------------------
  // handleStripeWebhook
  // ----------------------------------------

  describe('handleStripeWebhook', () => {
    it('should update order to paid on payment_intent.succeeded', async () => {
      const mockOrder = {
        orderNumber: 'CHI-000003',
        paymentStatus: 'pending',
        status: 'pending',
        save: vi.fn().mockResolvedValue(true),
      };
      vi.mocked(Order.findById).mockResolvedValue(mockOrder as any);

      const event = {
        type: 'payment_intent.succeeded',
        data: {
          object: {
            id: 'pi_xxx',
            metadata: { orderId: 'order123' },
          },
        },
      };

      await handleStripeWebhook(event);

      expect(mockOrder.paymentStatus).toBe('paid');
      expect(mockOrder.status).toBe('confirmed');
      expect(mockOrder.save).toHaveBeenCalled();
    });

    it('should update order to failed on payment_intent.payment_failed', async () => {
      const mockOrder = {
        orderNumber: 'CHI-000004',
        paymentStatus: 'pending',
        save: vi.fn().mockResolvedValue(true),
      };
      vi.mocked(Order.findById).mockResolvedValue(mockOrder as any);

      const event = {
        type: 'payment_intent.payment_failed',
        data: {
          object: {
            id: 'pi_yyy',
            metadata: { orderId: 'order456' },
          },
        },
      };

      await handleStripeWebhook(event);

      expect(mockOrder.paymentStatus).toBe('failed');
    });
  });

  // ----------------------------------------
  // RETRY LOGIC
  // ----------------------------------------

  describe('initializePaystackPaymentWithRetry', () => {
    it('should succeed on third attempt after two failures', async () => {
      let attempts = 0;
      mockedAxios.post = vi.fn().mockImplementation(() => {
        attempts++;
        if (attempts < 3) {
          return Promise.reject(
            Object.assign(new Error('Temp fail'), { isAxiosError: true, response: null })
          );
        }
        return Promise.resolve({
          data: {
            status: true,
            data: { authorization_url: 'url', access_code: 'c', reference: 'r' },
          },
        });
      });
      mockedAxios.isAxiosError = vi.fn().mockReturnValue(true);

      const result = await initializePaystackPaymentWithRetry(
        { orderId: 'order123', email: 'test@example.com', amount: 500 },
        3
      );

      expect(attempts).toBe(3);
      expect(result.authorizationUrl).toBe('url');
    });

    it('should throw PaymentError after all retries exhausted', async () => {
      mockedAxios.post = vi.fn().mockRejectedValue(
        Object.assign(new Error('Persistent failure'), { isAxiosError: true, response: null })
      );
      mockedAxios.isAxiosError = vi.fn().mockReturnValue(true);

      await expect(
        initializePaystackPaymentWithRetry(
          { orderId: 'order123', email: 'test@example.com', amount: 500 },
          2
        )
      ).rejects.toThrow('Payment initialization failed after 2 attempts');
    });
  });

  // ----------------------------------------
  // generatePaymentReference
  // ----------------------------------------

  describe('generatePaymentReference', () => {
    it('should generate a reference with CHI prefix', () => {
      const ref = generatePaymentReference();
      expect(ref).toMatch(/^CHI-/);
    });

    it('should include order number when provided', () => {
      const ref = generatePaymentReference('ORD-001');
      expect(ref).toContain('ORD-001');
    });

    it('should generate unique references', () => {
      const refs = new Set(Array.from({ length: 100 }, () => generatePaymentReference()));
      expect(refs.size).toBe(100);
    });
  });
});
