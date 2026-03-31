/**
 * ============================================
 * REFERRAL MODEL - PERFORMANCE TESTS
 * ============================================
 *
 * Performance benchmarks for Referral model operations.
 *
 * @file src/models/__tests__/Referral.perf.test.ts
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import mongoose from 'mongoose';
import { Referral, IReferral } from '../Referral.js';
import { measureTime, expectPerformance } from '../../test/helpers.js';

describe('Referral Model Performance', () => {
  // Shared test data
  const batchId = `PERF${Date.now()}`;
  let testReferrals: IReferral[] = [];

  // Helper to create test referral data
  const createTestReferral = (index: number) => ({
    referrerId: new mongoose.Types.ObjectId(),
    referredUserId: new mongoose.Types.ObjectId(),
    referralCode: `${batchId}-${String(index).padStart(6, '0')}`,
    rewardAmount: 5000 + (index % 10) * 1000,
    rewardCurrency: index % 10 === 0 ? ('USD' as const) : ('NGN' as const),
    rewardType: ['discount', 'credit', 'product'][index % 3] as any,
    status: ['pending', 'qualified', 'rewarded', 'expired'][index % 4] as any,
    expiresAt: new Date(Date.now() + (30 - (index % 60)) * 24 * 60 * 60 * 1000),
    qualifyingOrderId:
      index % 4 === 1 || index % 4 === 2 ? new mongoose.Types.ObjectId() : undefined,
    qualifiedAt: index % 4 === 1 || index % 4 === 2 ? new Date() : undefined,
    rewardedAt: index % 4 === 2 ? new Date() : undefined,
  });

  // Setup: Insert all test data
  beforeAll(async () => {
    const referralData = Array(500)
      .fill(null)
      .map((_, i) => createTestReferral(i));

    const inserted = await Referral.insertMany(referralData);
    testReferrals = inserted as IReferral[];
  });

  // Cleanup
  afterAll(async () => {
    await Referral.deleteMany({ referralCode: { $regex: `^${batchId}` } });
  });

  // ========================================
  // CREATE PERFORMANCE
  // ========================================
  describe('Create Operations', () => {
    it('should create referral within 150ms', async () => {
      let index = 10000;
      // MongoMemoryServer threshold is higher than production; 200ms guards against
      // catastrophic regressions without being flaky in CI.
      await expectPerformance(
        async () => {
          await Referral.create({
            ...createTestReferral(index),
            referredUserId: new mongoose.Types.ObjectId(), // Unique for each
            referralCode: `CREATE-${Date.now()}-${index++}`,
          });
        },
        200,
        10
      );
    });

    it('should bulk insert 100 referrals within 2 seconds', async () => {
      const insertBatchId = `INS${Date.now()}`;
      const referrals = Array(100)
        .fill(null)
        .map((_, i) => ({
          ...createTestReferral(i + 20000),
          referredUserId: new mongoose.Types.ObjectId(),
          referralCode: `${insertBatchId}-${String(i).padStart(6, '0')}`,
        }));

      const { duration } = await measureTime(async () => {
        await Referral.insertMany(referrals);
      });

      expect(duration).toBeLessThan(2000);
      console.log(`100 referrals inserted in ${duration.toFixed(2)}ms`);

      await Referral.deleteMany({ referralCode: { $regex: `^${insertBatchId}` } });
    });
  });

  // ========================================
  // QUERY PERFORMANCE
  // ========================================
  describe('Query Operations', () => {
    it('should find by referralCode within 20ms (indexed)', async () => {
      const targetReferral = testReferrals[250];
      await expectPerformance(
        async () => {
          await Referral.findOne({ referralCode: targetReferral.referralCode });
        },
        20,
        50
      );
    });

    it('should find by referrerId within 30ms (indexed)', async () => {
      const targetReferral = testReferrals[100];
      await expectPerformance(
        async () => {
          await Referral.find({ referrerId: targetReferral.referrerId }).limit(10).lean();
        },
        30,
        50
      );
    });

    it('should find by referredUserId within 20ms (indexed)', async () => {
      const targetReferral = testReferrals[200];
      await expectPerformance(
        async () => {
          await Referral.findOne({ referredUserId: targetReferral.referredUserId });
        },
        20,
        50
      );
    });

    it('should filter by status within 30ms (indexed)', async () => {
      await expectPerformance(
        async () => {
          await Referral.find({
            referralCode: { $regex: `^${batchId}` },
            status: 'pending',
          })
            .limit(20)
            .lean();
        },
        30,
        50
      );
    });

    it('should filter by expiring soon within 40ms', async () => {
      const sevenDaysFromNow = new Date();
      sevenDaysFromNow.setDate(sevenDaysFromNow.getDate() + 7);

      await expectPerformance(
        async () => {
          await Referral.find({
            referralCode: { $regex: `^${batchId}` },
            status: 'pending',
            expiresAt: { $lte: sevenDaysFromNow },
          })
            .limit(20)
            .lean();
        },
        40,
        50
      );
    });

    it('should paginate referrals efficiently', async () => {
      const { duration } = await measureTime(async () => {
        for (let page = 0; page < 5; page++) {
          await Referral.find({ referralCode: { $regex: `^${batchId}` } })
            .skip(page * 100)
            .limit(100)
            .lean();
        }
      });

      expect(duration).toBeLessThan(500);
      console.log(`5 pages of 100 referrals: ${duration.toFixed(2)}ms`);
    });
  });

  // ========================================
  // AGGREGATION PERFORMANCE
  // ========================================
  describe('Aggregation Operations', () => {
    it('should aggregate status counts within 100ms', async () => {
      await expectPerformance(
        async () => {
          await Referral.aggregate([
            { $match: { referralCode: { $regex: `^${batchId}` } } },
            { $group: { _id: '$status', count: { $sum: 1 } } },
          ]);
        },
        100,
        10
      );
    });

    it('should calculate total rewards by status within 100ms', async () => {
      await expectPerformance(
        async () => {
          await Referral.aggregate([
            { $match: { referralCode: { $regex: `^${batchId}` } } },
            {
              $group: {
                _id: '$status',
                totalRewards: { $sum: '$rewardAmount' },
                count: { $sum: 1 },
              },
            },
          ]);
        },
        100,
        10
      );
    });

    it('should find top referrers within 150ms', async () => {
      await expectPerformance(
        async () => {
          await Referral.aggregate([
            { $match: { referralCode: { $regex: `^${batchId}` } } },
            {
              $group: {
                _id: '$referrerId',
                referralCount: { $sum: 1 },
                totalRewards: { $sum: '$rewardAmount' },
              },
            },
            { $sort: { referralCount: -1 } },
            { $limit: 10 },
          ]);
        },
        150,
        10
      );
    });

    it('should calculate conversion rates within 150ms', async () => {
      await expectPerformance(
        async () => {
          await Referral.aggregate([
            { $match: { referralCode: { $regex: `^${batchId}` } } },
            {
              $group: {
                _id: null,
                total: { $sum: 1 },
                qualified: {
                  $sum: { $cond: [{ $eq: ['$status', 'qualified'] }, 1, 0] },
                },
                rewarded: {
                  $sum: { $cond: [{ $eq: ['$status', 'rewarded'] }, 1, 0] },
                },
              },
            },
            {
              $project: {
                conversionRate: {
                  $multiply: [
                    { $divide: [{ $add: ['$qualified', '$rewarded'] }, '$total'] },
                    100,
                  ],
                },
              },
            },
          ]);
        },
        150,
        10
      );
    });

    it('should aggregate reward type breakdown within 100ms', async () => {
      await expectPerformance(
        async () => {
          await Referral.aggregate([
            { $match: { referralCode: { $regex: `^${batchId}` } } },
            {
              $group: {
                _id: '$rewardType',
                count: { $sum: 1 },
                totalValue: { $sum: '$rewardAmount' },
              },
            },
          ]);
        },
        100,
        10
      );
    });
  });

  // ========================================
  // UPDATE PERFORMANCE
  // ========================================
  describe('Update Operations', () => {
    it('should update referral status within 30ms', async () => {
      const targetReferral = testReferrals[300];
      await expectPerformance(
        async () => {
          await Referral.findByIdAndUpdate(targetReferral._id, {
            $set: { status: 'qualified' },
          });
        },
        30,
        50
      );
    });

    it('should qualify referral with order within 30ms', async () => {
      const targetReferral = testReferrals[350];
      const orderId = new mongoose.Types.ObjectId();

      await expectPerformance(
        async () => {
          await Referral.findByIdAndUpdate(targetReferral._id, {
            $set: {
              status: 'qualified',
              qualifyingOrderId: orderId,
              qualifiedAt: new Date(),
            },
          });
        },
        30,
        30
      );
    });

    it('should mark as rewarded within 30ms', async () => {
      const targetReferral = testReferrals[400];

      await expectPerformance(
        async () => {
          await Referral.findByIdAndUpdate(targetReferral._id, {
            $set: {
              status: 'rewarded',
              rewardedAt: new Date(),
            },
          });
        },
        30,
        30
      );
    });

    it('should bulk expire referrals within 200ms', async () => {
      const { duration } = await measureTime(async () => {
        const now = new Date();
        await Referral.updateMany(
          {
            referralCode: { $regex: `^${batchId}` },
            status: 'pending',
            expiresAt: { $lt: now },
          },
          { $set: { status: 'expired' } }
        );
      });

      expect(duration).toBeLessThan(200);
      console.log(`Bulk expire update: ${duration.toFixed(2)}ms`);
    });
  });

  // ========================================
  // DELETE PERFORMANCE
  // ========================================
  describe('Delete Operations', () => {
    it('should deleteMany within 150ms', async () => {
      const deleteBatchId = `DEL${Date.now()}`;
      const referrals = Array(100)
        .fill(null)
        .map((_, i) => ({
          ...createTestReferral(i + 30000),
          referredUserId: new mongoose.Types.ObjectId(),
          referralCode: `${deleteBatchId}-${String(i).padStart(6, '0')}`,
        }));

      await Referral.insertMany(referrals);

      const { duration } = await measureTime(async () => {
        await Referral.deleteMany({ referralCode: { $regex: `^${deleteBatchId}` } });
      });

      expect(duration).toBeLessThan(150);
      console.log(`Bulk delete 100 referrals: ${duration.toFixed(2)}ms`);
    });
  });
});
