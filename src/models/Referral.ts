/**
 * ============================================
 * REFERRAL MODEL
 * ============================================
 *
 * Referral tracking and reward management system.
 * Handles referral sign-ups, qualification, and
 * reward distribution.
 *
 * @file src/models/Referral.ts
 */

import mongoose, { Schema, Document, Model } from 'mongoose';

// ============================================
// INTERFACES
// ============================================

export type ReferralStatus = 'pending' | 'qualified' | 'rewarded' | 'expired';
export type RewardType = 'discount' | 'credit' | 'product';

export interface IReferral extends Document {
  referrerId: mongoose.Types.ObjectId;
  referredUserId: mongoose.Types.ObjectId;
  referralCode: string;

  status: ReferralStatus;

  rewardAmount: number;
  rewardCurrency: 'NGN' | 'USD';
  rewardType: RewardType;
  rewardProductId?: mongoose.Types.ObjectId;

  qualifyingOrderId?: mongoose.Types.ObjectId;
  qualifiedAt?: Date;
  rewardedAt?: Date;

  expiresAt: Date;

  notes?: string;

  createdAt: Date;
  updatedAt: Date;

  // Methods
  isExpired(): boolean;
  canQualify(): boolean;
  qualify(orderId: mongoose.Types.ObjectId): void;
}

// ============================================
// SCHEMA
// ============================================

const ReferralSchema = new Schema<IReferral>(
  {
    referrerId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Referrer ID is required'],
      index: true,
    },
    referredUserId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Referred user ID is required'],
      unique: true,
    },
    referralCode: {
      type: String,
      required: [true, 'Referral code is required'],
      index: true,
    },

    status: {
      type: String,
      enum: ['pending', 'qualified', 'rewarded', 'expired'],
      default: 'pending',
      index: true,
    },

    rewardAmount: {
      type: Number,
      required: [true, 'Reward amount is required'],
      min: [0, 'Reward amount cannot be negative'],
    },
    rewardCurrency: {
      type: String,
      enum: ['NGN', 'USD'],
      default: 'NGN',
    },
    rewardType: {
      type: String,
      enum: ['discount', 'credit', 'product'],
      default: 'credit',
    },
    rewardProductId: {
      type: Schema.Types.ObjectId,
      ref: 'Product',
    },

    qualifyingOrderId: {
      type: Schema.Types.ObjectId,
      ref: 'Order',
    },
    qualifiedAt: Date,
    rewardedAt: Date,

    expiresAt: {
      type: Date,
      required: [true, 'Expiration date is required'],
      index: true,
    },

    notes: String,
  },
  {
    timestamps: true,
  }
);

// ============================================
// INDEXES
// ============================================

ReferralSchema.index({ createdAt: -1 });
ReferralSchema.index({ status: 1, expiresAt: 1 });
ReferralSchema.index({ referrerId: 1, status: 1 });

// ============================================
// METHODS
// ============================================

/**
 * Check if the referral has expired
 */
ReferralSchema.methods.isExpired = function (): boolean {
  return new Date() > this.expiresAt;
};

/**
 * Check if the referral can be qualified
 */
ReferralSchema.methods.canQualify = function (): boolean {
  return this.status === 'pending' && !this.isExpired();
};

/**
 * Qualify the referral with a qualifying order
 */
ReferralSchema.methods.qualify = function (orderId: mongoose.Types.ObjectId): void {
  if (!this.canQualify()) {
    throw new Error('Referral cannot be qualified');
  }
  this.status = 'qualified';
  this.qualifyingOrderId = orderId;
  this.qualifiedAt = new Date();
};

// ============================================
// PRE-SAVE HOOKS
// ============================================

// Auto-expire referrals past their expiration date
ReferralSchema.pre('save', function () {
  if (this.status === 'pending' && this.isExpired()) {
    this.status = 'expired';
  }
});

// ============================================
// STATICS
// ============================================

/**
 * Get default expiration date (30 days from now)
 */
ReferralSchema.statics.getDefaultExpiration = function (): Date {
  const date = new Date();
  date.setDate(date.getDate() + 30);
  return date;
};

// ============================================
// EXPORT
// ============================================

export const Referral: Model<IReferral> =
  mongoose.models.Referral || mongoose.model<IReferral>('Referral', ReferralSchema);

export default Referral;
