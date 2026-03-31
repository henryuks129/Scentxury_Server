/**
 * ============================================
 * PAYMENT SERVICE
 * ============================================
 *
 * Business logic for Paystack (NGN) and Stripe (USD) payments.
 * Handles initialization, verification, webhooks, and retries.
 *
 * @file src/services/payment.service.ts
 */

import crypto from 'crypto';
import axios from 'axios';
import { stripe } from '@config/stripe.js';
import { Order } from '@models/Order.js';
import {
  PaymentError,
  BadRequestError,
  ExternalServiceError,
  ErrorCodes,
} from '@utils/errors.js';

// ============================================
// TYPES
// ============================================

export interface InitializePaystackParams {
  email: string;
  amount: number; // NGN, will be converted to kobo
  reference?: string;
  orderId: string;
  callbackUrl?: string;
  metadata?: Record<string, unknown>;
}

export interface PaystackInitResponse {
  authorizationUrl: string;
  accessCode: string;
  reference: string;
}

export interface PaystackVerifyResult {
  status: 'success' | 'failed' | 'abandoned' | 'ongoing' | 'pending';
  reference: string;
  amount: number; // kobo
  currency: string;
  paidAt?: string;
  metadata?: Record<string, unknown>;
}

export interface InitializeStripeParams {
  amount: number; // USD cents
  orderId: string;
  email: string;
  currency?: string;
  metadata?: Record<string, string>;
}

export interface StripePaymentIntentResult {
  clientSecret: string;
  paymentIntentId: string;
  amount: number;
  currency: string;
}

const PAYSTACK_BASE_URL = 'https://api.paystack.co';

// ============================================
// HELPERS
// ============================================

/**
 * Generate a unique payment reference with CHI prefix.
 */
export function generatePaymentReference(orderNumber?: string): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).slice(2, 8).toUpperCase();
  const prefix = orderNumber ? `CHI-${orderNumber}` : 'CHI';
  return `${prefix}-${timestamp}-${random}`;
}

// ============================================
// PAYSTACK
// ============================================

/**
 * Initialize a Paystack payment transaction.
 * Converts NGN amount to kobo (× 100).
 */
export async function initializePaystackPayment(
  params: InitializePaystackParams
): Promise<PaystackInitResponse> {
  const secretKey = process.env.PAYSTACK_SECRET_KEY;
  if (!secretKey) {
    throw new ExternalServiceError('Paystack', 'Paystack secret key is not configured');
  }

  const reference = params.reference || generatePaymentReference();
  const amountInKobo = Math.round(params.amount * 100);

  try {
    const response = await axios.post(
      `${PAYSTACK_BASE_URL}/transaction/initialize`,
      {
        email: params.email,
        amount: amountInKobo,
        reference,
        callback_url: params.callbackUrl,
        metadata: {
          orderId: params.orderId,
          ...params.metadata,
        },
      },
      {
        headers: {
          Authorization: `Bearer ${secretKey}`,
          'Content-Type': 'application/json',
        },
      }
    );

    if (!response.data.status) {
      throw new PaymentError(
        response.data.message || 'Paystack initialization failed',
        'paystack',
        ErrorCodes.PAYMENT_FAILED
      );
    }

    const { authorization_url, access_code, reference: txRef } = response.data.data;

    return {
      authorizationUrl: authorization_url,
      accessCode: access_code,
      reference: txRef,
    };
  } catch (error) {
    if (error instanceof PaymentError || error instanceof ExternalServiceError) {
      throw error;
    }
    if (axios.isAxiosError(error)) {
      const message = error.response?.data?.message || error.message;
      throw new PaymentError(
        `Paystack payment initialization failed: ${message}`,
        'paystack',
        ErrorCodes.PAYMENT_FAILED
      );
    }
    throw new ExternalServiceError('Paystack', 'Unexpected error during payment initialization');
  }
}

/**
 * Initialize Paystack payment with exponential backoff retry.
 */
