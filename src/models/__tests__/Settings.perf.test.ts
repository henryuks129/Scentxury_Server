/**
 * ============================================
 * SETTINGS MODEL - PERFORMANCE TESTS
 * ============================================
 *
 * Performance benchmarks for Settings model operations.
 *
 * @file src/models/__tests__/Settings.perf.test.ts
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import mongoose from 'mongoose';
import { Settings, ISettings, SettingsCategory } from '../Settings.js';
import { measureTime, expectPerformance } from '../../test/helpers.js';

describe('Settings Model Performance', () => {
  // Shared test data
  const batchId = `PERF${Date.now()}`;
  let testSettings: ISettings[] = [];

  // Categories for rotation
  const categories: SettingsCategory[] = [
    'general',
    'shipping',
    'payment',
    'notification',
    'appearance',
  ];

  // Helper to create test setting data (keys are lowercased by schema)
  const createTestSetting = (index: number) => ({
    key: `${batchId.toLowerCase()}_setting_${String(index).padStart(6, '0')}`,
    value:
      index % 5 === 0
        ? { nested: { value: index, enabled: true } }
        : index % 3 === 0
          ? ['item1', 'item2', 'item3']
          : index % 2 === 0
            ? index * 100
            : `string_value_${index}`,
    category: categories[index % 5],
    description: `Test setting ${index} for performance benchmarking`,
    isPublic: index % 4 === 0,
    lastModifiedBy: index % 3 === 0 ? new mongoose.Types.ObjectId() : undefined,
  });

  // Setup: Insert all test data
  beforeAll(async () => {
    const settingData = Array(200)
      .fill(null)
      .map((_, i) => createTestSetting(i));

    const inserted = await Settings.insertMany(settingData);
    testSettings = inserted as ISettings[];

    // Verify data was inserted
    const count = await Settings.countDocuments({
      key: { $regex: `^${batchId.toLowerCase()}` },
    });
    console.log(`Inserted ${testSettings.length} settings, verified ${count} in DB`);
  });

  // Cleanup
  afterAll(async () => {
    await Settings.deleteMany({ key: { $regex: `^${batchId.toLowerCase()}` } });
  });

  // ========================================
  // CREATE PERFORMANCE
  // ========================================
  describe('Create Operations', () => {
    it('should create setting within 150ms', async () => {
      let index = 10000;
      await expectPerformance(
        async () => {
          await Settings.create({
            ...createTestSetting(index),
            key: `create_${Date.now()}_${index++}`,
          });
        },
        150,
        10
      );
    });

    it('should bulk insert 100 settings within 2 seconds', async () => {
      const insertBatchId = `ins${Date.now()}`;
      const settings = Array(100)
        .fill(null)
        .map((_, i) => ({
          ...createTestSetting(i + 20000),
          key: `${insertBatchId}_${String(i).padStart(6, '0')}`,
        }));

      const { duration } = await measureTime(async () => {
        await Settings.insertMany(settings);
      });

      expect(duration).toBeLessThan(2000);
      console.log(`100 settings inserted in ${duration.toFixed(2)}ms`);

      await Settings.deleteMany({ key: { $regex: `^${insertBatchId}` } });
    });
  });

  // ========================================
  // QUERY PERFORMANCE
  // ========================================
  describe('Query Operations', () => {
    it('should find by key within 20ms (indexed)', async () => {
      const targetSetting = testSettings[100];
      await expectPerformance(
        async () => {
          await Settings.findOne({ key: targetSetting.key });
        },
        20,
        50
      );
    });

    it('should filter by category within 30ms (indexed)', async () => {
      await expectPerformance(
        async () => {
          await Settings.find({
            key: { $regex: `^${batchId.toLowerCase()}` },
            category: 'general',
          })
            .limit(20)
            .lean();
        },
        30,
        50
      );
    });

    it('should filter by isPublic within 30ms (indexed)', async () => {
      await expectPerformance(
        async () => {
          await Settings.find({
            key: { $regex: `^${batchId.toLowerCase()}` },
            isPublic: true,
          })
            .limit(20)
            .lean();
        },
        30,
        50
      );
    });

    it('should paginate settings efficiently', async () => {
      const { duration } = await measureTime(async () => {
        for (let page = 0; page < 5; page++) {
          await Settings.find({ key: { $regex: `^${batchId.toLowerCase()}` } })
            .skip(page * 40)
            .limit(40)
            .lean();
        }
      });

      expect(duration).toBeLessThan(500);
      console.log(`5 pages of 40 settings: ${duration.toFixed(2)}ms`);
    });
  });

  // ========================================
  // STATIC METHODS PERFORMANCE
  // ========================================
  describe('Static Methods', () => {
    it('should getSetting within 20ms', async () => {
      const targetSetting = testSettings[50];
      await expectPerformance(
        async () => {
          await Settings.getSetting(targetSetting.key);
        },
        20,
        50
      );
    });

    it('should setSetting within 30ms', async () => {
      // Create a fresh setting specifically for this test
      const testKey = `settest_${Date.now()}`;
      await Settings.create({
        key: testKey,
        value: 'original',
        category: 'general',
        description: 'Test for setSetting',
      });

      await expectPerformance(
        async () => {
          await Settings.setSetting(testKey, `updated_${Date.now()}`);
        },
        30,
        30
      );

      // Cleanup
      await Settings.deleteOne({ key: testKey });
    });

    it('should getByCategory within 50ms', async () => {
      await expectPerformance(
        async () => {
          await Settings.getByCategory('shipping');
        },
        50,
        30
      );
    });

    it('should getPublicSettings within 50ms', async () => {
      await expectPerformance(
        async () => {
          await Settings.getPublicSettings();
        },
        50,
        30
      );
    });
  });

  // ========================================
  // AGGREGATION PERFORMANCE
  // ========================================
  describe('Aggregation Operations', () => {
    it('should aggregate category counts within 100ms', async () => {
      await expectPerformance(
        async () => {
          await Settings.aggregate([
            { $match: { key: { $regex: `^${batchId.toLowerCase()}` } } },
            { $group: { _id: '$category', count: { $sum: 1 } } },
          ]);
        },
        100,
        10
      );
    });

    it('should aggregate public vs private counts within 100ms', async () => {
      await expectPerformance(
        async () => {
          await Settings.aggregate([
            { $match: { key: { $regex: `^${batchId.toLowerCase()}` } } },
            { $group: { _id: '$isPublic', count: { $sum: 1 } } },
          ]);
        },
        100,
        10
      );
    });

    it('should group by category and isPublic within 100ms', async () => {
      await expectPerformance(
        async () => {
          await Settings.aggregate([
            { $match: { key: { $regex: `^${batchId.toLowerCase()}` } } },
            {
              $group: {
                _id: { category: '$category', isPublic: '$isPublic' },
                count: { $sum: 1 },
              },
            },
            { $sort: { '_id.category': 1 } },
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
    it('should update setting value within 30ms', async () => {
      const targetSetting = testSettings[150];
      await expectPerformance(
        async () => {
          await Settings.findByIdAndUpdate(targetSetting._id, {
            $set: { value: `updated_${Date.now()}` },
          });
        },
        30,
        50
      );
    });

    it('should update isPublic flag within 30ms', async () => {
      const targetSetting = testSettings[160];
      await expectPerformance(
        async () => {
          await Settings.findByIdAndUpdate(targetSetting._id, {
            $set: { isPublic: !targetSetting.isPublic },
          });
        },
        30,
        50
      );
    });

    it('should bulk update category within 200ms', async () => {
      const { duration } = await measureTime(async () => {
        await Settings.updateMany(
          {
            key: { $regex: `^${batchId.toLowerCase()}` },
            category: 'general',
          },
          { $set: { lastModifiedBy: new mongoose.Types.ObjectId() } }
        );
      });

      expect(duration).toBeLessThan(200);
      console.log(`Bulk update general settings: ${duration.toFixed(2)}ms`);
    });
  });

  // ========================================
  // DELETE PERFORMANCE
  // ========================================
  describe('Delete Operations', () => {
    it('should deleteMany within 150ms', async () => {
      const deleteBatchId = `del${Date.now()}`;
      const settings = Array(100)
        .fill(null)
        .map((_, i) => ({
          ...createTestSetting(i + 30000),
          key: `${deleteBatchId}_${String(i).padStart(6, '0')}`,
        }));

      await Settings.insertMany(settings);

      const { duration } = await measureTime(async () => {
        await Settings.deleteMany({ key: { $regex: `^${deleteBatchId}` } });
      });

      expect(duration).toBeLessThan(150);
      console.log(`Bulk delete 100 settings: ${duration.toFixed(2)}ms`);
    });
  });
});
