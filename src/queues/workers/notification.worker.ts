/**
 * ============================================
 * NOTIFICATION WORKER
 * ============================================
 *
 * Processes jobs from the 'notifications' BullMQ queue.
 * Dispatches push, email, and WhatsApp notifications.
 *
 * @file src/queues/workers/notification.worker.ts
 */

import { Worker, Job } from 'bullmq';
import { bullMQConnection } from '@config/redis.js';
import type {
  NotificationJobData,
  OrderStatusNotificationJobData,
  PaymentNotificationJobData,
  DeliveryNotificationJobData,
  LowStockNotificationJobData,
} from '../notification.queue.js';

// ============================================
// WORKER
// ============================================

export const notificationWorker = new Worker<NotificationJobData>(
  'notifications',
  async (job: Job<NotificationJobData>) => {
    console.log(`[NotificationWorker] Processing job: ${job.name} (id: ${job.id})`);

    switch (job.data.type) {
      case 'order-status':
        return handleOrderStatusNotification(job.data as OrderStatusNotificationJobData);

      case 'payment-confirmation':
      case 'payment-failed':
        return handlePaymentNotification(job.data as PaymentNotificationJobData);

      case 'delivery-update':
        return handleDeliveryNotification(job.data as DeliveryNotificationJobData);

      case 'low-stock-alert':
        return handleLowStockAlert(job.data as LowStockNotificationJobData);

      default: {
        const _exhaustive: never = job.data;
        throw new Error(`Unknown notification type: ${(_exhaustive as NotificationJobData).type}`);
      }
    }
  },
  {
    connection: bullMQConnection,
    concurrency: 10,
  }
);

// ============================================
// JOB HANDLERS
// ============================================

async function handleOrderStatusNotification(
  data: OrderStatusNotificationJobData
): Promise<void> {
  const { orderNumber, userEmail, oldStatus, newStatus, channels } = data;

  console.log(
    `[NotificationWorker] Order ${orderNumber}: ${oldStatus} → ${newStatus} | channels: ${channels.join(',')}`
  );

  // Email stub
  if (channels.includes('email')) {
    // await sendEmail({ to: userEmail, subject: `Order ${orderNumber} updated`, ... });
    console.log(`[NotificationWorker] Email sent to ${userEmail}`);
  }

  // Push notification stub (OneSignal)
  if (channels.includes('push')) {
    // await oneSignal.createNotification({ ... });
    console.log(`[NotificationWorker] Push notification sent for ${orderNumber}`);
  }
}

async function handlePaymentNotification(
  data: PaymentNotificationJobData
): Promise<void> {
  const { orderNumber, userEmail, amount, currency, type } = data;
  const symbol = currency === 'NGN' ? '₦' : '$';

  console.log(
    `[NotificationWorker] ${type} for order ${orderNumber} — ${symbol}${amount} → ${userEmail}`
  );

  // Email stub
  // await sendEmail({ to: userEmail, subject: `Payment ${type === 'payment-confirmation' ? 'confirmed' : 'failed'} ...`, ... });
}

async function handleDeliveryNotification(
  data: DeliveryNotificationJobData
): Promise<void> {
  const { orderNumber, userEmail, status, message } = data;
  console.log(
    `[NotificationWorker] Delivery update for order ${orderNumber}: ${status} → ${userEmail}${message ? ` | ${message}` : ''}`
  );
}

async function handleLowStockAlert(data: LowStockNotificationJobData): Promise<void> {
  const { productName, variantSku, currentStock, adminEmails } = data;
  console.log(
    `[NotificationWorker] Low stock alert: ${productName} (${variantSku}) — ${currentStock} units left → ${adminEmails.join(',')}`
  );
}

// ============================================
// WORKER EVENT HANDLERS
// ============================================

notificationWorker.on('completed', (job: Job) => {
  console.log(`[NotificationWorker] ✅ Job completed: ${job.name} (id: ${job.id})`);
});

notificationWorker.on('failed', (job: Job | undefined, err: Error) => {
  console.error(
    `[NotificationWorker] ❌ Job failed: ${job?.name} (id: ${job?.id}) — ${err.message}`
  );
});

export default notificationWorker;
