/**
 * ============================================
 * DELIVERY SERVICE
 * ============================================
 *
 * ETA calculation, delivery fee computation, and
 * service area validation for Nigerian logistics.
 * Integrates with Mapbox Directions API.
 *
 * @file src/services/delivery.service.ts
 */

import axios from 'axios';
import { ExternalServiceError, BadRequestError } from '@utils/errors.js';

// ============================================
// TYPES
// ============================================

export interface Coordinates {
  lat: number;
  lng: number;
}

export interface CalculateETAParams {
  origin: Coordinates;
  destination: Coordinates;
  orderTime: Date;
}

export interface ETAResult {
  eligibleForSameDay: boolean;
  deliveryType: 'same_day' | 'next_day' | 'standard';
  estimatedDelivery: Date;
  estimatedDuration: number; // seconds
  distance: number; // meters
  distanceKm: number;
}

export interface CalculateDeliveryFeeParams {
  distance: number; // meters
  deliveryType: 'same_day' | 'next_day' | 'standard';
  orderTotal?: number; // NGN — for free delivery threshold
}

export interface ServiceAreaAddress {
  state: string;
  city?: string;
}

export interface GeocodeResult {
  lat: number;
  lng: number;
  placeName: string;
}

// ============================================
// CONSTANTS
// ============================================

/** Same-day delivery cutoff hour (24h format) */
const SAME_DAY_CUTOFF_HOUR = 16; // 4 PM

/** Maximum distance for same-day delivery (meters) */
const MAX_SAME_DAY_DISTANCE = 50_000; // 50 km

/** Minimum order total for free delivery (NGN) */
const FREE_DELIVERY_THRESHOLD = 100_000; // ₦100,000

/** Base delivery fee (NGN) for first 5km */
const BASE_DELIVERY_FEE = 1_500;

/** Per-km fee beyond base distance (NGN) */
const FEE_PER_KM = 100;

/** Base distance included in base fee (km) */
const BASE_DISTANCE_KM = 5;

/** Same-day delivery multiplier */
const SAME_DAY_MULTIPLIER = 1.5;

/** Traffic buffer multiplier during peak hours */
const PEAK_HOUR_MULTIPLIER = 1.4;

/** Peak hours (24h): morning and evening rush */
const PEAK_HOURS = [7, 8, 9, 17, 18, 19];

/** Service areas: state → supported cities (empty = all cities in state) */
const SERVICE_AREAS: Record<string, string[]> = {
  Lagos: [],       // All Lagos cities
  FCT: ['Abuja'],
  Ogun: ['Sagamu', 'Abeokuta'],
  Rivers: ['Port Harcourt'],
};

const MAPBOX_BASE_URL = 'https://api.mapbox.com';

// ============================================
// HELPERS
// ============================================

function isPeakHour(date: Date): boolean {
  const hour = date.getHours();
  return PEAK_HOURS.includes(hour);
}

function isAfterCutoff(date: Date): boolean {
  return date.getHours() >= SAME_DAY_CUTOFF_HOUR;
}

function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

function toNextMorning(date: Date, deliveryHour: number = 10): Date {
  const next = addDays(date, 1);
  next.setHours(deliveryHour, 0, 0, 0);
  return next;
}

// ============================================
// MAPBOX INTEGRATION
// ============================================

/**
 * Fetch route data from Mapbox Directions API.
 */
async function fetchMapboxRoute(
  origin: Coordinates,
  destination: Coordinates
): Promise<{ duration: number; distance: number }> {
  const accessToken = process.env.MAPBOX_ACCESS_TOKEN;
  if (!accessToken) {
    throw new ExternalServiceError('Mapbox', 'Mapbox access token is not configured');
  }

  const coordinates = `${origin.lng},${origin.lat};${destination.lng},${destination.lat}`;
  const url = `${MAPBOX_BASE_URL}/directions/v5/mapbox/driving/${coordinates}`;

  try {
    const response = await axios.get(url, {
      params: {
        access_token: accessToken,
        geometries: 'geojson',
      },
    });

    const routes = response.data?.routes;
    if (!routes || routes.length === 0) {
      throw new BadRequestError('No route found between origin and destination');
    }

    return {
      duration: routes[0].duration, // seconds
      distance: routes[0].distance, // meters
    };
  } catch (error) {
    if (error instanceof BadRequestError || error instanceof ExternalServiceError) {
      throw error;
    }
    if (axios.isAxiosError(error)) {
      const msg = error.response?.data?.message || error.message;
      throw new ExternalServiceError('Mapbox', `Route calculation failed: ${msg}`);
    }
    throw new ExternalServiceError('Mapbox', 'Unexpected error fetching route');
  }
}

/**
 * Geocode an address string to coordinates.
 */
