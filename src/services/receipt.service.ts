/**
 * ============================================
 * RECEIPT SERVICE
 * ============================================
 *
 * Generates order receipts (PDF / shareable image) and
 * distributes them via email. Cloudinary storage for URLs.
 *
 * Note: PDF/image generation uses external libraries
 * (pdfkit, canvas) that are installed separately.
 * This service provides the orchestration layer.
 *
 * @file src/services/receipt.service.ts
 */

import { Order } from '@models/Order.js';
import { NotFoundError, ExternalServiceError } from '@utils/errors.js';

// ============================================
// TYPES
// ============================================

export interface ReceiptData {
  orderNumber: string;
  customerName: string;
  customerEmail: string;
  items: ReceiptItem[];
  subtotal: number;
  discount: number;
  deliveryFee: number;
  total: number;
  currency: 'NGN' | 'USD';
  paymentMethod: string;
  paymentReference?: string;
  deliveryAddress: string;
  estimatedDelivery?: Date;
  generatedAt: Date;
}

export interface ReceiptItem {
  name: string;
  sku: string;
  size: string;
  quantity: number;
  unitPrice: number;
  total: number;
}

export interface ReceiptResult {
  receiptUrl: string;
  receiptType: 'pdf' | 'image';
}

// ============================================
// HELPERS
// ============================================

/**
 * Format currency for receipt display.
 */
function formatCurrency(amount: number, currency: 'NGN' | 'USD'): string {
  const symbol = currency === 'NGN' ? '₦' : '$';
  return `${symbol}${amount.toLocaleString('en-NG', { minimumFractionDigits: 2 })}`;
}

/**
 * Build ReceiptData from an Order document.
 */
async function buildReceiptData(orderId: string): Promise<ReceiptData> {
  const order = await Order.findById(orderId)
    .populate('userId', 'firstName lastName email')
    .lean();

  if (!order) {
    throw new NotFoundError('Order');
  }

  const user = order.userId as { firstName?: string; lastName?: string; email?: string } | null | undefined;

  return {
    orderNumber: order.orderNumber,
    customerName: user ? `${user.firstName} ${user.lastName}` : 'Customer',
    customerEmail: user?.email || '',
    items: order.items.map((item) => ({
      name: item.productName,
      sku: item.variantSku,
      size: item.variantSize,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      total: item.total,
    })),
    subtotal: order.subtotal,
    discount: order.discount,
    deliveryFee: order.deliveryFee,
    total: order.total,
    currency: order.currency,
    paymentMethod: order.paymentMethod,
    paymentReference: order.paymentReference,
    deliveryAddress: [
      order.shippingAddress.street,
      order.shippingAddress.city,
      order.shippingAddress.state,
    ].join(', '),
    estimatedDelivery: order.estimatedDelivery,
    generatedAt: new Date(),
  };
}

// ============================================
// RECEIPT GENERATION
// ============================================

/**
 * Generate a PDF receipt for an order.
 * Returns the Cloudinary URL of the uploaded PDF.
 *
 * In production: uses pdfkit + cloudinary upload stream.
 * In this implementation: returns a placeholder URL —
 * swap the body of `uploadPdf` when Cloudinary is wired up.
 */
async function generatePDFReceipt(orderId: string): Promise<ReceiptResult> {
  const receiptData = await buildReceiptData(orderId);

  // --- Cloudinary upload stub ---
  // const pdfBuffer = await renderPDF(receiptData);
  // const result = await cloudinary.uploader.upload_stream(
  //   { resource_type: 'raw', folder: 'receipts', public_id: receiptData.orderNumber },
  //   callback
  // );
  // const receiptUrl = result.secure_url;

  // Placeholder URL until Cloudinary is configured
  const receiptUrl = `https://res.cloudinary.com/scentxury/raw/upload/receipts/${receiptData.orderNumber}.pdf`;

  // Persist URL back to order
  await Order.findByIdAndUpdate(orderId, {
    $set: { receiptUrl },
  });

  return { receiptUrl, receiptType: 'pdf' };
}

/**
 * Generate a shareable image receipt (for social media / 3D Story Canvas).
 */
async function generateImageReceipt(orderId: string): Promise<ReceiptResult> {
  const receiptData = await buildReceiptData(orderId);

  // --- Image generation stub ---
  // const imageBuffer = await renderReceiptImage(receiptData);
  // const result = await cloudinary.uploader.upload(imageBuffer, {
  //   folder: 'receipt-images',
  //   public_id: `${receiptData.orderNumber}-share`,
  //   format: 'png',
  // });

  const receiptUrl = `https://res.cloudinary.com/scentxury/image/upload/receipt-images/${receiptData.orderNumber}-share.png`;

  return { receiptUrl, receiptType: 'image' };
}

/**
 * Send receipt via email.
 */
async function sendReceiptEmail(orderId: string): Promise<void> {
  const receiptData = await buildReceiptData(orderId);

  if (!receiptData.customerEmail) {
    throw new ExternalServiceError('SMTP', 'Customer email is required to send receipt');
  }

  // --- Nodemailer stub ---
  // const transporter = nodemailer.createTransport({ ... });
  // await transporter.sendMail({
  //   from: process.env.SMTP_FROM,
  //   to: receiptData.customerEmail,
  //   subject: `Your Scentxury Order Receipt - ${receiptData.orderNumber}`,
  //   html: renderReceiptEmailTemplate(receiptData),
  // });

  console.log(`[ReceiptService] Email receipt queued for order ${receiptData.orderNumber} → ${receiptData.customerEmail}`);
}

/**
 * Render a plain-text receipt summary (useful for logs/emails).
 */
function renderTextReceipt(data: ReceiptData): string {
  const lines: string[] = [
    '========================================',
    '         SCENTXURY ORDER RECEIPT        ',
    '========================================',
    `Order #: ${data.orderNumber}`,
    `Date:    ${data.generatedAt.toLocaleDateString('en-NG')}`,
    `Customer: ${data.customerName}`,
    '----------------------------------------',
    'ITEMS:',
    ...data.items.map(
      (i) =>
        `  ${i.name} (${i.size}) × ${i.quantity}  ${formatCurrency(i.total, data.currency)}`
    ),
    '----------------------------------------',
    `Subtotal:     ${formatCurrency(data.subtotal, data.currency)}`,
    `Discount:    -${formatCurrency(data.discount, data.currency)}`,
    `Delivery:     ${formatCurrency(data.deliveryFee, data.currency)}`,
    `TOTAL:        ${formatCurrency(data.total, data.currency)}`,
    '----------------------------------------',
    `Payment: ${data.paymentMethod.toUpperCase()}`,
    data.paymentReference ? `Ref: ${data.paymentReference}` : '',
    '========================================',
  ].filter(Boolean);

  return lines.join('\n');
}

// ============================================
// SERVICE OBJECT
// ============================================

export const ReceiptService = {
  generatePDFReceipt,
  generateImageReceipt,
  sendReceiptEmail,
  buildReceiptData,
  renderTextReceipt,
};

export default ReceiptService;
