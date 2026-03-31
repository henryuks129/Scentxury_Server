/**
 * ============================================
 * ORDER VALIDATORS - TESTS
 * ============================================
 *
 * Tests for order validation schemas.
 *
 * @file src/validators/__tests__/order.validator.test.ts
 */

import { describe, it, expect } from 'vitest';
import {
  CreateOrderSchema,
  UpdateOrderStatusSchema,
  UpdatePaymentStatusSchema,
  AddTrackingEntrySchema,
  UpdateDeliveryInfoSchema,
  ProcessRefundSchema,
  OrderQuerySchema,
  OrderSearchSchema,
  CancelOrderSchema,
  ShippingAddressSchema,
  OrderItemSchema,
  nigerianPhoneSchema,
  postalCodeSchema,
} from '../order.validator.js';

describe('Order Validators', () => {
  // ========================================
  // HELPER SCHEMAS
  // ========================================
  describe('nigerianPhoneSchema', () => {
    it('should accept valid phone starting with 0', () => {
      const result = nigerianPhoneSchema.safeParse('08012345678');
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBe('+2348012345678');
      }
    });

    it('should accept valid phone starting with +234', () => {
      const result = nigerianPhoneSchema.safeParse('+2348012345678');
      expect(result.success).toBe(true);
    });

    it('should reject invalid phone', () => {
      const result = nigerianPhoneSchema.safeParse('1234567890');
      expect(result.success).toBe(false);
    });
  });

  describe('postalCodeSchema', () => {
    it('should accept valid 6-digit postal code', () => {
      const result = postalCodeSchema.safeParse('100001');
      expect(result.success).toBe(true);
    });

    it('should reject postal code with wrong length', () => {
      const result = postalCodeSchema.safeParse('10001');
      expect(result.success).toBe(false);
    });

    it('should reject non-numeric postal code', () => {
      const result = postalCodeSchema.safeParse('10000A');
      expect(result.success).toBe(false);
    });
  });

  // ========================================
  // SHIPPING ADDRESS SCHEMA
  // ========================================
  describe('ShippingAddressSchema', () => {
    const validAddress = {
      recipientName: 'John Doe',
      phone: '08012345678',
      street: '123 Main Street, Victoria Island',
      city: 'Lagos',
      state: 'Lagos State',
    };

    it('should accept valid address', () => {
      const result = ShippingAddressSchema.safeParse(validAddress);
      expect(result.success).toBe(true);
    });

    it('should default country to Nigeria', () => {
      const result = ShippingAddressSchema.safeParse(validAddress);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.country).toBe('Nigeria');
      }
    });

    it('should accept full address with all optional fields', () => {
      const fullAddress = {
        ...validAddress,
        alternatePhone: '09098765432',
        postalCode: '100001',
        landmark: 'Near the bank',
        deliveryInstructions: 'Call before delivery',
        coordinates: { lat: 6.4281, lng: 3.4219 },
      };
      const result = ShippingAddressSchema.safeParse(fullAddress);
      expect(result.success).toBe(true);
    });

    it('should reject address with short recipient name', () => {
      const result = ShippingAddressSchema.safeParse({
        ...validAddress,
        recipientName: 'J',
      });
      expect(result.success).toBe(false);
    });

    it('should reject address with invalid phone', () => {
      const result = ShippingAddressSchema.safeParse({
        ...validAddress,
        phone: 'invalid',
      });
      expect(result.success).toBe(false);
    });

    it('should reject invalid coordinates', () => {
      const result = ShippingAddressSchema.safeParse({
        ...validAddress,
        coordinates: { lat: 100, lng: 200 },
      });
      expect(result.success).toBe(false);
    });
  });

  // ========================================
  // ORDER ITEM SCHEMA
  // ========================================
  describe('OrderItemSchema', () => {
    const validItem = {
      productId: '507f1f77bcf86cd799439011',
      variantSku: 'CHI-001-50ML',
      quantity: 2,
      priceAtPurchase: 35000,
    };

    it('should accept valid order item', () => {
      const result = OrderItemSchema.safeParse(validItem);
      expect(result.success).toBe(true);
    });

    it('should default currency to NGN', () => {
      const result = OrderItemSchema.safeParse(validItem);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.currency).toBe('NGN');
      }
    });

    it('should default giftWrap to false', () => {
      const result = OrderItemSchema.safeParse(validItem);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.giftWrap).toBe(false);
      }
    });

    it('should accept item with gift options', () => {
      const result = OrderItemSchema.safeParse({
        ...validItem,
        giftWrap: true,
        giftMessage: 'Happy Birthday!',
      });
      expect(result.success).toBe(true);
    });

    it('should reject invalid product ID', () => {
      const result = OrderItemSchema.safeParse({
        ...validItem,
        productId: 'invalid',
      });
      expect(result.success).toBe(false);
    });

    it('should reject zero quantity', () => {
      const result = OrderItemSchema.safeParse({
        ...validItem,
        quantity: 0,
      });
      expect(result.success).toBe(false);
    });

    it('should reject invalid SKU format', () => {
      const result = OrderItemSchema.safeParse({
        ...validItem,
        variantSku: 'invalid_sku',
      });
      expect(result.success).toBe(false);
    });
  });

  // ========================================
  // CREATE ORDER SCHEMA
  // ========================================
  describe('CreateOrderSchema', () => {
    const validOrder = {
      items: [
        {
          productId: '507f1f77bcf86cd799439011',
          variantSku: 'CHI-001-50ML',
          quantity: 1,
          priceAtPurchase: 35000,
        },
      ],
      shippingAddress: {
        recipientName: 'John Doe',
        phone: '08012345678',
        street: '123 Main Street',
        city: 'Lagos',
        state: 'Lagos State',
      },
      paymentMethod: 'paystack' as const,
    };

    it('should accept valid order', () => {
      const result = CreateOrderSchema.safeParse(validOrder);
      expect(result.success).toBe(true);
    });

    it('should default deliveryType to standard', () => {
      const result = CreateOrderSchema.safeParse(validOrder);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.deliveryType).toBe('standard');
      }
    });

    it('should default currency to NGN', () => {
      const result = CreateOrderSchema.safeParse(validOrder);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.currency).toBe('NGN');
      }
    });

    it('should accept all valid payment methods', () => {
      const methods = ['paystack', 'stripe', 'bank_transfer', 'cash_on_delivery'] as const;
      methods.forEach((paymentMethod) => {
        const result = CreateOrderSchema.safeParse({ ...validOrder, paymentMethod });
        expect(result.success).toBe(true);
      });
    });

    it('should accept all valid delivery types', () => {
      const types = ['same_day', 'next_day', 'standard', 'pickup'] as const;
      types.forEach((deliveryType) => {
        const result = CreateOrderSchema.safeParse({ ...validOrder, deliveryType });
        expect(result.success).toBe(true);
      });
    });

    it('should accept order with optional fields', () => {
      const result = CreateOrderSchema.safeParse({
        ...validOrder,
        couponCode: 'SAVE10',
        customerNotes: 'Please handle with care',
        isGift: true,
      });
      expect(result.success).toBe(true);
    });

    it('should require at least one item', () => {
      const result = CreateOrderSchema.safeParse({
        ...validOrder,
        items: [],
      });
      expect(result.success).toBe(false);
    });

    it('should reject invalid payment method', () => {
      const result = CreateOrderSchema.safeParse({
        ...validOrder,
        paymentMethod: 'bitcoin',
      });
      expect(result.success).toBe(false);
    });
  });

  // ========================================
  // UPDATE ORDER STATUS SCHEMA
  // ========================================
  describe('UpdateOrderStatusSchema', () => {
    it('should accept valid status update', () => {
      const result = UpdateOrderStatusSchema.safeParse({
        status: 'shipped',
      });
      expect(result.success).toBe(true);
    });

    it('should default notifyCustomer to true', () => {
      const result = UpdateOrderStatusSchema.safeParse({
        status: 'shipped',
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.notifyCustomer).toBe(true);
      }
    });

    it('should accept all valid statuses', () => {
      // All statuses from ORDER_STATUSES constant — must stay in sync with Order model
      const statuses = [
        'pending',
        'confirmed',
        'processing',
        'shipped',
        'out_for_delivery',
        'delivered',
        'cancelled',
        'refunded',  // payment reversed
        'returned',  // item returned by customer
      ] as const;
      statuses.forEach((status) => {
        const result = UpdateOrderStatusSchema.safeParse({ status });
        expect(result.success).toBe(true);
      });
    });

    it('should accept optional notes', () => {
      const result = UpdateOrderStatusSchema.safeParse({
        status: 'shipped',
        notes: 'Shipped via DHL',
      });
      expect(result.success).toBe(true);
    });

    it('should reject invalid status', () => {
      const result = UpdateOrderStatusSchema.safeParse({
        status: 'invalid',
      });
      expect(result.success).toBe(false);
    });
  });

  // ========================================
  // UPDATE PAYMENT STATUS SCHEMA
  // ========================================
  describe('UpdatePaymentStatusSchema', () => {
    it('should accept valid payment status update', () => {
      // 'paid' is the settled/captured state in our model (matches Order.ts PaymentStatus)
      const result = UpdatePaymentStatusSchema.safeParse({
        paymentStatus: 'paid',
      });
      expect(result.success).toBe(true);
    });

    it('should accept full payment update', () => {
      const result = UpdatePaymentStatusSchema.safeParse({
        paymentStatus: 'paid',
        paymentReference: 'PAY-123456',
        paymentProvider: 'paystack',
        transactionId: 'TXN-789',
        notes: 'Payment successful',
      });
      expect(result.success).toBe(true);
    });

    it('should accept all valid payment statuses', () => {
      // Must match PaymentStatus type in Order.ts: 'pending' | 'paid' | 'failed' | 'refunded'
      const statuses = [
        'pending',
        'paid',
        'failed',
        'refunded',
      ] as const;
      statuses.forEach((paymentStatus) => {
        const result = UpdatePaymentStatusSchema.safeParse({ paymentStatus });
        expect(result.success).toBe(true);
      });
    });

    it('should reject gateway-internal statuses not in the model', () => {
      // 'authorized', 'captured', 'partially_refunded' are Stripe/Paystack states;
      // the payment service maps them → 'paid'/'refunded' before persisting (Day 5).
      const invalidStatuses = ['authorized', 'captured', 'partially_refunded'];
      invalidStatuses.forEach((paymentStatus) => {
        const result = UpdatePaymentStatusSchema.safeParse({ paymentStatus });
        expect(result.success).toBe(false);
      });
    });
  });

  // ========================================
  // ADD TRACKING ENTRY SCHEMA
  // ========================================
  describe('AddTrackingEntrySchema', () => {
    it('should accept valid tracking entry', () => {
      const result = AddTrackingEntrySchema.safeParse({
        status: 'shipped',
        description: 'Package has been shipped',
      });
      expect(result.success).toBe(true);
    });

    it('should accept entry with location', () => {
      const result = AddTrackingEntrySchema.safeParse({
        status: 'shipped',
        description: 'Package has been shipped',
        location: 'Lagos Distribution Center',
      });
      expect(result.success).toBe(true);
    });

    it('should coerce date strings', () => {
      const result = AddTrackingEntrySchema.safeParse({
        status: 'shipped',
        description: 'Package has been shipped',
        estimatedDelivery: '2025-01-20T10:00:00Z',
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.estimatedDelivery).toBeInstanceOf(Date);
      }
    });
  });

  // ========================================
  // UPDATE DELIVERY INFO SCHEMA
  // ========================================
  describe('UpdateDeliveryInfoSchema', () => {
    it('should accept partial delivery info update', () => {
      const result = UpdateDeliveryInfoSchema.safeParse({
        trackingNumber: 'DHL123456',
      });
      expect(result.success).toBe(true);
    });

    it('should accept full delivery info update', () => {
      const result = UpdateDeliveryInfoSchema.safeParse({
        trackingNumber: 'DHL123456',
        carrier: 'DHL',
        estimatedDelivery: new Date(),
        deliveryAttempts: 0,
        deliveryNotes: 'Out for delivery',
      });
      expect(result.success).toBe(true);
    });

    it('should accept empty object', () => {
      const result = UpdateDeliveryInfoSchema.safeParse({});
      expect(result.success).toBe(true);
    });
  });

  // ========================================
  // PROCESS REFUND SCHEMA
  // ========================================
  describe('ProcessRefundSchema', () => {
    it('should accept valid refund request', () => {
      const result = ProcessRefundSchema.safeParse({
        amount: 25000,
        reason: 'Customer changed their mind after delivery',
        refundMethod: 'original_payment',
      });
      expect(result.success).toBe(true);
    });

    it('should accept all refund methods', () => {
      const methods = ['original_payment', 'store_credit', 'bank_transfer'] as const;
      methods.forEach((refundMethod) => {
        const result = ProcessRefundSchema.safeParse({
          amount: 25000,
          reason: 'Customer changed their mind after delivery',
          refundMethod,
        });
        expect(result.success).toBe(true);
      });
    });

    it('should accept refund with specific items', () => {
      const result = ProcessRefundSchema.safeParse({
        amount: 25000,
        reason: 'Customer changed their mind after delivery',
        refundMethod: 'original_payment',
        itemsToRefund: [
          {
            productId: '507f1f77bcf86cd799439011',
            variantSku: 'CHI-001-50ML',
            quantity: 1,
          },
        ],
      });
      expect(result.success).toBe(true);
    });

    it('should reject zero refund amount', () => {
      const result = ProcessRefundSchema.safeParse({
        amount: 0,
        reason: 'Customer changed their mind after delivery',
        refundMethod: 'original_payment',
      });
      expect(result.success).toBe(false);
    });

    it('should reject short reason', () => {
      const result = ProcessRefundSchema.safeParse({
        amount: 25000,
        reason: 'Short',
        refundMethod: 'original_payment',
      });
      expect(result.success).toBe(false);
    });
  });

  // ========================================
  // ORDER QUERY SCHEMA
  // ========================================
  describe('OrderQuerySchema', () => {
    it('should accept empty query (defaults)', () => {
      const result = OrderQuerySchema.safeParse({});
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.page).toBe(1);
        expect(result.data.limit).toBe(20);
        expect(result.data.sort).toBe('-createdAt');
      }
    });

    it('should accept date range', () => {
      const result = OrderQuerySchema.safeParse({
        startDate: '2025-01-01',
        endDate: '2025-01-31',
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.startDate).toBeInstanceOf(Date);
        expect(result.data.endDate).toBeInstanceOf(Date);
      }
    });

    it('should accept status filter', () => {
      // paymentStatus must be one of the four values in Order.ts PaymentStatus
      const result = OrderQuerySchema.safeParse({
        status: 'shipped',
        paymentStatus: 'paid',
      });
      expect(result.success).toBe(true);
    });

    it('should reject invalid customer ID', () => {
      const result = OrderQuerySchema.safeParse({
        customerId: 'invalid',
      });
      expect(result.success).toBe(false);
    });
  });

  // ========================================
  // ORDER SEARCH SCHEMA
  // ========================================
  describe('OrderSearchSchema', () => {
    it('should accept valid order number', () => {
      const result = OrderSearchSchema.safeParse({
        orderNumber: 'CHI202501000001',
      });
      expect(result.success).toBe(true);
    });

    it('should reject invalid order number format', () => {
      const result = OrderSearchSchema.safeParse({
        orderNumber: 'ORDER-123',
      });
      expect(result.success).toBe(false);
    });
  });

  // ========================================
  // CANCEL ORDER SCHEMA
  // ========================================
  describe('CancelOrderSchema', () => {
    it('should accept valid cancellation', () => {
      const result = CancelOrderSchema.safeParse({
        reason: 'Customer requested cancellation before shipping',
        cancelledBy: 'customer',
      });
      expect(result.success).toBe(true);
    });

    it('should default refundRequested to true', () => {
      const result = CancelOrderSchema.safeParse({
        reason: 'Customer requested cancellation before shipping',
        cancelledBy: 'customer',
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.refundRequested).toBe(true);
      }
    });

    it('should accept all cancelledBy options', () => {
      const options = ['customer', 'admin', 'system'] as const;
      options.forEach((cancelledBy) => {
        const result = CancelOrderSchema.safeParse({
          reason: 'Customer requested cancellation before shipping',
          cancelledBy,
        });
        expect(result.success).toBe(true);
      });
    });

    it('should reject short reason', () => {
      const result = CancelOrderSchema.safeParse({
        reason: 'Short',
        cancelledBy: 'customer',
      });
      expect(result.success).toBe(false);
    });
  });
});
