/**
 * ============================================
 * NOTIFICATION SERVICE
 * ============================================
 *
 * Handles push notifications via OneSignal and
 * transactional emails via SMTP (Gmail/Nodemailer).
 *
 * Gracefully degrades: if env keys are absent,
 * notifications are logged but not sent (dev mode).
 *
 * @file src/services/notification.service.ts
 */

import axios from 'axios';
import nodemailer from 'nodemailer';
import { logger } from '@utils/logger.js';

// ============================================
// TYPES
// ============================================

export interface PushNotificationPayload {
  /** OneSignal player IDs to target */
  playerIds?: string[];
  /** Target all subscribers (overrides playerIds) */
  includeAll?: boolean;
  /** Notification title */
  title: string;
  /** Notification body */
  body: string;
  /** Deep link URL */
  url?: string;
  /** Additional data payload */
  data?: Record<string, unknown>;
}

export interface EmailPayload {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
  from?: string;
}

export interface OrderStatusEmailData {
  customerName: string;
  orderNumber: string;
  status: string;
  items: Array<{ name: string; size: string; quantity: number; price: number }>;
  total: number;
  trackingUrl?: string;
}

export interface NotificationResult {
  success: boolean;
  provider: string;
  message?: string;
  id?: string;
}

// ============================================
// ONESIGNAL PUSH NOTIFICATIONS
// ============================================

/**
 * Send a push notification via OneSignal.
 */
