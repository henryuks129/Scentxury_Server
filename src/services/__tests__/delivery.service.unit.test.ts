/**
 * Delivery Service — Unit Tests
 *
 * Tests ETA calculation, delivery fee, service area validation,
 * and geocoding with Mapbox integration mocked.
 *
 * @file src/services/__tests__/delivery.service.unit.test.ts
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import axios from 'axios';
import { DeliveryService } from '../delivery.service.js';

vi.mock('axios');

const mockedAxios = vi.mocked(axios);

// Lagos Island → Victoria Island: ~15km, 1h
const MOCK_ROUTE_SHORT = {
  data: { routes: [{ duration: 3600, distance: 15_000 }] },
};

// Lagos → Far city: 60km, 2h
const MOCK_ROUTE_LONG = {
  data: { routes: [{ duration: 7200, distance: 60_000 }] },
};

// Helper: build Date for today at a given hour
function todayAt(hour: number, minute: number = 0): Date {
  const d = new Date();
  d.setHours(hour, minute, 0, 0);
  return d;
}

const ORIGIN = { lat: 6.5244, lng: 3.3792 }; // Lagos Island
const DESTINATION = { lat: 6.4541, lng: 3.3947 }; // Victoria Island
const FAR_DESTINATION = { lat: 7.0, lng: 3.5 };

describe('DeliveryService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.MAPBOX_ACCESS_TOKEN = 'pk.test_token';
  });

  // ============================================
  // calculateETA
  // ============================================

  describe('calculateETA', () => {
    it('should return same-day delivery for order before 4 PM within 50km', async () => {
      mockedAxios.get = vi.fn().mockResolvedValue(MOCK_ROUTE_SHORT);

      const result = await DeliveryService.calculateETA({
        origin: ORIGIN,
        destination: DESTINATION,
        orderTime: todayAt(10), // 10 AM
      });

      expect(result.eligibleForSameDay).toBe(true);
      expect(result.deliveryType).toBe('same_day');
      expect(result.estimatedDelivery).toBeInstanceOf(Date);
    });

    it('should return next-day when order is placed after 4 PM cutoff', async () => {
      mockedAxios.get = vi.fn().mockResolvedValue(MOCK_ROUTE_SHORT);

      const result = await DeliveryService.calculateETA({
        origin: ORIGIN,
        destination: DESTINATION,
        orderTime: todayAt(17), // 5 PM — after cutoff
      });

      expect(result.eligibleForSameDay).toBe(false);
      expect(result.deliveryType).toBe('next_day');
    });

    it('should return next-day for distance > 50km (same-day not eligible)', async () => {
      mockedAxios.get = vi.fn().mockResolvedValue(MOCK_ROUTE_LONG);

      const result = await DeliveryService.calculateETA({
        origin: ORIGIN,
        destination: FAR_DESTINATION,
        orderTime: todayAt(10), // still morning, but too far
      });

      expect(result.eligibleForSameDay).toBe(false);
    });

    it('should apply peak-hour buffer: peak duration > off-peak duration', async () => {
      mockedAxios.get = vi.fn().mockResolvedValue(MOCK_ROUTE_SHORT);

      const peakResult = await DeliveryService.calculateETA({
        origin: ORIGIN,
        destination: DESTINATION,
        orderTime: todayAt(8), // 8 AM — peak hour
      });

      mockedAxios.get = vi.fn().mockResolvedValue(MOCK_ROUTE_SHORT);

      const offPeakResult = await DeliveryService.calculateETA({
        origin: ORIGIN,
        destination: DESTINATION,
        orderTime: todayAt(14), // 2 PM — off-peak
      });

      expect(peakResult.estimatedDuration).toBeGreaterThan(offPeakResult.estimatedDuration);
    });

    it('should set estimatedDelivery to next morning for next-day delivery', async () => {
      mockedAxios.get = vi.fn().mockResolvedValue(MOCK_ROUTE_SHORT);

      const orderTime = todayAt(18); // 6 PM
      const result = await DeliveryService.calculateETA({
        origin: ORIGIN,
        destination: DESTINATION,
        orderTime,
      });

      expect(result.estimatedDelivery.getDate()).toBe(new Date(orderTime.getTime() + 86_400_000).getDate());
    });

    it('should expose distance in meters and km', async () => {
      mockedAxios.get = vi.fn().mockResolvedValue(MOCK_ROUTE_SHORT);

      const result = await DeliveryService.calculateETA({
        origin: ORIGIN,
        destination: DESTINATION,
        orderTime: todayAt(10),
      });

      expect(result.distance).toBe(15_000);
      expect(result.distanceKm).toBeCloseTo(15, 0);
    });

    it('should throw ExternalServiceError when MAPBOX_ACCESS_TOKEN is missing', async () => {
      delete process.env.MAPBOX_ACCESS_TOKEN;

      await expect(
        DeliveryService.calculateETA({
          origin: ORIGIN,
          destination: DESTINATION,
          orderTime: todayAt(10),
        })
      ).rejects.toThrow('Mapbox access token is not configured');
    });

    it('should throw BadRequestError when no route found', async () => {
      mockedAxios.get = vi.fn().mockResolvedValue({
        data: { routes: [] },
      });

      await expect(
        DeliveryService.calculateETA({
          origin: ORIGIN,
          destination: DESTINATION,
          orderTime: todayAt(10),
        })
      ).rejects.toThrow('No route found');
    });
  });

  // ============================================
  // calculateDeliveryFee
  // ============================================

  describe('calculateDeliveryFee', () => {
    it('should charge base fee for short distance (≤ 5km)', async () => {
      const fee = await DeliveryService.calculateDeliveryFee({
        distance: 4_000,
        deliveryType: 'standard',
      });

      expect(fee).toBe(1_500); // base fee
    });

    it('should increase fee proportionally with distance', async () => {
      const fee10km = await DeliveryService.calculateDeliveryFee({
        distance: 10_000,
        deliveryType: 'standard',
      });

      const fee30km = await DeliveryService.calculateDeliveryFee({
        distance: 30_000,
        deliveryType: 'standard',
      });

      expect(fee30km).toBeGreaterThan(fee10km);
    });

    it('should apply 1.5× multiplier for same-day delivery', async () => {
      const standardFee = await DeliveryService.calculateDeliveryFee({
        distance: 15_000,
        deliveryType: 'standard',
      });

      const sameDayFee = await DeliveryService.calculateDeliveryFee({
        distance: 15_000,
        deliveryType: 'same_day',
      });

      expect(sameDayFee).toBe(Math.round(standardFee * 1.5));
    });

    it('should return 0 for standard delivery above free threshold (₦100,000)', async () => {
      const fee = await DeliveryService.calculateDeliveryFee({
        distance: 15_000,
        deliveryType: 'standard',
        orderTotal: 100_000,
      });

      expect(fee).toBe(0);
    });

    it('should NOT apply free threshold to same-day delivery', async () => {
      const fee = await DeliveryService.calculateDeliveryFee({
        distance: 15_000,
        deliveryType: 'same_day',
        orderTotal: 100_000,
      });

      expect(fee).toBeGreaterThan(0);
    });

    it('should not give free delivery when order total is below threshold', async () => {
      const fee = await DeliveryService.calculateDeliveryFee({
        distance: 15_000,
        deliveryType: 'standard',
        orderTotal: 50_000, // below ₦100k threshold
      });

      expect(fee).toBeGreaterThan(0);
    });
  });

  // ============================================
  // isWithinServiceArea
  // ============================================

  describe('isWithinServiceArea', () => {
    it('should return true for all Lagos cities', () => {
      expect(DeliveryService.isWithinServiceArea({ state: 'Lagos' })).toBe(true);
      expect(DeliveryService.isWithinServiceArea({ state: 'Lagos', city: 'Ikeja' })).toBe(true);
      expect(
        DeliveryService.isWithinServiceArea({ state: 'Lagos', city: 'Victoria Island' })
      ).toBe(true);
    });

    it('should return true for Abuja in FCT', () => {
      expect(
        DeliveryService.isWithinServiceArea({ state: 'FCT', city: 'Abuja' })
      ).toBe(true);
    });

    it('should return false for unsupported states', () => {
      expect(
        DeliveryService.isWithinServiceArea({ state: 'Sokoto', city: 'Sokoto' })
      ).toBe(false);
    });

    it('should return false for supported state but unsupported city', () => {
      expect(
        DeliveryService.isWithinServiceArea({ state: 'FCT', city: 'Gwagwalada' })
      ).toBe(false);
    });

    it('should return false for supported state without a city when state has city restrictions', () => {
      // FCT requires a supported city
      expect(DeliveryService.isWithinServiceArea({ state: 'FCT' })).toBe(false);
    });

    it('should be case-insensitive for city matching', () => {
      expect(
        DeliveryService.isWithinServiceArea({ state: 'FCT', city: 'abuja' })
      ).toBe(true);
    });
  });

  // ============================================
  // getEstimatedDeliveryWindow
  // ============================================

  describe('getEstimatedDeliveryWindow', () => {
    it('should return "Today by ..." for same-day delivery', () => {
      const eta = new Date();
      eta.setHours(14, 0, 0, 0);
      const result = DeliveryService.getEstimatedDeliveryWindow('same_day', eta);
      expect(result).toMatch(/^Today by/);
    });

    it('should return "Tomorrow by ..." for next-day delivery', () => {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      tomorrow.setHours(10, 0, 0, 0);
      const result = DeliveryService.getEstimatedDeliveryWindow('next_day', tomorrow);
      expect(result).toMatch(/^Tomorrow by/);
    });

    it('should return "By ..." for standard delivery', () => {
      const future = new Date();
      future.setDate(future.getDate() + 2);
      const result = DeliveryService.getEstimatedDeliveryWindow('standard', future);
      expect(result).toMatch(/^By/);
    });
  });
});
