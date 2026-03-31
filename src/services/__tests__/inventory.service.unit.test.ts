/**
 * ============================================
 * INVENTORY SERVICE — UNIT TESTS
 * ============================================
 *
 * Tests all stock management operations:
 * - deductStockOnPurchase — decrements, creates audit, emits alerts
 * - restockVariant — increments, recalculates avg cost
 * - adjustStock — positive and negative adjustments
 * - reserveStock — soft hold with Redis key
 * - releaseReservation — restores stock and removes Redis key
 * - updateDailySummaryForOrder — creates / increments DailySummary
 * - getLowStockProducts — filters by threshold, calculates velocity
 *
 * MongoDB in-memory; Redis mocked; Socket.io service mocked.
 *
 * @file src/services/__tests__/inventory.service.unit.test.ts
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import mongoose from 'mongoose';
import { InventoryService } from '../inventory.service.js';
import { Product } from '../../models/Product.js';
import { Order } from '../../models/Order.js';
import { InventoryTransaction } from '../../models/InventoryTransaction.js';
import { DailySummary } from '../../models/DailySummary.js';

// ============================================
// MOCKS
// ============================================

// Redis mock with a store map for reservation keys
const redisStore = new Map<string, string>();

vi.mock('../../config/redis.js', () => ({
  redisClient: {
    get: vi.fn((key: string) => Promise.resolve(redisStore.get(key) ?? null)),
    setex: vi.fn((key: string, _ttl: number, value: string) => {
      redisStore.set(key, value);
      return Promise.resolve('OK');
    }),
    del: vi.fn((key: string) => {
      redisStore.delete(key);
      return Promise.resolve(1);
    }),
  },
  connectRedis: vi.fn(),
  disconnectRedis: vi.fn(),
  isRedisConnected: vi.fn().mockReturnValue(false),
  setCache: vi.fn(),
  getCache: vi.fn().mockResolvedValue(null),
  deleteCache: vi.fn(),
}));

// Mock socket service so alerts don't require a real io instance
vi.mock('../socket.service.js', () => ({
  dashboardEvents: {
    lowStockAlert: vi.fn(),
    outOfStockAlert: vi.fn(),
    dailySummaryUpdated: vi.fn(),
  },
  initializeSocket: vi.fn(),
  getSocketIO: vi.fn(),
}));

// ============================================
// FIXTURES
// ============================================

beforeEach(() => {
  redisStore.clear();
  vi.clearAllMocks();
});

const adminId = new mongoose.Types.ObjectId().toString();

const makeProduct = async (stock = 50, lowStockThreshold = 10) => {
  const sku = `SKU-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return Product.create({
    name: `Test Fragrance ${Math.random()}`,
    description: 'A test fragrance',
    category: 'unisex',
    brand: 'Chi',
    scentFamily: 'woody',
    scentNotes: { top: ['bergamot'], middle: ['rose'], base: ['musk'] },
    images: { boxed: 'http://b.jpg', bottle: 'http://bt.jpg', thumbnail: 'http://th.jpg' },
    variants: [{
      sku,
      size: '50ml',
      priceNGN: 30000,
      priceUSD: 40,
      costPrice: 10000,
      stock,
      lowStockThreshold,
      isAvailable: true,
    }],
    isActive: true,
  });
};

const makeOrder = async (productId: string, variantSku: string, quantity = 1) => {
  const userId = new mongoose.Types.ObjectId();
  return Order.create({
    orderNumber: `ORD-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    userId,
    items: [{
      productId: new mongoose.Types.ObjectId(productId),
      productName: 'Test Product',
      variantSku,
      variantSize: '50ml',
      quantity,
      unitPrice: 30000,
      costPrice: 10000,
      discount: 0,
      total: 30000 * quantity,
    }],
    subtotal: 30000 * quantity,
    discount: 0,
    deliveryFee: 1500,
    total: 31500 * quantity,
    currency: 'NGN',
    status: 'delivered',
    paymentStatus: 'paid',
    paymentMethod: 'paystack',
    shippingAddress: {
      street: '1 Test Lane',
      city: 'Lagos',
      state: 'Lagos',
      country: 'Nigeria',
      phone: '+2340000000000',
      recipientName: 'Test User',
    },
    deliveryType: 'standard',
    trackingHistory: [],
  });
};

// ============================================
// TESTS
// ============================================

describe('InventoryService', () => {
  // -----------------------------------------
  // deductStockOnPurchase
  // -----------------------------------------

  describe('deductStockOnPurchase', () => {
    it('correctly deducts stock from the variant', async () => {
      const product = await makeProduct(50);
      const variantSku = product.variants[0]!.sku;
      const order = await makeOrder(String(product._id), variantSku, 3);

      await InventoryService.deductStockOnPurchase(String(order._id));

      const updated = await Product.findById(product._id).lean();
      const variant = updated?.variants.find((v) => v.sku === variantSku);
      expect(variant?.stock).toBe(47); // 50 - 3
    });

    it('creates an InventoryTransaction record with type "sale"', async () => {
      const product = await makeProduct(50);
      const variantSku = product.variants[0]!.sku;
      const order = await makeOrder(String(product._id), variantSku, 2);

      await InventoryService.deductStockOnPurchase(String(order._id));

      const tx = await InventoryTransaction.findOne({
        productId: product._id,
        transactionType: 'sale',
      }).lean();
      expect(tx).toBeTruthy();
      expect(tx?.quantityChanged).toBe(-2);
    });

    it('emits lowStockAlert when stock falls to or below threshold', async () => {
      const { dashboardEvents } = await import('../socket.service.js');
      const product = await makeProduct(11, 10); // stock 11, threshold 10
      const variantSku = product.variants[0]!.sku;
      const order = await makeOrder(String(product._id), variantSku, 2); // → stock 9

      await InventoryService.deductStockOnPurchase(String(order._id));

      expect(dashboardEvents.lowStockAlert).toHaveBeenCalledWith(
        expect.objectContaining({ productId: String(product._id) })
      );
    });

    it('emits outOfStockAlert when stock reaches 0', async () => {
      const { dashboardEvents } = await import('../socket.service.js');
      const product = await makeProduct(2, 10);
      const variantSku = product.variants[0]!.sku;
      const order = await makeOrder(String(product._id), variantSku, 2); // → stock 0

      await InventoryService.deductStockOnPurchase(String(order._id));

      expect(dashboardEvents.outOfStockAlert).toHaveBeenCalledWith(
        expect.objectContaining({ productId: String(product._id) })
      );
    });
  });

  // -----------------------------------------
  // restockVariant
  // -----------------------------------------

  describe('restockVariant', () => {
    it('increments variant stock by the given quantity', async () => {
      const product = await makeProduct(20);
      const variantSku = product.variants[0]!.sku;

      await InventoryService.restockVariant(String(product._id), variantSku, 30, { costPerUnit: 10000 }, adminId);

      const updated = await Product.findById(product._id).lean();
      const variant = updated?.variants.find((v) => v.sku === variantSku);
      expect(variant?.stock).toBe(50); // 20 + 30
    });

    it('sets isAvailable to true when variant was out of stock', async () => {
      const product = await makeProduct(0);
      await Product.updateOne(
        { _id: product._id, 'variants.sku': product.variants[0]!.sku },
        { $set: { 'variants.$.isAvailable': false } }
      );

      await InventoryService.restockVariant(
        String(product._id),
        product.variants[0]!.sku,
        10,
        { costPerUnit: 10000 },
        adminId
      );

      const updated = await Product.findById(product._id).lean();
      expect(updated?.variants[0]?.isAvailable).toBe(true);
    });

    it('recalculates weighted average cost price after restock', async () => {
      const product = await makeProduct(10); // costPrice: 10000
      const variantSku = product.variants[0]!.sku;

      // Restock 10 more at 12000 per unit
      await InventoryService.restockVariant(String(product._id), variantSku, 10, { costPerUnit: 12000 }, adminId);

      const updated = await Product.findById(product._id).lean();
      const variant = updated?.variants.find((v) => v.sku === variantSku);
      // Weighted avg: (10*10000 + 10*12000) / 20 = 11000
      expect(variant?.costPrice).toBeCloseTo(11000, 0);
    });

    it('creates an InventoryTransaction with type "restock"', async () => {
      const product = await makeProduct(20);
      await InventoryService.restockVariant(String(product._id), product.variants[0]!.sku, 5, { costPerUnit: 10000, supplierName: 'Test Supplier' }, adminId);

      const tx = await InventoryTransaction.findOne({ transactionType: 'restock' }).lean();
      expect(tx).toBeTruthy();
      expect(tx?.quantityChanged).toBe(5);
    });
  });

  // -----------------------------------------
  // adjustStock
  // -----------------------------------------

  describe('adjustStock', () => {
    it('sets variant stock to the exact new value (positive adjustment)', async () => {
      const product = await makeProduct(20);
      const variantSku = product.variants[0]!.sku;

      await InventoryService.adjustStock(String(product._id), variantSku, 35, 'Counted 35', adminId);

      const updated = await Product.findById(product._id).lean();
      expect(updated?.variants[0]?.stock).toBe(35);
    });

    it('creates a "damaged" transaction for negative adjustment', async () => {
      const product = await makeProduct(20);
      const variantSku = product.variants[0]!.sku;

      await InventoryService.adjustStock(String(product._id), variantSku, 15, 'Damaged on delivery', adminId);

      const tx = await InventoryTransaction.findOne({ productId: product._id, transactionType: 'damaged' }).lean();
      expect(tx).toBeTruthy();
      expect(tx?.quantityChanged).toBe(-5); // 15 - 20
    });
  });

  // -----------------------------------------
  // reserveStock
  // -----------------------------------------

  describe('reserveStock', () => {
    it('decrements stock when reserving', async () => {
      const product = await makeProduct(50);
      const variantSku = product.variants[0]!.sku;
      const sessionId = 'cart-session-abc';

      await InventoryService.reserveStock(String(product._id), variantSku, 2, sessionId);

      const updated = await Product.findById(product._id).lean();
      expect(updated?.variants[0]?.stock).toBe(48);
    });

    it('sets a Redis reservation key with the quantity', async () => {
      const product = await makeProduct(50);
      const variantSku = product.variants[0]!.sku;
      const sessionId = 'cart-session-def';

      await InventoryService.reserveStock(String(product._id), variantSku, 3, sessionId);

      const key = `reserve:${product._id}:${variantSku}:${sessionId}`;
      expect(redisStore.has(key)).toBe(true);
      expect(redisStore.get(key)).toBe('3');
    });

    it('throws BadRequestError when stock is insufficient', async () => {
      const product = await makeProduct(1);
      const variantSku = product.variants[0]!.sku;

      await expect(
        InventoryService.reserveStock(String(product._id), variantSku, 5, 'session-too-many')
      ).rejects.toThrow('Insufficient stock');
    });
  });

  // -----------------------------------------
  // releaseReservation
  // -----------------------------------------

  describe('releaseReservation', () => {
    it('restores stock after releasing a reservation', async () => {
      const product = await makeProduct(50);
      const variantSku = product.variants[0]!.sku;
      const sessionId = 'release-session';

      // First reserve
      await InventoryService.reserveStock(String(product._id), variantSku, 3, sessionId);

      // Then release
      await InventoryService.releaseReservation(String(product._id), variantSku, 3, sessionId);

      const updated = await Product.findById(product._id).lean();
      expect(updated?.variants[0]?.stock).toBe(50); // back to original
    });

    it('removes the Redis reservation key after release', async () => {
      const product = await makeProduct(50);
      const variantSku = product.variants[0]!.sku;
      const sessionId = 'release-session-2';
      const key = `reserve:${product._id}:${variantSku}:${sessionId}`;

      await InventoryService.reserveStock(String(product._id), variantSku, 2, sessionId);
      expect(redisStore.has(key)).toBe(true);

      await InventoryService.releaseReservation(String(product._id), variantSku, 2, sessionId);
      expect(redisStore.has(key)).toBe(false);
    });
  });

  // -----------------------------------------
  // updateDailySummaryForOrder
  // -----------------------------------------

  describe('updateDailySummaryForOrder', () => {
    it('creates a DailySummary document if none exists for today', async () => {
      const product = await makeProduct();
      const order = await makeOrder(String(product._id), product.variants[0]!.sku, 1);
      const plainOrder = await Order.findById(order._id).lean();

      const today = new Date().toISOString().split('T')[0];

      await InventoryService.updateDailySummaryForOrder(plainOrder!);

      const summary = await DailySummary.findOne({ dateString: today }).lean();
      expect(summary).toBeTruthy();
      expect(summary?.totalOrders).toBeGreaterThan(0);
    });

    it('increments COGS correctly for the order items', async () => {
      const product = await makeProduct();
      // costPrice = 10000, quantity = 2 → COGS = 20000
      const order = await makeOrder(String(product._id), product.variants[0]!.sku, 2);
      const plainOrder = await Order.findById(order._id).lean();

      await InventoryService.updateDailySummaryForOrder(plainOrder!);

      const today = new Date().toISOString().split('T')[0];
      const summary = await DailySummary.findOne({ dateString: today }).lean();
      expect(summary?.costOfGoodsSold).toBeGreaterThanOrEqual(20000);
    });

    it('emits dailySummaryUpdated after updating the summary', async () => {
      const { dashboardEvents } = await import('../socket.service.js');
      const product = await makeProduct();
      const order = await makeOrder(String(product._id), product.variants[0]!.sku);
      const plainOrder = await Order.findById(order._id).lean();

      await InventoryService.updateDailySummaryForOrder(plainOrder!);

      expect(dashboardEvents.dailySummaryUpdated).toHaveBeenCalled();
    });
  });

  // -----------------------------------------
  // getLowStockProducts
  // -----------------------------------------

  describe('getLowStockProducts', () => {
    it('returns products where any variant is at or below threshold', async () => {
      await makeProduct(3, 10);   // low stock (3 ≤ 10)
      await makeProduct(100, 10); // normal stock (100 > 10)

      const results = await InventoryService.getLowStockProducts(10);

      expect(results.length).toBe(1);
      expect(results[0]?.currentStock).toBe(3);
    });

    it('calculates daysUntilStockout based on sales velocity', async () => {
      await makeProduct(5, 10);

      const results = await InventoryService.getLowStockProducts();
      expect(results.length).toBeGreaterThan(0);
      // daysUntilStockout is a number (999 if no sales)
      expect(typeof results[0]?.daysUntilStockout).toBe('number');
      expect(results[0]!.daysUntilStockout).toBeGreaterThanOrEqual(0);
    });
  });
});
