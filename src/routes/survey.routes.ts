/**
 * ============================================
 * SURVEY ROUTES
 * ============================================
 *
 * /api/v1/surveys/*
 *
 * GET  /questions — static question list (public)
 * POST /submit    — submit answers → recommendations (public / optional auth)
 * GET  /history   — user's past surveys (auth required)
 *
 * @file src/routes/survey.routes.ts
 */

import { Router } from 'express';
import { authenticate, optionalAuth } from '@middleware/auth.middleware.js';
import { validate } from '@middleware/validate.middleware.js';
import { SurveySubmitSchema } from '@validators/survey.validator.js';
import {
  getSurveyQuestions,
  submitSurvey,
  getSurveyHistory,
} from '@controllers/survey.controller.js';

const router = Router();

// Public — returns static question list with options
router.get('/questions', getSurveyQuestions);

// Public (optional auth) — validated body → personalised recommendations
router.post('/submit', optionalAuth, validate(SurveySubmitSchema), submitSurvey);

// Auth required — user's past survey submissions
router.get('/history', authenticate, getSurveyHistory);

export default router;
