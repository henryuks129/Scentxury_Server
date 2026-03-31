/**
 * Analytics Service — Performance Tests
 *
 * @file src/services/__tests__/analytics.service.perf.test.ts
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AnalyticsService } from '../analytics.service.js';
import { Order } from '@models/Order.js';
import { Product } from '@models/Product.js';
import { Expense } from '@models/Expense.js';
import { User } from '@models/User.js';
import { DailySummary } from '@models/DailySummary.js';
import { measureTime } from '../../test/helpers.js';

vi.mock('@models/Order.js');
vi.mock('@models/Product.js');
vi.mock('@models/User.js');
vi.mock('@models/Expense.js');
vi.mock('@models/DailySummary.js');

describe('AnalyticsService Performance', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Default mock: 500 orders worth of aggregation
    vi.mocked(Order.aggregate).mockResolvedValue([
      { revenue: 5_000_000, orders: 500, _id: null },
    ]);

    // Default product mock: 50 products each with 3 variants
    const mockProducts = Array.from({ length: 50 }, (_, i) => ({
      _id: `prod-${i}`,
      name: `Product ${i}`,
      isActive: true,
      variants: [
        { sku: `P${i}-20`, size: '20ml', stock: 30, costPrice: 3_000, lowStockThreshold: 5 },
        { sku: `P${i}-50`, size: '50ml', stock: 20, costPrice: 6_000, lowStockThreshold: 5 },
        { sku: `P${i}-100`, size: '100ml', stock: 10, costPrice: 10_000, lowStockThreshold: 5 },
      ],
    }));
    vi.mocked(Product.find).mockReturnValue({ lean: vi.fn().mockResolvedValue(mockProducts) } as any);
    vi.mocked(Expense.aggregate).mockResolvedValue([{ total: 500_000 }]);
    vi.mocked(User.countDocuments).mockResolvedValue(10);
    vi.mocked(Order.find).mockReturnValue({
      sort: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      populate: vi.fn().mockReturnThis(),
      lean: vi.fn().mockResolvedValue([]),
    } as any);
  });

  it('should return sales analytics within 200ms', async () => {
    const { duration } = await measureTime(() =>
      AnalyticsService.getSalesAnalytics(
        new Date('2025-01-01'),
        new Date('2025-01-31'),
        'day'
      )
    );
    expect(duration).toBeLessThan(200);
  });

  it('should calculate inventory report for 50 products within 200ms', async () => {
    const { duration } = await measureTime(() =>
      AnalyticsService.getInventoryReport()
    );
    expect(duration).toBeLessThan(200);
  });

  it('should generate P&L report within 200ms', async () => {
    vi.mocked(Order.aggregate)
      .mockResolvedValueOnce([{
        grossRevenue: 3_000_000, discountsGiven: 0, deliveryFees: 0,
        netRevenue: 3_000_000, cogs: 1_800_000,
      }])
      .mockResolvedValueOnce([{ netRevenue: 2_500_000, cogs: 1_500_000 }]);

    vi.mocked(Expense.aggregate)
      .mockResolvedValueOnce([{ _id: 'salary', total: 300_000 }])
      .mockResolvedValueOnce([{ total: 250_000 }]);

    const { duration } = await measureTime(() =>
      AnalyticsService.getPnLReport(2025, 1)
    );
    expect(duration).toBeLessThan(200);
  });

  it('should generate daily summary within 200ms', async () => {
    vi.mocked(Order.aggregate).mockResolvedValue([{
      totalOrders: 20, grossRevenue: 800_000, discountsGiven: 0,
      deliveryFeesCollected: 25_000, netRevenue: 825_000,
      paystackRevenue: 700_000, stripeRevenue: 125_000, bankTransferRevenue: 0,
      cogs: 490_000,
    }]);
    vi.mocked(Expense.aggregate).mockResolvedValue([{ total: 80_000 }]);
    vi.mocked(User.countDocuments).mockResolvedValue(4);
    vi.mocked(DailySummary.findOneAndUpdate).mockResolvedValue({ _id: 's1' } as any);

    const { duration } = await measureTime(() =>
      AnalyticsService.calculateDailySummary(new Date('2025-01-15'))
    );
    expect(duration).toBeLessThan(200);
  });

  it('should handle 10 concurrent getSalesAnalytics calls within 500ms', async () => {
    vi.mocked(Order.aggregate).mockResolvedValue([
      { _id: '2025-01-01', revenue: 10_000, orders: 1 },
    ]);

    const { duration } = await measureTime(async () => {
      await Promise.all(
        Array.from({ length: 10 }, () =>
          AnalyticsService.getSalesAnalytics(
            new Date('2025-01-01'),
            new Date('2025-01-31'),
            'day'
          )
        )
      );
    });
    expect(duration).toBeLessThan(500);
  });
});
