/**
 * ============================================
 * SURVEY VALIDATORS - TESTS
 * ============================================
 *
 * Tests for survey validation schemas.
 *
 * @file src/validators/__tests__/survey.validator.test.ts
 */

import { describe, it, expect } from 'vitest';
import {
  StartSurveySchema,
  SubmitResponseSchema,
  SubmitBatchResponsesSchema,
  CompleteSurveySchema,
  ScentPreferencesSchema,
  QuickPreferenceSchema,
  SurveyQuerySchema,
  SurveyResponseSchema,
  SingleChoiceResponseSchema,
  MultipleChoiceResponseSchema,
  ScaleResponseSchema,
  TextResponseSchema,
} from '../survey.validator.js';

describe('Survey Validators', () => {
  // ========================================
  // RESPONSE SCHEMAS
  // ========================================
  describe('SingleChoiceResponseSchema', () => {
    it('should accept valid single choice response', () => {
      const result = SingleChoiceResponseSchema.safeParse({
        questionId: 'q1',
        type: 'single_choice',
        value: 'option_a',
      });
      expect(result.success).toBe(true);
    });

    it('should reject empty value', () => {
      const result = SingleChoiceResponseSchema.safeParse({
        questionId: 'q1',
        type: 'single_choice',
        value: '',
      });
      expect(result.success).toBe(false);
    });
  });

  describe('MultipleChoiceResponseSchema', () => {
    it('should accept valid multiple choice response', () => {
      const result = MultipleChoiceResponseSchema.safeParse({
        questionId: 'q2',
        type: 'multiple_choice',
        values: ['option_a', 'option_b'],
      });
      expect(result.success).toBe(true);
    });

    it('should reject empty values array', () => {
      const result = MultipleChoiceResponseSchema.safeParse({
        questionId: 'q2',
        type: 'multiple_choice',
        values: [],
      });
      expect(result.success).toBe(false);
    });
  });

  describe('ScaleResponseSchema', () => {
    it('should accept valid scale response', () => {
      const result = ScaleResponseSchema.safeParse({
        questionId: 'q3',
        type: 'scale',
        value: 7,
      });
      expect(result.success).toBe(true);
    });

    it('should accept minimum value (1)', () => {
      const result = ScaleResponseSchema.safeParse({
        questionId: 'q3',
        type: 'scale',
        value: 1,
      });
      expect(result.success).toBe(true);
    });

    it('should accept maximum value (10)', () => {
      const result = ScaleResponseSchema.safeParse({
        questionId: 'q3',
        type: 'scale',
        value: 10,
      });
      expect(result.success).toBe(true);
    });

    it('should reject value below 1', () => {
      const result = ScaleResponseSchema.safeParse({
        questionId: 'q3',
        type: 'scale',
        value: 0,
      });
      expect(result.success).toBe(false);
    });

    it('should reject value above 10', () => {
      const result = ScaleResponseSchema.safeParse({
        questionId: 'q3',
        type: 'scale',
        value: 11,
      });
      expect(result.success).toBe(false);
    });
  });

  describe('TextResponseSchema', () => {
    it('should accept valid text response', () => {
      const result = TextResponseSchema.safeParse({
        questionId: 'q4',
        type: 'text',
        value: 'I love floral scents',
      });
      expect(result.success).toBe(true);
    });

    it('should reject empty text', () => {
      const result = TextResponseSchema.safeParse({
        questionId: 'q4',
        type: 'text',
        value: '',
      });
      expect(result.success).toBe(false);
    });

    it('should reject text over 1000 characters', () => {
      const result = TextResponseSchema.safeParse({
        questionId: 'q4',
        type: 'text',
        value: 'a'.repeat(1001),
      });
      expect(result.success).toBe(false);
    });
  });

  describe('SurveyResponseSchema (discriminated union)', () => {
    it('should correctly discriminate single_choice', () => {
      const result = SurveyResponseSchema.safeParse({
        questionId: 'q1',
        type: 'single_choice',
        value: 'option_a',
      });
      expect(result.success).toBe(true);
    });

    it('should correctly discriminate multiple_choice', () => {
      const result = SurveyResponseSchema.safeParse({
        questionId: 'q2',
        type: 'multiple_choice',
        values: ['a', 'b'],
      });
      expect(result.success).toBe(true);
    });

    it('should reject invalid type', () => {
      const result = SurveyResponseSchema.safeParse({
        questionId: 'q1',
        type: 'invalid_type',
        value: 'test',
      });
      expect(result.success).toBe(false);
    });
  });

  // ========================================
  // START SURVEY SCHEMA
  // ========================================
  describe('StartSurveySchema', () => {
    it('should accept empty object', () => {
      const result = StartSurveySchema.safeParse({});
      expect(result.success).toBe(true);
    });

    it('should accept session ID', () => {
      const result = StartSurveySchema.safeParse({
        sessionId: 'sess_123',
      });
      expect(result.success).toBe(true);
    });

    it('should accept valid referral sources', () => {
      const sources = ['website', 'social', 'email', 'advertisement', 'referral', 'other'] as const;
      sources.forEach((referralSource) => {
        const result = StartSurveySchema.safeParse({ referralSource });
        expect(result.success).toBe(true);
      });
    });

    it('should reject invalid referral source', () => {
      const result = StartSurveySchema.safeParse({
        referralSource: 'invalid',
      });
      expect(result.success).toBe(false);
    });
  });

  // ========================================
  // SUBMIT RESPONSE SCHEMA
  // ========================================
  describe('SubmitResponseSchema', () => {
    it('should accept valid response submission', () => {
      const result = SubmitResponseSchema.safeParse({
        surveyId: '507f1f77bcf86cd799439011',
        response: {
          questionId: 'q1',
          type: 'single_choice',
          value: 'option_a',
        },
      });
      expect(result.success).toBe(true);
    });

    it('should reject invalid survey ID', () => {
      const result = SubmitResponseSchema.safeParse({
        surveyId: 'invalid',
        response: {
          questionId: 'q1',
          type: 'single_choice',
          value: 'option_a',
        },
      });
      expect(result.success).toBe(false);
    });
  });

  // ========================================
  // SUBMIT BATCH RESPONSES SCHEMA
  // ========================================
  describe('SubmitBatchResponsesSchema', () => {
    it('should accept valid batch submission', () => {
      const result = SubmitBatchResponsesSchema.safeParse({
        surveyId: '507f1f77bcf86cd799439011',
        responses: [
          { questionId: 'q1', type: 'single_choice', value: 'a' },
          { questionId: 'q2', type: 'scale', value: 8 },
        ],
      });
      expect(result.success).toBe(true);
    });

    it('should reject empty responses array', () => {
      const result = SubmitBatchResponsesSchema.safeParse({
        surveyId: '507f1f77bcf86cd799439011',
        responses: [],
      });
      expect(result.success).toBe(false);
    });
  });

  // ========================================
  // COMPLETE SURVEY SCHEMA
  // ========================================
  describe('CompleteSurveySchema', () => {
    it('should accept valid completion', () => {
      const result = CompleteSurveySchema.safeParse({
        surveyId: '507f1f77bcf86cd799439011',
      });
      expect(result.success).toBe(true);
    });

    it('should accept completion with notes', () => {
      const result = CompleteSurveySchema.safeParse({
        surveyId: '507f1f77bcf86cd799439011',
        finalNotes: 'Thank you for the recommendations!',
      });
      expect(result.success).toBe(true);
    });

    it('should reject invalid survey ID', () => {
      const result = CompleteSurveySchema.safeParse({
        surveyId: 'invalid',
      });
      expect(result.success).toBe(false);
    });
  });

  // ========================================
  // SCENT PREFERENCES SCHEMA
  // ========================================
  describe('ScentPreferencesSchema', () => {
    const validPreferences = {
      preferredFamilies: ['floral', 'woody'],
      occasions: ['daily_wear', 'work_office'],
      intensityPreference: 'moderate' as const,
    };

    it('should accept valid preferences', () => {
      const result = ScentPreferencesSchema.safeParse(validPreferences);
      expect(result.success).toBe(true);
    });

    it('should accept full preferences', () => {
      const fullPreferences = {
        ...validPreferences,
        gender: 'female' as const,
        ageGroup: '25-34' as const,
        dislikedFamilies: ['gourmand'],
        budget: { max: 50000, currency: 'NGN' as const },
        allergies: ['musk'],
        existingFavorites: ['Chanel No. 5'],
      };
      const result = ScentPreferencesSchema.safeParse(fullPreferences);
      expect(result.success).toBe(true);
    });

    it('should require at least one preferred family', () => {
      const result = ScentPreferencesSchema.safeParse({
        ...validPreferences,
        preferredFamilies: [],
      });
      expect(result.success).toBe(false);
    });

    it('should require at least one occasion', () => {
      const result = ScentPreferencesSchema.safeParse({
        ...validPreferences,
        occasions: [],
      });
      expect(result.success).toBe(false);
    });

    it('should accept all valid gender options', () => {
      const genders = ['male', 'female', 'non_binary', 'prefer_not_to_say'] as const;
      genders.forEach((gender) => {
        const result = ScentPreferencesSchema.safeParse({ ...validPreferences, gender });
        expect(result.success).toBe(true);
      });
    });

    it('should accept all valid scent families', () => {
      const families = [
        'floral',
        'oriental',
        'woody',
        'fresh',
        'citrus',
        'aquatic',
        'gourmand',
        'spicy',
        'green',
        'fruity',
      ] as const;
      families.forEach((family) => {
        const result = ScentPreferencesSchema.safeParse({
          ...validPreferences,
          preferredFamilies: [family],
        });
        expect(result.success).toBe(true);
      });
    });

    it('should accept all valid intensity levels', () => {
      const levels = ['light', 'moderate', 'intense', 'very_intense'] as const;
      levels.forEach((intensityPreference) => {
        const result = ScentPreferencesSchema.safeParse({
          ...validPreferences,
          intensityPreference,
        });
        expect(result.success).toBe(true);
      });
    });
  });

  // ========================================
  // QUICK PREFERENCE SCHEMA
  // ========================================
  describe('QuickPreferenceSchema', () => {
    it('should accept valid quick preference', () => {
      const result = QuickPreferenceSchema.safeParse({
        gender: 'male',
        occasion: 'work_office',
        intensity: 'moderate',
        scentFamily: 'woody',
      });
      expect(result.success).toBe(true);
    });

    it('should require all fields', () => {
      const result = QuickPreferenceSchema.safeParse({
        gender: 'male',
        occasion: 'work_office',
      });
      expect(result.success).toBe(false);
    });
  });

  // ========================================
  // SURVEY QUERY SCHEMA
  // ========================================
  describe('SurveyQuerySchema', () => {
    it('should accept empty query (defaults)', () => {
      const result = SurveyQuerySchema.safeParse({});
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.page).toBe(1);
        expect(result.data.limit).toBe(20);
      }
    });

    it('should accept status filter', () => {
      const statuses = ['in_progress', 'completed', 'abandoned'] as const;
      statuses.forEach((status) => {
        const result = SurveyQuerySchema.safeParse({ status });
        expect(result.success).toBe(true);
      });
    });

    it('should accept user ID filter', () => {
      const result = SurveyQuerySchema.safeParse({
        userId: '507f1f77bcf86cd799439011',
      });
      expect(result.success).toBe(true);
    });

    it('should coerce dates', () => {
      const result = SurveyQuerySchema.safeParse({
        startDate: '2025-01-01',
        endDate: '2025-01-31',
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.startDate).toBeInstanceOf(Date);
      }
    });

    it('should reject invalid user ID', () => {
      const result = SurveyQuerySchema.safeParse({
        userId: 'invalid',
      });
      expect(result.success).toBe(false);
    });
  });
});
