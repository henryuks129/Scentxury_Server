/**
 * ============================================
 * USER MODEL
 * ============================================
 *
 * User accounts with authentication, OAuth support,
 * addresses, scent preferences, and referral system.
 *
 * @file src/models/User.ts
 */

import mongoose, { Schema, Document, Model } from 'mongoose';
import bcrypt from 'bcryptjs';

// ============================================
// INTERFACES
// ============================================

export interface IAddress {
  _id?: mongoose.Types.ObjectId;
  label: string;
  street: string;
  city: string;
  state: string;
  country: string;
  postalCode?: string;
  coordinates?: {
    lat: number;
    lng: number;
  };
  isDefault: boolean;
}

export interface IScentPreferences {
  preferredNotes: string[];
  avoidNotes: string[];
  intensity: 'light' | 'moderate' | 'strong';
  occasions: string[];
}

// User segmentation for churn detection & marketing targeting
export type UserSegment = 'vip' | 'loyal' | 'at_risk' | 'churned' | 'new';

export interface IUser extends Document {
  // Mongoose id virtual (string form of _id)
  id: string;

  // Core fields
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  phone?: string;
  role: 'user' | 'admin';
  avatar?: string;

  // OAuth
  googleId?: string;
  appleId?: string;

  // Addresses
  addresses: IAddress[];

  // Scent Preferences
  scentPreferences?: IScentPreferences;

  // Referral System
  referralCode: string;
  referredBy?: mongoose.Types.ObjectId;
  referralCount: number;
  referralRewardsClaimed: number;

  // Status
  isVerified: boolean;
  isActive: boolean;
  lastLoginAt?: Date;

  // Segmentation (populated by RecommendationService.clusterUsersByBehaviour)
  segment?: UserSegment;
  churnRisk?: number; // 0–1 score; higher = more likely to churn

  // Timestamps
  createdAt: Date;
  updatedAt: Date;

  // Methods
  comparePassword(candidatePassword: string): Promise<boolean>;
  generateReferralCode(): string;

  // Virtuals
  fullName: string;
}

// ============================================
// SCHEMAS
// ============================================

const AddressSchema = new Schema<IAddress>(
  {
    label: { type: String, default: 'Home' },
    street: { type: String, required: true },
    city: { type: String, required: true },
    state: { type: String, required: true },
    country: { type: String, default: 'Nigeria' },
    postalCode: String,
    coordinates: {
      lat: Number,
      lng: Number,
    },
    isDefault: { type: Boolean, default: false },
  },
  { _id: true }
);

const ScentPreferencesSchema = new Schema<IScentPreferences>(
  {
    preferredNotes: [String],
    avoidNotes: [String],
    intensity: {
      type: String,
      enum: ['light', 'moderate', 'strong'],
      default: 'moderate',
    },
    occasions: [String],
  },
  { _id: false }
);

const UserSchema = new Schema<IUser>(
  {
    email: {
      type: String,
      required: [true, 'Email is required'],
      unique: true,
      lowercase: true,
      trim: true,
      match: [/^\S+@\S+\.\S+$/, 'Invalid email format'],
    },
    password: {
      type: String,
      required: [true, 'Password is required'],
      minlength: [8, 'Password must be at least 8 characters'],
      select: false,
    },
    firstName: {
      type: String,
      required: [true, 'First name is required'],
      trim: true,
      maxlength: [50, 'First name cannot exceed 50 characters'],
    },
    lastName: {
      type: String,
      required: [true, 'Last name is required'],
      trim: true,
      maxlength: [50, 'Last name cannot exceed 50 characters'],
    },
    phone: {
      type: String,
      trim: true,
      match: [/^\+?[\d\s-]{10,}$/, 'Invalid phone number format'],
    },
    role: {
      type: String,
      enum: ['user', 'admin'],
      default: 'user',
    },
    avatar: String,

    // OAuth fields
    googleId: { type: String, sparse: true },
    appleId: { type: String, sparse: true },

    // Addresses
    addresses: [AddressSchema],

    // Scent preferences
    scentPreferences: ScentPreferencesSchema,

    // Referral system
    referralCode: {
      type: String,
      unique: true,
      sparse: true,
    },
    referredBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
    },
    referralCount: { type: Number, default: 0 },
    referralRewardsClaimed: { type: Number, default: 0 },

    // Status
    isVerified: { type: Boolean, default: false },
    isActive: { type: Boolean, default: true },
    lastLoginAt: Date,

    // Segmentation fields (updated by RecommendationService weekly cron)
    segment: {
      type: String,
      enum: ['vip', 'loyal', 'at_risk', 'churned', 'new'],
      index: true,
    },
    churnRisk: { type: Number, min: 0, max: 1 },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// ============================================
// INDEXES
// ============================================

// Note: email and referralCode have unique: true in schema
// Additional compound indexes for query optimization
UserSchema.index({ role: 1 });
UserSchema.index({ createdAt: -1 });
UserSchema.index({ isActive: 1, role: 1 });

// ============================================
// VIRTUALS
// ============================================

UserSchema.virtual('fullName').get(function (this: IUser) {
  return `${this.firstName} ${this.lastName}`;
});

// ============================================
// PRE-SAVE HOOKS
// ============================================

// Hash password before saving
UserSchema.pre('save', async function () {
  if (!this.isModified('password')) return;

  const rounds = parseInt(process.env.BCRYPT_ROUNDS || '12', 10);
  const salt = await bcrypt.genSalt(rounds);
  this.password = await bcrypt.hash(this.password, salt);
});

// Generate referral code before saving
UserSchema.pre('save', function () {
  if (!this.referralCode) {
    this.referralCode = this.generateReferralCode();
  }
});

// ============================================
// METHODS
// ============================================

/**
 * Compare candidate password with hashed password
 */
UserSchema.methods.comparePassword = async function (
  candidatePassword: string
): Promise<boolean> {
  if (!candidatePassword) return false;
  return bcrypt.compare(candidatePassword, this.password);
};

/**
 * Generate unique referral code (CHI-XXXXXX)
 */
UserSchema.methods.generateReferralCode = function (): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = 'CHI-';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
};

// ============================================
// STATICS
// ============================================

// Add static methods to the model if needed
// UserSchema.statics.findByEmail = function(email: string) {
//   return this.findOne({ email: email.toLowerCase() });
// };

// ============================================
// EXPORT
// ============================================

export const User: Model<IUser> = mongoose.models.User || mongoose.model<IUser>('User', UserSchema);

export default User;
