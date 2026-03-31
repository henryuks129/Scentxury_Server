/**
 * ============================================
 * SURVEY MODEL - PERFORMANCE TESTS
 * ============================================
 *
 * Performance benchmarks for Survey model operations.
 *
 * @file src/models/__tests__/Survey.perf.test.ts
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import mongoose from 'mongoose';
import { Survey, ISurvey } from '../Survey.js';
import { measureTime, expectPerformance } from '../../test/helpers.js';

describe('Survey Model Performance', () => {
  // Shared test data
  const batchId = `PERF${Date.now()}`;
  let testSurveys: ISurvey[] = [];

  // Helper to create test survey data
  const createTestSurvey = (index: number) => ({
    sessionId: `${batchId}_${String(index).padStart(6, '0')}`,
    userId: index % 3 === 0 ? new mongoose.Types.ObjectId() : undefined,
    responses:
      index % 5 === 0
        ? []
        : [
            {
              questionId: 'q1',
              questionText: 'What scent families do you prefer?',
              answer: ['woody', 'floral', 'fresh'][index % 3],
              weight: 5,
            },
            {
              questionId: 'q2',
              questionText: 'How strong do you like your fragrances?',
              answer: ['light', 'moderate', 'strong'][index % 3],
              weight: 4,
            },
          ],
    currentStep: (index % 10) + 1,
    totalSteps: 10,
    status: ['in_progress', 'completed', 'abandoned'][index % 3] as any,
    source: ['web', 'mobile', 'chatbot'][index % 3] as any,
    derivedPreferences:
      index % 3 === 1
        ? {
            scentFamilies: ['woody', 'oriental'],
            intensity: 'moderate' as const,
            occasions: ['evening', 'casual'],
            priceRange: { min: 20000, max: 80000, currency: 'NGN' as const },
            gender: ['male', 'female', 'unisex'][index % 3] as any,
          }
        : undefined,
    recommendedProducts:
      index % 3 === 1
        ? [
            {
              productId: new mongoose.Types.ObjectId(),
              score: 90 - (index % 10),
              reason: 'Matches your preferences',
            },
            {
              productId: new mongoose.Types.ObjectId(),
              score: 85 - (index % 10),
              reason: 'Popular choice',
            },
          ]
        : [],
    startedAt: new Date(Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000),
    completedAt: index % 3 === 1 ? new Date() : undefined,
    abandonedAt: index % 3 === 2 ? new Date() : undefined,
  });

  // Setup: Insert all test data
  beforeAll(async () => {
    const surveyData = Array(500)
      .fill(null)
      .map((_, i) => createTestSurvey(i));

    const inserted = await Survey.insertMany(surveyData);
    testSurveys = inserted as ISurvey[];
  });

  // Cleanup
  afterAll(async () => {
    await Survey.deleteMany({ sessionId: { $regex: `^${batchId}` } });
  });

  // ========================================
  // CREATE PERFORMANCE
  // ========================================
  describe('Create Operations', () => {
    it('should create survey within 150ms', async () => {
      let index = 10000;
      await expectPerformance(
        async () => {
          await Survey.create({
            ...createTestSurvey(index++),
            sessionId: `create_${Date.now()}_${index}`,
          });
        },
        150,
        10
      );
    });

    it('should bulk insert 100 surveys within 2 seconds', async () => {
      const insertBatchId = `INS${Date.now()}`;
      const surveys = Array(100)
        .fill(null)
        .map((_, i) => ({
          ...createTestSurvey(i + 20000),
          sessionId: `${insertBatchId}_${String(i).padStart(6, '0')}`,
        }));

      const { duration } = await measureTime(async () => {
        await Survey.insertMany(surveys);
      });

      expect(duration).toBeLessThan(2000);
      console.log(`100 surveys inserted in ${duration.toFixed(2)}ms`);

      await Survey.deleteMany({ sessionId: { $regex: `^${insertBatchId}` } });
    });
  });

  // ========================================
  // QUERY PERFORMANCE
  // ========================================
  describe('Query Operations', () => {
    it('should find by sessionId within 20ms (indexed)', async () => {
      const targetSurvey = testSurveys[250];
      await expectPerformance(
        async () => {
          await Survey.findOne({ sessionId: targetSurvey.sessionId });
        },
        20,
        50
      );
    });

    it('should find by userId within 30ms (indexed)', async () => {
      const targetSurvey = testSurveys.find((s) => s.userId);
      await expectPerformance(
        async () => {
          await Survey.find({ userId: targetSurvey!.userId }).limit(10).lean();
        },
        30,
        50
      );
    });

    it('should filter by status within 30ms (indexed)', async () => {
      await expectPerformance(
        async () => {
          await Survey.find({
            sessionId: { $regex: `^${batchId}` },
            status: 'completed',
          })
            .limit(20)
            .lean();
        },
        30,
        50
      );
    });

    it('should filter by source within 30ms', async () => {
      await expectPerformance(
        async () => {
          await Survey.find({
            sessionId: { $regex: `^${batchId}` },
            source: 'mobile',
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
          await Survey.find({
            sessionId: { $regex: `^${batchId}` },
            startedAt: { $gte: thirtyDaysAgo },
          })
            .limit(20)
            .lean();
        },
        40,
        50
      );
    });

    it('should paginate surveys efficiently', async () => {
      const { duration } = await measureTime(async () => {
        for (let page = 0; page < 5; page++) {
          await Survey.find({ sessionId: { $regex: `^${batchId}` } })
            .skip(page * 100)
            .limit(100)
            .lean();
        }
      });

      expect(duration).toBeLessThan(500);
      console.log(`5 pages of 100 surveys: ${duration.toFixed(2)}ms`);
    });
  });

  // ========================================
  // AGGREGATION PERFORMANCE
  // ========================================
  describe('Aggregation Operations', () => {
    it('should aggregate status counts within 100ms', async () => {
      await expectPerformance(
        async () => {
          await Survey.aggregate([
            { $match: { sessionId: { $regex: `^${batchId}` } } },
            { $group: { _id: '$status', count: { $sum: 1 } } },
          ]);
        },
        100,
        10
      );
    });

    it('should aggregate source breakdown within 100ms', async () => {
      await expectPerformance(
        async () => {
          await Survey.aggregate([
            { $match: { sessionId: { $regex: `^${batchId}` } } },
            { $group: { _id: '$source', count: { $sum: 1 } } },
          ]);
        },
        100,
        10
      );
    });

    it('should calculate completion rates within 150ms', async () => {
      await expectPerformance(
        async () => {
          await Survey.aggregate([
            { $match: { sessionId: { $regex: `^${batchId}` } } },
            {
              $group: {
                _id: null,
                total: { $sum: 1 },
                completed: {
                  $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] },
                },
                abandoned: {
                  $sum: { $cond: [{ $eq: ['$status', 'abandoned'] }, 1, 0] },
                },
              },
            },
            {
              $project: {
                completionRate: {
                  $multiply: [{ $divide: ['$completed', '$total'] }, 100],
                },
                abandonmentRate: {
                  $multiply: [{ $divide: ['$abandoned', '$total'] }, 100],
                },
              },
            },
          ]);
        },
        150,
        10
      );
    });

    it('should calculate average responses per survey within 150ms', async () => {
      await expectPerformance(
        async () => {
          await Survey.aggregate([
            { $match: { sessionId: { $regex: `^${batchId}` } } },
            {
              $project: {
                responseCount: { $size: '$responses' },
              },
            },
            {
              $group: {
                _id: null,
                avgResponses: { $avg: '$responseCount' },
                maxResponses: { $max: '$responseCount' },
              },
            },
          ]);
        },
        150,
        10
      );
    });

    it('should find popular scent preferences within 200ms', async () => {
      await expectPerformance(
        async () => {
          await Survey.aggregate([
            { $match: { sessionId: { $regex: `^${batchId}` } } },
            { $unwind: '$derivedPreferences.scentFamilies' },
            {
              $group: {
                _id: '$derivedPreferences.scentFamilies',
                count: { $sum: 1 },
              },
            },
            { $sort: { count: -1 } },
            { $limit: 5 },
          ]);
        },
        200,
        10
      );
    });
  });

  // ========================================
  // UPDATE PERFORMANCE
  // ========================================
  describe('Update Operations', () => {
    it('should update survey status within 30ms', async () => {
      const targetSurvey = testSurveys[300];
      await expectPerformance(
        async () => {
          await Survey.findByIdAndUpdate(targetSurvey._id, {
            $set: { status: 'completed' },
          });
        },
        30,
        50
      );
    });

    it('should add response within 30ms', async () => {
      const targetSurvey = testSurveys[350];
      await expectPerformance(
        async () => {
          await Survey.findByIdAndUpdate(targetSurvey._id, {
            $push: {
              responses: {
                questionId: 'q_new',
                questionText: 'New question',
                answer: 'new answer',
                weight: 3,
              },
            },
            $inc: { currentStep: 1 },
          });
        },
        30,
        30
      );
    });

    it('should update derived preferences within 50ms', async () => {
      const targetSurvey = testSurveys[400];
      await expectPerformance(
        async () => {
          await Survey.findByIdAndUpdate(targetSurvey._id, {
            $set: {
              derivedPreferences: {
                scentFamilies: ['woody', 'oriental'],
                intensity: 'strong',
                occasions: ['evening'],
                priceRange: { min: 30000, max: 100000, currency: 'NGN' },
                gender: 'male',
              },
            },
          });
        },
        50,
        30
      );
    });

    it('should bulk update status within 200ms', async () => {
      const { duration } = await measureTime(async () => {
        await Survey.updateMany(
          {
            sessionId: { $regex: `^${batchId}` },
            status: 'in_progress',
            currentStep: { $gte: 8 },
          },
          { $set: { status: 'abandoned' } }
        );
      });

      expect(duration).toBeLessThan(200);
      console.log(`Bulk status update: ${duration.toFixed(2)}ms`);
    });
  });

  // ========================================
  // DELETE PERFORMANCE
  // ========================================
  describe('Delete Operations', () => {
    it('should deleteMany within 150ms', async () => {
      const deleteBatchId = `DEL${Date.now()}`;
      const surveys = Array(100)
        .fill(null)
        .map((_, i) => ({
          ...createTestSurvey(i + 30000),
          sessionId: `${deleteBatchId}_${String(i).padStart(6, '0')}`,
        }));

      await Survey.insertMany(surveys);

      const { duration } = await measureTime(async () => {
        await Survey.deleteMany({ sessionId: { $regex: `^${deleteBatchId}` } });
      });

      expect(duration).toBeLessThan(150);
      console.log(`Bulk delete 100 surveys: ${duration.toFixed(2)}ms`);
    });
  });
});
