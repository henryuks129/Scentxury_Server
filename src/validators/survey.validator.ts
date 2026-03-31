/**
 * ============================================
 * SURVEY VALIDATORS
 * ============================================
 *
 * Zod schemas for survey-related operations.
 *
 * @file src/validators/survey.validator.ts
 */

import { z } from 'zod';

// ============================================
// CONSTANTS
// ============================================

export const QUESTION_TYPES = [
  'single_choice',
  'multiple_choice',
  'scale',
  'text',
] as const;

export const SURVEY_STATUSES = [
  'in_progress',
  'completed',
  'abandoned',
] as const;

export const GENDER_OPTIONS = ['male', 'female', 'non_binary', 'prefer_not_to_say'] as const;

export const AGE_GROUPS = ['18-24', '25-34', '35-44', '45-54', '55-64', '65+'] as const;

export const SCENT_FAMILIES = [
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

export const FRAGRANCE_OCCASIONS = [
  'daily_wear',
  'work_office',
  'evening_out',
  'special_occasion',
  'date_night',
  'casual',
  'gym_sports',
] as const;

export const INTENSITY_LEVELS = ['light', 'moderate', 'intense', 'very_intense'] as const;

// ============================================
// RESPONSE SCHEMAS
// ============================================

/**
 * Single choice response
 */
export const SingleChoiceResponseSchema = z.object({
  questionId: z.string().min(1, 'Question ID is required'),
  type: z.literal('single_choice'),
  value: z.string().min(1, 'Selection is required'),
});

/**
 * Multiple choice response
 */
export const MultipleChoiceResponseSchema = z.object({
  questionId: z.string().min(1, 'Question ID is required'),
  type: z.literal('multiple_choice'),
  values: z.array(z.string()).min(1, 'At least one selection is required'),
});

/**
 * Scale response (1-10)
 */
export const ScaleResponseSchema = z.object({
  questionId: z.string().min(1, 'Question ID is required'),
  type: z.literal('scale'),
  value: z.number().int().min(1).max(10),
});

/**
 * Text response
 */
export const TextResponseSchema = z.object({
  questionId: z.string().min(1, 'Question ID is required'),
  type: z.literal('text'),
  value: z.string().min(1, 'Response is required').max(1000),
});

/**
 * Union of all response types
 */
export const SurveyResponseSchema = z.discriminatedUnion('type', [
  SingleChoiceResponseSchema,
  MultipleChoiceResponseSchema,
  ScaleResponseSchema,
  TextResponseSchema,
]);

export type SurveyResponseInput = z.infer<typeof SurveyResponseSchema>;

// ============================================
// START SURVEY SCHEMA
// ============================================

/**
 * Start survey schema
 */
export const StartSurveySchema = z.object({
  sessionId: z.string().optional(),
  referralSource: z
    .enum(['website', 'social', 'email', 'advertisement', 'referral', 'other'])
    .optional(),
});

export type StartSurveyInput = z.infer<typeof StartSurveySchema>;

// ============================================
// SUBMIT RESPONSE SCHEMA
// ============================================

/**
 * Submit single response
 */
export const SubmitResponseSchema = z.object({
  surveyId: z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid survey ID'),
  response: SurveyResponseSchema,
});

export type SubmitResponseInput = z.infer<typeof SubmitResponseSchema>;

/**
 * Submit multiple responses (batch)
 */
export const SubmitBatchResponsesSchema = z.object({
  surveyId: z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid survey ID'),
  responses: z.array(SurveyResponseSchema).min(1, 'At least one response required'),
});

export type SubmitBatchResponsesInput = z.infer<typeof SubmitBatchResponsesSchema>;

// ============================================
// COMPLETE SURVEY SCHEMA
// ============================================

/**
 * Complete survey schema
 */
export const CompleteSurveySchema = z.object({
  surveyId: z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid survey ID'),
  finalNotes: z.string().max(500).optional(),
});

export type CompleteSurveyInput = z.infer<typeof CompleteSurveySchema>;

// ========================================
// PREFERENCE SCHEMAS
// ========================================

/**
 * Scent preferences input
 */
export const ScentPreferencesSchema = z.object({
  gender: z.enum(GENDER_OPTIONS).optional(),
  ageGroup: z.enum(AGE_GROUPS).optional(),
  preferredFamilies: z
    .array(z.enum(SCENT_FAMILIES))
    .min(1, 'Select at least one scent family'),
  dislikedFamilies: z.array(z.enum(SCENT_FAMILIES)).optional(),
  occasions: z
    .array(z.enum(FRAGRANCE_OCCASIONS))
    .min(1, 'Select at least one occasion'),
  intensityPreference: z.enum(INTENSITY_LEVELS),
  budget: z
    .object({
      min: z.number().positive().optional(),
      max: z.number().positive(),
      currency: z.enum(['NGN', 'USD']).default('NGN'),
    })
    .optional(),
  allergies: z.array(z.string()).optional(),
  existingFavorites: z.array(z.string()).max(10).optional(),
});

export type ScentPreferencesInput = z.infer<typeof ScentPreferencesSchema>;

// ========================================
// QUICK PREFERENCE SCHEMA
// ========================================

/**
 * Quick preference quiz (for homepage)
 */
export const QuickPreferenceSchema = z.object({
  gender: z.enum(GENDER_OPTIONS),
  occasion: z.enum(FRAGRANCE_OCCASIONS),
  intensity: z.enum(INTENSITY_LEVELS),
  scentFamily: z.enum(SCENT_FAMILIES),
});

export type QuickPreferenceInput = z.infer<typeof QuickPreferenceSchema>;

// ========================================
// QUERY SCHEMAS
// ========================================

/**
 * Survey query parameters
 */
export const SurveyQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  status: z.enum(SURVEY_STATUSES).optional(),
  userId: z.string().regex(/^[0-9a-fA-F]{24}$/).optional(),
  startDate: z.coerce.date().optional(),
  endDate: z.coerce.date().optional(),
  hasRecommendations: z.boolean().optional(),
});

