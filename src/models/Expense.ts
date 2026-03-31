/**
 * ============================================
 * EXPENSE MODEL
 * ============================================
 *
 * Tracks all business expenses for P&L calculations
 * and the admin BI dashboard.
 *
 * @file src/models/Expense.ts
 */

import mongoose, { Schema, Document } from 'mongoose';

// ============================================
// INTERFACES
// ============================================

export type ExpenseCategory =
  | 'inventory'
  | 'delivery'
  | 'marketing'
  | 'salary'
  | 'rent'
  | 'utilities'
  | 'packaging'
  | 'platform_fees'
  | 'other';

export type RecurringPeriod = 'daily' | 'weekly' | 'monthly' | 'yearly';

export interface IExpense extends Document {
  category: ExpenseCategory;
  description: string;
  amount: number;
  currency: 'NGN' | 'USD';
  isRecurring: boolean;
  recurringPeriod?: RecurringPeriod;
  expenseDate: Date;
  receiptUrl?: string;
  vendor?: string;
  createdBy: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

// ============================================
// SCHEMA
// ============================================

const ExpenseSchema = new Schema<IExpense>(
  {
    category: {
      type: String,
      enum: [
        'inventory',
        'delivery',
        'marketing',
        'salary',
        'rent',
        'utilities',
        'packaging',
        'platform_fees',
        'other',
      ],
      required: [true, 'Expense category is required'],
      index: true,
    },
    description: {
      type: String,
      required: [true, 'Description is required'],
      trim: true,
      maxlength: [500, 'Description cannot exceed 500 characters'],
    },
    amount: {
      type: Number,
      required: [true, 'Amount is required'],
      min: [0, 'Amount cannot be negative'],
    },
    currency: {
      type: String,
      enum: ['NGN', 'USD'],
      default: 'NGN',
    },
    isRecurring: {
      type: Boolean,
      default: false,
    },
    recurringPeriod: {
      type: String,
      enum: ['daily', 'weekly', 'monthly', 'yearly'],
    },
    expenseDate: {
      type: Date,
      required: [true, 'Expense date is required'],
      index: true,
    },
    receiptUrl: {
      type: String,
      trim: true,
    },
    vendor: {
      type: String,
      trim: true,
      maxlength: [200, 'Vendor name cannot exceed 200 characters'],
    },
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Created by is required'],
      index: true,
    },
  },
  { timestamps: true }
);

// Indexes for date range queries
ExpenseSchema.index({ expenseDate: 1, category: 1 });
ExpenseSchema.index({ expenseDate: 1, createdBy: 1 });

// ============================================
// EXPORT
// ============================================

export const Expense: mongoose.Model<IExpense> =
  (mongoose.models['Expense'] as mongoose.Model<IExpense>) ||
  mongoose.model<IExpense>('Expense', ExpenseSchema);
export default Expense;
