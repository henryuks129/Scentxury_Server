/**
 * ============================================
 * ORDER SERVICE — UNIT TESTS
 * ============================================
 *
 * Tests OrderService business logic with in-memory MongoDB.
 *
 * @file src/services/__tests__/order.service.unit.test.ts
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { OrderService } from '../order.service.js';
import { Order } from '../../models/Order.js';
import { User } from '../../models/User.js';
import { Product } from '../../models/Product.js';
import {
  NotFoundError,
  BadRequestError,
  ForbiddenError,
} from '../../utils/errors.js';
import mongoose from 'mongoose';

// ============================================
// FIXTURES
// ============================================

const mkProduct = (stockOverride = 50) => ({
  name: `Product ${Date.now()}-${Math.random()}`,
  description: 'Test product for orders',
  category: 'unisex' as const,
  brand: 'Chi',
  scentFamily: 'woody',
  scentNotes: { top: ['bergamot'], middle: ['rose'], base: ['musk'] },
  images: { boxed: 'http://b.jpg', bottle: 'http://bt.jpg', thumbnail: 'http://t.jpg' },
  variants: [
    {
      sku: `SKU-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      size: '50ml' as const,
      priceNGN: 30000,
      priceUSD: 40,
      costPrice: 15000,
      stock: stockOverride,
    },
  ],
});

const mkUser = () => ({
  email: `user-${Date.now()}@test.com`,
  password: 'Password123!',
  firstName: 'Test',
  lastName: 'User',
});

// ============================================
// TESTS
// ============================================

// Tests OrderService business logic against a real in-memory MongoDB instance.
// Each test is isolated via beforeEach-created user + product fixtures.
// Key invariants tested: price resolution from DB (never from client), stock deduction,
// status transitions, ownership enforcement, and cancellation rules.
describe('OrderService', () => {
  let testUser: any;
  let testProduct: any;
  let orderData: any;

  beforeEach(async () => {
    testUser = await User.create(mkUser());
    testProduct = await Product.create(mkProduct(100));

    orderData = {
      items: [
        {
          productId: testProduct._id.toString(),
          variantSku: testProduct.variants[0].sku,
          quantity: 2,
        },
      ],
      shippingAddress: {
        recipientName: 'John Doe',
        phone: '+2348012345678',
        street: '10 Test Street',
        city: 'Lagos',
        state: 'Lagos',
        country: 'Nigeria',
      },
      paymentMethod: 'paystack' as const,
      deliveryType: 'standard' as const,
    };
  });

  // ============================================
  // CREATE ORDER
  // ============================================
  // createOrder: resolves prices from DB, validates stock, deducts stock atomically,
  // persists the order, and emits a Socket.io event to the admin dashboard.
  describe('createOrder', () => {
    // Happy path: order created with correct orderNumber format and initial status
    it('should create a valid order and return it', async () => {
      const order = await OrderService.createOrder(testUser._id.toString(), orderData);

      expect(order._id).toBeDefined();
      expect(order.orderNumber).toMatch(/^CHI\d+/);
      expect(order.status).toBe('pending');
      expect(order.paymentStatus).toBe('pending');
      expect(order.items).toHaveLength(1);
      expect(order.items[0]!.quantity).toBe(2);
    });

    // Price resolution: totals must come from DB prices, not client-submitted values
    it('should compute correct subtotal from DB prices', async () => {
      const order = await OrderService.createOrder(testUser._id.toString(), orderData);
      // 2 × 30000 NGN + 1500 standard delivery
      expect(order.subtotal).toBe(60000);
      expect(order.total).toBe(61500);
    });

    // Stock deduction: ordered quantity must be deducted from the variant's stock in MongoDB
    it('should deduct stock after order creation', async () => {
      await OrderService.createOrder(testUser._id.toString(), orderData);
      const updated = await Product.findById(testProduct._id);
      expect(updated?.variants[0]!.stock).toBe(98); // 100 - 2
    });

    // Stock guard: ordering more than available stock must throw BadRequestError (→ 400)
    it('should throw BadRequestError when stock is insufficient', async () => {
      const lowStockProduct = await Product.create(mkProduct(1));
      const data = {
        ...orderData,
        items: [
          {
            productId: lowStockProduct._id.toString(),
            variantSku: lowStockProduct.variants[0].sku,
            quantity: 5,
          },
        ],
      };

      await expect(
        OrderService.createOrder(testUser._id.toString(), data)
      ).rejects.toThrow(BadRequestError);
    });

    // Not found: ordering a non-existent product must throw NotFoundError (→ 404)
    it('should throw NotFoundError for unknown productId', async () => {
      const data = {
        ...orderData,
        items: [
          {
            productId: new mongoose.Types.ObjectId().toString(),
            variantSku: 'GHOST-SKU',
            quantity: 1,
          },
        ],
      };

      await expect(
        OrderService.createOrder(testUser._id.toString(), data)
      ).rejects.toThrow(NotFoundError);
    });

    // Tracking history: first entry added by pre-save hook with status 'pending'
    it('should add initial tracking entry', async () => {
      const order = await OrderService.createOrder(testUser._id.toString(), orderData);
      expect(order.trackingHistory.length).toBeGreaterThan(0);
      expect(order.trackingHistory[0]!.status).toBe('pending');
    });
  });

  // ============================================
  // GET USER ORDERS
  // ============================================
  // getUserOrders: scoped to a single userId — must never return other users' orders
  describe('getUserOrders', () => {
    // Happy path: multiple orders created → all appear in paginated result
    it('should return paginated orders for a user', async () => {
      await OrderService.createOrder(testUser._id.toString(), orderData);
      await OrderService.createOrder(testUser._id.toString(), orderData);

      const result = await OrderService.getUserOrders(testUser._id.toString());
      expect(result.orders.length).toBeGreaterThanOrEqual(2);
      expect(result.pagination.total).toBeGreaterThanOrEqual(2);
    });

    // Isolation: another user's orders must NOT appear in the result
    it('should only return orders for the specified user', async () => {
      const anotherUser = await User.create(mkUser());
      await OrderService.createOrder(testUser._id.toString(), orderData);

      const result = await OrderService.getUserOrders(anotherUser._id.toString());
      expect(result.orders).toHaveLength(0);
    });
  });

  // ============================================
  // GET ORDER BY NUMBER
  // ============================================
  // getOrderByNumber: fetches by orderNumber string; enforces ownership when userId provided
  describe('getOrderByNumber', () => {
    // Happy path: order owner can access their order
    it('should return order for the owner', async () => {
      const created = await OrderService.createOrder(testUser._id.toString(), orderData);
      const found = await OrderService.getOrderByNumber(
        created.orderNumber,
        testUser._id.toString()
      );
      expect(found.orderNumber).toBe(created.orderNumber);
    });

    // Ownership: wrong userId → ForbiddenError (→ 403), not 404 (to avoid enumeration)
    it('should throw ForbiddenError when user tries to access another\'s order', async () => {
      const created = await OrderService.createOrder(testUser._id.toString(), orderData);
      const anotherUser = await User.create(mkUser());

      await expect(
        OrderService.getOrderByNumber(created.orderNumber, anotherUser._id.toString())
      ).rejects.toThrow(ForbiddenError);
    });

    // Admin bypass: no userId passed → ownership check skipped (admin access)
    it('should return any order when userId is undefined (admin)', async () => {
      const created = await OrderService.createOrder(testUser._id.toString(), orderData);
      const found = await OrderService.getOrderByNumber(created.orderNumber);
      expect(found._id.toString()).toBe(created._id.toString());
    });

    // Not found: unknown order number → NotFoundError (→ 404)
    it('should throw NotFoundError for unknown order number', async () => {
      await expect(
        OrderService.getOrderByNumber('CHI999999999999')
      ).rejects.toThrow(NotFoundError);
    });
  });

  // ============================================
  // UPDATE ORDER STATUS
  // ============================================
  // updateOrderStatus: validates transitions, appends tracking history, emits Socket.io event.
  // Invalid transitions are blocked by validateStatusTransition().
  describe('updateOrderStatus', () => {
    // Happy path: valid transition → status updated + new tracking entry added
    it('should update status and add tracking entry', async () => {
      const order = await OrderService.createOrder(testUser._id.toString(), orderData);
      const initialTrackingLen = order.trackingHistory.length;

      const updated = await OrderService.updateOrderStatus(
        order.orderNumber,
        'confirmed'
      );

      expect(updated.status).toBe('confirmed');
      expect(updated.trackingHistory.length).toBeGreaterThan(initialTrackingLen);
    });

    // Delivery timestamp: actualDelivery must be set when status transitions to 'delivered'
    it('should set actualDelivery when status is delivered', async () => {
      const order = await OrderService.createOrder(testUser._id.toString(), orderData);
      // Walk through statuses
      await OrderService.updateOrderStatus(order.orderNumber, 'confirmed');
      await OrderService.updateOrderStatus(order.orderNumber, 'processing');
      await OrderService.updateOrderStatus(order.orderNumber, 'shipped');
      const updated = await OrderService.updateOrderStatus(order.orderNumber, 'delivered');

      expect(updated.actualDelivery).toBeInstanceOf(Date);
    });

    // Invalid transition: pending → shipped is not allowed; must throw BadRequestError
    it('should throw BadRequestError on invalid status transition', async () => {
      const order = await OrderService.createOrder(testUser._id.toString(), orderData);
      // Can't jump from pending → shipped
      await expect(
        OrderService.updateOrderStatus(order.orderNumber, 'shipped')
      ).rejects.toThrow(BadRequestError);
    });
  });

  // ============================================
  // CANCEL ORDER
  // ============================================
  // cancelOrder: owner or admin can cancel; triggers async stock restock + Socket.io event.
  // Customer can only cancel pending/confirmed. Admin can cancel up to shipped.
  describe('cancelOrder', () => {
    // Happy path: pending order cancelled by owner
    it('should cancel a pending order', async () => {
      const order = await OrderService.createOrder(testUser._id.toString(), orderData);
      const cancelled = await OrderService.cancelOrder(
        order.orderNumber,
        testUser._id.toString(),
        'Changed my mind'
      );
      expect(cancelled.status).toBe('cancelled');
    });

    // Ownership: another user cannot cancel someone else's order → ForbiddenError
    it('should throw ForbiddenError when wrong user tries to cancel', async () => {
      const order = await OrderService.createOrder(testUser._id.toString(), orderData);
      const anotherUser = await User.create(mkUser());

      await expect(
        OrderService.cancelOrder(
          order.orderNumber,
          anotherUser._id.toString(),
          'reason'
        )
      ).rejects.toThrow(ForbiddenError);
    });

    // Cancellation window: customers cannot cancel 'shipped' orders — BadRequestError
    it('should throw BadRequestError when cancelling a shipped order as customer', async () => {
      const order = await OrderService.createOrder(testUser._id.toString(), orderData);
      await OrderService.updateOrderStatus(order.orderNumber, 'confirmed');
      await OrderService.updateOrderStatus(order.orderNumber, 'processing');
      await OrderService.updateOrderStatus(order.orderNumber, 'shipped');

      await expect(
        OrderService.cancelOrder(
          order.orderNumber,
          testUser._id.toString(),
          'reason'
        )
      ).rejects.toThrow(BadRequestError);
    });
  });

  // ============================================
  // ADMIN ORDER LIST
  // ============================================
  // getAdminOrders: no userId scope, supports status/date/search filters
  describe('getAdminOrders', () => {
    // Happy path: admin sees all orders regardless of userId
    it('should return all orders', async () => {
      await OrderService.createOrder(testUser._id.toString(), orderData);

      const result = await OrderService.getAdminOrders({ page: 1, limit: 20 });
      expect(result.orders.length).toBeGreaterThanOrEqual(1);
    });

    // Status filter: only orders with the specified status must be returned
    it('should filter by status', async () => {
      const order = await OrderService.createOrder(testUser._id.toString(), orderData);
      await OrderService.updateOrderStatus(order.orderNumber, 'confirmed');

      const result = await OrderService.getAdminOrders({ status: 'confirmed' });
      expect(result.orders.every((o) => o.status === 'confirmed')).toBe(true);
    });
  });
});
