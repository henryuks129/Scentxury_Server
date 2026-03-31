/**
 * ============================================
 * RECEIPT QUEUE
 * ============================================
 *
 * BullMQ queue for receipt generation and delivery.
 * Triggers PDF/image generation and email dispatch
 * after successful payment.
 *
 * @file src/queues/receipt.queue.ts
 */

import { Queue } from 'bullmq';
import { bullMQConnection } from '@config/redis.js';

// ============================================
// JOB DATA TYPES
// ============================================

export interface GeneratePDFReceiptJobData {
  type: 'generate-pdf';
  orderId: string;
  orderNumber: string;
  userEmail: string;
  sendEmail: boolean;
}

export interface GenerateImageReceiptJobData {
  type: 'generate-image';
  orderId: string;
  orderNumber: string;
}

export interface SendReceiptEmailJobData {
  type: 'send-email';
  orderId: string;
  orderNumber: string;
  userEmail: string;
  receiptUrl: string;
}

export type ReceiptJobData =
  | GeneratePDFReceiptJobData
  | GenerateImageReceiptJobData
  | SendReceiptEmailJobData;

// ============================================
// QUEUE
// ============================================

export const receiptQueue = new Queue<ReceiptJobData>('receipts', {
  connection: bullMQConnection,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 3_000,
    },
    removeOnComplete: { count: 100 },
    removeOnFail: { count: 50 },
  },
});

// ============================================
// JOB HELPERS
// ============================================

export async function addGeneratePDFReceiptJob(
  data: Omit<GeneratePDFReceiptJobData, 'type'>,
  delayMs: number = 2_000
): Promise<void> {
  await receiptQueue.add(
    'generate-pdf-receipt',
    { type: 'generate-pdf', ...data },
    { delay: delayMs }
  );
}

export async function addGenerateImageReceiptJob(
  data: Omit<GenerateImageReceiptJobData, 'type'>
): Promise<void> {
  await receiptQueue.add('generate-image-receipt', {
    type: 'generate-image',
    ...data,
  });
}

export async function addSendReceiptEmailJob(
  data: Omit<SendReceiptEmailJobData, 'type'>
): Promise<void> {
  await receiptQueue.add('send-receipt-email', {
    type: 'send-email',
    ...data,
  });
}

export default receiptQueue;
