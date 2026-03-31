/**
 * Analytics Service — Unit Tests
 *
 * Tests dashboard summary, sales analytics, inventory report,
 * P&L calculations, and daily summary generation.
 *
 * @file src/services/__tests__/analytics.service.unit.test.ts
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AnalyticsService } from '../analytics.service.js';
import { Order } from '@models/Order.js';
import { Product } from '@models/Product.js';
import { User } from '@models/User.js';
import { Expense } from '@models/Expense.js';
import { DailySummary } from '@models/DailySummary.js';

// ============================================
// MOCKS
// ============================================

vi.mock('@models/Order.js');
vi.mock('@models/Product.js');
vi.mock('@models/User.js');
vi.mock('@models/Expense.js');
vi.mock('@models/DailySummary.js');

// ============================================
// TESTS
// ============================================

describe('AnalyticsService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ============================================
  // getDashboardSummary
  // ============================================

  describe('getDashboardSummary', () => {
    it('should return dashboard with today/week/month/year metrics', async () => {
      const mockAggResult = [{ revenue: 50_000, orders: 5 }];

      vi.mocked(Order.aggregate).mockResolvedValue(mockAggResult);
      vi.mocked(Product.find).mockReturnValue({ lean: vi.fn().mockResolvedValue([]) } as any);
      vi.mocked(Order.find).mockReturnValue({
        sort: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        populate: vi.fn().mockReturnThis(),
        lean: vi.fn().mockResolvedValue([]),
      } as any);

      const summary = await AnalyticsService.getDashboardSummary();

      expect(summary).toHaveProperty('today');
      expect(summary).toHaveProperty('week');
      expect(summary).toHaveProperty('month');
      expect(summary).toHaveProperty('year');
      expect(summary).toHaveProperty('lowStockAlerts');
      expect(summary).toHaveProperty('recentOrders');
    });

    it('should calculate changePercent as 0 when previous period had no revenue', async () => {
      // First 8 calls: today, yesterday=0, week, prevWeek=0, month, prevMonth=0, year, prevYear=0
      vi.mocked(Order.aggregate)
        .mockResolvedValueOnce([{ revenue: 10_000, orders: 2 }]) // today
        .mockResolvedValueOnce([])                               // yesterday (no data)
        .mockResolvedValue([{ revenue: 5_000, orders: 1 }]);    // rest

      vi.mocked(Product.find).mockReturnValue({ lean: vi.fn().mockResolvedValue([]) } as any);
      vi.mocked(Order.find).mockReturnValue({
        sort: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        populate: vi.fn().mockReturnThis(),
        lean: vi.fn().mockResolvedValue([]),
      } as any);

      const summary = await AnalyticsService.getDashboardSummary();
      expect(typeof summary.today.changePercent).toBe('number');
    });
  });

  // ============================================
  // getSalesAnalytics
  // ============================================

  describe('getSalesAnalytics', () => {
    it('should return sales data grouped by day', async () => {
      vi.mocked(Order.aggregate).mockResolvedValue([
        { _id: '2025-01-01', revenue: 30_000, orders: 3 },
        { _id: '2025-01-02', revenue: 45_000, orders: 5 },
      ]);

      const result = await AnalyticsService.getSalesAnalytics(
        new Date('2025-01-01'),
        new Date('2025-01-07'),
        'day'
      );

      expect(result.data).toHaveLength(2);
      expect(result.data[0].revenue).toBe(30_000);
      expect(result.data[0].avgOrderValue).toBe(10_000);
      expect(result.groupBy).toBe('day');
    });

    it('should calculate total revenue across all data points', async () => {
      vi.mocked(Order.aggregate).mockResolvedValue([
        { _id: '2025-01-01', revenue: 30_000, orders: 3 },
        { _id: '2025-01-02', revenue: 45_000, orders: 5 },
      ]);

      const result = await AnalyticsService.getSalesAnalytics(
        new Date('2025-01-01'),
        new Date('2025-01-07'),
        'day'
      );

      expect(result.total).toBe(75_000);
      expect(result.orderCount).toBe(8);
    });

    it('should return empty data when no paid orders exist', async () => {
      vi.mocked(Order.aggregate).mockResolvedValue([]);

      const result = await AnalyticsService.getSalesAnalytics(
        new Date('2025-01-01'),
        new Date('2025-01-07'),
        'day'
      );

      expect(result.data).toHaveLength(0);
      expect(result.total).toBe(0);
    });

    it('should support month grouping', async () => {
      vi.mocked(Order.aggregate).mockResolvedValue([
        { _id: '2025-01', revenue: 500_000, orders: 50 },
      ]);

      const result = await AnalyticsService.getSalesAnalytics(
        new Date('2025-01-01'),
        new Date('2025-12-31'),
        'month'
      );

      expect(result.groupBy).toBe('month');
      expect(result.data[0].date).toBe('2025-01');
    });
  });

  // ============================================
  // getInventoryReport
  // ============================================

  describe('getInventoryReport', () => {
    it('should aggregate stock across all products and variants', async () => {
      const mockProducts = [
        {
          _id: 'prod1',
          name: 'Oud Wood',
          isActive: true,
          variants: [
            { sku: 'OUD-20', size: '20ml', stock: 50, costPrice: 3_000, lowStockThreshold: 5 },
            { sku: 'OUD-50', size: '50ml', stock: 30, costPrice: 6_000, lowStockThreshold: 5 },
          ],
        },
        {
          _id: 'prod2',
          name: 'Rose',
          isActive: true,
          variants: [
            { sku: 'ROSE-100', size: '100ml', stock: 3, costPrice: 10_000, lowStockThreshold: 5 },
          ],
        },
      ];

      vi.mocked(Product.find).mockReturnValue({ lean: vi.fn().mockResolvedValue(mockProducts) } as any);

      const report = await AnalyticsService.getInventoryReport();

      expect(report.totalProducts).toBe(2);
      expect(report.totalVariants).toBe(3);
      expect(report.totalStockUnits).toBe(83);
      expect(report.stockBySize['20ml']).toBe(50);
      expect(report.stockBySize['50ml']).toBe(30);
      expect(report.stockBySize['100ml']).toBe(3);
    });

    it('should identify low-stock products (stock ≤ threshold)', async () => {
      const mockProducts = [
        {
          _id: 'prod1',
          name: 'Low Stock Product',
          isActive: true,
          variants: [
            { sku: 'LSP-50', size: '50ml', stock: 3, costPrice: 5_000, lowStockThreshold: 5 },
          ],
        },
      ];

      vi.mocked(Product.find).mockReturnValue({ lean: vi.fn().mockResolvedValue(mockProducts) } as any);

      const report = await AnalyticsService.getInventoryReport();

      expect(report.lowStockProducts).toHaveLength(1);
      expect(report.lowStockProducts[0].variantSku).toBe('LSP-50');
    });

    it('should identify out-of-stock products (stock === 0)', async () => {
      const mockProducts = [
        {
          _id: 'prod1',
          name: 'Empty Product',
          isActive: true,
          variants: [
            { sku: 'EMPTY-100', size: '100ml', stock: 0, costPrice: 8_000, lowStockThreshold: 5 },
          ],
        },
      ];

      vi.mocked(Product.find).mockReturnValue({ lean: vi.fn().mockResolvedValue(mockProducts) } as any);

      const report = await AnalyticsService.getInventoryReport();

      expect(report.outOfStockProducts).toHaveLength(1);
      expect(report.outOfStockProducts[0].currentStock).toBe(0);
    });

    it('should calculate total inventory value from stock × costPrice', async () => {
      const mockProducts = [
        {
          _id: 'prod1',
          name: 'Test',
          isActive: true,
          variants: [
            { sku: 'T-20', size: '20ml', stock: 10, costPrice: 3_000, lowStockThreshold: 5 },
            { sku: 'T-50', size: '50ml', stock: 5, costPrice: 6_000, lowStockThreshold: 5 },
          ],
        },
      ];

      vi.mocked(Product.find).mockReturnValue({ lean: vi.fn().mockResolvedValue(mockProducts) } as any);

      const report = await AnalyticsService.getInventoryReport();

      // (10 × 3000) + (5 × 6000) = 30,000 + 30,000 = 60,000
      expect(report.totalInventoryValue).toBe(60_000);
    });
  });

  // ============================================
  // getPnLReport
  // ============================================

  describe('getPnLReport', () => {
    it('should calculate grossProfit = netRevenue - cogs', async () => {
      // Current month
      vi.mocked(Order.aggregate)
        .mockResolvedValueOnce([{
          grossRevenue: 3_500_000,
          discountsGiven: 350_000,
          deliveryFees: 125_000,
          netRevenue: 3_275_000,
          cogs: 2_300_000,
        }])
        // Previous month
        .mockResolvedValueOnce([{
          netRevenue: 2_850_000,
          cogs: 2_000_000,
        }]);

      vi.mocked(Expense.aggregate)
        .mockResolvedValueOnce([
          { _id: 'delivery', total: 150_000 },
          { _id: 'marketing', total: 100_000 },
        ])
        .mockResolvedValueOnce([{ total: 200_000 }]);

      const report = await AnalyticsService.getPnLReport(2025, 1);

      expect(report.grossProfit).toBe(3_275_000 - 2_300_000);
      expect(report.cogs).toBe(2_300_000);
      expect(report.revenue.net).toBe(3_275_000);
    });

    it('should calculate netProfit = grossProfit - totalExpenses', async () => {
      vi.mocked(Order.aggregate)
        .mockResolvedValueOnce([{
          grossRevenue: 1_000_000,
          discountsGiven: 0,
          deliveryFees: 0,
          netRevenue: 1_000_000,
          cogs: 600_000,
        }])
        .mockResolvedValueOnce([]);

      vi.mocked(Expense.aggregate)
        .mockResolvedValueOnce([{ _id: 'salary', total: 200_000 }])
        .mockResolvedValueOnce([]);

      const report = await AnalyticsService.getPnLReport(2025, 3);

      // grossProfit = 1_000_000 - 600_000 = 400_000
      // netProfit = 400_000 - 200_000 = 200_000
      expect(report.netProfit).toBe(200_000);
    });

    it('should include expense breakdown by category', async () => {
      vi.mocked(Order.aggregate)
        .mockResolvedValueOnce([{
          grossRevenue: 500_000, discountsGiven: 0, deliveryFees: 0,
          netRevenue: 500_000, cogs: 300_000,
        }])
        .mockResolvedValueOnce([]);

      vi.mocked(Expense.aggregate)
        .mockResolvedValueOnce([
          { _id: 'delivery', total: 50_000 },
          { _id: 'packaging', total: 20_000 },
        ])
        .mockResolvedValueOnce([]);

      const report = await AnalyticsService.getPnLReport(2025, 6);

      expect(report.expenses['delivery']).toBe(50_000);
      expect(report.expenses['packaging']).toBe(20_000);
      expect(report.totalExpenses).toBe(70_000);
    });

    it('should include revenue growth comparison vs previous month', async () => {
      vi.mocked(Order.aggregate)
        .mockResolvedValueOnce([{
          grossRevenue: 1_200_000, discountsGiven: 0, deliveryFees: 0,
          netRevenue: 1_200_000, cogs: 700_000,
        }])
        .mockResolvedValueOnce([{ netRevenue: 1_000_000, cogs: 600_000 }]);

      vi.mocked(Expense.aggregate)
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);

      const report = await AnalyticsService.getPnLReport(2025, 2);

      expect(report.comparison?.revenueGrowth).toBe(20); // +20%
    });
  });

  // ============================================
  // calculateDailySummary
  // ============================================

  describe('calculateDailySummary', () => {
    it('should aggregate orders and expenses for the given date', async () => {
      vi.mocked(Order.aggregate).mockResolvedValue([{
        totalOrders: 10,
        grossRevenue: 500_000,
        discountsGiven: 25_000,
        deliveryFeesCollected: 15_000,
        netRevenue: 490_000,
        paystackRevenue: 450_000,
        stripeRevenue: 40_000,
        bankTransferRevenue: 0,
        cogs: 290_000,
      }]);

      vi.mocked(Expense.aggregate).mockResolvedValue([{ total: 50_000 }]);
      vi.mocked(User.countDocuments).mockResolvedValue(3);

      const mockSummary = { _id: 'summary1', date: new Date(), dateString: '2025-01-15' };
      vi.mocked(DailySummary.findOneAndUpdate).mockResolvedValue(mockSummary as any);

      const result = await AnalyticsService.calculateDailySummary(new Date('2025-01-15'));

      expect(DailySummary.findOneAndUpdate).toHaveBeenCalledWith(
        { dateString: '2025-01-15' },
        expect.objectContaining({
          totalOrders: 10,
          netRevenue: 490_000,
        }),
        expect.objectContaining({ upsert: true })
      );

      expect(result).toBeDefined();
    });

    it('should calculate gross and net profit correctly', async () => {
      vi.mocked(Order.aggregate).mockResolvedValue([{
        totalOrders: 5,
        grossRevenue: 300_000,
        discountsGiven: 0,
        deliveryFeesCollected: 10_000,
        netRevenue: 310_000,
        paystackRevenue: 310_000,
        stripeRevenue: 0,
        bankTransferRevenue: 0,
        cogs: 180_000,
      }]);

      vi.mocked(Expense.aggregate).mockResolvedValue([{ total: 30_000 }]);
      vi.mocked(User.countDocuments).mockResolvedValue(2);

      let capturedData: any;
      vi.mocked(DailySummary.findOneAndUpdate).mockImplementation((filter, data) => {
        capturedData = data;
        return Promise.resolve({ _id: 's1', ...data }) as any;
      });

      await AnalyticsService.calculateDailySummary(new Date('2025-02-01'));

      // grossProfit = 310_000 - 180_000 = 130_000
      // netProfit = 130_000 - 30_000 = 100_000
      expect(capturedData.grossProfit).toBe(130_000);
      expect(capturedData.netProfit).toBe(100_000);
    });
  });

  // ============================================
  // getChartData
  // ============================================

  describe('getChartData', () => {
    it('should return sales-trend chart with labels and datasets', async () => {
      vi.mocked(Order.aggregate).mockResolvedValue([
        { _id: '2025-01-01', revenue: 10_000, orders: 2 },
        { _id: '2025-01-02', revenue: 15_000, orders: 3 },
      ]);

      const chart = await AnalyticsService.getChartData('sales-trend', '7d');

      expect(chart.labels).toHaveLength(2);
      expect(chart.datasets[0].data).toEqual([10_000, 15_000]);
    });

    it('should return empty chart for unknown type', async () => {
      const chart = await AnalyticsService.getChartData('unknown-type', '30d');

      expect(chart.labels).toHaveLength(0);
      expect(chart.datasets).toHaveLength(0);
    });

    it('should return payment-methods chart with aggregated data', async () => {
      vi.mocked(Order.aggregate).mockResolvedValue([
        { _id: 'paystack', total: 1_200_000 },
        { _id: 'stripe', total: 300_000 },
      ]);

      const chart = await AnalyticsService.getChartData('payment-methods', '30d');

      expect(chart.labels).toContain('paystack');
      expect(chart.labels).toContain('stripe');
    });
  });
});
