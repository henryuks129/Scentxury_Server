/**
 * ============================================
 * INVENTORY TRANSACTION MODEL
 * ============================================
 *
 * Audit trail for all stock changes (adds, removals,
 * returns, damages). Used for inventory reporting and
 * admin BI dashboard.
 *
 * @file src/models/InventoryTransaction.ts
 */

import mongoose, { Schema, Document } from 'mongoose';

// ============================================
// INTERFACES
// ============================================

export type TransactionType =
  | 'add'
  | 'remove'
  | 'return'
  | 'damage'
  | 'adjustment'
  | 'sale'       // deducted on purchase payment
  | 'restock'    // manual admin restock
  | 'reserved'   // held in cart
  | 'unreserved' // cart expired / item removed
  | 'damaged';   // write-off

export interface IInventoryTransaction extends Document {
  productId: mongoose.Types.ObjectId;
  variantSku: string;
  transactionType: TransactionType;
  quantityChanged: number; // positive = added, negative = removed
  beforeStock: number;
  afterStock: number;
  reason?: string;
  orderId?: mongoose.Types.ObjectId; // linked order if applicable
  createdBy?: mongoose.Types.ObjectId; // admin who initiated
  timestamp: Date;
  createdAt: Date;
  updatedAt: Date;
}

// ============================================
// SCHEMA
// ============================================

const InventoryTransactionSchema = new Schema<IInventoryTransaction>(
  {
    productId: {
      type: Schema.Types.ObjectId,
      ref: 'Product',
      required: [true, 'Product ID is required'],
      index: true,
    },
    variantSku: {
      type: String,
      required: [true, 'Variant SKU is required'],
      trim: true,
      index: true,
    },
    transactionType: {
      type: String,
      enum: ['add', 'remove', 'return', 'damage', 'adjustment', 'sale', 'restock', 'reserved', 'unreserved', 'damaged'],
      required: [true, 'Transaction type is required'],
      index: true,
    },
    quantityChanged: {
      type: Number,
      required: [true, 'Quantity changed is required'],
    },
    beforeStock: {
      type: Number,
      required: [true, 'Before stock is required'],
      min: [0, 'Before stock cannot be negative'],
    },
    afterStock: {
      type: Number,
      required: [true, 'After stock is required'],
      min: [0, 'After stock cannot be negative'],
    },
    reason: {
      type: String,
      trim: true,
      maxlength: [500, 'Reason cannot exceed 500 characters'],
    },
    orderId: {
      type: Schema.Types.ObjectId,
      ref: 'Order',
    },
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
    },
    timestamp: {
      type: Date,
      default: Date.now,
      index: true,
    },
  },
  { timestamps: true }
);

// Composite indexes for common queries
InventoryTransactionSchema.index({ productId: 1, variantSku: 1 });
InventoryTransactionSchema.index({ productId: 1, timestamp: -1 });
InventoryTransactionSchema.index({ timestamp: -1 });

// ============================================
// EXPORT
// ============================================

export const InventoryTransaction: mongoose.Model<IInventoryTransaction> =
  (mongoose.models['InventoryTransaction'] as mongoose.Model<IInventoryTransaction>) ||
  mongoose.model<IInventoryTransaction>('InventoryTransaction', InventoryTransactionSchema);
export default InventoryTransaction;