export type SurveyQueryInput = z.infer<typeof SurveyQuerySchema>;

// ========================================
// EXPORTS
// ========================================

// ========================================
// SURVEY SUBMIT SCHEMA (Day 6 — chatbot/recommendation flow)
// ========================================

/**
 * Flat survey submission — used by POST /api/v1/surveys/submit.
 * Maps structured answers to the recommendation engine's ISurveyAnswers shape.
 */
export const SurveySubmitSchema = z.object({
  answers: z.object({
    occasion: z.enum(['daily', 'evening', 'office', 'casual', 'special']).optional(),
    intensity: z.enum(['light', 'moderate', 'strong', 'beast-mode']).optional(),
    gender: z.enum(['male', 'female', 'unisex']).optional(),
    preferredNotes: z.array(z.string().min(1)).max(10).optional(),
    avoidNotes: z.array(z.string().min(1)).max(10).optional(),
    budget: z.enum(['affordable', 'mid-range', 'premium', 'luxury']).optional(),
    season: z.enum(['spring', 'summer', 'autumn', 'winter', 'all']).optional(),
  }),
});

export type SurveySubmitInput = z.infer<typeof SurveySubmitSchema>;

export const SurveyValidators = {
  startSurvey: StartSurveySchema,
  submitResponse: SubmitResponseSchema,
  submitBatchResponses: SubmitBatchResponsesSchema,
  completeSurvey: CompleteSurveySchema,
  scentPreferences: ScentPreferencesSchema,
  quickPreference: QuickPreferenceSchema,
  surveyQuery: SurveyQuerySchema,
  singleChoiceResponse: SingleChoiceResponseSchema,
  multipleChoiceResponse: MultipleChoiceResponseSchema,
  scaleResponse: ScaleResponseSchema,
  textResponse: TextResponseSchema,
  surveySubmit: SurveySubmitSchema,
};

export default SurveyValidators;
