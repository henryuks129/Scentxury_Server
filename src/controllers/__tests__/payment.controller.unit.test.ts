/**
 * Payment Controller — Unit Tests
 *
 * @file src/controllers/__tests__/payment.controller.unit.test.ts
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  initializePaystackPayment,
  verifyPaystackPayment,
  handlePaystackWebhook,
  createStripePaymentIntent,
} from '../payment.controller.js';
import { PaymentService } from '@services/payment.service.js';
import { Order } from '@models/Order.js';
import { mockRequest, mockResponse } from '../../test/helpers.js';

// ============================================
// MOCKS
// ============================================

vi.mock('@services/payment.service.js');
vi.mock('@models/Order.js');
vi.mock('../../queues/receipt.queue.js', () => ({
  addGeneratePDFReceiptJob: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('../../queues/notification.queue.js', () => ({
  addPaymentNotification: vi.fn().mockResolvedValue(undefined),
}));

// ============================================
// TESTS
// ============================================

describe('PaymentController', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ============================================
  // initializePaystackPayment
  // ============================================

  describe('initializePaystackPayment', () => {
    it('should return 200 with authorization URL on success', async () => {
      const mockOrder = {
        paymentStatus: 'pending',
        paymentReference: undefined,
        paymentMethod: undefined,
        save: vi.fn().mockResolvedValue(true),
      };
      vi.mocked(Order.findById).mockResolvedValue(mockOrder as any);
      vi.mocked(PaymentService.initializePaystackPayment).mockResolvedValue({
        authorizationUrl: 'https://checkout.paystack.com/abc',
        accessCode: 'abc123',
        reference: 'CHI-REF-001',
      });

      const req = mockRequest({
        body: {
          orderId: 'order123',
          email: 'test@example.com',
          amount: 5000,
          paymentMethod: 'paystack',
        },
      });
      const res = mockResponse();
      const next = vi.fn();

      await initializePaystackPayment(req as any, res as any, next);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: expect.objectContaining({
            authorizationUrl: 'https://checkout.paystack.com/abc',
            reference: 'CHI-REF-001',
          }),
        })
      );
    });

    it('should call next with NotFoundError when order not found', async () => {
      vi.mocked(Order.findById).mockResolvedValue(null);

      const req = mockRequest({
        body: {
          orderId: 'nonexistent',
          email: 'test@example.com',
          amount: 5000,
          paymentMethod: 'paystack',
        },
      });
      const res = mockResponse();
      const next = vi.fn();

      await initializePaystackPayment(req as any, res as any, next);

      expect(next).toHaveBeenCalledWith(expect.any(Error));
    });

    it('should call next with BadRequestError when order is already paid', async () => {
      vi.mocked(Order.findById).mockResolvedValue({
        paymentStatus: 'paid',
      } as any);

      const req = mockRequest({
        body: {
          orderId: 'order123',
          email: 'test@example.com',
          amount: 5000,
          paymentMethod: 'paystack',
        },
      });
      const res = mockResponse();
      const next = vi.fn();

      await initializePaystackPayment(req as any, res as any, next);

      expect(next).toHaveBeenCalledWith(expect.any(Error));
      const err = next.mock.calls[0][0] as any;
      expect(err.statusCode).toBe(400);
    });

    it('should call next with BadRequestError for wrong paymentMethod', async () => {
      const req = mockRequest({
        body: {
          orderId: 'order123',
          email: 'test@example.com',
          amount: 5000,
          paymentMethod: 'stripe', // wrong for this endpoint
        },
      });
      const res = mockResponse();
      const next = vi.fn();

      await initializePaystackPayment(req as any, res as any, next);

      expect(next).toHaveBeenCalled();
    });

    it('should save paymentReference and paymentMethod on order', async () => {
      const mockOrder = {
        paymentStatus: 'pending',
        paymentReference: undefined,
        paymentMethod: undefined,
        save: vi.fn().mockResolvedValue(true),
      };
      vi.mocked(Order.findById).mockResolvedValue(mockOrder as any);
      vi.mocked(PaymentService.initializePaystackPayment).mockResolvedValue({
        authorizationUrl: 'url',
        accessCode: 'code',
        reference: 'MY-REF',
      });

      const req = mockRequest({
        body: {
          orderId: 'order123',
          email: 'test@example.com',
          amount: 5000,
          paymentMethod: 'paystack',
        },
      });
      const res = mockResponse();
      const next = vi.fn();

      await initializePaystackPayment(req as any, res as any, next);

      expect(mockOrder.paymentReference).toBe('MY-REF');
      expect(mockOrder.paymentMethod).toBe('paystack');
      expect(mockOrder.save).toHaveBeenCalled();
    });
  });

  // ============================================
  // verifyPaystackPayment
  // ============================================

  describe('verifyPaystackPayment', () => {
    it('should return 200 with payment status on success', async () => {
      vi.mocked(PaymentService.verifyPaystackPayment).mockResolvedValue({
        status: 'success',
        reference: 'CHI-REF-001',
        amount: 50000,
        currency: 'NGN',
        paidAt: '2025-01-15T12:00:00Z',
      });

      const mockOrder = {
        _id: 'order123',
        orderNumber: 'CHI-000001',
        paymentStatus: 'pending',
        status: 'pending',
        total: 500,
        currency: 'NGN',
        userId: 'user123',
        save: vi.fn().mockResolvedValue(true),
      };
      vi.mocked(Order.findOne).mockResolvedValue(mockOrder as any);

      const req = mockRequest({ query: { reference: 'CHI-REF-001' } });
      const res = mockResponse();
      const next = vi.fn();

      await verifyPaystackPayment(req as any, res as any, next);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: expect.objectContaining({ status: 'success' }),
        })
      );
    });

    it('should update order to paid when payment succeeds', async () => {
      vi.mocked(PaymentService.verifyPaystackPayment).mockResolvedValue({
        status: 'success',
        reference: 'REF-001',
        amount: 50000,
        currency: 'NGN',
      });

      const mockOrder = {
        _id: 'order123',
        orderNumber: 'CHI-000001',
        paymentStatus: 'pending',
        status: 'pending',
        total: 500,
        currency: 'NGN',
        userId: 'user123',
        save: vi.fn().mockResolvedValue(true),
      };
      vi.mocked(Order.findOne).mockResolvedValue(mockOrder as any);

      const req = mockRequest({ query: { reference: 'REF-001' } });
      const res = mockResponse();
      const next = vi.fn();

      await verifyPaystackPayment(req as any, res as any, next);

      expect(mockOrder.paymentStatus).toBe('paid');
      expect(mockOrder.status).toBe('confirmed');
      expect(mockOrder.save).toHaveBeenCalled();
    });

    it('should call next on validation error when reference is missing', async () => {
      const req = mockRequest({ query: {} }); // missing reference
      const res = mockResponse();
      const next = vi.fn();

      await verifyPaystackPayment(req as any, res as any, next);

      expect(next).toHaveBeenCalled();
    });
  });

  // ============================================
  // handlePaystackWebhook
  // ============================================

  describe('handlePaystackWebhook', () => {
    it('should return 200 on valid webhook', async () => {
      vi.mocked(PaymentService.handlePaystackWebhook).mockResolvedValue(undefined);

      const req = mockRequest({
        headers: { 'x-paystack-signature': 'valid-sig' },
        body: { event: 'charge.success', data: { reference: 'ref' } },
      });
      const res = mockResponse();
      const next = vi.fn();

      await handlePaystackWebhook(req as any, res as any, next);

      expect(res.status).toHaveBeenCalledWith(200);
    });

    it('should call next with BadRequestError when signature header is missing', async () => {
      const req = mockRequest({
        headers: {},
        body: { event: 'charge.success' },
      });
      const res = mockResponse();
      const next = vi.fn();

      await handlePaystackWebhook(req as any, res as any, next);

      expect(next).toHaveBeenCalledWith(expect.any(Error));
    });
  });

  // ============================================
  // createStripePaymentIntent
  // ============================================

  describe('createStripePaymentIntent', () => {
    it('should return 200 with client secret on success', async () => {
      const mockOrder = {
        paymentMethod: undefined,
        currency: 'NGN',
        paymentStatus: 'pending',
        save: vi.fn().mockResolvedValue(true),
      };
      vi.mocked(Order.findById).mockResolvedValue(mockOrder as any);
      vi.mocked(PaymentService.createStripePaymentIntent).mockResolvedValue({
        clientSecret: 'pi_xxx_secret',
        paymentIntentId: 'pi_xxx',
        amount: 10000,
        currency: 'usd',
      });

      const req = mockRequest({
        body: {
          orderId: 'order123',
          email: 'test@example.com',
          amount: 100,
          paymentMethod: 'stripe',
          currency: 'USD',
        },
      });
      const res = mockResponse();
      const next = vi.fn();

      await createStripePaymentIntent(req as any, res as any, next);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: expect.objectContaining({ clientSecret: 'pi_xxx_secret' }),
        })
      );
    });
  });
});
