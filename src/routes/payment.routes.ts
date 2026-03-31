/**
 * ============================================
 * PAYMENT ROUTES
 * ============================================
 *
 * /api/v1/payments/*
 *
 * Public:
 *   POST /webhook/paystack   — Paystack webhook (raw body)
 *   POST /webhook/stripe     — Stripe webhook (raw body)
 *
 * Authenticated:
 *   POST /paystack/initialize — Initialize Paystack payment
 *   GET  /paystack/verify     — Verify Paystack payment
 *   POST /stripe/intent       — Create Stripe PaymentIntent
 *
 * @file src/routes/payment.routes.ts
 */

import express, { Router } from 'express';
import { authenticate } from '@middleware/auth.middleware.js';
import {
  initializePaystackPayment,
  verifyPaystackPayment,
  handlePaystackWebhook,
  createStripePaymentIntent,
  handleStripeWebhook,
} from '@controllers/payment.controller.js';

const router = Router();

// ============================================
// WEBHOOKS (no auth — raw body for signature verification)
// ============================================

router.post(
  '/webhook/paystack',
  express.json(),
  handlePaystackWebhook
);

router.post(
  '/webhook/stripe',
  express.raw({ type: 'application/json' }),
  handleStripeWebhook
);

// ============================================
// PAYSTACK (authenticated)
// ============================================

router.post('/paystack/initialize', authenticate, initializePaystackPayment);
router.get('/paystack/verify', authenticate, verifyPaystackPayment);

// ============================================
// STRIPE (authenticated)
// ============================================

router.post('/stripe/intent', authenticate, createStripePaymentIntent);

export default router;
