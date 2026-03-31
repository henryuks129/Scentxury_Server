/**
 * ============================================
 * PAYMENT QUEUE
 * ============================================
 *
 * BullMQ queue for payment processing jobs.
 * Handles Paystack/Stripe payment retries and
 * post-payment order updates.
 *
 * @file src/queues/payment.queue.ts
 */

import { Queue } from 'bullmq';
import { bullMQConnection } from '@config/redis.js';

// ============================================
// JOB DATA TYPES
// ============================================

export interface InitializePaymentJobData {
  orderId: string;
  email: string;
  amount: number;
  provider: 'paystack' | 'stripe';
  reference?: string;
  currency?: string;
}

export interface VerifyPaymentJobData {
  orderId: string;
  reference: string;
  provider: 'paystack' | 'stripe';
}

export interface WebhookProcessJobData {
  provider: 'paystack' | 'stripe';
  event: Record<string, unknown>;
  signature?: string;
}

export type PaymentJobData =
  | InitializePaymentJobData
  | VerifyPaymentJobData
  | WebhookProcessJobData;

// ============================================
// QUEUE
// ============================================

export const paymentQueue = new Queue<PaymentJobData>('payments', {
  connection: bullMQConnection,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 2_000,
    },
    removeOnComplete: { count: 100 },
    removeOnFail: { count: 50 },
  },
});

// ============================================
// JOB HELPERS
// ============================================

export async function addInitializePaymentJob(
  data: InitializePaymentJobData
): Promise<void> {
  await paymentQueue.add('initialize-payment', data, {
    priority: 1,
  });
}

export async function addVerifyPaymentJob(
  data: VerifyPaymentJobData,
  delayMs: number = 5_000
): Promise<void> {
  await paymentQueue.add('verify-payment', data, {
    delay: delayMs,
    priority: 2,
  });
}

export async function addWebhookProcessJob(
  data: WebhookProcessJobData
): Promise<void> {
  await paymentQueue.add('process-webhook', data, {
    priority: 1,
    attempts: 5,
  });
}

export default paymentQueue;
