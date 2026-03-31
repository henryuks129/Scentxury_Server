/**
 * ============================================
 * ADMIN SERVICE — UNIT TESTS
 * ============================================
 *
 * @file src/services/__tests__/admin.service.unit.test.ts
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AdminService } from '../admin.service.js';
import { Order } from '@models/Order.js';
import { Product } from '@models/Product.js';
import { Expense } from '@models/Expense.js';
import { DailySummary } from '@models/DailySummary.js';
import { InventoryTransaction } from '@models/InventoryTransaction.js';
import { NotFoundError, BadRequestError } from '@utils/errors.js';
import { Types } from 'mongoose';

vi.mock('@models/Order.js');
vi.mock('@models/Product.js');
vi.mock('@models/Expense.js');
vi.mock('@models/DailySummary.js');
vi.mock('@models/InventoryTransaction.js');

const adminId = new Types.ObjectId().toString();

describe('AdminService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ============================================================
  // getDashboardStats
  // ============================================================
  describe('getDashboardStats', () => {
    it('should return stats with zero values when no data', async () => {
      vi.mocked(Order.aggregate).mockResolvedValue([]);
      vi.mocked(Order.find).mockReturnValue({
        sort: vi.fn().mockReturnValue({
          limit: vi.fn().mockReturnValue({
            select: vi.fn().mockReturnValue({
              lean: vi.fn().mockResolvedValue([]),
            }),
          }),
        }),
      } as never);
      vi.mocked(Product.aggregate).mockResolvedValue([]);

      const stats = await AdminService.getDashboardStats();

      expect(stats.today.orders).toBe(0);
      expect(stats.today.revenue).toBe(0);
      expect(stats.lowStockAlerts).toEqual([]);
    });

    it('should return low stock alerts', async () => {
      vi.mocked(Order.aggregate).mockResolvedValue([]);
      vi.mocked(Order.find).mockReturnValue({
        sort: vi.fn().mockReturnValue({
          limit: vi.fn().mockReturnValue({
            select: vi.fn().mockReturnValue({
              lean: vi.fn().mockResolvedValue([]),
            }),
          }),
        }),
      } as never);
      vi.mocked(Product.aggregate).mockResolvedValue([
        {
          productId: new Types.ObjectId(),
          productName: 'Oud Wood',
          variantSku: 'OUD-20ML',
          stock: 3,
        },
      ]);

      const stats = await AdminService.getDashboardStats();

      expect(stats.lowStockAlerts).toHaveLength(1);
      expect(stats.lowStockAlerts[0]!.stock).toBe(3);
    });
  });

  // ============================================================
  // createExpense
  // ============================================================
  describe('createExpense', () => {
    const validExpense = {
      category: 'delivery' as const,
      description: 'Delivery to Lagos',
      amount: 5000,
      expenseDate: new Date(),
    };

    it('should create an expense record', async () => {
      vi.mocked(Expense.create).mockResolvedValue({ ...validExpense, _id: new Types.ObjectId() } as never);

      const expense = await AdminService.createExpense(validExpense, adminId);

      expect(expense.amount).toBe(5000);
      expect(Expense.create).toHaveBeenCalledWith(
        expect.objectContaining({ category: 'delivery', amount: 5000 })
      );
    });

    it('should throw BadRequestError if recurring without period', async () => {
      await expect(
        AdminService.createExpense({ ...validExpense, isRecurring: true }, adminId)
      ).rejects.toThrow(BadRequestError);
    });

    it('should allow recurring expense with recurringPeriod', async () => {
      vi.mocked(Expense.create).mockResolvedValue({ ...validExpense } as never);

      await expect(
        AdminService.createExpense(
          { ...validExpense, isRecurring: true, recurringPeriod: 'monthly' },
          adminId
        )
      ).resolves.not.toThrow();
    });
  });

  // ============================================================
  // getExpenses
  // ============================================================
  describe('getExpenses', () => {
    it('should return paginated expenses', async () => {
      const mockExpenses = [
        { category: 'delivery', amount: 5000 },
        { category: 'marketing', amount: 10000 },
      ];
      vi.mocked(Expense.find).mockReturnValue({
        sort: vi.fn().mockReturnValue({
          skip: vi.fn().mockReturnValue({
            limit: vi.fn().mockReturnValue({
              lean: vi.fn().mockResolvedValue(mockExpenses),
            }),
          }),
        }),
      } as never);
      vi.mocked(Expense.countDocuments).mockResolvedValue(2 as never);

      const result = await AdminService.getExpenses({ page: 1, limit: 10 });

      expect(result.expenses).toHaveLength(2);
      expect(result.total).toBe(2);
    });

    it('should filter by category', async () => {
      vi.mocked(Expense.find).mockReturnValue({
        sort: vi.fn().mockReturnValue({
          skip: vi.fn().mockReturnValue({
            limit: vi.fn().mockReturnValue({
              lean: vi.fn().mockResolvedValue([]),
            }),
          }),
        }),
      } as never);
      vi.mocked(Expense.countDocuments).mockResolvedValue(0 as never);

      await AdminService.getExpenses({ category: 'delivery' });

      expect(Expense.find).toHaveBeenCalledWith(
        expect.objectContaining({ category: 'delivery' })
      );
    });
  });

  // ============================================================
  // deleteExpense
  // ============================================================
  describe('deleteExpense', () => {
    it('should delete an expense by id', async () => {
      vi.mocked(Expense.findByIdAndDelete).mockResolvedValue({ _id: 'some-id' } as never);

      await expect(
        AdminService.deleteExpense(new Types.ObjectId().toString())
      ).resolves.not.toThrow();
    });

    it('should throw NotFoundError for unknown expense', async () => {
      vi.mocked(Expense.findByIdAndDelete).mockResolvedValue(null);

      await expect(
        AdminService.deleteExpense(new Types.ObjectId().toString())
      ).rejects.toThrow(NotFoundError);
    });
  });

  // ============================================================
  // getInventoryTransactions
  // ============================================================
  describe('getInventoryTransactions', () => {
    it('should return paginated transactions', async () => {
      const mockTxns = [
        { transactionType: 'remove', quantityChanged: -5, variantSku: 'OUD-50ML' },
      ];
      vi.mocked(InventoryTransaction.find).mockReturnValue({
        sort: vi.fn().mockReturnValue({
          skip: vi.fn().mockReturnValue({
            limit: vi.fn().mockReturnValue({
              populate: vi.fn().mockReturnValue({
                lean: vi.fn().mockResolvedValue(mockTxns),
              }),
            }),
          }),
        }),
      } as never);
      vi.mocked(InventoryTransaction.countDocuments).mockResolvedValue(1 as never);

      const result = await AdminService.getInventoryTransactions({});

      expect(result.transactions).toHaveLength(1);
      expect(result.total).toBe(1);
    });

    it('should filter by productId when provided', async () => {
      vi.mocked(InventoryTransaction.find).mockReturnValue({
        sort: vi.fn().mockReturnValue({
          skip: vi.fn().mockReturnValue({
            limit: vi.fn().mockReturnValue({
              populate: vi.fn().mockReturnValue({
                lean: vi.fn().mockResolvedValue([]),
              }),
            }),
          }),
        }),
      } as never);
      vi.mocked(InventoryTransaction.countDocuments).mockResolvedValue(0 as never);

      const productId = new Types.ObjectId().toString();
      await AdminService.getInventoryTransactions({ productId });

      expect(InventoryTransaction.find).toHaveBeenCalledWith(
        expect.objectContaining({ productId: expect.any(Object) })
      );
    });
  });

  // ============================================================
  // getDailySummaries
  // ============================================================
  describe('getDailySummaries', () => {
    it('should query summaries within date range', async () => {
      vi.mocked(DailySummary.find).mockReturnValue({
        sort: vi.fn().mockReturnValue({
          lean: vi.fn().mockResolvedValue([]),
        }),
      } as never);

      const start = new Date('2025-01-01');
      const end = new Date('2025-01-31');
      await AdminService.getDailySummaries(start, end);

      expect(DailySummary.find).toHaveBeenCalledWith({
        dateString: { $gte: '2025-01-01', $lte: '2025-01-31' },
      });
    });
  });
});
