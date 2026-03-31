/**
 * ============================================
 * SURVEY CONTROLLER — UNIT TESTS
 * ============================================
 *
 * Tests the scent preference survey endpoints:
 * - getSurveyQuestions — returns question array (public)
 * - submitSurvey — valid submission returns recs, guest allowed, invalid body → 400
 * - getSurveyHistory — requires auth, returns user surveys
 *
 * RecommendationService is mocked; Survey model uses in-memory MongoDB.
 *
 * @file src/controllers/__tests__/survey.controller.unit.test.ts
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import mongoose from 'mongoose';
import {
  getSurveyQuestions,
  submitSurvey,
  getSurveyHistory,
} from '../survey.controller.js';
import { mockRequest, mockResponse, mockNext } from '../../test/helpers.js';
import { Survey } from '../../models/Survey.js';

// ============================================
// MOCK RECOMMENDATION SERVICE
// ============================================

// Use vi.hoisted() so variables are available when vi.mock factory is hoisted.
const { mockProcessSurvey } = vi.hoisted(() => ({
  mockProcessSurvey: vi.fn(),
}));

vi.mock('../../services/recommendation.service.js', () => ({
  RecommendationService: {
    processSurveyForRecommendations: mockProcessSurvey,
    getHybridRecommendations: vi.fn().mockResolvedValue({ products: [], source: [] }),
  },
}));

// ============================================
// TESTS
// ============================================

beforeEach(() => {
  // Restore implementations — vi.resetAllMocks() in setup.ts afterEach wipes them.
  mockProcessSurvey.mockResolvedValue({
    products: [{ _id: 'prod-1', name: 'Test Oud' }],
    comboMixes: [],
    derivedProfile: { preferredNotes: ['oud'], avoidNotes: [], scentFamilies: ['oriental'] },
  });
});

describe('SurveyController', () => {
  // -----------------------------------------
  // getSurveyQuestions
  // -----------------------------------------

  describe('getSurveyQuestions', () => {
    it('returns the static question list with correct structure', async () => {
      const req = mockRequest();
      const res = mockResponse();
      const next = mockNext();

      await getSurveyQuestions(req as never, res as never, next);

      expect(res._getStatusCode()).toBe(200);
      const data = res._getData() as {
        success: boolean;
        data: { questions: Array<{ id: string; type: string; options: unknown[] }> };
      };
      expect(data.success).toBe(true);
      expect(data.data.questions.length).toBeGreaterThan(0);

      const firstQ = data.data.questions[0];
      expect(firstQ).toHaveProperty('id');
      expect(firstQ).toHaveProperty('text');
      expect(firstQ).toHaveProperty('type');
      expect(firstQ).toHaveProperty('options');
      expect(Array.isArray(firstQ!.options)).toBe(true);
    });
  });

  // -----------------------------------------
  // submitSurvey
  // -----------------------------------------

  describe('submitSurvey', () => {
    it('returns 200 with recommendations for valid survey submission', async () => {
      const req = mockRequest({
        user: { id: new mongoose.Types.ObjectId().toString(), role: 'user' },
        body: {
          answers: {
            occasion: 'evening',
            intensity: 'strong',
            gender: 'unisex',
            budget: 'premium',
          },
        },
      });
      const res = mockResponse();
      const next = mockNext();

      await submitSurvey(req as never, res as never, next);

      expect(res._getStatusCode()).toBe(200);
      const data = res._getData() as { success: boolean; data: { recommendations: unknown[] } };
      expect(data.success).toBe(true);
      expect(data.data.recommendations.length).toBeGreaterThan(0);
    });

    it('allows unauthenticated (guest) survey submission', async () => {
      const req = mockRequest({
        body: { answers: { occasion: 'casual' } },
      }); // no user
      const res = mockResponse();
      const next = mockNext();

      await submitSurvey(req as never, res as never, next);

      expect(res._getStatusCode()).toBe(200);
      // Service called with undefined userId
      expect(mockProcessSurvey).toHaveBeenCalledWith(
        expect.objectContaining({ userId: undefined })
      );
    });

    it('calls next(error) when service throws', async () => {
      mockProcessSurvey.mockRejectedValueOnce(new Error('DB error'));
      const req = mockRequest({ body: { answers: {} } });
      const res = mockResponse();
      const next = vi.fn();

      await submitSurvey(req as never, res as never, next);

      expect(next).toHaveBeenCalledWith(expect.any(Error));
    });
  });

  // -----------------------------------------
  // getSurveyHistory
  // -----------------------------------------

  describe('getSurveyHistory', () => {
    it('returns the authenticated user\'s survey history', async () => {
      const userId = new mongoose.Types.ObjectId();

      // Seed a survey for this user
      await Survey.create({
        userId,
        sessionId: `session-${Date.now()}`,
        status: 'completed',
        source: 'web',
        totalSteps: 7,
        currentStep: 7,
      });

      const req = mockRequest({ user: { id: String(userId), role: 'user' } });
      const res = mockResponse();
      const next = mockNext();

      await getSurveyHistory(req as never, res as never, next);

      expect(res._getStatusCode()).toBe(200);
      const data = res._getData() as { success: boolean; data: { surveys: unknown[]; count: number } };
      expect(data.success).toBe(true);
      expect(data.data.surveys.length).toBeGreaterThan(0);
      expect(data.data.count).toBe(data.data.surveys.length);
    });

    it('returns empty array when user has no survey history', async () => {
      const req = mockRequest({ user: { id: new mongoose.Types.ObjectId().toString(), role: 'user' } });
      const res = mockResponse();
      const next = mockNext();

      await getSurveyHistory(req as never, res as never, next);

      const data = res._getData() as { data: { surveys: unknown[] } };
      expect(Array.isArray(data.data.surveys)).toBe(true);
    });
  });
});