export async function initializePaystackPaymentWithRetry(
  params: InitializePaystackParams,
  maxRetries: number = 3
): Promise<PaystackInitResponse> {
  let lastError: Error | undefined;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await initializePaystackPayment(params);
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      if (attempt < maxRetries) {
        const delay = Math.pow(2, attempt - 1) * 1000; // 1s, 2s, 4s
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  throw new PaymentError(
    `Payment initialization failed after ${maxRetries} attempts: ${lastError?.message}`,
    'paystack',
    ErrorCodes.PAYMENT_FAILED
  );
}

/**
 * Verify a Paystack payment by reference.
 */
export async function verifyPaystackPayment(
  reference: string
): Promise<PaystackVerifyResult> {
  const secretKey = process.env.PAYSTACK_SECRET_KEY;
  if (!secretKey) {
    throw new ExternalServiceError('Paystack', 'Paystack secret key is not configured');
  }

  try {
    const response = await axios.get(
      `${PAYSTACK_BASE_URL}/transaction/verify/${encodeURIComponent(reference)}`,
      {
        headers: {
          Authorization: `Bearer ${secretKey}`,
        },
      }
    );

    if (!response.data.status) {
      throw new PaymentError(
        response.data.message || 'Payment verification failed',
        'paystack',
        ErrorCodes.PAYMENT_FAILED
      );
    }

    const tx = response.data.data;
    return {
      status: tx.status,
      reference: tx.reference,
      amount: tx.amount,
      currency: tx.currency,
      paidAt: tx.paid_at,
      metadata: tx.metadata,
    };
  } catch (error) {
    if (error instanceof PaymentError || error instanceof ExternalServiceError) {
      throw error;
    }
    if (axios.isAxiosError(error)) {
      const message = error.response?.data?.message || error.message;
      throw new PaymentError(
        `Paystack verification failed: ${message}`,
        'paystack',
        ErrorCodes.PAYMENT_FAILED
      );
    }
    throw new ExternalServiceError('Paystack', 'Unexpected error during payment verification');
  }
}

/**
 * Handle Paystack webhook event.
 * Validates HMAC signature and updates order payment status.
 */
export async function handlePaystackWebhook(
  event: Record<string, unknown>,
  signature: string
): Promise<void> {
  const webhookSecret = process.env.PAYSTACK_WEBHOOK_SECRET;
  if (!webhookSecret) {
    throw new ExternalServiceError('Paystack', 'Paystack webhook secret is not configured');
  }

  // Validate HMAC signature
  const rawBody = JSON.stringify(event);
  const hash = crypto
    .createHmac('sha512', webhookSecret)
    .update(rawBody)
    .digest('hex');

  if (hash !== signature) {
    throw new BadRequestError('Invalid Paystack webhook signature');
  }

  const eventType = event.event as string;
  const data = event.data as Record<string, unknown>;

  if (eventType === 'charge.success') {
    const reference = data.reference as string;
    const order = await Order.findOne({ paymentReference: reference });

    if (!order) {
      // Log but don't throw — webhook should always respond 200
      console.warn(`[PaystackWebhook] Order not found for reference: ${reference}`);
      return;
    }

    order.paymentStatus = 'paid';
    if (order.status === 'pending') {
      order.status = 'confirmed';
    }
    await order.save();

    console.log(`[PaystackWebhook] Order ${order.orderNumber} marked as paid`);
  } else if (eventType === 'charge.failed') {
    const reference = data.reference as string;
    const order = await Order.findOne({ paymentReference: reference });

    if (order) {
      order.paymentStatus = 'failed';
      await order.save();
      console.log(`[PaystackWebhook] Order ${order.orderNumber} payment failed`);
    }
  }
}

// ============================================
// STRIPE
// ============================================

/**
 * Create a Stripe PaymentIntent for USD payments.
 */
export async function createStripePaymentIntent(
  params: InitializeStripeParams
): Promise<StripePaymentIntentResult> {
  try {
    const paymentIntent = await stripe.paymentIntents.create({
      amount: params.amount, // USD cents
      currency: params.currency || 'usd',
      metadata: {
        orderId: params.orderId,
        email: params.email,
        ...params.metadata,
      },
      receipt_email: params.email,
    });

    if (!paymentIntent.client_secret) {
      throw new PaymentError(
        'Stripe PaymentIntent missing client_secret',
        'stripe',
        ErrorCodes.PAYMENT_FAILED
      );
    }

    return {
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id,
      amount: paymentIntent.amount,
      currency: paymentIntent.currency,
    };
  } catch (error) {
    if (error instanceof PaymentError) {
      throw error;
    }
    const message = error instanceof Error ? error.message : 'Unknown error';
    throw new PaymentError(
      `Stripe PaymentIntent creation failed: ${message}`,
      'stripe',
      ErrorCodes.PAYMENT_FAILED
    );
  }
}

/**
 * Verify Stripe webhook signature and return the event.
 */
export function verifyStripeWebhookSignature(
  payload: Buffer | string,
  signature: string
): ReturnType<typeof stripe.webhooks.constructEvent> {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    throw new ExternalServiceError('Stripe', 'Stripe webhook secret is not configured');
  }

  try {
    return stripe.webhooks.constructEvent(payload, signature, webhookSecret);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Signature verification failed';
    throw new BadRequestError(`Invalid Stripe webhook signature: ${message}`);
  }
}

/**
 * Handle a verified Stripe webhook event.
 * Updates order payment status based on event type.
 */
export async function handleStripeWebhook(
  event: { type: string; data: { object: Record<string, unknown> } }
): Promise<void> {
  const paymentIntent = event.data.object;

  if (event.type === 'payment_intent.succeeded') {
    const orderId = (paymentIntent.metadata as Record<string, string>)?.orderId;

    if (!orderId) {
      console.warn('[StripeWebhook] payment_intent.succeeded missing orderId in metadata');
      return;
    }

    const order = await Order.findById(orderId);
    if (!order) {
      console.warn(`[StripeWebhook] Order not found for id: ${orderId}`);
      return;
    }

    order.paymentStatus = 'paid';
    if (order.status === 'pending') {
      order.status = 'confirmed';
    }
    await order.save();

    console.log(`[StripeWebhook] Order ${order.orderNumber} marked as paid`);
  } else if (event.type === 'payment_intent.payment_failed') {
    const orderId = (paymentIntent.metadata as Record<string, string>)?.orderId;

    if (!orderId) {
      console.warn('[StripeWebhook] payment_intent.payment_failed missing orderId in metadata');
      return;
    }

    const order = await Order.findById(orderId);
    if (!order) {
      console.warn(`[StripeWebhook] Order not found for id: ${orderId}`);
      return;
    }

    order.paymentStatus = 'failed';
    await order.save();

    console.log(`[StripeWebhook] Order ${order.orderNumber} payment failed`);
  }
}

// ============================================
// PAYMENT SERVICE CLASS (for injection/mocking)
// ============================================

export const PaymentService = {
  initializePaystackPayment,
  initializePaystackPaymentWithRetry,
  verifyPaystackPayment,
  handlePaystackWebhook,
  createStripePaymentIntent,
  verifyStripeWebhookSignature,
  handleStripeWebhook,
  generatePaymentReference,
};

export default PaymentService;