async function geocodeAddress(address: string): Promise<GeocodeResult> {
  const accessToken = process.env.MAPBOX_ACCESS_TOKEN;
  if (!accessToken) {
    throw new ExternalServiceError('Mapbox', 'Mapbox access token is not configured');
  }

  const encoded = encodeURIComponent(address);
  const url = `${MAPBOX_BASE_URL}/geocoding/v5/mapbox.places/${encoded}.json`;

  try {
    const response = await axios.get(url, {
      params: {
        access_token: accessToken,
        country: 'NG',
        limit: 1,
      },
    });

    const features = response.data?.features;
    if (!features || features.length === 0) {
      throw new BadRequestError(`Address not found: ${address}`);
    }

    const [lng, lat] = features[0].center;
    return {
      lat,
      lng,
      placeName: features[0].place_name,
    };
  } catch (error) {
    if (error instanceof BadRequestError || error instanceof ExternalServiceError) {
      throw error;
    }
    if (axios.isAxiosError(error)) {
      const msg = error.response?.data?.message || error.message;
      throw new ExternalServiceError('Mapbox', `Geocoding failed: ${msg}`);
    }
    throw new ExternalServiceError('Mapbox', 'Unexpected error during geocoding');
  }
}

// ============================================
// CORE SERVICE FUNCTIONS
// ============================================

/**
 * Calculate delivery ETA for an order.
 *
 * Rules:
 * - Same-day if: order before 4 PM, distance ≤ 50km
 * - Next-day if: order after 4 PM or distance > 50km
 * - Peak hour traffic adds a 40% buffer to duration
 */
async function calculateETA(params: CalculateETAParams): Promise<ETAResult> {
  const { origin, destination, orderTime } = params;

  const { duration: baseDuration, distance } = await fetchMapboxRoute(origin, destination);
  const distanceKm = distance / 1000;

  // Apply peak hour traffic buffer
  const adjustedDuration = isPeakHour(orderTime)
    ? Math.round(baseDuration * PEAK_HOUR_MULTIPLIER)
    : baseDuration;

  const afterCutoff = isAfterCutoff(orderTime);
  const tooFar = distance > MAX_SAME_DAY_DISTANCE;
  const eligibleForSameDay = !afterCutoff && !tooFar;

  let deliveryType: ETAResult['deliveryType'];
  let estimatedDelivery: Date;

  if (eligibleForSameDay) {
    deliveryType = 'same_day';
    estimatedDelivery = new Date(orderTime.getTime() + adjustedDuration * 1000 + 30 * 60 * 1000); // route + 30min prep
  } else if (distanceKm > 100) {
    deliveryType = 'standard';
    estimatedDelivery = toNextMorning(orderTime, 14); // 2 PM next day
  } else {
    deliveryType = 'next_day';
    estimatedDelivery = toNextMorning(orderTime, 10); // 10 AM next day
  }

  return {
    eligibleForSameDay,
    deliveryType,
    estimatedDelivery,
    estimatedDuration: adjustedDuration,
    distance,
    distanceKm,
  };
}

/**
 * Calculate delivery fee based on distance, delivery type, and order total.
 *
 * Rules:
 * - Free delivery for orders ≥ ₦100,000 (standard only)
 * - Base fee: ₦1,500 for first 5km
 * - ₦100 per km beyond 5km
 * - Same-day: 1.5× multiplier
 */
async function calculateDeliveryFee(params: CalculateDeliveryFeeParams): Promise<number> {
  const { distance, deliveryType, orderTotal } = params;
  const distanceKm = distance / 1000;

  // Free delivery threshold (standard delivery only)
  if (
    orderTotal !== undefined &&
    orderTotal >= FREE_DELIVERY_THRESHOLD &&
    deliveryType === 'standard'
  ) {
    return 0;
  }

  // Distance-based fee
  let fee = BASE_DELIVERY_FEE;
  if (distanceKm > BASE_DISTANCE_KM) {
    fee += Math.ceil(distanceKm - BASE_DISTANCE_KM) * FEE_PER_KM;
  }

  // Same-day premium
  if (deliveryType === 'same_day') {
    fee = Math.round(fee * SAME_DAY_MULTIPLIER);
  }

  return fee;
}

/**
 * Check if an address is within the supported service area.
 */
function isWithinServiceArea(address: ServiceAreaAddress): boolean {
  const { state, city } = address;

  if (!(state in SERVICE_AREAS)) {
    return false;
  }

  const supportedCities = SERVICE_AREAS[state] ?? [];
  // Empty array = all cities in state are supported
  if (supportedCities.length === 0) {
    return true;
  }

  if (!city) {
    return false;
  }

  return supportedCities.some(
    (c) => c.toLowerCase() === city.toLowerCase()
  );
}

/**
 * Get a human-readable estimated delivery window string.
 */
function getEstimatedDeliveryWindow(
  deliveryType: ETAResult['deliveryType'],
  estimatedDelivery: Date
): string {
  const formatter = new Intl.DateTimeFormat('en-NG', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
    timeZone: 'Africa/Lagos',
  });

  switch (deliveryType) {
    case 'same_day':
      return `Today by ${formatter.format(estimatedDelivery)}`;
    case 'next_day':
      return `Tomorrow by ${formatter.format(estimatedDelivery)}`;
    default:
      return `By ${formatter.format(estimatedDelivery)}`;
  }
}

// ============================================
// SERVICE OBJECT
// ============================================

export const DeliveryService = {
  calculateETA,
  calculateDeliveryFee,
  isWithinServiceArea,
  geocodeAddress,
  getEstimatedDeliveryWindow,
};

export default DeliveryService;
