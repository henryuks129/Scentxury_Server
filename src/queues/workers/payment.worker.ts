/**
 * ============================================
 * PAYMENT WORKER
 * ============================================
 *
 * Processes jobs from the 'payments' BullMQ queue.
 * Handles payment initialization, verification, and webhook processing.
 *
 * @file src/queues/workers/payment.worker.ts
 */

import { Worker, Job } from 'bullmq';
import { bullMQConnection } from '@config/redis.js';
import {
  initializePaystackPayment,
  verifyPaystackPayment,
  handlePaystackWebhook,
  handleStripeWebhook,
} from '@services/payment.service.js';
import { Order } from '@models/Order.js';
import type {
  PaymentJobData,
  InitializePaymentJobData,
  VerifyPaymentJobData,
  WebhookProcessJobData,
} from '../payment.queue.js';

// ============================================
// WORKER
// ============================================

export const paymentWorker = new Worker<PaymentJobData>(
  'payments',
  async (job: Job<PaymentJobData>) => {
    console.log(`[PaymentWorker] Processing job: ${job.name} (id: ${job.id})`);

    switch (job.name) {
      case 'initialize-payment':
        return handleInitializePayment(job.data as InitializePaymentJobData);

      case 'verify-payment':
        return handleVerifyPayment(job.data as VerifyPaymentJobData);

      case 'process-webhook':
        return handleWebhookProcess(job.data as WebhookProcessJobData);

      default:
        throw new Error(`Unknown payment job: ${job.name}`);
    }
  },
  {
    connection: bullMQConnection,
    concurrency: 5,
  }
);

// ============================================
// JOB HANDLERS
// ============================================

async function handleInitializePayment(data: InitializePaymentJobData): Promise<void> {
  const { orderId, email, amount, provider, reference } = data;

  if (provider === 'paystack') {
    await initializePaystackPayment({
      orderId,
      email,
      amount,
      reference,
    });
  }
  // Stripe payment intents are created synchronously in the controller
}

async function handleVerifyPayment(data: VerifyPaymentJobData): Promise<void> {
  const { orderId, reference, provider } = data;

  if (provider === 'paystack') {
    const result = await verifyPaystackPayment(reference);

    if (result.status === 'success') {
      await Order.findByIdAndUpdate(orderId, {
        paymentStatus: 'paid',
        status: 'confirmed',
        paymentReference: reference,
      });
    } else if (result.status === 'failed') {
      await Order.findByIdAndUpdate(orderId, {
        paymentStatus: 'failed',
      });
    }
  }
}

async function handleWebhookProcess(data: WebhookProcessJobData): Promise<void> {
  const { provider, event, signature } = data;

  if (provider === 'paystack' && signature) {
    await handlePaystackWebhook(event, signature);
  } else if (provider === 'stripe') {
    await handleStripeWebhook(
      event as { type: string; data: { object: Record<string, unknown> } }
    );
  }
}

// ============================================
// WORKER EVENT HANDLERS
// ============================================

paymentWorker.on('completed', (job: Job) => {
  console.log(`[PaymentWorker] ✅ Job completed: ${job.name} (id: ${job.id})`);
});

paymentWorker.on('failed', (job: Job | undefined, err: Error) => {
  console.error(`[PaymentWorker] ❌ Job failed: ${job?.name} (id: ${job?.id}) — ${err.message}`);
});

export default paymentWorker;
