/**
 * ============================================
 * RECEIPT WORKER
 * ============================================
 *
 * Processes jobs from the 'receipts' BullMQ queue.
 * Generates PDF/image receipts and dispatches emails.
 *
 * @file src/queues/workers/receipt.worker.ts
 */

import { Worker, Job } from 'bullmq';
import { bullMQConnection } from '@config/redis.js';
import { ReceiptService } from '@services/receipt.service.js';
import type {
  ReceiptJobData,
  GeneratePDFReceiptJobData,
  GenerateImageReceiptJobData,
  SendReceiptEmailJobData,
} from '../receipt.queue.js';

// ============================================
// WORKER
// ============================================

export const receiptWorker = new Worker<ReceiptJobData>(
  'receipts',
  async (job: Job<ReceiptJobData>) => {
    console.log(`[ReceiptWorker] Processing job: ${job.name} (id: ${job.id})`);

    switch (job.data.type) {
      case 'generate-pdf':
        return handleGeneratePDF(job.data as GeneratePDFReceiptJobData);

      case 'generate-image':
        return handleGenerateImage(job.data as GenerateImageReceiptJobData);

      case 'send-email':
        return handleSendEmail(job.data as SendReceiptEmailJobData);

      default: {
        const _exhaustive: never = job.data;
        throw new Error(`Unknown receipt job type: ${(_exhaustive as ReceiptJobData).type}`);
      }
    }
  },
  {
    connection: bullMQConnection,
    concurrency: 3, // Receipt generation is CPU-intensive
  }
);

// ============================================
// JOB HANDLERS
// ============================================

async function handleGeneratePDF(data: GeneratePDFReceiptJobData): Promise<void> {
  const { orderId, orderNumber, sendEmail } = data;

  const result = await ReceiptService.generatePDFReceipt(orderId);
  console.log(`[ReceiptWorker] PDF generated for order ${orderNumber}: ${result.receiptUrl}`);

  if (sendEmail) {
    await ReceiptService.sendReceiptEmail(orderId);
    console.log(`[ReceiptWorker] Receipt email sent for order ${orderNumber}`);
  }
}

async function handleGenerateImage(data: GenerateImageReceiptJobData): Promise<void> {
  const { orderId, orderNumber } = data;

  const result = await ReceiptService.generateImageReceipt(orderId);
  console.log(
    `[ReceiptWorker] Shareable image generated for order ${orderNumber}: ${result.receiptUrl}`
  );
}

async function handleSendEmail(data: SendReceiptEmailJobData): Promise<void> {
  const { orderId, orderNumber } = data;

  await ReceiptService.sendReceiptEmail(orderId);
  console.log(`[ReceiptWorker] Receipt email sent for order ${orderNumber}`);
}

// ============================================
// WORKER EVENT HANDLERS
// ============================================

receiptWorker.on('completed', (job: Job) => {
  console.log(`[ReceiptWorker] ✅ Job completed: ${job.name} (id: ${job.id})`);
});

receiptWorker.on('failed', (job: Job | undefined, err: Error) => {
  console.error(
    `[ReceiptWorker] ❌ Job failed: ${job?.name} (id: ${job?.id}) — ${err.message}`
  );
});

export default receiptWorker;
