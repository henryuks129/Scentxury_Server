/**
 * Expense Model — Unit Tests
 *
 * MongoDB lifecycle is managed by the global vitest setup file
 * (src/test/setup.ts) — do NOT create a local MongoMemoryServer here,
 * as singleFork mode shares one Mongoose connection across all test files.
 *
 * @file src/models/__tests__/Expense.unit.test.ts
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { Types } from 'mongoose';
import { Expense } from '../Expense.js';

// Clear before each test so tests don't bleed into each other
beforeEach(async () => {
  await Expense.deleteMany({});
});

const adminId = new Types.ObjectId();

function validExpense(overrides = {}) {
  return {
    category: 'delivery',
    description: 'Monthly delivery costs',
    amount: 150_000,
    currency: 'NGN',
    isRecurring: false,
    expenseDate: new Date('2025-01-15'),
    createdBy: adminId,
    ...overrides,
  };
}

describe('Expense Model', () => {
  describe('creation', () => {
    it('should create an expense with valid data', async () => {
      const expense = await Expense.create(validExpense());

      expect(expense._id).toBeDefined();
      expect(expense.category).toBe('delivery');
      expect(expense.amount).toBe(150_000);
      expect(expense.currency).toBe('NGN');
    });

    it('should default currency to NGN', async () => {
      const { currency: _c, ...data } = validExpense();
      const expense = await Expense.create(data);
      expect(expense.currency).toBe('NGN');
    });

    it('should default isRecurring to false', async () => {
      const { isRecurring: _r, ...data } = validExpense();
      const expense = await Expense.create(data);
      expect(expense.isRecurring).toBe(false);
    });

    it('should set timestamps (createdAt, updatedAt)', async () => {
      const expense = await Expense.create(validExpense());
      expect(expense.createdAt).toBeInstanceOf(Date);
      expect(expense.updatedAt).toBeInstanceOf(Date);
    });
  });

  describe('validation', () => {
    it('should reject missing category', async () => {
      const { category: _c, ...data } = validExpense() as any;
      await expect(Expense.create(data)).rejects.toThrow();
    });

    it('should reject invalid category', async () => {
      await expect(
        Expense.create(validExpense({ category: 'invalid_category' }))
      ).rejects.toThrow();
    });

    it('should reject missing description', async () => {
      const { description: _d, ...data } = validExpense() as any;
      await expect(Expense.create(data)).rejects.toThrow();
    });

    it('should reject negative amount', async () => {
      await expect(
        Expense.create(validExpense({ amount: -100 }))
      ).rejects.toThrow();
    });

    it('should reject missing expenseDate', async () => {
      const { expenseDate: _d, ...data } = validExpense() as any;
      await expect(Expense.create(data)).rejects.toThrow();
    });

    it('should reject missing createdBy', async () => {
      const { createdBy: _c, ...data } = validExpense() as any;
      await expect(Expense.create(data)).rejects.toThrow();
    });

    it('should accept all valid expense categories', async () => {
      const categories = [
        'inventory', 'delivery', 'marketing', 'salary',
        'rent', 'utilities', 'packaging', 'platform_fees', 'other',
      ];

      for (const category of categories) {
        const expense = await Expense.create(validExpense({ category }));
        expect(expense.category).toBe(category);
        await Expense.deleteOne({ _id: expense._id });
      }
    });

    it('should accept recurringPeriod for recurring expenses', async () => {
      const expense = await Expense.create(
        validExpense({ isRecurring: true, recurringPeriod: 'monthly' })
      );
      expect(expense.isRecurring).toBe(true);
      expect(expense.recurringPeriod).toBe('monthly');
    });
  });

  describe('queries', () => {
    it('should find expenses by category', async () => {
      await Expense.create(validExpense({ category: 'salary' }));
      await Expense.create(validExpense({ category: 'delivery' }));

      const salaryExpenses = await Expense.find({ category: 'salary' });
      expect(salaryExpenses).toHaveLength(1);
    });

    it('should find expenses by date range', async () => {
      await Expense.create(validExpense({ expenseDate: new Date('2025-01-10') }));
      await Expense.create(validExpense({ expenseDate: new Date('2025-01-20') }));
      await Expense.create(validExpense({ expenseDate: new Date('2025-02-05') }));

      const jan = await Expense.find({
        expenseDate: {
          $gte: new Date('2025-01-01'),
          $lte: new Date('2025-01-31'),
        },
      });

      expect(jan).toHaveLength(2);
    });
  });
});
