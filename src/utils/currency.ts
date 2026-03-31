/**
 * ============================================
 * CURRENCY UTILITY
 * ============================================
 *
 * NGN/USD conversion with live rate fetching
 * and Redis-cached fallback.
 *
 * @file src/utils/currency.ts
 */

import axios from 'axios';
import { getCache, setCache } from '@config/redis.js';

// ============================================
// CONSTANTS
// ============================================

/** Redis cache key for exchange rate */
const RATE_CACHE_KEY = 'currency:ngn_usd_rate';

/** Cache TTL: 1 hour */
const RATE_CACHE_TTL = 3600;

/** Fallback rate when live API is unavailable (approx market rate) */
const FALLBACK_NGN_TO_USD_RATE = 0.00065; // 1 NGN ≈ 0.00065 USD (~1540 NGN per USD)

// ============================================
// TYPES
// ============================================

export interface ConversionResult {
  amountNGN: number;
  amountUSD: number;
  rate: number;
  source: 'live' | 'cached' | 'fallback';
}

// ============================================
// EXCHANGE RATE FETCHING
// ============================================

/**
 * Fetch live NGN→USD exchange rate from exchangerate-api.
 * Returns null on failure.
 */
async function fetchLiveRate(): Promise<number | null> {
  try {
    const apiKey = process.env.EXCHANGE_RATE_API_KEY;
    if (!apiKey) return null;

    const response = await axios.get(
      `https://v6.exchangerate-api.com/v6/${apiKey}/pair/NGN/USD`,
      { timeout: 5000 }
    );

    if (response.data?.result === 'success') {
      return response.data.conversion_rate as number;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Get the current NGN→USD exchange rate.
 * Priority: Redis cache → live API → hardcoded fallback.
 */
export async function getNGNtoUSDRate(): Promise<{ rate: number; source: 'live' | 'cached' | 'fallback' }> {
  // 1. Try Redis cache
  try {
    const cached = await getCache<number>(RATE_CACHE_KEY);
    if (cached !== null && cached !== undefined) {
      return { rate: cached, source: 'cached' };
    }
  } catch {
    // Redis unavailable — continue to live fetch
  }

  // 2. Try live API
  const liveRate = await fetchLiveRate();
  if (liveRate !== null) {
    try {
      await setCache(RATE_CACHE_KEY, liveRate, RATE_CACHE_TTL);
    } catch {
      // Cache write failed — non-critical
    }
    return { rate: liveRate, source: 'live' };
  }

  // 3. Fallback to hardcoded rate
  return { rate: FALLBACK_NGN_TO_USD_RATE, source: 'fallback' };
}

// ============================================
// CONVERSION FUNCTIONS
// ============================================

/**
 * Convert NGN amount to USD.
 * @param amountNGN - Amount in Nigerian Naira
 * @returns ConversionResult with USD equivalent and rate info
 */
export async function convertNGNtoUSD(amountNGN: number): Promise<ConversionResult> {
  const { rate, source } = await getNGNtoUSDRate();
  const amountUSD = parseFloat((amountNGN * rate).toFixed(2));

  return { amountNGN, amountUSD, rate, source };
}

/**
 * Convert USD amount to NGN.
 * @param amountUSD - Amount in US Dollars
 * @returns ConversionResult with NGN equivalent and rate info
 */
export async function convertUSDtoNGN(amountUSD: number): Promise<ConversionResult> {
  const { rate, source } = await getNGNtoUSDRate();
  const amountNGN = parseFloat((amountUSD / rate).toFixed(2));

  return { amountNGN, amountUSD, rate, source };
}

/**
 * Format amount as Nigerian Naira string.
 * @param amount - Amount in NGN
 */
export function formatNGN(amount: number): string {
  return new Intl.NumberFormat('en-NG', {
    style: 'currency',
    currency: 'NGN',
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(amount);
}

/**
 * Format amount as US Dollar string.
 * @param amount - Amount in USD
 */
export function formatUSD(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

/**
 * Convert NGN kobo (integer) to NGN naira (float).
 * Paystack uses kobo (smallest unit).
 */
export function koboToNaira(kobo: number): number {
  return kobo / 100;
}

/**
 * Convert NGN naira (float) to kobo (integer).
 * Paystack uses kobo (smallest unit).
 */
export function nairaToKobo(naira: number): number {
  return Math.round(naira * 100);
}

/**
 * Convert USD dollars to cents (integer).
 * Stripe uses cents (smallest unit).
 */
export function dollarsToCents(dollars: number): number {
  return Math.round(dollars * 100);
}

/**
 * Convert USD cents (integer) to dollars (float).
 */
export function centsToDollars(cents: number): number {
  return cents / 100;
}

export const CurrencyUtils = {
  getNGNtoUSDRate,
  convertNGNtoUSD,
  convertUSDtoNGN,
  formatNGN,
  formatUSD,
  koboToNaira,
  nairaToKobo,
  dollarsToCents,
  centsToDollars,
};

export default CurrencyUtils;
