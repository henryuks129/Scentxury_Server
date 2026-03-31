/**
 * ============================================
 * DATABASE CONFIGURATION - PERFORMANCE TESTS
 * ============================================
 *
 * Tests for MongoDB connection performance using
 * the in-memory MongoDB server from test setup.
 *
 * @file src/config/__tests__/database.perf.test.ts
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import mongoose, { Schema } from 'mongoose';
import { measureTime, expectPerformance } from '../../test/helpers.js';

// Simple test model for performance testing
const TestDocSchema = new Schema({
  name: { type: String, required: true },
  value: { type: Number, required: true },
  tags: [String],
  metadata: {
    createdBy: String,
    version: Number,
  },
  timestamp: { type: Date, default: Date.now },
});

// Add index for query tests
TestDocSchema.index({ name: 1 });
TestDocSchema.index({ value: 1 });
TestDocSchema.index({ tags: 1 });

const TestDoc = mongoose.models.TestDoc || mongoose.model('TestDoc', TestDocSchema);

describe('Database Performance', () => {
  beforeAll(async () => {
    // Ensure clean collection
    await TestDoc.deleteMany({});
  });

  afterAll(async () => {
    // Cleanup
    await TestDoc.deleteMany({});
  });

  describe('Connection Performance', () => {
    it('should verify connection is ready', async () => {
      expect(mongoose.connection.readyState).toBe(1); // 1 = connected
    });

    it('should ping database within 50ms', async () => {
      await expectPerformance(
        async () => {
          await mongoose.connection.db?.admin().ping();
        },
        50, // max 50ms
        20 // 20 iterations
      );
    });
  });

  describe('Write Performance', () => {
    it('should create single document within 100ms', async () => {
      await expectPerformance(
        async () => {
          await TestDoc.create({
            name: `test-${Date.now()}`,
            value: Math.random() * 1000,
            tags: ['perf', 'test'],
          });
        },
        100, // max 100ms (relaxed for in-memory DB with variable performance)
        50 // 50 iterations
      );
    });

    it('should handle 100 concurrent inserts within 2 seconds', async () => {
      const docs = Array(100)
        .fill(null)
        .map((_, i) => ({
          name: `concurrent-${i}-${Date.now()}`,
          value: i,
          tags: ['concurrent', 'batch'],
        }));

      const { duration } = await measureTime(async () => {
        await Promise.all(docs.map((doc) => TestDoc.create(doc)));
      });

      expect(duration).toBeLessThan(2000);
      console.log(`100 concurrent inserts: ${duration.toFixed(2)}ms`);
    });

    it('should insertMany 1000 documents within 3 seconds', async () => {
      const docs = Array(1000)
        .fill(null)
        .map((_, i) => ({
          name: `batch-${i}-${Date.now()}`,
          value: i,
          tags: ['batch', 'bulk'],
        }));

      const { duration } = await measureTime(async () => {
        await TestDoc.insertMany(docs);
      });

      expect(duration).toBeLessThan(3000);
      console.log(`insertMany 1000 docs: ${duration.toFixed(2)}ms`);
    });
  });

  describe('Read Performance', () => {
    beforeAll(async () => {
      // Seed data for read tests
      const docs = Array(1000)
        .fill(null)
        .map((_, i) => ({
          name: `read-test-${i}`,
          value: i,
          tags: i % 2 === 0 ? ['even'] : ['odd'],
          metadata: {
            createdBy: 'seeder',
            version: 1,
          },
        }));
      await TestDoc.insertMany(docs);
    });

    afterAll(async () => {
      await TestDoc.deleteMany({ name: /^read-test/ });
    });

    it('should findOne by indexed field within 20ms', async () => {
      await expectPerformance(
        async () => {
          await TestDoc.findOne({ name: 'read-test-500' });
        },
        20, // max 20ms (relaxed for in-memory DB)
        50
      );
    });

    it('should find with limit within 30ms', async () => {
      await expectPerformance(
        async () => {
          await TestDoc.find({ tags: 'even' }).limit(100);
        },
        30, // max 30ms (relaxed for in-memory DB)
        30
      );
    });

    it('should find with skip and limit (pagination) within 30ms', async () => {
      await expectPerformance(
        async () => {
          await TestDoc.find({}).skip(200).limit(50).lean();
        },
        30, // max 30ms (relaxed for in-memory DB)
        30
      );
    });

    it('should count documents within 30ms', async () => {
      await expectPerformance(
        async () => {
          await TestDoc.countDocuments({ tags: 'even' });
        },
        30, // max 30ms (relaxed for in-memory DB)
        30
      );
    });

    it('should use lean() for faster reads', async () => {
      // Compare lean vs non-lean
      const { duration: withoutLean } = await measureTime(async () => {
        await TestDoc.find({}).limit(100);
      });

      const { duration: withLean } = await measureTime(async () => {
        await TestDoc.find({}).limit(100).lean();
      });

      console.log(
        `Without lean: ${withoutLean.toFixed(2)}ms, With lean: ${withLean.toFixed(2)}ms`
      );

      // Lean should generally be faster (or at least not slower)
      // We use a loose assertion since in-memory DB may not show big difference
      expect(withLean).toBeLessThan(withoutLean + 10);
    });
  });

  describe('Update Performance', () => {
    beforeAll(async () => {
      // Seed data for update tests
      const docs = Array(500)
        .fill(null)
        .map((_, i) => ({
          name: `update-test-${i}`,
          value: i,
          tags: ['update'],
        }));
      await TestDoc.insertMany(docs);
    });

    afterAll(async () => {
      await TestDoc.deleteMany({ name: /^update-test/ });
    });

    it('should updateOne within 20ms', async () => {
      let counter = 0;
      await expectPerformance(
        async () => {
          await TestDoc.updateOne(
            { name: `update-test-${counter++ % 500}` },
            { $inc: { value: 1 } }
          );
        },
        20, // max 20ms (relaxed for in-memory DB)
        50
      );
    });

    it('should updateMany within 100ms', async () => {
      await expectPerformance(
        async () => {
          await TestDoc.updateMany({ tags: 'update' }, { $inc: { value: 1 } });
        },
        100, // max 100ms (relaxed for in-memory DB)
        20
      );
    });

    it('should findOneAndUpdate within 30ms', async () => {
      let counter = 0;
      await expectPerformance(
        async () => {
          await TestDoc.findOneAndUpdate(
            { name: `update-test-${counter++ % 500}` },
            { $inc: { value: 1 } },
            { new: true }
          );
        },
        30, // max 30ms (relaxed for in-memory DB)
        50
      );
    });
  });

  describe('Delete Performance', () => {
    it('should deleteOne within 30ms', async () => {
      // Create docs to delete
      const docs = Array(100)
        .fill(null)
        .map((_, i) => ({
          name: `delete-test-${i}-${Date.now()}`,
          value: i,
          tags: ['delete'],
        }));
      await TestDoc.insertMany(docs);

      let counter = 0;
      await expectPerformance(
        async () => {
          await TestDoc.deleteOne({
            name: { $regex: `^delete-test-${counter++ % 100}` },
          });
        },
        30, // max 30ms (relaxed for in-memory DB with regex)
        20
      );
    });

    it('should deleteMany within 500ms (including re-seed)', async () => {
      // Create docs to delete
      const docs = Array(1000)
        .fill(null)
        .map((_, i) => ({
          name: `bulk-delete-${i}-${Date.now()}`,
          value: i,
          tags: ['bulk-delete'],
        }));
      await TestDoc.insertMany(docs);

      await expectPerformance(
        async () => {
          await TestDoc.deleteMany({ tags: 'bulk-delete' });

          // Re-create for next iteration
          await TestDoc.insertMany(
            docs.map((d, i) => ({ ...d, name: `bulk-delete-${i}-${Date.now()}` }))
          );
        },
        500, // max 500ms (includes delete + 1000 inserts per iteration)
        5 // Few iterations due to heavy operation
      );
    });
  });

  describe('Aggregation Performance', () => {
    beforeAll(async () => {
      // Seed data for aggregation tests
      const docs = Array(1000)
        .fill(null)
        .map((_, i) => ({
          name: `agg-test-${i}`,
          value: Math.floor(Math.random() * 100),
          tags: [`group-${i % 10}`],
          metadata: {
            createdBy: `user-${i % 5}`,
            version: Math.floor(Math.random() * 3),
          },
        }));
      await TestDoc.insertMany(docs);
    });

    afterAll(async () => {
      await TestDoc.deleteMany({ name: /^agg-test/ });
    });

    it('should aggregate with $match and $group within 100ms', async () => {
      await expectPerformance(
        async () => {
          await TestDoc.aggregate([
            { $match: { value: { $gte: 50 } } },
            {
              $group: {
                _id: '$metadata.createdBy',
                count: { $sum: 1 },
                avgValue: { $avg: '$value' },
              },
            },
          ]);
        },
        100, // max 100ms (relaxed for in-memory DB)
        20
      );
    });

    it('should aggregate with $sort and $limit within 100ms', async () => {
      await expectPerformance(
        async () => {
          await TestDoc.aggregate([
            { $match: { name: /^agg-test/ } },
            { $sort: { value: -1 } },
            { $limit: 100 },
          ]);
        },
        100, // max 100ms (relaxed for in-memory DB)
        20
      );
    });
  });
});
