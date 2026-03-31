/**
 * ============================================
 * SURVEY CONTROLLER
 * ============================================
 *
 * Handles the scent preference survey flow.
 *
 * Routes:
 *   GET  /api/v1/surveys/questions  — static question list (public)
 *   POST /api/v1/surveys/submit     — submit answers → recommendations (public/optional auth)
 *   GET  /api/v1/surveys/history    — user's past surveys (auth required)
 *
 * @file src/controllers/survey.controller.ts
 */

import { Request, Response, NextFunction } from 'express';
import { RecommendationService } from '@services/recommendation.service.js';
import { Survey } from '@models/Survey.js';

// ============================================
// STATIC SURVEY QUESTIONS
// ============================================

/**
 * The 7-question Scentxury scent discovery survey.
 * Each question maps to a field in ISurveyAnswers.
 */
const SURVEY_QUESTIONS = [
  {
    id: 'q1',
    text: 'What is your gender preference for this fragrance?',
    type: 'single_choice',
    field: 'gender',
    options: [
      { value: 'male', label: 'Male / Masculine' },
      { value: 'female', label: 'Female / Feminine' },
      { value: 'unisex', label: 'Unisex / No preference' },
    ],
    scentMapping: 'Maps to product category filter',
  },
  {
    id: 'q2',
    text: 'What occasion will you mainly wear this fragrance?',
    type: 'single_choice',
    field: 'occasion',
    options: [
      { value: 'daily', label: 'Daily casual wear' },
      { value: 'office', label: 'Work / Office' },
      { value: 'evening', label: 'Evening / Nights out' },
      { value: 'casual', label: 'Weekend / Relaxed' },
      { value: 'special', label: 'Special occasions / Events' },
    ],
    scentMapping: 'evening→oud,amber,vanilla | office→fresh,citrus,lavender | casual→woody,musk',
  },
  {
    id: 'q3',
    text: 'How strong do you like your fragrance to be?',
    type: 'single_choice',
    field: 'intensity',
    options: [
      { value: 'light', label: 'Light — subtle and fresh' },
      { value: 'moderate', label: 'Moderate — balanced projection' },
      { value: 'strong', label: 'Strong — noticeable presence' },
      { value: 'beast-mode', label: 'Beast Mode — maximum longevity and sillage' },
    ],
    scentMapping: 'strong/beast-mode→oriental,woody | light→fresh,citrus,floral',
  },
  {
    id: 'q4',
    text: 'Which scent notes do you find most appealing? (select up to 5)',
    type: 'multi_choice',
    field: 'preferredNotes',
    options: [
      { value: 'oud', label: 'Oud (rich, smoky, woody)' },
      { value: 'rose', label: 'Rose (floral, romantic)' },
      { value: 'vanilla', label: 'Vanilla (sweet, warm)' },
      { value: 'citrus', label: 'Citrus (fresh, zesty)' },
      { value: 'musk', label: 'Musk (clean, sensual)' },
      { value: 'amber', label: 'Amber (warm, resinous)' },
      { value: 'woody', label: 'Woody (earthy, natural)' },
      { value: 'lavender', label: 'Lavender (fresh, herbal)' },
      { value: 'jasmine', label: 'Jasmine (floral, exotic)' },
      { value: 'fresh', label: 'Fresh / Aquatic (clean, cool)' },
    ],
    scentMapping: 'Direct inclusion in preferredNotes filter',
  },
  {
    id: 'q5',
    text: 'Are there any scent notes you dislike or are sensitive to?',
    type: 'multi_choice',
    field: 'avoidNotes',
    options: [
      { value: 'oud', label: 'Oud' },
      { value: 'patchouli', label: 'Patchouli (heavy, earthy)' },
      { value: 'smoke', label: 'Smoke / Incense' },
      { value: 'spicy', label: 'Very Spicy notes' },
      { value: 'sweet', label: 'Very Sweet / Gourmand' },
      { value: 'none', label: 'No restrictions' },
    ],
    scentMapping: 'Direct exclusion in avoidNotes filter',
  },
  {
    id: 'q6',
    text: 'What is your budget per bottle?',
    type: 'single_choice',
    field: 'budget',
    options: [
      { value: 'affordable', label: 'Affordable (under ₦40,000)' },
      { value: 'mid-range', label: 'Mid-range (₦40,000 – ₦80,000)' },
      { value: 'premium', label: 'Premium (₦80,000 – ₦150,000)' },
      { value: 'luxury', label: 'Luxury (₦150,000+)' },
    ],
    scentMapping: 'premium/luxury→basePrice≥40000 | affordable→basePrice<40000',
  },
  {
    id: 'q7',
    text: 'What season do you plan to wear this fragrance most?',
    type: 'single_choice',
    field: 'season',
    options: [
      { value: 'spring', label: 'Spring / Harmattan season' },
      { value: 'summer', label: 'Summer / Hot weather' },
      { value: 'autumn', label: 'Autumn / Cool evenings' },
      { value: 'winter', label: 'Winter / Dry season' },
      { value: 'all', label: 'All year round' },
    ],
    scentMapping: 'Informational — no direct filter (used for future refinement)',
  },
];

// ============================================
// CONTROLLER HANDLERS
// ============================================

/**
 * GET /api/v1/surveys/questions
 * Returns the static question list with answer options and scent mappings.
 */
export async function getSurveyQuestions(
  _req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    res.status(200).json({
      success: true,
      data: {
        questions: SURVEY_QUESTIONS,
        totalSteps: SURVEY_QUESTIONS.length,
      },
    });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/v1/surveys/submit
 * Accepts survey answers, derives scent profile, returns product recommendations.
 * Works for both authenticated users and guests.
 * Body is validated by SurveySubmitSchema before reaching this handler.
 */
export async function submitSurvey(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const userId = req.user?.id; // optional auth
    const { answers } = req.body as { answers: Record<string, unknown> };

    const result = await RecommendationService.processSurveyForRecommendations({
      userId,
      answers,
    });

    res.status(200).json({
      success: true,
      message: 'Survey completed — here are your personalised recommendations!',
      data: {
        recommendations: result.products,
        comboMixes: result.comboMixes,
        derivedProfile: result.derivedProfile,
        count: result.products.length,
      },
    });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/v1/surveys/history
 * Returns authenticated user's past survey submissions.
 */
export async function getSurveyHistory(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const userId = req.user!.id;

    const surveys = await Survey.find({ userId })
      .sort({ createdAt: -1 })
      .select('status derivedPreferences recommendedProducts createdAt completedAt source')
      .lean();

    res.status(200).json({
      success: true,
      data: { surveys, count: surveys.length },
    });
  } catch (err) {
    next(err);
  }
}
