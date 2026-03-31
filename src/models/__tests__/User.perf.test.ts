/**
 * ============================================
 * USER MODEL - PERFORMANCE TESTS
 * ============================================
 *
 * Performance benchmarks for User model operations.
 * Uses MongoDB Memory Server from test setup.
 *
 * @file src/models/__tests__/User.perf.test.ts
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { User } from '../User.js';
import { measureTime, expectPerformance } from '../../test/helpers.js';

describe('User Model Performance', () => {
  // Helper to create test user data
  const createUserData = (index: number) => ({
    email: `perf${index}${Date.now()}@example.com`,
    password: 'Password123!',
    firstName: `User${index}`,
    lastName: 'PerfTest',
  });

  // ========================================
  // CREATE PERFORMANCE
  // ========================================
  describe('Create Operations', () => {
    it('should create user within 700ms (includes bcrypt cost factor 12)', async () => {
      let index = 0;
      await expectPerformance(
        async () => {
          await User.create(createUserData(index++));
        },
        700, // bcrypt with cost factor 12 is intentionally slow for security
        5 // 5 iterations (bcrypt is slow)
      );
    });

    it('should handle 20 concurrent user creations within 10 seconds', async () => {
      const users = Array(20)
        .fill(null)
        .map((_, i) => createUserData(i + 1000));

      const { duration } = await measureTime(async () => {
        await Promise.all(users.map((u) => User.create(u)));
      });

      // 20 users with password hashing should complete within 10s
      expect(duration).toBeLessThan(10000);
      console.log(`20 users created in ${duration.toFixed(2)}ms`);
    });

    it('should bulk insert users with insertMany within 5 seconds', async () => {
      // Note: insertMany won't trigger pre-save hooks (no password hashing)
      // This tests raw insertion performance
      const users = Array(100)
        .fill(null)
        .map((_, i) => ({
          ...createUserData(i + 2000),
          password: '$2b$12$hashedpassword', // Pre-hashed for insertMany
          referralCode: `CHI-TEST${String(i).padStart(4, '0')}`,
        }));

      const { duration } = await measureTime(async () => {
        await User.insertMany(users);
      });

      expect(duration).toBeLessThan(5000);
      console.log(`100 users inserted in ${duration.toFixed(2)}ms`);
    });
  });

  // ========================================
  // QUERY PERFORMANCE
  // ========================================
  describe('Query Operations', () => {
    beforeAll(async () => {
      // Seed test data for query tests
      const users = Array(1000)
        .fill(null)
        .map((_, i) => ({
          email: `querytest${i}@example.com`,
          password: '$2b$12$hashedpassword',
          firstName: `Query${i}`,
          lastName: 'TestUser',
          role: i % 10 === 0 ? 'admin' : 'user',
          referralCode: `CHI-QRY${String(i).padStart(4, '0')}`,
          isActive: i % 5 !== 0, // 80% active
        }));

      await User.insertMany(users);
    });

    afterAll(async () => {
      await User.deleteMany({ email: /^querytest/ });
    });

    it('should find by email within 20ms (indexed)', async () => {
      await expectPerformance(
        async () => {
          await User.findOne({ email: 'querytest500@example.com' });
        },
        20,
        50
      );
    });

    it('should find by referralCode within 20ms (indexed)', async () => {
      await expectPerformance(
        async () => {
          await User.findOne({ referralCode: 'CHI-QRY0500' });
        },
        20,
        50
      );
    });

    it('should find by role within 30ms (indexed)', async () => {
      await expectPerformance(
        async () => {
          await User.find({ role: 'admin' }).limit(10);
        },
        30,
        50
      );
    });

    it('should paginate 1000 users efficiently', async () => {
      const { duration } = await measureTime(async () => {
        // Simulate pagination through 10 pages
        for (let page = 0; page < 10; page++) {
          await User.find({ email: /^querytest/ })
            .skip(page * 100)
            .limit(100)
            .lean();
        }
      });

      expect(duration).toBeLessThan(2000);
      console.log(`10 pages of 100 users each: ${duration.toFixed(2)}ms`);
    });

    it('should count documents within 50ms', async () => {
      await expectPerformance(
        async () => {
          await User.countDocuments({ role: 'user', isActive: true });
        },
        50,
        20
      );
    });

    it('should find with multiple filters within 30ms', async () => {
      await expectPerformance(
        async () => {
          await User.find({
            role: 'user',
            isActive: true,
            email: { $regex: /^querytest[0-9]/ },
          }).limit(20);
        },
        30,
        30
      );
    });
  });

  // ========================================
  // PASSWORD COMPARISON PERFORMANCE
  // ========================================
  describe('Password Comparison', () => {
    it('should compare password within 1000ms (bcrypt cost factor 12)', async () => {
      const user = await User.create({
        email: `passperf${Date.now()}@example.com`,
        password: 'Password123!',
        firstName: 'Pass',
        lastName: 'Test',
      });

      const userWithPassword = await User.findById(user._id).select('+password');

      await expectPerformance(
        async () => {
          await userWithPassword!.comparePassword('Password123!');
        },
        1000, // bcrypt with cost factor 12 comparison is intentionally slow for security
        3 // Few iterations since bcrypt is slow by design
      );
    });
  });

  // ========================================
  // UPDATE PERFORMANCE
  // ========================================
  describe('Update Operations', () => {
    beforeAll(async () => {
      const users = Array(100)
        .fill(null)
        .map((_, i) => ({
          email: `updatetest${i}@example.com`,
          password: '$2b$12$hashedpassword',
          firstName: `Update${i}`,
          lastName: 'TestUser',
          referralCode: `CHI-UPD${String(i).padStart(4, '0')}`,
        }));

      await User.insertMany(users);
    });

    afterAll(async () => {
      await User.deleteMany({ email: /^updatetest/ });
    });

    it('should updateOne within 30ms', async () => {
      let counter = 0;
      await expectPerformance(
        async () => {
          await User.updateOne(
            { email: `updatetest${counter++ % 100}@example.com` },
            { $set: { lastLoginAt: new Date() } }
          );
        },
        30,
        50
      );
    });

    it('should findOneAndUpdate within 30ms', async () => {
      let counter = 0;
      await expectPerformance(
        async () => {
          await User.findOneAndUpdate(
            { email: `updatetest${counter++ % 100}@example.com` },
            { $inc: { referralCount: 1 } },
            { new: true }
          );
        },
        30,
        50
      );
    });

    it('should bulk update within 200ms', async () => {
      await expectPerformance(
        async () => {
          await User.updateMany(
            { email: /^updatetest/ },
            { $set: { isActive: true } }
          );
        },
        200,
        10
      );
    });
  });

  // ========================================
  // AGGREGATION PERFORMANCE
  // ========================================
  describe('Aggregation Operations', () => {
    beforeAll(async () => {
      const users = Array(500)
        .fill(null)
        .map((_, i) => ({
          email: `aggtest${i}@example.com`,
          password: '$2b$12$hashedpassword',
          firstName: `Agg${i}`,
          lastName: 'TestUser',
          role: i % 10 === 0 ? 'admin' : 'user',
          referralCode: `CHI-AGG${String(i).padStart(4, '0')}`,
          referralCount: Math.floor(Math.random() * 20),
          createdAt: new Date(Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000), // Random date in last 30 days
        }));

      await User.insertMany(users);
    });

    afterAll(async () => {
      await User.deleteMany({ email: /^aggtest/ });
    });

    it('should count by role within 100ms', async () => {
      await expectPerformance(
        async () => {
          await User.aggregate([
            { $match: { email: /^aggtest/ } },
            { $group: { _id: '$role', count: { $sum: 1 } } },
          ]);
        },
        100,
        20
      );
    });

    it('should calculate top referrers within 100ms', async () => {
      await expectPerformance(
        async () => {
          await User.aggregate([
            { $match: { email: /^aggtest/, referralCount: { $gt: 0 } } },
            { $sort: { referralCount: -1 } },
            { $limit: 10 },
            {
              $project: {
                fullName: { $concat: ['$firstName', ' ', '$lastName'] },
                referralCount: 1,
              },
            },
          ]);
        },
        100,
        20
      );
    });

    it('should get registration stats by day within 150ms', async () => {
      await expectPerformance(
        async () => {
          await User.aggregate([
            { $match: { email: /^aggtest/ } },
            {
              $group: {
                _id: {
                  $dateToString: { format: '%Y-%m-%d', date: '$createdAt' },
                },
                count: { $sum: 1 },
              },
            },
            { $sort: { _id: -1 } },
            { $limit: 7 },
          ]);
        },
        150,
        10
      );
    });
  });

  // ========================================
  // DELETE PERFORMANCE
  // ========================================
  describe('Delete Operations', () => {
    it('should deleteOne within 30ms', async () => {
      // Create users to delete
      const users = Array(50)
        .fill(null)
        .map((_, i) => ({
          email: `deletetest${i}${Date.now()}@example.com`,
          password: '$2b$12$hashedpassword',
          firstName: `Delete${i}`,
          lastName: 'TestUser',
          referralCode: `CHI-DEL${Date.now()}${i}`,
        }));

      await User.insertMany(users);

      let counter = 0;
      await expectPerformance(
        async () => {
          await User.deleteOne({
            email: { $regex: `^deletetest${counter++ % 50}` },
          });
        },
        30,
        20
      );
    });

    it('should deleteMany within 200ms', async () => {
      // Create users to delete
      const batchId = Date.now();
      const users = Array(100)
        .fill(null)
        .map((_, i) => ({
          email: `bulkdelete${batchId}${i}@example.com`,
          password: '$2b$12$hashedpassword',
          firstName: `BulkDel${i}`,
          lastName: 'TestUser',
          referralCode: `CHI-BD${batchId}${i}`,
        }));

      await User.insertMany(users);

      const { duration } = await measureTime(async () => {
        await User.deleteMany({ email: { $regex: `^bulkdelete${batchId}` } });
      });

      expect(duration).toBeLessThan(200);
      console.log(`Bulk delete 100 users: ${duration.toFixed(2)}ms`);
    });
  });
});
