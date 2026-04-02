/**
 * ============================================
 * STRIPE CLIENT CONFIGURATION
 * ============================================
 *
 * Stripe singleton for international USD payments.
 * Uses STRIPE_SECRET_KEY from environment.
 *
 * @file src/config/stripe.ts
 */

import Stripe from 'stripe';

export const stripe = new Stripe(
  process.env.STRIPE_SECRET_KEY || 'sk_test_placeholder',
  {
    apiVersion: '2025-12-15.clover',
    typescript: true,
  }
);

export default stripe;
