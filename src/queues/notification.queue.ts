/**
 * ============================================
 * NOTIFICATION QUEUE
 * ============================================
 *
 * BullMQ queue for push/email/WhatsApp notifications.
 * Handles order status updates, payment confirmations,
 * delivery alerts, and marketing campaigns.
 *
 * @file src/queues/notification.queue.ts
 */

import { Queue } from 'bullmq';
import { bullMQConnection } from '@config/redis.js';

// ============================================
// JOB DATA TYPES
// ============================================

export interface OrderStatusNotificationJobData {
  type: 'order-status';
  orderId: string;
  orderNumber: string;
  userId: string;
  userEmail: string;
  oldStatus: string;
  newStatus: string;
  channels: Array<'email' | 'push' | 'whatsapp'>;
}

export interface PaymentNotificationJobData {
  type: 'payment-confirmation' | 'payment-failed';
  orderId: string;
  orderNumber: string;
  userId: string;
  userEmail: string;
  amount: number;
  currency: string;
  paymentMethod: string;
}

export interface DeliveryNotificationJobData {
  type: 'delivery-update';
  orderId: string;
  orderNumber: string;
  userId: string;
  userEmail: string;
  status: string;
  estimatedDelivery?: Date;
  message?: string;
}

export interface LowStockNotificationJobData {
  type: 'low-stock-alert';
  productId: string;
  productName: string;
  variantSku: string;
  currentStock: number;
  adminEmails: string[];
}

export type NotificationJobData =
  | OrderStatusNotificationJobData
  | PaymentNotificationJobData
  | DeliveryNotificationJobData
  | LowStockNotificationJobData;

// ============================================
// QUEUE
// ============================================

export const notificationQueue = new Queue<NotificationJobData>('notifications', {
  connection: bullMQConnection,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 1_000,
    },
    removeOnComplete: { count: 200 },
    removeOnFail: { count: 100 },
  },
});

// ============================================
// JOB HELPERS
// ============================================

export async function addOrderStatusNotification(
  data: Omit<OrderStatusNotificationJobData, 'type'>,
  delayMs: number = 0
): Promise<void> {
  await notificationQueue.add(
    'order-status-notification',
    { type: 'order-status', ...data },
    { delay: delayMs }
  );
}

export async function addPaymentNotification(
  data: Omit<PaymentNotificationJobData, 'type'> & {
    type: 'payment-confirmation' | 'payment-failed';
  }
): Promise<void> {
  await notificationQueue.add('payment-notification', data, { priority: 1 });
}

export async function addDeliveryNotification(
  data: Omit<DeliveryNotificationJobData, 'type'>
): Promise<void> {
  await notificationQueue.add(
    'delivery-notification',
    { type: 'delivery-update', ...data }
  );
}

export async function addLowStockAlert(
  data: Omit<LowStockNotificationJobData, 'type'>
): Promise<void> {
  await notificationQueue.add(
    'low-stock-alert',
    { type: 'low-stock-alert', ...data },
    { priority: 3 }
  );
}

export default notificationQueue;
