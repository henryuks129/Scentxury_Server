/**
 * ============================================
 * ORDER MODEL - UNIT TESTS
 * ============================================
 *
 * Comprehensive tests for Order model schema validation,
 * methods, and business logic.
 *
 * @file src/models/__tests__/Order.unit.test.ts
 */

import { describe, it, expect, beforeEach } from 'vitest';
import mongoose from 'mongoose';
import { Order, IOrder, OrderStatus, PaymentStatus } from '../Order.js';

describe('Order Model', () => {
  // Helper to create valid order data
  const createValidOrder = (overrides = {}) => ({
    userId: new mongoose.Types.ObjectId(),
    items: [
      {
        productId: new mongoose.Types.ObjectId(),
        productName: 'Test Fragrance',
        variantSku: 'TF-50ML',
        variantSize: '50ml' as const,
        quantity: 2,
        unitPrice: 25000,
        costPrice: 12000,
        discount: 0,
        total: 50000,
      },
    ],
    subtotal: 50000,
    deliveryFee: 2500,
    total: 52500,
    paymentMethod: 'paystack' as const,
    shippingAddress: {
      street: '123 Victoria Island',
      city: 'Lagos',
      state: 'Lagos',
      country: 'Nigeria',
      phone: '+2348012345678',
      recipientName: 'John Doe',
    },
    ...overrides,
  });

  // ========================================
  // SCHEMA VALIDATION
  // ========================================
  describe('Schema Validation', () => {
    it('should create valid order with required fields', async () => {
      const order = new Order(createValidOrder());
      const error = order.validateSync();
      expect(error).toBeUndefined();
    });

    it('should require userId', async () => {
      const order = new Order(createValidOrder({ userId: undefined }));
      const error = order.validateSync();
      expect(error?.errors['userId']).toBeDefined();
    });

    it('should require at least one item', async () => {
      const order = new Order(createValidOrder({ items: [] }));
      const error = order.validateSync();
      expect(error?.errors['items']).toBeDefined();
    });

    it('should require paymentMethod', async () => {
      const order = new Order(createValidOrder({ paymentMethod: undefined }));
      const error = order.validateSync();
      expect(error?.errors['paymentMethod']).toBeDefined();
    });

    it('should require shippingAddress', async () => {
      const order = new Order(createValidOrder({ shippingAddress: undefined }));
      const error = order.validateSync();
      expect(error?.errors['shippingAddress']).toBeDefined();
    });

    it('should default status to pending', () => {
      const order = new Order(createValidOrder());
      expect(order.status).toBe('pending');
    });

    it('should default paymentStatus to pending', () => {
      const order = new Order(createValidOrder());
      expect(order.paymentStatus).toBe('pending');
    });

    it('should default currency to NGN', () => {
      const order = new Order(createValidOrder());
      expect(order.currency).toBe('NGN');
    });

    it('should default deliveryType to standard', () => {
      const order = new Order(createValidOrder());
      expect(order.deliveryType).toBe('standard');
    });
  });

  // ========================================
  // ORDER STATUS
  // ========================================
  describe('Order Status', () => {
    const validStatuses: OrderStatus[] = [
      'pending',
      'confirmed',
      'processing',
      'shipped',
      'out_for_delivery',
      'delivered',
      'cancelled',
      'refunded',
    ];

    validStatuses.forEach((status) => {
      it(`should accept status: ${status}`, () => {
        const order = new Order(createValidOrder({ status }));
        const error = order.validateSync();
        expect(error?.errors['status']).toBeUndefined();
        expect(order.status).toBe(status);
      });
    });

    it('should reject invalid status', () => {
      const order = new Order(createValidOrder({ status: 'invalid_status' }));
      const error = order.validateSync();
      expect(error?.errors['status']).toBeDefined();
    });
  });

  // ========================================
  // PAYMENT STATUS
  // ========================================
  describe('Payment Status', () => {
    const validPaymentStatuses: PaymentStatus[] = ['pending', 'paid', 'failed', 'refunded'];

    validPaymentStatuses.forEach((status) => {
      it(`should accept paymentStatus: ${status}`, () => {
        const order = new Order(createValidOrder({ paymentStatus: status }));
        const error = order.validateSync();
        expect(error?.errors['paymentStatus']).toBeUndefined();
        expect(order.paymentStatus).toBe(status);
      });
    });

    it('should reject invalid paymentStatus', () => {
      const order = new Order(createValidOrder({ paymentStatus: 'invalid' }));
      const error = order.validateSync();
      expect(error?.errors['paymentStatus']).toBeDefined();
    });
  });

  // ========================================
  // PAYMENT METHOD
  // ========================================
  describe('Payment Method', () => {
    const validMethods = ['paystack', 'stripe', 'bank_transfer'];

    validMethods.forEach((method) => {
      it(`should accept paymentMethod: ${method}`, () => {
        const order = new Order(createValidOrder({ paymentMethod: method }));
        const error = order.validateSync();
        expect(error?.errors['paymentMethod']).toBeUndefined();
      });
    });

    it('should reject invalid paymentMethod', () => {
      const order = new Order(createValidOrder({ paymentMethod: 'bitcoin' }));
      const error = order.validateSync();
      expect(error?.errors['paymentMethod']).toBeDefined();
    });
  });

  // ========================================
  // ORDER ITEMS
  // ========================================
  describe('Order Items', () => {
    it('should validate item productId', () => {
      const order = new Order(
        createValidOrder({
          items: [
            {
              productName: 'Test',
              variantSku: 'SKU',
              variantSize: '50ml',
              quantity: 1,
              unitPrice: 1000,
              costPrice: 500,
              discount: 0,
              total: 1000,
            },
          ],
        })
      );
      const error = order.validateSync();
      expect(error?.errors['items.0.productId']).toBeDefined();
    });

    it('should validate item productName', () => {
      const order = new Order(
        createValidOrder({
          items: [
            {
              productId: new mongoose.Types.ObjectId(),
              variantSku: 'SKU',
              variantSize: '50ml',
              quantity: 1,
              unitPrice: 1000,
              costPrice: 500,
              discount: 0,
              total: 1000,
            },
          ],
        })
      );
      const error = order.validateSync();
      expect(error?.errors['items.0.productName']).toBeDefined();
    });

    it('should validate item variantSize enum', () => {
      const order = new Order(
        createValidOrder({
          items: [
            {
              productId: new mongoose.Types.ObjectId(),
              productName: 'Test',
              variantSku: 'SKU',
              variantSize: '75ml', // Invalid size
              quantity: 1,
              unitPrice: 1000,
              costPrice: 500,
              discount: 0,
              total: 1000,
            },
          ],
        })
      );
      const error = order.validateSync();
      expect(error?.errors['items.0.variantSize']).toBeDefined();
    });

    it('should accept valid variant sizes', () => {
      const sizes = ['20ml', '50ml', '100ml'] as const;
      sizes.forEach((size) => {
        const order = new Order(
          createValidOrder({
            items: [
              {
                productId: new mongoose.Types.ObjectId(),
                productName: 'Test',
                variantSku: 'SKU',
                variantSize: size,
                quantity: 1,
                unitPrice: 1000,
                costPrice: 500,
                discount: 0,
                total: 1000,
              },
            ],
          })
        );
        const error = order.validateSync();
        expect(error?.errors[`items.0.variantSize`]).toBeUndefined();
      });
    });

    it('should require quantity minimum of 1', () => {
      const order = new Order(
        createValidOrder({
          items: [
            {
              productId: new mongoose.Types.ObjectId(),
              productName: 'Test',
              variantSku: 'SKU',
              variantSize: '50ml',
              quantity: 0,
              unitPrice: 1000,
              costPrice: 500,
              discount: 0,
              total: 1000,
            },
          ],
        })
      );
      const error = order.validateSync();
      expect(error?.errors['items.0.quantity']).toBeDefined();
    });

    it('should support multiple items', () => {
      const order = new Order(
        createValidOrder({
          items: [
            {
              productId: new mongoose.Types.ObjectId(),
              productName: 'Product 1',
              variantSku: 'SKU1',
              variantSize: '50ml',
              quantity: 2,
              unitPrice: 25000,
              costPrice: 12000,
              discount: 0,
              total: 50000,
            },
            {
              productId: new mongoose.Types.ObjectId(),
              productName: 'Product 2',
              variantSku: 'SKU2',
              variantSize: '100ml',
              quantity: 1,
              unitPrice: 45000,
              costPrice: 20000,
              discount: 5000,
              total: 40000,
            },
          ],
        })
      );
      const error = order.validateSync();
      expect(error).toBeUndefined();
      expect(order.items).toHaveLength(2);
    });

    it('should store item image optionally', () => {
      const order = new Order(
        createValidOrder({
          items: [
            {
              productId: new mongoose.Types.ObjectId(),
              productName: 'Test',
              variantSku: 'SKU',
              variantSize: '50ml',
              quantity: 1,
              unitPrice: 1000,
              costPrice: 500,
              discount: 0,
              total: 1000,
              image: 'https://example.com/image.jpg',
            },
          ],
        })
      );
      expect(order.items[0].image).toBe('https://example.com/image.jpg');
    });
  });

  // ========================================
  // SHIPPING ADDRESS
  // ========================================
  describe('Shipping Address', () => {
    it('should require street', () => {
      const order = new Order(
        createValidOrder({
          shippingAddress: {
            city: 'Lagos',
            state: 'Lagos',
            phone: '+234801234567',
            recipientName: 'John',
          },
        })
      );
      const error = order.validateSync();
      expect(error?.errors['shippingAddress.street']).toBeDefined();
    });

    it('should require city', () => {
      const order = new Order(
        createValidOrder({
          shippingAddress: {
            street: '123 Test St',
            state: 'Lagos',
            phone: '+234801234567',
            recipientName: 'John',
          },
        })
      );
      const error = order.validateSync();
      expect(error?.errors['shippingAddress.city']).toBeDefined();
    });

    it('should require state', () => {
      const order = new Order(
        createValidOrder({
          shippingAddress: {
            street: '123 Test St',
            city: 'Lagos',
            phone: '+234801234567',
            recipientName: 'John',
          },
        })
      );
      const error = order.validateSync();
      expect(error?.errors['shippingAddress.state']).toBeDefined();
    });

    it('should require phone', () => {
      const order = new Order(
        createValidOrder({
          shippingAddress: {
            street: '123 Test St',
            city: 'Lagos',
            state: 'Lagos',
            recipientName: 'John',
          },
        })
      );
      const error = order.validateSync();
      expect(error?.errors['shippingAddress.phone']).toBeDefined();
    });

    it('should require recipientName', () => {
      const order = new Order(
        createValidOrder({
          shippingAddress: {
            street: '123 Test St',
            city: 'Lagos',
            state: 'Lagos',
            phone: '+234801234567',
          },
        })
      );
      const error = order.validateSync();
      expect(error?.errors['shippingAddress.recipientName']).toBeDefined();
    });

    it('should default country to Nigeria', () => {
      const order = new Order(createValidOrder());
      expect(order.shippingAddress.country).toBe('Nigeria');
    });

    it('should accept custom country', () => {
      const order = new Order(
        createValidOrder({
          shippingAddress: {
            street: '123 Test St',
            city: 'London',
            state: 'Greater London',
            country: 'United Kingdom',
            phone: '+44123456789',
            recipientName: 'Jane Doe',
          },
        })
      );
      expect(order.shippingAddress.country).toBe('United Kingdom');
    });

    it('should store postal code optionally', () => {
      const order = new Order(
        createValidOrder({
          shippingAddress: {
            street: '123 Test St',
            city: 'Lagos',
            state: 'Lagos',
            country: 'Nigeria',
            postalCode: '100001',
            phone: '+234801234567',
            recipientName: 'John',
          },
        })
      );
      expect(order.shippingAddress.postalCode).toBe('100001');
    });

    it('should store coordinates optionally', () => {
      const order = new Order(
        createValidOrder({
          shippingAddress: {
            street: '123 Test St',
            city: 'Lagos',
            state: 'Lagos',
            country: 'Nigeria',
            coordinates: { lat: 6.5244, lng: 3.3792 },
            phone: '+234801234567',
            recipientName: 'John',
          },
        })
      );
      expect(order.shippingAddress.coordinates?.lat).toBe(6.5244);
      expect(order.shippingAddress.coordinates?.lng).toBe(3.3792);
    });
  });

  // ========================================
  // DELIVERY TYPE
  // ========================================
  describe('Delivery Type', () => {
    const deliveryTypes = ['same_day', 'next_day', 'standard'];

    deliveryTypes.forEach((type) => {
      it(`should accept deliveryType: ${type}`, () => {
        const order = new Order(createValidOrder({ deliveryType: type }));
        const error = order.validateSync();
        expect(error?.errors['deliveryType']).toBeUndefined();
      });
    });

    it('should reject invalid deliveryType', () => {
      const order = new Order(createValidOrder({ deliveryType: 'express' }));
      const error = order.validateSync();
      expect(error?.errors['deliveryType']).toBeDefined();
    });
  });

  // ========================================
  // CURRENCY
  // ========================================
  describe('Currency', () => {
    it('should accept NGN currency', () => {
      const order = new Order(createValidOrder({ currency: 'NGN' }));
      expect(order.currency).toBe('NGN');
    });

    it('should accept USD currency', () => {
      const order = new Order(createValidOrder({ currency: 'USD' }));
      expect(order.currency).toBe('USD');
    });

    it('should reject invalid currency', () => {
      const order = new Order(createValidOrder({ currency: 'EUR' }));
      const error = order.validateSync();
      expect(error?.errors['currency']).toBeDefined();
    });
  });

  // ========================================
  // ORDER NUMBER GENERATION
  // ========================================
  describe('Order Number Generation', () => {
    it('should generate order number on save', async () => {
      const order = await Order.create(createValidOrder());
      expect(order.orderNumber).toBeDefined();
      expect(order.orderNumber).toMatch(/^CHI\d{6}\d{6}$/);
    });

    it('should generate unique order numbers', async () => {
      const order1 = await Order.create(createValidOrder());
      const order2 = await Order.create(createValidOrder());
      expect(order1.orderNumber).not.toBe(order2.orderNumber);
    });

    it('should not override existing order number', async () => {
      const customOrderNumber = 'CHI202501000001';
      const order = await Order.create(
        createValidOrder({ orderNumber: customOrderNumber })
      );
      expect(order.orderNumber).toBe(customOrderNumber);
    });
  });

  // ========================================
  // TRACKING HISTORY
  // ========================================
  describe('Tracking History', () => {
    it('should add tracking entry on new order', async () => {
      const order = await Order.create(createValidOrder());
      expect(order.trackingHistory).toHaveLength(1);
      expect(order.trackingHistory[0].status).toBe('pending');
    });

    it('should add tracking entry on status change', async () => {
      const order = await Order.create(createValidOrder());
      order.status = 'confirmed';
      await order.save();

      expect(order.trackingHistory).toHaveLength(2);
      expect(order.trackingHistory[1].status).toBe('confirmed');
    });

    it('should track multiple status changes', async () => {
      const order = await Order.create(createValidOrder());

      order.status = 'confirmed';
      await order.save();

      order.status = 'processing';
      await order.save();

      order.status = 'shipped';
      await order.save();

      expect(order.trackingHistory).toHaveLength(4);
      expect(order.trackingHistory.map((t) => t.status)).toEqual([
        'pending',
        'confirmed',
        'processing',
        'shipped',
      ]);
    });

    it('should include timestamp in tracking entry', async () => {
      const beforeCreate = new Date();
      const order = await Order.create(createValidOrder());

      expect(order.trackingHistory[0].timestamp).toBeDefined();
      expect(order.trackingHistory[0].timestamp.getTime()).toBeGreaterThanOrEqual(
        beforeCreate.getTime()
      );
    });

    it('should support tracking notes', async () => {
      const order = new Order(
        createValidOrder({
          trackingHistory: [
            {
              status: 'pending',
              timestamp: new Date(),
              note: 'Order received',
            },
          ],
        })
      );
      expect(order.trackingHistory[0].note).toBe('Order received');
    });

    it('should support updatedBy reference', async () => {
      const adminId = new mongoose.Types.ObjectId();
      const order = new Order(
        createValidOrder({
          trackingHistory: [
            {
              status: 'pending',
              timestamp: new Date(),
              updatedBy: adminId,
            },
          ],
        })
      );
      expect(order.trackingHistory[0].updatedBy?.toString()).toBe(adminId.toString());
    });
  });

  // ========================================
  // OPTIONAL FIELDS
  // ========================================
  describe('Optional Fields', () => {
    it('should store discount code', () => {
      const order = new Order(
        createValidOrder({
          discountCode: 'WELCOME10',
          discount: 5250,
        })
      );
      expect(order.discountCode).toBe('WELCOME10');
      expect(order.discount).toBe(5250);
    });

    it('should store payment reference', () => {
      const order = new Order(
        createValidOrder({
          paymentReference: 'PAY_abc123xyz',
        })
      );
      expect(order.paymentReference).toBe('PAY_abc123xyz');
    });

    it('should store estimated delivery date', () => {
      const estimatedDate = new Date('2025-01-20');
      const order = new Order(
        createValidOrder({
          estimatedDelivery: estimatedDate,
        })
      );
      expect(order.estimatedDelivery).toEqual(estimatedDate);
    });

    it('should store actual delivery date', () => {
      const actualDate = new Date('2025-01-19');
      const order = new Order(
        createValidOrder({
          actualDelivery: actualDate,
        })
      );
      expect(order.actualDelivery).toEqual(actualDate);
    });

    it('should store customer notes', () => {
      const order = new Order(
        createValidOrder({
          notes: 'Please leave at the gate',
        })
      );
      expect(order.notes).toBe('Please leave at the gate');
    });

    it('should store admin notes', () => {
      const order = new Order(
        createValidOrder({
          adminNotes: 'VIP customer - priority delivery',
        })
      );
      expect(order.adminNotes).toBe('VIP customer - priority delivery');
    });
  });

  // ========================================
  // PRICING FIELDS
  // ========================================
  describe('Pricing Fields', () => {
    it('should require subtotal', () => {
      const order = new Order(createValidOrder({ subtotal: undefined }));
      const error = order.validateSync();
      expect(error?.errors['subtotal']).toBeDefined();
    });

    it('should require total', () => {
      const order = new Order(createValidOrder({ total: undefined }));
      const error = order.validateSync();
      expect(error?.errors['total']).toBeDefined();
    });

    it('should default discount to 0', () => {
      const order = new Order(createValidOrder());
      expect(order.discount).toBe(0);
    });

    it('should default deliveryFee to 0', () => {
      const orderData = createValidOrder();
      delete (orderData as any).deliveryFee;
      const order = new Order(orderData);
      expect(order.deliveryFee).toBe(0);
    });

    it('should calculate correct totals', () => {
      const order = new Order(
        createValidOrder({
          subtotal: 100000,
          discount: 10000,
          deliveryFee: 5000,
          total: 95000, // 100000 - 10000 + 5000
        })
      );
      expect(order.subtotal).toBe(100000);
      expect(order.discount).toBe(10000);
      expect(order.deliveryFee).toBe(5000);
      expect(order.total).toBe(95000);
    });
  });

  // ========================================
  // TIMESTAMPS
  // ========================================
  describe('Timestamps', () => {
    it('should set createdAt on creation', async () => {
      const beforeCreate = new Date();
      const order = await Order.create(createValidOrder());
      expect(order.createdAt).toBeDefined();
      expect(order.createdAt.getTime()).toBeGreaterThanOrEqual(beforeCreate.getTime());
    });

    it('should set updatedAt on creation', async () => {
      const order = await Order.create(createValidOrder());
      expect(order.updatedAt).toBeDefined();
    });

    it('should update updatedAt on save', async () => {
      const order = await Order.create(createValidOrder());
      const originalUpdatedAt = order.updatedAt;

      await new Promise((resolve) => setTimeout(resolve, 10));
      order.status = 'confirmed';
      await order.save();

      expect(order.updatedAt.getTime()).toBeGreaterThan(originalUpdatedAt.getTime());
    });
  });

  // ========================================
  // INDEXES
  // ========================================
  describe('Indexes', () => {
    it('should have unique orderNumber index', async () => {
      const order1 = await Order.create(createValidOrder());

      await expect(
        Order.create({ ...createValidOrder(), orderNumber: order1.orderNumber })
      ).rejects.toThrow();
    });

    it('should have userId index', async () => {
      const indexes = Order.schema.indexes();
      const userIdIndex = indexes.find(
        ([fields]) => Object.keys(fields).includes('userId')
      );
      expect(userIdIndex).toBeDefined();
    });

    it('should have status index', async () => {
      const indexes = Order.schema.indexes();
      const statusIndex = indexes.find(
        ([fields]) => Object.keys(fields).includes('status')
      );
      expect(statusIndex).toBeDefined();
    });
  });
});
