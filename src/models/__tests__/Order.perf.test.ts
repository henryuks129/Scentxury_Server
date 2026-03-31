/**
 * ============================================
 * ORDER MODEL - PERFORMANCE TESTS
 * ============================================
 *
 * Performance benchmarks for Order model operations.
 *
 * @file src/models/__tests__/Order.perf.test.ts
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import mongoose from 'mongoose';
import { Order, IOrder } from '../Order.js';
import { measureTime, expectPerformance } from '../../test/helpers.js';

describe('Order Model Performance', () => {
  // Shared test data
  const batchId = `PERF${Date.now()}`;
  let testOrders: IOrder[] = [];

  // Helper to create test order data
  const createTestOrder = (index: number) => ({
    orderNumber: `${batchId}${String(index).padStart(6, '0')}`,
    userId: new mongoose.Types.ObjectId(),
    items: [
      {
        productId: new mongoose.Types.ObjectId(),
        productName: `Test Product ${index}`,
        variantSku: `TP${index}-50ML`,
        variantSize: '50ml' as const,
        quantity: Math.floor(Math.random() * 3) + 1,
        unitPrice: 25000,
        costPrice: 12000,
        discount: 0,
        total: 25000 * (Math.floor(Math.random() * 3) + 1),
      },
      {
        productId: new mongoose.Types.ObjectId(),
        productName: `Test Product ${index + 1000}`,
        variantSku: `TP${index + 1000}-100ML`,
        variantSize: '100ml' as const,
        quantity: 1,
        unitPrice: 45000,
        costPrice: 20000,
        discount: 0,
        total: 45000,
      },
    ],
    subtotal: 70000,
    discount: index % 5 === 0 ? 7000 : 0,
    deliveryFee: index % 3 === 0 ? 0 : 2500,
    total: 70000 - (index % 5 === 0 ? 7000 : 0) + (index % 3 === 0 ? 0 : 2500),
    currency: index % 10 === 0 ? ('USD' as const) : ('NGN' as const),
    status: ['pending', 'confirmed', 'processing', 'shipped', 'delivered'][index % 5] as any,
    paymentStatus: ['pending', 'paid', 'paid', 'paid', 'paid'][index % 5] as any,
    paymentMethod: ['paystack', 'stripe', 'bank_transfer'][index % 3] as any,
    paymentReference: `PAY_${batchId}_${index}`,
    shippingAddress: {
      street: `${index} Victoria Island`,
      city: 'Lagos',
      state: 'Lagos',
      country: 'Nigeria',
      phone: `+234801234${String(index).padStart(4, '0')}`,
      recipientName: `Customer ${index}`,
    },
    deliveryType: ['same_day', 'next_day', 'standard'][index % 3] as any,
    createdAt: new Date(Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000),
  });

  // Setup: Insert all test data before any tests run
  beforeAll(async () => {
    const orderData = Array(1000)
      .fill(null)
      .map((_, i) => createTestOrder(i));

    const inserted = await Order.insertMany(orderData);
    testOrders = inserted as IOrder[];
  });

  // Cleanup: Remove all test data after all tests complete
  afterAll(async () => {
    await Order.deleteMany({ orderNumber: { $regex: `^${batchId}` } });
  });

  // ========================================
  // CREATE PERFORMANCE
  // ========================================
  describe('Create Operations', () => {
    it('should create order within 500ms (includes order number generation)', async () => {
      let index = 10000;
      await expectPerformance(
        async () => {
          await Order.create({
            ...createTestOrder(index++),
            orderNumber: undefined, // Force generation
          });
        },
        500,
        5
      );
    });

    it('should bulk insert 100 orders within 3 seconds', async () => {
      const insertBatchId = `INS${Date.now()}`;
      const orders = Array(100)
        .fill(null)
        .map((_, i) => ({
          ...createTestOrder(i + 20000),
          orderNumber: `${insertBatchId}${String(i).padStart(6, '0')}`,
        }));

      const { duration } = await measureTime(async () => {
        await Order.insertMany(orders);
      });

      expect(duration).toBeLessThan(3000);
      console.log(`100 orders inserted in ${duration.toFixed(2)}ms`);

      // Cleanup
      await Order.deleteMany({ orderNumber: { $regex: `^${insertBatchId}` } });
    });
  });

  // ========================================
  // QUERY PERFORMANCE
  // ========================================
  describe('Query Operations', () => {
    it('should find by orderNumber within 20ms (indexed)', async () => {
      const targetOrder = testOrders[250];
      await expectPerformance(
        async () => {
          await Order.findOne({ orderNumber: targetOrder.orderNumber });
        },
        20,
        50
      );
    });

    it('should find by userId within 30ms (indexed)', async () => {
      const targetOrder = testOrders[100];
      await expectPerformance(
        async () => {
          await Order.find({ userId: targetOrder.userId }).limit(10).lean();
        },
        30,
        50
      );
    });

    it('should filter by status within 30ms (indexed)', async () => {
      await expectPerformance(
        async () => {
          await Order.find({
            orderNumber: { $regex: `^${batchId}` },
            status: 'pending',
          })
            .limit(20)
            .lean();
        },
        30,
        50
      );
    });

    it('should filter by paymentStatus within 30ms (indexed)', async () => {
      await expectPerformance(
        async () => {
          await Order.find({
            orderNumber: { $regex: `^${batchId}` },
            paymentStatus: 'paid',
          })
            .limit(20)
            .lean();
        },
        30,
        50
      );
    });

    it('should filter by date range within 40ms', async () => {
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      await expectPerformance(
        async () => {
          await Order.find({
            orderNumber: { $regex: `^${batchId}` },
            createdAt: { $gte: thirtyDaysAgo },
          })
            .limit(20)
            .lean();
        },
        40,
        50
      );
    });

    it('should paginate orders efficiently', async () => {
      const { duration } = await measureTime(async () => {
        for (let page = 0; page < 5; page++) {
          await Order.find({ orderNumber: { $regex: `^${batchId}` } })
            .skip(page * 100)
            .limit(100)
            .lean();
        }
      });

      expect(duration).toBeLessThan(1000);
      console.log(`5 pages of 100 orders: ${duration.toFixed(2)}ms`);
    });

    it('should find by product in items within 40ms', async () => {
      const targetOrder = testOrders[50];
      const productId = targetOrder.items[0].productId;

      await expectPerformance(
        async () => {
          await Order.find({ 'items.productId': productId }).limit(10).lean();
        },
        40,
        30
      );
    });
  });

  // ========================================
  // AGGREGATION PERFORMANCE
  // ========================================
  describe('Aggregation Operations', () => {
    it('should aggregate status counts within 150ms', async () => {
      await expectPerformance(
        async () => {
          await Order.aggregate([
            { $match: { orderNumber: { $regex: `^${batchId}` } } },
            { $group: { _id: '$status', count: { $sum: 1 } } },
          ]);
        },
        150,
        10
      );
    });

    it('should calculate total revenue within 200ms', async () => {
      await expectPerformance(
        async () => {
          await Order.aggregate([
            {
              $match: {
                orderNumber: { $regex: `^${batchId}` },
                paymentStatus: 'paid',
              },
            },
            {
              $group: {
                _id: null,
                totalRevenue: { $sum: '$total' },
                orderCount: { $sum: 1 },
                avgOrderValue: { $avg: '$total' },
              },
            },
          ]);
        },
        200,
        10
      );
    });

    it('should calculate daily order stats within 200ms', async () => {
      await expectPerformance(
        async () => {
          await Order.aggregate([
            { $match: { orderNumber: { $regex: `^${batchId}` } } },
            {
              $group: {
                _id: {
                  $dateToString: { format: '%Y-%m-%d', date: '$createdAt' },
                },
                orders: { $sum: 1 },
                revenue: { $sum: '$total' },
              },
            },
            { $sort: { _id: -1 } },
            { $limit: 7 },
          ]);
        },
        200,
        10
      );
    });

    it('should calculate payment method breakdown within 250ms', async () => {
      await expectPerformance(
        async () => {
          await Order.aggregate([
            { $match: { orderNumber: { $regex: `^${batchId}` } } },
            {
              $group: {
                _id: '$paymentMethod',
                count: { $sum: 1 },
                total: { $sum: '$total' },
              },
            },
          ]);
        },
        250,
        10
      );
    });

    it('should find top selling products within 250ms', async () => {
      await expectPerformance(
        async () => {
          await Order.aggregate([
            { $match: { orderNumber: { $regex: `^${batchId}` } } },
            { $unwind: '$items' },
            {
              $group: {
                _id: '$items.productId',
                productName: { $first: '$items.productName' },
                totalQuantity: { $sum: '$items.quantity' },
                totalRevenue: { $sum: '$items.total' },
              },
            },
            { $sort: { totalQuantity: -1 } },
            { $limit: 10 },
          ]);
        },
        250,
        10
      );
    });
  });

  // ========================================
  // UPDATE PERFORMANCE
  // ========================================
  describe('Update Operations', () => {
    it('should update order status within 30ms', async () => {
      const targetOrder = testOrders[500];
      await expectPerformance(
        async () => {
          await Order.findByIdAndUpdate(targetOrder._id, {
            $set: { status: 'confirmed' },
          });
        },
        30,
        50
      );
    });

    it('should update payment status within 30ms', async () => {
      const targetOrder = testOrders[600];
      await expectPerformance(
        async () => {
          await Order.findByIdAndUpdate(targetOrder._id, {
            $set: { paymentStatus: 'paid', paymentReference: 'PAY_new_ref' },
          });
        },
        30,
        50
      );
    });

    it('should add tracking entry within 40ms', async () => {
      const targetOrder = testOrders[700];
      await expectPerformance(
        async () => {
          await Order.findByIdAndUpdate(targetOrder._id, {
            $push: {
              trackingHistory: {
                status: 'shipped',
                timestamp: new Date(),
                note: 'Package dispatched',
              },
            },
          });
        },
        40,
        30
      );
    });

    it('should bulk update status within 300ms', async () => {
      const { duration } = await measureTime(async () => {
        await Order.updateMany(
          {
            orderNumber: { $regex: `^${batchId}` },
            status: 'pending',
          },
          { $set: { status: 'confirmed' } }
        );
      });

      expect(duration).toBeLessThan(300);
      console.log(`Bulk status update: ${duration.toFixed(2)}ms`);
    });
  });

  // ========================================
  // DELETE PERFORMANCE
  // ========================================
  describe('Delete Operations', () => {
    it('should deleteMany within 200ms', async () => {
      const deleteBatchId = `DEL${Date.now()}`;
      const orders = Array(100)
        .fill(null)
        .map((_, i) => ({
          ...createTestOrder(i + 30000),
          orderNumber: `${deleteBatchId}${String(i).padStart(6, '0')}`,
        }));

      await Order.insertMany(orders);

      const { duration } = await measureTime(async () => {
        await Order.deleteMany({ orderNumber: { $regex: `^${deleteBatchId}` } });
      });

      expect(duration).toBeLessThan(200);
      console.log(`Bulk delete 100 orders: ${duration.toFixed(2)}ms`);
    });
  });
});