export async function sendPushNotification(
  payload: PushNotificationPayload
): Promise<NotificationResult> {
  const appId = process.env.ONESIGNAL_APP_ID;
  const apiKey = process.env.ONESIGNAL_API_KEY;

  if (!appId || !apiKey) {
    logger.warn('[NotificationService] OneSignal credentials not configured — skipping push');
    return { success: false, provider: 'onesignal', message: 'OneSignal not configured' };
  }

  const body: Record<string, unknown> = {
    app_id: appId,
    headings: { en: payload.title },
    contents: { en: payload.body },
  };

  if (payload.includeAll) {
    body['included_segments'] = ['All'];
  } else if (payload.playerIds && payload.playerIds.length > 0) {
    body['include_player_ids'] = payload.playerIds;
  } else {
    body['included_segments'] = ['All'];
  }

  if (payload.url) body['url'] = payload.url;
  if (payload.data) body['data'] = payload.data;

  try {
    const response = await axios.post(
      'https://onesignal.com/api/v1/notifications',
      body,
      {
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Basic ${apiKey}`,
        },
        timeout: 10000,
      }
    );

    logger.info(`[NotificationService] Push sent: ${response.data.id}`);
    return { success: true, provider: 'onesignal', id: response.data.id };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error(`[NotificationService] Push failed: ${message}`);
    return { success: false, provider: 'onesignal', message };
  }
}

// ============================================
// EMAIL (NODEMAILER / SMTP)
// ============================================

/** Lazily-created transporter (avoids startup failures when SMTP not configured) */
let transporter: nodemailer.Transporter | null = null;

function getTransporter(): nodemailer.Transporter | null {
  if (transporter) return transporter;

  const host = process.env.SMTP_HOST;
  const port = parseInt(process.env.SMTP_PORT || '587', 10);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!host || !user || !pass) {
    logger.warn('[NotificationService] SMTP credentials not configured — emails will be skipped');
    return null;
  }

  transporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
  });

  return transporter;
}

/**
 * Send a transactional email.
 */
export async function sendEmail(payload: EmailPayload): Promise<NotificationResult> {
  const smtp = getTransporter();

  if (!smtp) {
    logger.warn(`[NotificationService] Email skipped (no SMTP): ${payload.subject}`);
    return { success: false, provider: 'smtp', message: 'SMTP not configured' };
  }

  const fromName = process.env.EMAIL_FROM_NAME || 'Scentxury';
  const fromAddress = process.env.SMTP_USER || 'noreply@scentxury.com';

  try {
    const info = await smtp.sendMail({
      from: payload.from || `"${fromName}" <${fromAddress}>`,
      to: Array.isArray(payload.to) ? payload.to.join(', ') : payload.to,
      subject: payload.subject,
      html: payload.html,
      text: payload.text,
    });

    logger.info(`[NotificationService] Email sent: ${info.messageId}`);
    return { success: true, provider: 'smtp', id: info.messageId };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error(`[NotificationService] Email failed: ${message}`);
    return { success: false, provider: 'smtp', message };
  }
}

// ============================================
// PREDEFINED EMAIL TEMPLATES
// ============================================

/**
 * Send order status update email to a customer.
 */
export async function sendOrderStatusEmail(
  customerEmail: string,
  data: OrderStatusEmailData
): Promise<NotificationResult> {
  const statusLabels: Record<string, string> = {
    pending: 'Order Received',
    confirmed: 'Order Confirmed',
    processing: 'Being Prepared',
    shipped: 'Out for Delivery',
    delivered: 'Delivered',
    cancelled: 'Cancelled',
  };

  const statusLabel = statusLabels[data.status] || data.status;
  const itemRows = data.items
    .map(
      (item) =>
        `<tr>
          <td style="padding:8px;border-bottom:1px solid #eee">${item.name} (${item.size})</td>
          <td style="padding:8px;border-bottom:1px solid #eee;text-align:center">${item.quantity}</td>
          <td style="padding:8px;border-bottom:1px solid #eee;text-align:right">₦${item.price.toLocaleString()}</td>
        </tr>`
    )
    .join('');

  const html = `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto">
      <div style="background:#1a1a2e;padding:24px;text-align:center">
        <h1 style="color:#c9a96e;margin:0">Scentxury</h1>
        <p style="color:#fff;margin:8px 0 0">Premium Fragrance</p>
      </div>
      <div style="padding:24px">
        <h2>Hi ${data.customerName},</h2>
        <p>Your order <strong>#${data.orderNumber}</strong> status has been updated to: <strong>${statusLabel}</strong></p>
        <table style="width:100%;border-collapse:collapse;margin:16px 0">
          <thead>
            <tr style="background:#f5f5f5">
              <th style="padding:8px;text-align:left">Item</th>
              <th style="padding:8px;text-align:center">Qty</th>
              <th style="padding:8px;text-align:right">Price</th>
            </tr>
          </thead>
          <tbody>${itemRows}</tbody>
          <tfoot>
            <tr>
              <td colspan="2" style="padding:8px;font-weight:bold">Total</td>
              <td style="padding:8px;font-weight:bold;text-align:right">₦${data.total.toLocaleString()}</td>
            </tr>
          </tfoot>
        </table>
        ${
          data.trackingUrl
            ? `<p><a href="${data.trackingUrl}" style="background:#c9a96e;color:#fff;padding:12px 24px;text-decoration:none;border-radius:4px">Track Your Order</a></p>`
            : ''
        }
      </div>
      <div style="background:#f5f5f5;padding:16px;text-align:center;color:#666;font-size:12px">
        <p>Chi Fragrance — Nigeria's Premium Scent House</p>
      </div>
    </div>
  `;

  return sendEmail({
    to: customerEmail,
    subject: `Order #${data.orderNumber} — ${statusLabel}`,
    html,
    text: `Your order #${data.orderNumber} status: ${statusLabel}. Total: ₦${data.total.toLocaleString()}`,
  });
}

/**
 * Send a welcome email to a newly registered user.
 */
export async function sendWelcomeEmail(
  customerEmail: string,
  customerName: string
): Promise<NotificationResult> {
  const html = `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto">
      <div style="background:#1a1a2e;padding:24px;text-align:center">
        <h1 style="color:#c9a96e;margin:0">Welcome to Scentxury</h1>
      </div>
      <div style="padding:24px">
        <h2>Hi ${customerName}!</h2>
        <p>Welcome to Nigeria's premium fragrance destination. Discover authentic scents crafted for every occasion.</p>
        <p>Use our <strong>Scent Finder</strong> to find your perfect fragrance match.</p>
      </div>
    </div>
  `;

  return sendEmail({
    to: customerEmail,
    subject: 'Welcome to Scentxury — Your Scent Journey Begins',
    html,
    text: `Welcome to Scentxury, ${customerName}! Discover premium fragrances at scentxury.com`,
  });
}

/**
 * Send a low-stock alert to admin.
 */
export async function sendLowStockAlert(
  productName: string,
  sku: string,
  currentStock: number,
  threshold: number
): Promise<NotificationResult> {
  const adminEmail = process.env.ADMIN_EMAIL;
  if (!adminEmail) {
    return { success: false, provider: 'smtp', message: 'ADMIN_EMAIL not configured' };
  }

  const html = `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px">
      <h2 style="color:#e53e3e">⚠️ Low Stock Alert</h2>
      <p><strong>Product:</strong> ${productName}</p>
      <p><strong>SKU:</strong> ${sku}</p>
      <p><strong>Current Stock:</strong> ${currentStock} units</p>
      <p><strong>Threshold:</strong> ${threshold} units</p>
      <p>Please restock this variant as soon as possible.</p>
    </div>
  `;

  return sendEmail({
    to: adminEmail,
    subject: `⚠️ Low Stock Alert: ${productName} (${sku})`,
    html,
    text: `Low stock alert: ${productName} SKU:${sku} has ${currentStock} units remaining (threshold: ${threshold})`,
  });
}

export const NotificationService = {
  sendPushNotification,
  sendEmail,
  sendOrderStatusEmail,
  sendWelcomeEmail,
  sendLowStockAlert,
};

export default NotificationService;
