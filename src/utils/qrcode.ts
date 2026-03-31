/**
 * ============================================
 * QR CODE UTILITY
 * ============================================
 *
 * Generates QR codes for product authenticity
 * verification. Outputs base64 PNG data URLs
 * and SVG strings.
 *
 * @file src/utils/qrcode.ts
 */

import QRCode from 'qrcode';

// ============================================
// TYPES
// ============================================

export interface QRCodeOptions {
  /** Width/height in pixels for PNG output (default: 256) */
  size?: number;
  /** Error correction level: L=7%, M=15%, Q=25%, H=30% (default: M) */
  errorCorrectionLevel?: 'L' | 'M' | 'Q' | 'H';
  /** Background colour (default: #ffffff) */
  color?: {
    dark?: string;
    light?: string;
  };
}

export interface ProductQRData {
  productId: string;
  sku: string;
  name: string;
  isOriginal: boolean;
  verificationUrl: string;
}

export interface QRCodeResult {
  dataUrl: string; // base64 PNG data URL
  svg: string;     // SVG string
  text: string;    // The raw encoded text
}

// ============================================
// CONSTANTS
// ============================================

const BASE_VERIFICATION_URL =
  process.env.FRONTEND_URL
    ? `${process.env.FRONTEND_URL}/verify`
    : 'https://scentxury.com/verify';

// ============================================
// CORE GENERATORS
// ============================================

/**
 * Generate a QR code as a base64 PNG data URL.
 * @param text - The text/URL to encode
 * @param options - QR code options
 */
export async function generateQRDataURL(
  text: string,
  options: QRCodeOptions = {}
): Promise<string> {
  const { size = 256, errorCorrectionLevel = 'M', color = {} } = options;

  return QRCode.toDataURL(text, {
    width: size,
    errorCorrectionLevel,
    color: {
      dark: color.dark || '#000000',
      light: color.light || '#ffffff',
    },
    margin: 2,
  });
}

/**
 * Generate a QR code as an SVG string.
 * @param text - The text/URL to encode
 * @param options - QR code options
 */
export async function generateQRSVG(
  text: string,
  options: QRCodeOptions = {}
): Promise<string> {
  const { errorCorrectionLevel = 'M', color = {} } = options;

  return QRCode.toString(text, {
    type: 'svg',
    errorCorrectionLevel,
    color: {
      dark: color.dark || '#000000',
      light: color.light || '#ffffff',
    },
    margin: 2,
  });
}

// ============================================
// PRODUCT AUTHENTICITY QR
// ============================================

/**
 * Build the verification URL for a product variant.
 * The URL encodes productId and SKU as query params.
 */
export function buildProductVerificationURL(productId: string, sku: string): string {
  const params = new URLSearchParams({ id: productId, sku });
  return `${BASE_VERIFICATION_URL}?${params.toString()}`;
}

/**
 * Generate a full QR code (PNG + SVG) for product authenticity.
 * @param data - Product data to encode
 * @param options - QR code render options
 */
export async function generateProductQRCode(
  data: ProductQRData,
  options: QRCodeOptions = {}
): Promise<QRCodeResult> {
  const verificationUrl = data.verificationUrl || buildProductVerificationURL(data.productId, data.sku);

  const [dataUrl, svg] = await Promise.all([
    generateQRDataURL(verificationUrl, options),
    generateQRSVG(verificationUrl, options),
  ]);

  return {
    dataUrl,
    svg,
    text: verificationUrl,
  };
}

/**
 * Generate a QR code for an order receipt.
 * @param orderNumber - The order number
 * @param orderId - MongoDB order _id
 */
export async function generateOrderQRCode(
  orderNumber: string,
  orderId: string
): Promise<QRCodeResult> {
  const trackingUrl = process.env.FRONTEND_URL
    ? `${process.env.FRONTEND_URL}/orders/${orderNumber}`
    : `https://scentxury.com/orders/${orderNumber}`;

  const text = JSON.stringify({ orderNumber, orderId, url: trackingUrl });

  const [dataUrl, svg] = await Promise.all([
    generateQRDataURL(trackingUrl, { errorCorrectionLevel: 'M' }),
    generateQRSVG(trackingUrl, { errorCorrectionLevel: 'M' }),
  ]);

  return { dataUrl, svg, text };
}

export const QRCodeUtils = {
  generateQRDataURL,
  generateQRSVG,
  buildProductVerificationURL,
  generateProductQRCode,
  generateOrderQRCode,
};

export default QRCodeUtils;
