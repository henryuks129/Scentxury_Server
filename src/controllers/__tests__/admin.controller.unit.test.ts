/**
 * ============================================
 * ADMIN CONTROLLER — UNIT TESTS
 * ============================================
 *
 * @file src/controllers/__tests__/admin.controller.unit.test.ts
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  getDashboardStats,
  getSalesAnalytics,
  getPnLReport,
  getInventoryReport,
  createExpense,
  getExpenses,
  deleteExpense,
  getInventoryTransactions,
  generateDailySummary,
  getDailySummaries,
} from '../admin.controller.js';
import { AdminService } from '@services/admin.service.js';
import { AnalyticsService } from '@services/analytics.service.js';
import { mockRequest, mockResponse } from '../../test/helpers.js';
import { Types } from 'mongoose';
import { NotFoundError, BadRequestError } from '@utils/errors.js';

vi.mock('@services/admin.service.js');
vi.mock('@services/analytics.service.js');

const adminId = new Types.ObjectId().toString();

describe('AdminController', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ============================================================
  // getDashboardStats
  // ============================================================
  describe('getDashboardStats', () => {
    it('should return dashboard summary', async () => {
      vi.mocked(AnalyticsService.getDashboardSummary).mockResolvedValue({
        today: { revenue: 50000, orders: 5, avgOrderValue: 10000, changePercent: 20 },
        week: { revenue: 200000, orders: 20, avgOrderValue: 10000, changePercent: 5 },
        month: { revenue: 800000, orders: 80, avgOrderValue: 10000, changePercent: 10 },
        year: { revenue: 5000000, orders: 500, avgOrderValue: 10000, changePercent: 15 },
        lowStockAlerts: [],
        recentOrders: [],
      });

      const req = mockRequest({ user: { id: adminId, role: 'admin' } });
      const res = mockResponse();
      const next = vi.fn();

      await getDashboardStats(req as never, res as never, next);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: expect.objectContaining({ today: expect.any(Object) }),
        })
      );
    });

    it('should call next with error on service failure', async () => {
      vi.mocked(AnalyticsService.getDashboardSummary).mockRejectedValue(new Error('DB error'));

      const req = mockRequest({ user: { id: adminId, role: 'admin' } });
      const res = mockResponse();
      const next = vi.fn();

      await getDashboardStats(req as never, res as never, next);

      expect(next).toHaveBeenCalledWith(expect.any(Error));
    });
  });

  // ============================================================
  // getSalesAnalytics
  // ============================================================
  describe('getSalesAnalytics', () => {
    it('should return sales data for default period', async () => {
      vi.mocked(AnalyticsService.getSalesAnalytics).mockResolvedValue({
        data: [],
        total: 0,
        orderCount: 0,
        groupBy: 'day',
      });

      const req = mockRequest({ user: { id: adminId, role: 'admin' } });
      const res = mockResponse();
      const next = vi.fn();

      await getSalesAnalytics(req as never, res as never, next);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(AnalyticsService.getSalesAnalytics).toHaveBeenCalledWith(
        expect.any(Date),
        expect.any(Date),
        'day'
      );
    });

    it('should use groupBy from query', async () => {
      vi.mocked(AnalyticsService.getSalesAnalytics).mockResolvedValue({
        data: [],
        total: 0,
        orderCount: 0,
        groupBy: 'month',
      });

      const req = mockRequest({
        query: { groupBy: 'month' },
        user: { id: adminId, role: 'admin' },
      });
      const res = mockResponse();
      const next = vi.fn();

      await getSalesAnalytics(req as never, res as never, next);

      expect(AnalyticsService.getSalesAnalytics).toHaveBeenCalledWith(
        expect.any(Date),
        expect.any(Date),
        'month'
      );
    });
  });

  // ============================================================
  // getPnLReport
  // ============================================================
  describe('getPnLReport', () => {
    it('should return P&L report for current month', async () => {
      vi.mocked(AnalyticsService.getPnLReport).mockResolvedValue({
        period: 'March 2025',
        revenue: { gross: 100000, discounts: 5000, deliveryFees: 3000, net: 98000 },
        cogs: 40000,
        grossProfit: 58000,
        grossProfitMargin: 59.18,
        expenses: {},
        totalExpenses: 10000,
        netProfit: 48000,
        netProfitMargin: 48.97,
      });

      const req = mockRequest({ user: { id: adminId, role: 'admin' } });
      const res = mockResponse();
      const next = vi.fn();

      await getPnLReport(req as never, res as never, next);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ netProfit: 48000 }) })
      );
    });

    it('should throw BadRequestError for invalid month', async () => {
      const req = mockRequest({
        query: { year: '2025', month: '13' },
        user: { id: adminId, role: 'admin' },
      });
      const res = mockResponse();
      const next = vi.fn();

      await getPnLReport(req as never, res as never, next);

      expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 400 }));
    });
  });

  // ============================================================
  // createExpense
  // ============================================================
  describe('createExpense', () => {
    it('should create expense and return 201', async () => {
      vi.mocked(AdminService.createExpense).mockResolvedValue({
        category: 'delivery',
        amount: 5000,
        expenseDate: new Date(),
      } as never);

      const req = mockRequest({
        body: { category: 'delivery', description: 'Test', amount: 5000, expenseDate: new Date() },
        user: { id: adminId, role: 'admin' },
      });
      const res = mockResponse();
      const next = vi.fn();

      await createExpense(req as never, res as never, next);

      expect(res.status).toHaveBeenCalledWith(201);
    });
  });

  // ============================================================
  // getExpenses
  // ============================================================
  describe('getExpenses', () => {
    it('should return paginated expenses', async () => {
      vi.mocked(AdminService.getExpenses).mockResolvedValue({
        expenses: [],
        total: 0,
      } as never);

      const req = mockRequest({ user: { id: adminId, role: 'admin' } });
      const res = mockResponse();
      const next = vi.fn();

      await getExpenses(req as never, res as never, next);

      expect(res.status).toHaveBeenCalledWith(200);
    });
  });

  // ============================================================
  // deleteExpense
  // ============================================================
  describe('deleteExpense', () => {
    it('should delete expense and return 200', async () => {
      vi.mocked(AdminService.deleteExpense).mockResolvedValue(undefined);

      const req = mockRequest({
        params: { id: new Types.ObjectId().toString() },
        user: { id: adminId, role: 'admin' },
      });
      const res = mockResponse();
      const next = vi.fn();

      await deleteExpense(req as never, res as never, next);

      expect(res.status).toHaveBeenCalledWith(200);
    });

    it('should call next with error for unknown expense', async () => {
      vi.mocked(AdminService.deleteExpense).mockRejectedValue(new NotFoundError('Expense'));

      const req = mockRequest({
        params: { id: new Types.ObjectId().toString() },
        user: { id: adminId, role: 'admin' },
      });
      const res = mockResponse();
      const next = vi.fn();

      await deleteExpense(req as never, res as never, next);

      expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 404 }));
    });
  });

  // ============================================================
  // getInventoryTransactions
  // ============================================================
  describe('getInventoryTransactions', () => {
    it('should return inventory transactions', async () => {
      vi.mocked(AdminService.getInventoryTransactions).mockResolvedValue({
        transactions: [],
        total: 0,
      } as never);

      const req = mockRequest({ user: { id: adminId, role: 'admin' } });
      const res = mockResponse();
      const next = vi.fn();

      await getInventoryTransactions(req as never, res as never, next);

      expect(res.status).toHaveBeenCalledWith(200);
    });
  });

  // ============================================================
  // generateDailySummary
  // ============================================================
  describe('generateDailySummary', () => {
    it('should generate summary for today when no date given', async () => {
      vi.mocked(AnalyticsService.calculateDailySummary).mockResolvedValue({
        dateString: '2025-03-17',
        totalOrders: 5,
      } as never);

      const req = mockRequest({
        body: {},
        user: { id: adminId, role: 'admin' },
      });
      const res = mockResponse();
      const next = vi.fn();

      await generateDailySummary(req as never, res as never, next);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(AnalyticsService.calculateDailySummary).toHaveBeenCalledWith(expect.any(Date));
    });

    it('should generate summary for specified date', async () => {
      vi.mocked(AnalyticsService.calculateDailySummary).mockResolvedValue({
        dateString: '2025-01-15',
      } as never);

      const req = mockRequest({
        body: { date: '2025-01-15' },
        user: { id: adminId, role: 'admin' },
      });
      const res = mockResponse();
      const next = vi.fn();

      await generateDailySummary(req as never, res as never, next);

      expect(AnalyticsService.calculateDailySummary).toHaveBeenCalledWith(
        new Date('2025-01-15')
      );
    });
  });

  // ============================================================
  // getDailySummaries
  // ============================================================
  describe('getDailySummaries', () => {
    it('should return summaries for date range', async () => {
      vi.mocked(AdminService.getDailySummaries).mockResolvedValue([]);

      const req = mockRequest({
        query: { startDate: '2025-01-01', endDate: '2025-01-31' },
        user: { id: adminId, role: 'admin' },
      });
      const res = mockResponse();
      const next = vi.fn();

      await getDailySummaries(req as never, res as never, next);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(AdminService.getDailySummaries).toHaveBeenCalledWith(
        new Date('2025-01-01'),
        new Date('2025-01-31')
      );
    });
  });

  // ============================================================
  // getInventoryReport
  // ============================================================
  describe('getInventoryReport', () => {
    it('should return inventory report', async () => {
      vi.mocked(AnalyticsService.getInventoryReport).mockResolvedValue({
        totalProducts: 10,
        totalVariants: 30,
        totalStockUnits: 500,
        totalInventoryValue: 2000000,
        lowStockProducts: [],
        outOfStockProducts: [],
        stockBySize: { '20ml': 100, '50ml': 200, '100ml': 200 },
      });

      const req = mockRequest({ user: { id: adminId, role: 'admin' } });
      const res = mockResponse();
      const next = vi.fn();

      await getInventoryReport(req as never, res as never, next);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ totalProducts: 10 }),
        })
      );
    });
  });
});
