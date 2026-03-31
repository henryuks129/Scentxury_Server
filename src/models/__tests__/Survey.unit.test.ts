/**
 * ============================================
 * SURVEY MODEL - UNIT TESTS
 * ============================================
 *
 * Comprehensive tests for Survey model schema validation,
 * methods, and business logic.
 *
 * @file src/models/__tests__/Survey.unit.test.ts
 */

import { describe, it, expect } from 'vitest';
import mongoose from 'mongoose';
import { Survey, ISurvey, SurveyStatus } from '../Survey.js';

describe('Survey Model', () => {
  // Helper to create valid survey data
  const createValidSurvey = (overrides = {}) => ({
    sessionId: `sess_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    ...overrides,
  });

  // ========================================
  // SCHEMA VALIDATION
  // ========================================
  describe('Schema Validation', () => {
    it('should create valid survey with required fields', async () => {
      const survey = new Survey(createValidSurvey());
      const error = survey.validateSync();
      expect(error).toBeUndefined();
    });

    it('should require sessionId', () => {
      const survey = new Survey({});
      const error = survey.validateSync();
      expect(error?.errors['sessionId']).toBeDefined();
    });

    it('should allow survey without userId (guest)', () => {
      const survey = new Survey(createValidSurvey());
      const error = survey.validateSync();
      expect(error?.errors['userId']).toBeUndefined();
      expect(survey.userId).toBeUndefined();
    });

    it('should accept valid userId for authenticated user', () => {
      const userId = new mongoose.Types.ObjectId();
      const survey = new Survey(createValidSurvey({ userId }));
      const error = survey.validateSync();
      expect(error).toBeUndefined();
      expect(survey.userId?.toString()).toBe(userId.toString());
    });

    it('should default status to in_progress', () => {
      const survey = new Survey(createValidSurvey());
      expect(survey.status).toBe('in_progress');
    });

    it('should default currentStep to 1', () => {
      const survey = new Survey(createValidSurvey());
      expect(survey.currentStep).toBe(1);
    });

    it('should default totalSteps to 10', () => {
      const survey = new Survey(createValidSurvey());
      expect(survey.totalSteps).toBe(10);
    });

    it('should default source to web', () => {
      const survey = new Survey(createValidSurvey());
      expect(survey.source).toBe('web');
    });

    it('should initialize responses as empty array', () => {
      const survey = new Survey(createValidSurvey());
      expect(survey.responses).toEqual([]);
    });

    it('should initialize recommendedProducts as empty array', () => {
      const survey = new Survey(createValidSurvey());
      expect(survey.recommendedProducts).toEqual([]);
    });
  });

  // ========================================
  // SURVEY STATUS
  // ========================================
  describe('Survey Status', () => {
    const validStatuses: SurveyStatus[] = ['in_progress', 'completed', 'abandoned'];

    validStatuses.forEach((status) => {
      it(`should accept status: ${status}`, () => {
        const survey = new Survey(createValidSurvey({ status }));
        const error = survey.validateSync();
        expect(error?.errors['status']).toBeUndefined();
        expect(survey.status).toBe(status);
      });
    });

    it('should reject invalid status', () => {
      const survey = new Survey(createValidSurvey({ status: 'invalid' }));
      const error = survey.validateSync();
      expect(error?.errors['status']).toBeDefined();
    });

    it('should set completedAt when status changes to completed', async () => {
      const survey = await Survey.create(createValidSurvey());
      expect(survey.completedAt).toBeUndefined();

      survey.status = 'completed';
      await survey.save();

      expect(survey.completedAt).toBeDefined();
      expect(survey.completedAt).toBeInstanceOf(Date);
    });

    it('should set abandonedAt when status changes to abandoned', async () => {
      const survey = await Survey.create(createValidSurvey());
      expect(survey.abandonedAt).toBeUndefined();

      survey.status = 'abandoned';
      await survey.save();

      expect(survey.abandonedAt).toBeDefined();
      expect(survey.abandonedAt).toBeInstanceOf(Date);
    });

    it('should not override existing completedAt', async () => {
      const existingDate = new Date('2025-01-01');
      const survey = await Survey.create(
        createValidSurvey({
          status: 'completed',
          completedAt: existingDate,
        })
      );

      survey.status = 'in_progress';
      await survey.save();
      survey.status = 'completed';
      await survey.save();

      expect(survey.completedAt).toEqual(existingDate);
    });
  });

  // ========================================
  // SOURCE
  // ========================================
  describe('Source', () => {
    const validSources = ['web', 'mobile', 'chatbot'];

    validSources.forEach((source) => {
      it(`should accept source: ${source}`, () => {
        const survey = new Survey(createValidSurvey({ source }));
        const error = survey.validateSync();
        expect(error?.errors['source']).toBeUndefined();
      });
    });

    it('should reject invalid source', () => {
      const survey = new Survey(createValidSurvey({ source: 'desktop' }));
      const error = survey.validateSync();
      expect(error?.errors['source']).toBeDefined();
    });
  });

  // ========================================
  // RESPONSES
  // ========================================
  describe('Responses', () => {
    it('should accept valid response', () => {
      const survey = new Survey(
        createValidSurvey({
          responses: [
            {
              questionId: 'q1',
              questionText: 'What scents do you prefer?',
              answer: 'woody',
              weight: 5,
            },
          ],
        })
      );
      const error = survey.validateSync();
      expect(error).toBeUndefined();
      expect(survey.responses).toHaveLength(1);
    });

    it('should accept array answer', () => {
      const survey = new Survey(
        createValidSurvey({
          responses: [
            {
              questionId: 'q2',
              questionText: 'Select all that apply',
              answer: ['woody', 'floral', 'fresh'],
              weight: 3,
            },
          ],
        })
      );
      const error = survey.validateSync();
      expect(error).toBeUndefined();
      expect(survey.responses[0].answer).toEqual(['woody', 'floral', 'fresh']);
    });

    it('should default weight to 1', () => {
      const survey = new Survey(
        createValidSurvey({
          responses: [
            {
              questionId: 'q1',
              questionText: 'Test question',
              answer: 'test',
            },
          ],
        })
      );
      expect(survey.responses[0].weight).toBe(1);
    });

    it('should validate weight min 0', () => {
      const survey = new Survey(
        createValidSurvey({
          responses: [
            {
              questionId: 'q1',
              questionText: 'Test question',
              answer: 'test',
              weight: -1,
            },
          ],
        })
      );
      const error = survey.validateSync();
      expect(error?.errors['responses.0.weight']).toBeDefined();
    });

    it('should validate weight max 10', () => {
      const survey = new Survey(
        createValidSurvey({
          responses: [
            {
              questionId: 'q1',
              questionText: 'Test question',
              answer: 'test',
              weight: 11,
            },
          ],
        })
      );
      const error = survey.validateSync();
      expect(error?.errors['responses.0.weight']).toBeDefined();
    });

    it('should support multiple responses', () => {
      const survey = new Survey(
        createValidSurvey({
          responses: [
            {
              questionId: 'q1',
              questionText: 'Question 1',
              answer: 'answer1',
              weight: 2,
            },
            {
              questionId: 'q2',
              questionText: 'Question 2',
              answer: 'answer2',
              weight: 3,
            },
            {
              questionId: 'q3',
              questionText: 'Question 3',
              answer: ['a', 'b'],
              weight: 5,
            },
          ],
        })
      );
      expect(survey.responses).toHaveLength(3);
    });
  });

  // ========================================
  // DERIVED PREFERENCES
  // ========================================
  describe('Derived Preferences', () => {
    it('should accept valid derived preferences', () => {
      const survey = new Survey(
        createValidSurvey({
          derivedPreferences: {
            scentFamilies: ['woody', 'oriental'],
            intensity: 'strong',
            occasions: ['evening', 'special'],
            priceRange: { min: 20000, max: 80000, currency: 'NGN' },
            gender: 'male',
          },
        })
      );
      const error = survey.validateSync();
      expect(error).toBeUndefined();
    });

    it('should default intensity to moderate', () => {
      const survey = new Survey(
        createValidSurvey({
          derivedPreferences: {
            scentFamilies: ['floral'],
          },
        })
      );
      expect(survey.derivedPreferences?.intensity).toBe('moderate');
    });

    it('should default gender to unisex', () => {
      const survey = new Survey(
        createValidSurvey({
          derivedPreferences: {
            scentFamilies: ['fresh'],
          },
        })
      );
      expect(survey.derivedPreferences?.gender).toBe('unisex');
    });

    it('should validate intensity enum', () => {
      const survey = new Survey(
        createValidSurvey({
          derivedPreferences: {
            intensity: 'very_strong',
          },
        })
      );
      const error = survey.validateSync();
      expect(error?.errors['derivedPreferences.intensity']).toBeDefined();
    });

    it('should validate gender enum', () => {
      const survey = new Survey(
        createValidSurvey({
          derivedPreferences: {
            gender: 'other',
          },
        })
      );
      const error = survey.validateSync();
      expect(error?.errors['derivedPreferences.gender']).toBeDefined();
    });

    it('should validate priceRange currency enum', () => {
      const survey = new Survey(
        createValidSurvey({
          derivedPreferences: {
            priceRange: { min: 0, max: 100, currency: 'EUR' },
          },
        })
      );
      const error = survey.validateSync();
      expect(error?.errors['derivedPreferences.priceRange.currency']).toBeDefined();
    });

    it('should lowercase scent families', () => {
      const survey = new Survey(
        createValidSurvey({
          derivedPreferences: {
            scentFamilies: ['WOODY', 'Floral', 'FRESH'],
          },
        })
      );
      expect(survey.derivedPreferences?.scentFamilies).toEqual(['woody', 'floral', 'fresh']);
    });

    it('should lowercase occasions', () => {
      const survey = new Survey(
        createValidSurvey({
          derivedPreferences: {
            occasions: ['EVENING', 'Work', 'CASUAL'],
          },
        })
      );
      expect(survey.derivedPreferences?.occasions).toEqual(['evening', 'work', 'casual']);
    });
  });

  // ========================================
  // RECOMMENDED PRODUCTS
  // ========================================
  describe('Recommended Products', () => {
    it('should accept valid recommended products', () => {
      const survey = new Survey(
        createValidSurvey({
          recommendedProducts: [
            {
              productId: new mongoose.Types.ObjectId(),
              score: 95,
              reason: 'Matches woody preference',
            },
            {
              productId: new mongoose.Types.ObjectId(),
              score: 87,
              reason: 'Popular in your price range',
            },
          ],
        })
      );
      const error = survey.validateSync();
      expect(error).toBeUndefined();
      expect(survey.recommendedProducts).toHaveLength(2);
    });

    it('should require productId', () => {
      const survey = new Survey(
        createValidSurvey({
          recommendedProducts: [
            {
              score: 90,
              reason: 'Test reason',
            },
          ],
        })
      );
      const error = survey.validateSync();
      expect(error?.errors['recommendedProducts.0.productId']).toBeDefined();
    });

    it('should require score', () => {
      const survey = new Survey(
        createValidSurvey({
          recommendedProducts: [
            {
              productId: new mongoose.Types.ObjectId(),
              reason: 'Test reason',
            },
          ],
        })
      );
      const error = survey.validateSync();
      expect(error?.errors['recommendedProducts.0.score']).toBeDefined();
    });

    it('should require reason', () => {
      const survey = new Survey(
        createValidSurvey({
          recommendedProducts: [
            {
              productId: new mongoose.Types.ObjectId(),
              score: 90,
            },
          ],
        })
      );
      const error = survey.validateSync();
      expect(error?.errors['recommendedProducts.0.reason']).toBeDefined();
    });

    it('should validate score min 0', () => {
      const survey = new Survey(
        createValidSurvey({
          recommendedProducts: [
            {
              productId: new mongoose.Types.ObjectId(),
              score: -1,
              reason: 'Test',
            },
          ],
        })
      );
      const error = survey.validateSync();
      expect(error?.errors['recommendedProducts.0.score']).toBeDefined();
    });

    it('should validate score max 100', () => {
      const survey = new Survey(
        createValidSurvey({
          recommendedProducts: [
            {
              productId: new mongoose.Types.ObjectId(),
              score: 101,
              reason: 'Test',
            },
          ],
        })
      );
      const error = survey.validateSync();
      expect(error?.errors['recommendedProducts.0.score']).toBeDefined();
    });
  });

  // ========================================
  // DEVICE INFO
  // ========================================
  describe('Device Info', () => {
    it('should accept device info', () => {
      const survey = new Survey(
        createValidSurvey({
          deviceInfo: {
            userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 14_0)',
            platform: 'iOS',
            screenSize: '375x812',
          },
        })
      );
      const error = survey.validateSync();
      expect(error).toBeUndefined();
      expect(survey.deviceInfo?.platform).toBe('iOS');
    });

    it('should be optional', () => {
      const survey = new Survey(createValidSurvey());
      expect(survey.deviceInfo).toBeUndefined();
    });
  });

  // ========================================
  // STEPS
  // ========================================
  describe('Steps', () => {
    it('should validate currentStep min 1', () => {
      const survey = new Survey(createValidSurvey({ currentStep: 0 }));
      const error = survey.validateSync();
      expect(error?.errors['currentStep']).toBeDefined();
    });

    it('should validate totalSteps min 1', () => {
      const survey = new Survey(createValidSurvey({ totalSteps: 0 }));
      const error = survey.validateSync();
      expect(error?.errors['totalSteps']).toBeDefined();
    });

    it('should allow custom step counts', () => {
      const survey = new Survey(
        createValidSurvey({
          currentStep: 5,
          totalSteps: 15,
        })
      );
      const error = survey.validateSync();
      expect(error).toBeUndefined();
      expect(survey.currentStep).toBe(5);
      expect(survey.totalSteps).toBe(15);
    });
  });

  // ========================================
  // METHODS
  // ========================================
  describe('Methods', () => {
    describe('calculateProgress', () => {
      it('should calculate progress correctly', async () => {
        const survey = await Survey.create(
          createValidSurvey({
            currentStep: 3,
            totalSteps: 10,
          })
        );
        expect(survey.calculateProgress()).toBe(30);
      });

      it('should return 100 when on last step', async () => {
        const survey = await Survey.create(
          createValidSurvey({
            currentStep: 10,
            totalSteps: 10,
          })
        );
        expect(survey.calculateProgress()).toBe(100);
      });

      it('should return 10 on first step of 10', async () => {
        const survey = await Survey.create(
          createValidSurvey({
            currentStep: 1,
            totalSteps: 10,
          })
        );
        expect(survey.calculateProgress()).toBe(10);
      });

      it('should round progress', async () => {
        const survey = await Survey.create(
          createValidSurvey({
            currentStep: 1,
            totalSteps: 3,
          })
        );
        // 1/3 = 0.333... -> 33%
        expect(survey.calculateProgress()).toBe(33);
      });
    });

    describe('addResponse', () => {
      it('should add response and advance step', async () => {
        const survey = await Survey.create(createValidSurvey());
        expect(survey.responses).toHaveLength(0);
        expect(survey.currentStep).toBe(1);

        survey.addResponse({
          questionId: 'q1',
          questionText: 'Test question',
          answer: 'test answer',
          weight: 2,
        });

        expect(survey.responses).toHaveLength(1);
        expect(survey.currentStep).toBe(2);
      });

      it('should not advance past totalSteps', async () => {
        const survey = await Survey.create(
          createValidSurvey({
            currentStep: 10,
            totalSteps: 10,
          })
        );

        survey.addResponse({
          questionId: 'q10',
          questionText: 'Last question',
          answer: 'final answer',
          weight: 1,
        });

        expect(survey.currentStep).toBe(10);
        expect(survey.responses).toHaveLength(1);
      });
    });
  });

  // ========================================
  // TIMESTAMPS
  // ========================================
  describe('Timestamps', () => {
    it('should set startedAt on creation', async () => {
      const beforeCreate = new Date();
      const survey = await Survey.create(createValidSurvey());
      expect(survey.startedAt).toBeDefined();
      expect(survey.startedAt.getTime()).toBeGreaterThanOrEqual(beforeCreate.getTime());
    });

    it('should set createdAt on creation', async () => {
      const survey = await Survey.create(createValidSurvey());
      expect(survey.createdAt).toBeDefined();
    });

    it('should set updatedAt on creation', async () => {
      const survey = await Survey.create(createValidSurvey());
      expect(survey.updatedAt).toBeDefined();
    });

    it('should update updatedAt on save', async () => {
      const survey = await Survey.create(createValidSurvey());
      const originalUpdatedAt = survey.updatedAt;

      await new Promise((resolve) => setTimeout(resolve, 10));
      survey.currentStep = 2;
      await survey.save();

      expect(survey.updatedAt.getTime()).toBeGreaterThan(originalUpdatedAt.getTime());
    });
  });

  // ========================================
  // INDEXES
  // ========================================
  describe('Indexes', () => {
    it('should have userId index', () => {
      const indexes = Survey.schema.indexes();
      const userIdIndex = indexes.find(
        ([fields]) => Object.keys(fields).includes('userId')
      );
      expect(userIdIndex).toBeDefined();
    });

    it('should have sessionId index', () => {
      const indexes = Survey.schema.indexes();
      const sessionIdIndex = indexes.find(
        ([fields]) => Object.keys(fields).includes('sessionId')
      );
      expect(sessionIdIndex).toBeDefined();
    });

    it('should have status index', () => {
      const indexes = Survey.schema.indexes();
      const statusIndex = indexes.find(
        ([fields]) => Object.keys(fields).includes('status')
      );
      expect(statusIndex).toBeDefined();
    });
  });

  // ========================================
  // DATABASE OPERATIONS
  // ========================================
  describe('Database Operations', () => {
    it('should create and find survey', async () => {
      const survey = await Survey.create(createValidSurvey());
      const found = await Survey.findById(survey._id);
      expect(found).not.toBeNull();
      expect(found?.sessionId).toBe(survey.sessionId);
    });

    it('should find surveys by userId', async () => {
      const userId = new mongoose.Types.ObjectId();
      await Survey.create([
        createValidSurvey({ userId }),
        createValidSurvey({ userId }),
        createValidSurvey(), // Guest survey
      ]);

      const userSurveys = await Survey.find({ userId });
      expect(userSurveys).toHaveLength(2);
    });

    it('should find surveys by status', async () => {
      const batchSessionPrefix = `batch_${Date.now()}`;
      await Survey.create([
        createValidSurvey({ sessionId: `${batchSessionPrefix}_1`, status: 'completed' }),
        createValidSurvey({ sessionId: `${batchSessionPrefix}_2`, status: 'in_progress' }),
        createValidSurvey({ sessionId: `${batchSessionPrefix}_3`, status: 'abandoned' }),
      ]);

      const completedSurveys = await Survey.find({
        sessionId: { $regex: `^${batchSessionPrefix}` },
        status: 'completed',
      });
      expect(completedSurveys).toHaveLength(1);
    });

    it('should find by sessionId', async () => {
      const sessionId = `unique_${Date.now()}`;
      await Survey.create(createValidSurvey({ sessionId }));

      const found = await Survey.findOne({ sessionId });
      expect(found).not.toBeNull();
      expect(found?.sessionId).toBe(sessionId);
    });
  });
});
