/**
 * ============================================
 * DAILY SUMMARY MODEL
 * ============================================
 *
 * Aggregated daily sales data for the admin BI dashboard.
 * Generated nightly via cron job from order/expense data.
 *
 * @file src/models/DailySummary.ts
 */

import mongoose, { Schema, Document } from 'mongoose';

// ============================================
// INTERFACES
// ============================================

export interface IUnitsBySize {
  '20ml': number;
  '50ml': number;
  '100ml': number;
  total: number;
}

export interface IPaymentBreakdown {
  paystack: number;
  stripe: number;
  bankTransfer: number;
}

export interface ICategoryBreakdown {
  male: number;
  female: number;
  unisex: number;
  children: number;
  combo_mix: number;
}

export interface IDailySummary extends Document {
  date: Date;
  dateString: string; // YYYY-MM-DD for easy querying

  // Order counts
  totalOrders: number;
  completedOrders: number;
  cancelledOrders: number;

  // Revenue
  grossRevenue: number;
  discountsGiven: number;
  deliveryFeesCollected: number;
  netRevenue: number;

  // Cost of goods sold
  costOfGoodsSold: number;

  // Profit
  grossProfit: number;
  grossProfitMargin: number; // percentage

  // Units sold
  unitsBySize: IUnitsBySize;

  // Payment breakdown
  paymentBreakdown: IPaymentBreakdown;

  // Category breakdown (revenue)
  categoryBreakdown: ICategoryBreakdown;

  // Expenses (from Expense model)
  totalExpenses: number;

  // Net profit (after expenses)
  netProfit: number;
  netProfitMargin: number; // percentage

  // Customer metrics
  newCustomers: number;
  returningCustomers: number;
  avgOrderValue: number;

  // Meta
  generatedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

// ============================================
// SCHEMA
// ============================================

const UnitsBySizeSchema = new Schema<IUnitsBySize>(
  {
    '20ml': { type: Number, default: 0 },
    '50ml': { type: Number, default: 0 },
    '100ml': { type: Number, default: 0 },
    total: { type: Number, default: 0 },
  },
  { _id: false }
);

const PaymentBreakdownSchema = new Schema<IPaymentBreakdown>(
  {
    paystack: { type: Number, default: 0 },
    stripe: { type: Number, default: 0 },
    bankTransfer: { type: Number, default: 0 },
  },
  { _id: false }
);

const CategoryBreakdownSchema = new Schema<ICategoryBreakdown>(
  {
    male: { type: Number, default: 0 },
    female: { type: Number, default: 0 },
    unisex: { type: Number, default: 0 },
    children: { type: Number, default: 0 },
    combo_mix: { type: Number, default: 0 },
  },
  { _id: false }
);

const DailySummarySchema = new Schema<IDailySummary>(
  {
    date: {
      type: Date,
      required: true,
      unique: true,
      index: true,
    },
    dateString: {
      type: String,
      required: true,
      unique: true,
      match: /^\d{4}-\d{2}-\d{2}$/,
    },

    totalOrders: { type: Number, default: 0 },
    completedOrders: { type: Number, default: 0 },
    cancelledOrders: { type: Number, default: 0 },

    grossRevenue: { type: Number, default: 0 },
    discountsGiven: { type: Number, default: 0 },
    deliveryFeesCollected: { type: Number, default: 0 },
    netRevenue: { type: Number, default: 0 },

    costOfGoodsSold: { type: Number, default: 0 },

    grossProfit: { type: Number, default: 0 },
    grossProfitMargin: { type: Number, default: 0 },

    unitsBySize: { type: UnitsBySizeSchema, default: () => ({}) },
    paymentBreakdown: { type: PaymentBreakdownSchema, default: () => ({}) },
    categoryBreakdown: { type: CategoryBreakdownSchema, default: () => ({}) },

    totalExpenses: { type: Number, default: 0 },

    netProfit: { type: Number, default: 0 },
    netProfitMargin: { type: Number, default: 0 },

    newCustomers: { type: Number, default: 0 },
    returningCustomers: { type: Number, default: 0 },
    avgOrderValue: { type: Number, default: 0 },

    generatedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

// ============================================
// EXPORT
// ============================================

export const DailySummary: mongoose.Model<IDailySummary> =
  (mongoose.models['DailySummary'] as mongoose.Model<IDailySummary>) ||
  mongoose.model<IDailySummary>('DailySummary', DailySummarySchema);
export default DailySummary;
