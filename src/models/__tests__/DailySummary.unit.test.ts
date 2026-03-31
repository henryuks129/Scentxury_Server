/**
 * DailySummary Model — Unit Tests
 *
 * MongoDB lifecycle is managed by the global vitest setup file
 * (src/test/setup.ts) — do NOT create a local MongoMemoryServer here,
 * as singleFork mode shares one Mongoose connection across all test files.
 *
 * @file src/models/__tests__/DailySummary.unit.test.ts
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { DailySummary } from '../DailySummary.js';

// Clear the collection before each test (global setup clears all collections
// in beforeEach, but an explicit clear here makes the intent obvious)
beforeEach(async () => {
  await DailySummary.deleteMany({});
});

function validSummary(dateStr: string, overrides = {}) {
  return {
    date: new Date(dateStr),
    dateString: dateStr,
    totalOrders: 10,
    completedOrders: 8,
    cancelledOrders: 1,
    grossRevenue: 500_000,
    discountsGiven: 25_000,
    deliveryFeesCollected: 15_000,
    netRevenue: 490_000,
    costOfGoodsSold: 290_000,
    grossProfit: 200_000,
    grossProfitMargin: 40.8,
    totalExpenses: 80_000,
    netProfit: 120_000,
    netProfitMargin: 24.5,
    newCustomers: 3,
    returningCustomers: 7,
    avgOrderValue: 49_000,
    ...overrides,
  };
}

describe('DailySummary Model', () => {
  describe('creation', () => {
    it('should create a daily summary with valid data', async () => {
      const summary = await DailySummary.create(validSummary('2025-01-15'));

      expect(summary._id).toBeDefined();
      expect(summary.dateString).toBe('2025-01-15');
      expect(summary.totalOrders).toBe(10);
      expect(summary.netRevenue).toBe(490_000);
    });

    it('should set default numeric fields to 0', async () => {
      const summary = await DailySummary.create({
        date: new Date('2025-01-16'),
        dateString: '2025-01-16',
      });

      expect(summary.totalOrders).toBe(0);
      expect(summary.grossRevenue).toBe(0);
      expect(summary.netProfit).toBe(0);
    });

    it('should initialize nested objects with defaults', async () => {
      const summary = await DailySummary.create({
        date: new Date('2025-01-17'),
        dateString: '2025-01-17',
      });

      expect(summary.unitsBySize['20ml']).toBe(0);
      expect(summary.paymentBreakdown.paystack).toBe(0);
      expect(summary.categoryBreakdown.male).toBe(0);
    });
  });

  describe('uniqueness', () => {
    it('should enforce unique dateString', async () => {
      await DailySummary.create(validSummary('2025-01-20'));

      await expect(
        DailySummary.create(validSummary('2025-01-20', { totalOrders: 5 }))
      ).rejects.toThrow();
    });

    it('should allow upsert to update existing summary', async () => {
      await DailySummary.create(validSummary('2025-01-21'));

      const updated = await DailySummary.findOneAndUpdate(
        { dateString: '2025-01-21' },
        { $set: { totalOrders: 15 } },
        { new: true }
      );

      expect(updated?.totalOrders).toBe(15);
    });
  });

  describe('validation', () => {
    it('should reject missing date', async () => {
      const { date: _d, ...data } = validSummary('2025-01-22') as any;
      await expect(DailySummary.create(data)).rejects.toThrow();
    });

    it('should reject invalid dateString format', async () => {
      await expect(
        DailySummary.create(validSummary('2025-01-23', { dateString: '01/23/2025' }))
      ).rejects.toThrow();
    });
  });

  describe('queries', () => {
    it('should find summaries by date range', async () => {
      await DailySummary.create(validSummary('2025-02-01'));
      await DailySummary.create(validSummary('2025-02-10'));
      await DailySummary.create(validSummary('2025-03-01'));

      const feb = await DailySummary.find({
        date: {
          $gte: new Date('2025-02-01'),
          $lte: new Date('2025-02-28'),
        },
      });

      expect(feb).toHaveLength(2);
    });
  });
});
